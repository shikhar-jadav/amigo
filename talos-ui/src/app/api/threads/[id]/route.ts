import { NextRequest, NextResponse } from 'next/server';

const TALOS_CLOUD_URL = process.env.TALOS_CLOUD_URL ? process.env.TALOS_CLOUD_URL.replace('/v1/chat', '') : 'http://127.0.0.1:8000';
const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://127.0.0.1:8001';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 });
    }

    // 1. First, try fetching directly from local backend (where checkpoints live locally)
    try {
      const backendRes = await fetch(`${TALOS_BACKEND_URL}/internal/threads/${encodeURIComponent(id)}/messages`, {
        method: 'GET',
        headers: {
          'X-Talos-Internal-Token': (process.env.TALOS_INTERNAL_SECRET || '')
        },
        signal: AbortSignal.timeout(3000),
      });
      if (backendRes.ok) {
        const backendData = await backendRes.json();
        if (backendData && Array.isArray(backendData.messages)) {
          return NextResponse.json(backendData);
        }
      }
    } catch {
      // Local backend unreachable or error, fallback to cloud
    }

    // 2. Fallback to Cloud Gateway (for remote machines)
    const messagesUrl = `${TALOS_CLOUD_URL}/v1/threads/${encodeURIComponent(id)}/messages`;
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(messagesUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'error', messages: [] }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'error', error: message, messages: [] }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 });
    }

    const cookieHeader = req.headers.get('cookie') || '';
    const cloudBase = process.env.TALOS_CLOUD_URL
      ? process.env.TALOS_CLOUD_URL.replace('/v1/chat', '')
      : 'http://localhost:8000';
    const backendUrl = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
    const internalSecret = process.env.TALOS_INTERNAL_SECRET || '';

    // 1. Immediately purge local workspace, process, checkpoints, and thread memory on THIS machine
    let localCleanupOk = false;
    try {
      const localRes = await fetch(`${backendUrl}/internal/threads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'X-Talos-Internal-Token': internalSecret,
        },
      });
      localCleanupOk = localRes.ok;
    } catch (localErr) {
      console.warn('[Delete] Local backend cleanup notice:', localErr);
    }

    // 2. Real-time removal from cloud thread index (sidebar updates immediately across browsers)
    const deleteUrl = `${cloudBase}/v1/threads/${encodeURIComponent(id)}`;
    let cloudResOk = false;
    try {
      const backendRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Cookie': cookieHeader,
          'Origin': 'http://localhost:3000',
        },
      });
      cloudResOk = backendRes.ok;
    } catch {
      // Cloud unreachable
    }

    // 3. Record durable tombstone in snapshot pending-deletes
    //    Ensures the deleted thread is excluded from the next snapshot upload
    //    and automatically deleted on any OTHER PC when they restore or download.
    let tombstoneResOk = false;
    try {
      const tombstoneRes = await fetch(`${cloudBase}/v1/snapshot/pending-deletes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ thread_id: id }),
      });
      tombstoneResOk = tombstoneRes.ok;
    } catch (e) {
      console.warn('[Delete] Failed to record snapshot tombstone:', e);
    }

    if (!localCleanupOk || (!cloudResOk && !tombstoneResOk)) {
      return NextResponse.json(
        { status: 'error', error: 'Thread deletion was incomplete. Retry after the local backend and cloud are reachable.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ status: 'success', thread_id: id });
  } catch (err: unknown) {
    console.error('Error in DELETE /api/threads/[id]:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
