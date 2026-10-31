/**
 * Pure TypeScript ZIP parser utilizing native DecompressionStream.
 * Zero external dependencies. Works in modern browsers and Node.js 18+.
 */

export interface ZipEntry {
  filename: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  data: () => Promise<Uint8Array>;
  text: () => Promise<string>;
}

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 1000;

export async function parseZip(fileOrBuffer: File | ArrayBuffer | Uint8Array): Promise<ZipEntry[]> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else if (fileOrBuffer instanceof Uint8Array) {
    arrayBuffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    ) as ArrayBuffer;
  } else {
    arrayBuffer = fileOrBuffer;
  }

  if (arrayBuffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error('ZIP archive exceeds 50 MB');

  const view = new DataView(arrayBuffer);
  const uint8 = new Uint8Array(arrayBuffer);
  const entries: ZipEntry[] = [];

  // Search backwards for End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = uint8.length - 22; i >= 0 && i >= uint8.length - 65557; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    // Fallback: parse sequentially through Local File Headers (0x04034b50)
    return parseZipLocalHeaders(view, uint8);
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  if (totalEntries > MAX_ENTRIES) throw new Error('ZIP contains more than 1000 entries');
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let currentOffset = cdOffset;
  const decoder = new TextDecoder('utf-8');
  let totalUncompressed = 0;

  for (let e = 0; e < totalEntries && currentOffset < eocdOffset; e++) {
    if (view.getUint32(currentOffset, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(currentOffset + 10, true);
    const compressedSize = view.getUint32(currentOffset + 20, true);
    const uncompressedSize = view.getUint32(currentOffset + 24, true);
    const localHeaderOffset = view.getUint32(currentOffset + 42, true);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP expands beyond 100 MB');
    if (compressedSize > uint8.length || localHeaderOffset + 30 > uint8.length) throw new Error('Corrupted ZIP entry bounds');
    const filenameLen = view.getUint16(currentOffset + 28, true);
    const extraLen = view.getUint16(currentOffset + 30, true);
    const commentLen = view.getUint16(currentOffset + 32, true);
    const filenameBytes = uint8.subarray(currentOffset + 46, currentOffset + 46 + filenameLen);
    const rawFilename = decoder.decode(filenameBytes).replace(/\\/g, '/');
    const isDirectory = rawFilename.endsWith('/');

    // Move to next Central Directory entry
    currentOffset += 46 + filenameLen + extraLen + commentLen;

    const getData = async (): Promise<Uint8Array> => {
      // Read local file header to find start of data
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error(`Corrupted ZIP: Invalid local header for ${rawFilename}`);
      }
      const localFnLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localFnLen + localExtraLen;
      const compressedData = uint8.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        // Stored (no compression)
        if (compressedData.byteLength !== uncompressedSize) throw new Error(`Invalid size for ${rawFilename}`);
        return compressedData;
      } else if (compressionMethod === 8) {
        // Deflate
        const output = await decompressDeflate(compressedData);
        if (output.byteLength !== uncompressedSize || output.byteLength > MAX_UNCOMPRESSED_BYTES) throw new Error(`Invalid expanded size for ${rawFilename}`);
        return output;
      } else {
        throw new Error(`Unsupported compression method ${compressionMethod} for ${rawFilename}`);
      }
    };

    entries.push({
      filename: rawFilename,
      isDirectory,
      compressedSize,
      uncompressedSize,
      data: getData,
      text: async () => {
        const raw = await getData();
        return decoder.decode(raw);
      },
    });
  }

  return entries;
}

function parseZipLocalHeaders(view: DataView, uint8: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder('utf-8');
  let offset = 0;
  let totalUncompressed = 0;

  while (offset + 30 <= uint8.length) {
    if (entries.length >= MAX_ENTRIES) throw new Error('ZIP contains more than 1000 entries');
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP expands beyond 100 MB');
    const filenameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const filenameBytes = uint8.subarray(offset + 30, offset + 30 + filenameLen);
    const rawFilename = decoder.decode(filenameBytes).replace(/\\/g, '/');
    const isDirectory = rawFilename.endsWith('/');
    const dataStart = offset + 30 + filenameLen + extraLen;

    const getData = async (): Promise<Uint8Array> => {
      const compressedData = uint8.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) {
        if (compressedData.byteLength !== uncompressedSize) throw new Error('Invalid ZIP entry size');
        return compressedData;
      } else if (compressionMethod === 8) {
        const output = await decompressDeflate(compressedData);
        if (output.byteLength !== uncompressedSize || output.byteLength > MAX_UNCOMPRESSED_BYTES) throw new Error('Invalid expanded ZIP entry size');
        return output;
      }
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    };

    entries.push({
      filename: rawFilename,
      isDirectory,
      compressedSize,
      uncompressedSize,
      data: getData,
      text: async () => {
        const raw = await getData();
        return decoder.decode(raw);
      },
    });

    offset = dataStart + compressedSize;
  }

  return entries;
}

async function decompressDeflate(compressedData: Uint8Array): Promise<Uint8Array> {
  // Use native browser / Node.js DecompressionStream
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressedData as unknown as BufferSource);
      writer.close();

      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLength += value.length;
        }
      }

      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    } catch {
      // Fall through to Node.js zlib
    }
  }

  // Node.js fallback via zlib
  try {
    const zlib = await import('zlib');
    return new Uint8Array(zlib.inflateRawSync(Buffer.from(compressedData)));
  } catch {
    throw new Error('DecompressionStream and zlib are not supported in this runtime');
  }
}
