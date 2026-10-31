import { NextRequest, NextResponse } from 'next/server';

const TALOS_CLOUD_URL = process.env.TALOS_CLOUD_URL ? process.env.TALOS_CLOUD_URL.replace('/v1/chat', '') : 'http://127.0.0.1:8000';
const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://127.0.0.1:8001';
const TALOS_INTERNAL_SECRET = process.env.TALOS_INTERNAL_SECRET || '';

type ThreadRecord = {
  thread_id: string;
  title?: string;
  updated_at?: string | number | null;
  created_at?: string | number | null;
};

class UpstreamHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isThreadRecord(value: unknown): value is ThreadRecord {
  return typeof value === 'object' && value !== null &&
    'thread_id' in value && typeof value.thread_id === 'string';
}

async function getLocalThreads(): Promise<ThreadRecord[]> {
  try {
    const response = await fetch(`${TALOS_BACKEND_URL}/internal/threads`, {
      headers: { 'X-Talos-Internal-Token': TALOS_INTERNAL_SECRET },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!response.ok) {
      return [];
    }

    const data: { threads?: unknown } = await response.json().catch(() => ({}));
    return Array.isArray(data.threads) ? data.threads.filter(isThreadRecord) : [];
  } catch {
    return [];
  }
}

async function getCloudThreads(cookieHeader: string): Promise<{
  threads: ThreadRecord[];
  deletedThreadIds: Set<string>;
}> {
  const headers = {
    'Cookie': cookieHeader,
    'Origin': 'http://localhost:3000',
  };
  try {
    const [threadsResponse, snapshotResponse] = await Promise.all([
      fetch(`${TALOS_CLOUD_URL}/v1/threads`, {
        headers,
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      }),
      fetch(`${TALOS_CLOUD_URL}/v1/snapshot/info`, {
        headers,
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      }),
    ]);
    if (!threadsResponse.ok) {
      return { threads: [], deletedThreadIds: new Set<string>() };
    }

    const cloudData: { threads?: unknown } = await threadsResponse.json().catch(() => ({}));
    let deletedThreadIds = new Set<string>();
    if (snapshotResponse.ok) {
      const snapshotData: { pending_deletes?: unknown } = await snapshotResponse.json().catch(() => ({}));
      if (Array.isArray(snapshotData.pending_deletes)) {
        deletedThreadIds = new Set(
          snapshotData.pending_deletes
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.replace(/^thread-/, ''))
        );
      }
    }

    return {
      threads: Array.isArray(cloudData.threads) ? cloudData.threads.filter(isThreadRecord) : [],
      deletedThreadIds,
    };
  } catch {
    return { threads: [], deletedThreadIds: new Set<string>() };
  }
}

function sortThreads(threads: ThreadRecord[]): ThreadRecord[] {
  return threads.sort((a, b) => {
    const tsA = new Date(a.updated_at || a.created_at || (a.thread_id.length >= 10 ? parseInt(a.thread_id) : 0)).getTime();
    const tsB = new Date(b.updated_at || b.created_at || (b.thread_id.length >= 10 ? parseInt(b.thread_id) : 0)).getTime();
    return tsB - tsA;
  });
}

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source');
  const cookieHeader = req.headers.get('cookie') || '';

  try {
    if (source === 'local') {
      return NextResponse.json({ status: 'success', threads: sortThreads(await getLocalThreads()) });
    }

    if (source === 'cloud') {
      const cloud = await getCloudThreads(cookieHeader);
      const threads = cloud.threads.filter(
        (thread) => !cloud.deletedThreadIds.has(thread.thread_id.replace(/^thread-/, ''))
      );
      return NextResponse.json({
        status: 'success',
        threads: sortThreads(threads),
        deleted_thread_ids: Array.from(cloud.deletedThreadIds),
      });
    }

    const cloudPromise = getCloudThreads(cookieHeader);
    const localPromise = getLocalThreads();
    const [cloudResult, localResult] = await Promise.allSettled([cloudPromise, localPromise]);
    const threadsMap = new Map<string, ThreadRecord>();
    if (localResult.status === 'fulfilled') {
      for (const thread of localResult.value) threadsMap.set(thread.thread_id, thread);
    }
    let deletedThreadIds = new Set<string>();
    if (cloudResult.status === 'fulfilled') {
      deletedThreadIds = cloudResult.value.deletedThreadIds;
      for (const thread of cloudResult.value.threads) {
        threadsMap.set(thread.thread_id, { ...threadsMap.get(thread.thread_id), ...thread });
      }
    }

    return NextResponse.json({
      status: 'success',
      threads: sortThreads(Array.from(threadsMap.values()).filter(
        (thread) => !deletedThreadIds.has(thread.thread_id.replace(/^thread-/, ''))
      )),
      deleted_thread_ids: Array.from(deletedThreadIds),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof UpstreamHttpError
      ? err.status
      : err instanceof DOMException && err.name === 'TimeoutError'
        ? 504
        : 503;
    return NextResponse.json({ status: 'error', error: message, threads: [] }, { status });
  }
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookieHeader = req.headers.get('cookie') || '';
    const res = await fetch(`${TALOS_CLOUD_URL}/v1/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
