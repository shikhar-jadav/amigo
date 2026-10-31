import { NextRequest, NextResponse } from 'next/server';

const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
const TALOS_CLOUD_URL = process.env.TALOS_CLOUD_URL
  ? process.env.TALOS_CLOUD_URL.replace('/v1/chat', '')
  : 'http://localhost:8000';
const TALOS_INTERNAL_TOKEN = process.env.TALOS_INTERNAL_SECRET || '';

export async function GET(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';

    // Check local backend for local data presence and export state
    const backendRes = await fetch(`${TALOS_BACKEND_URL}/internal/snapshot/status`, {
      headers: {
        'X-Talos-Internal-Token': TALOS_INTERNAL_TOKEN,
        // Forward session cookie so backend can update its periodic-sync state
        'X-Session-Cookie': cookieHeader,
      },
    });
    const backendData = backendRes.ok ? await backendRes.json() : { has_local_data: false };

    // Check cloud for snapshot existence
    let cloudData: any = { has_snapshot: false };
    try {
      const cloudRes = await fetch(`${TALOS_CLOUD_URL}/v1/snapshot/info`, {
        headers: { 'Cookie': cookieHeader, 'Origin': 'http://localhost:3000' },
      });
      if (cloudRes.ok) cloudData = await cloudRes.json();
    } catch { /* cloud unreachable */ }

    return NextResponse.json({
      has_local_data: backendData.has_local_data ?? false,
      last_export_at: backendData.last_export_at ?? null,
      is_busy: backendData.is_busy ?? false,
      generation: backendData.generation ?? 1,
      cloud: {
        has_snapshot: cloudData.has_snapshot ?? false,
        size_bytes: cloudData.size_bytes ?? null,
        committed_at: cloudData.committed_at ?? null,
        pending_deletes: cloudData.pending_deletes ?? [],
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
