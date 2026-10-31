import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { parseZip } from '@/lib/zipReader';

const CLOUD_URL = process.env.TALOS_CLOUD_URL || 'http://127.0.0.1:8000';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid plugin identifier' }, { status: 400 });
    }
    const cookies = req.headers.get('cookie') || '';
    const searchParams = req.nextUrl.searchParams.toString();
    const cloudEndpoint = searchParams
      ? `${CLOUD_URL}/v1/marketplace/plugins/${id}/install-session?${searchParams}`
      : `${CLOUD_URL}/v1/marketplace/plugins/${id}/install-session`;

    // 1. Authorize on cloud & mark installed in DB
    const res = await fetch(cloudEndpoint, {
      method: 'POST',
      headers: { cookie: cookies }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(err, { status: res.status });
    }

    const data = await res.json();
    const pluginType = data.plugin_type || 'agent';
    const slug = data.slug || data.name || id;
    const version = data.version || '1.0.0';
    if (!['agent', 'skill', 'mcp'].includes(pluginType) ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(slug) || slug.includes('..') ||
        !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(version) || version.includes('..')) {
      return NextResponse.json({ error: 'Invalid plugin package metadata' }, { status: 400 });
    }
    
    // Construct artifact download URL
    const downloadUrl = data.zip_download_url
      ? new URL(data.zip_download_url, CLOUD_URL).toString()
      : `${CLOUD_URL}/v1/marketplace/plugins/${id}/download${version ? `?version=${encodeURIComponent(version)}` : ''}`;
    if (new URL(downloadUrl).origin !== new URL(CLOUD_URL).origin) {
      return NextResponse.json({ error: 'Plugin archive URL must use the Talos cloud origin' }, { status: 400 });
    }

    // 2. Download the artifact ZIP directly to this local machine
    const zipRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: { cookie: cookies },
      redirect: 'error'
    });

    if (zipRes.ok) {
      const contentLength = Number(zipRes.headers.get('content-length') || 0);
      if (contentLength > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'Plugin archive exceeds 50 MB' }, { status: 413 });
      }
      const zipBuffer = await zipRes.arrayBuffer();
      if (zipBuffer.byteLength > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'Plugin archive exceeds 50 MB' }, { status: 413 });
      }
      const entries = await parseZip(zipBuffer);

      // 3. Determine local destination directory in ~/.talos
      const talosBase = path.join(os.homedir(), '.talos');
      let targetDir: string;

      if (pluginType === 'agent') {
        targetDir = path.join(talosBase, 'packages', 'agents', slug, version);
      } else if (pluginType === 'skill') {
        targetDir = path.join(talosBase, 'skills', slug);
      } else {
        targetDir = path.join(talosBase, 'mcp', slug);
      }

      await fs.mkdir(targetDir, { recursive: true });

      // Detect if there's a single top-level folder wrapper
      const fileEntries = entries.filter((e) => !e.isDirectory);
      let stripPrefix = '';
      if (fileEntries.length > 0) {
        const firstParts = fileEntries.map((e) => e.filename.split('/')[0]);
        if (firstParts.every((p) => p === firstParts[0]) &&
            /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(firstParts[0]) && firstParts[0] !== '..' &&
            fileEntries.every((e) => e.filename.includes('/'))) {
          stripPrefix = firstParts[0] + '/';
        }
      }

      // 4. Extract all files safely onto local PC disk
      const resolvedTarget = path.resolve(targetDir);
      for (const entry of entries) {
        let relPath = entry.filename;
        if (stripPrefix && relPath.startsWith(stripPrefix)) {
          relPath = relPath.slice(stripPrefix.length);
        }
        if (!relPath || relPath.endsWith('/')) continue;
        const posixPath = relPath.replace(/\\/g, '/');
        if (posixPath.startsWith('/') || /^[A-Za-z]:/.test(posixPath) ||
            posixPath.split('/').some((part) => !part || part === '.' || part === '..' || part.endsWith('.') || part.endsWith(' ')) ||
            posixPath.split('/').some((part) => /^\.env(?!\.(example|sample|template)$)/i.test(part) || /^secrets\.json$/i.test(part) || /^\.ssh$/i.test(part) || /^\.git$/i.test(part) || /\.(pem|key|p12|pfx)$/i.test(part))) {
          return NextResponse.json({ error: `Unsafe path in plugin archive: ${entry.filename}` }, { status: 400 });
        }

        const outPath = path.join(targetDir, relPath);
        const resolvedOut = path.resolve(outPath);
        if (resolvedOut !== resolvedTarget && !resolvedOut.startsWith(`${resolvedTarget}${path.sep}`)) {
          return NextResponse.json({ error: 'Plugin archive path escapes install directory' }, { status: 400 });
        }
        await fs.mkdir(path.dirname(outPath), { recursive: true });

        if (!entry.isDirectory) {
          const content = await entry.data();
          await fs.writeFile(outPath, Buffer.from(content));
        }
      }

      // 5. If agent, write ready .provision_state.json for the supervisor
      if (pluginType === 'agent') {
        const stateFile = path.join(targetDir, '.provision_state.json');
        const stateObj = {
          status: 'ready',
          slug: slug,
          version: version,
          install_dir: targetDir,
          plugin_id: id,
          completed_at: Date.now() / 1000
        };
        await fs.writeFile(stateFile, JSON.stringify(stateObj, null, 2), 'utf-8');
      }

      return NextResponse.json({
        success: true,
        plugin_id: id,
        slug,
        version,
        plugin_type: pluginType,
        local_path: targetDir,
        message: `Successfully installed and provisioned into ${targetDir}`
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Error during plugin installation:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to install plugin' },
      { status: 500 }
    );
  }
}
