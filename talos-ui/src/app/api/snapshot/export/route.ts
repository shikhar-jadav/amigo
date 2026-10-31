import { NextRequest, NextResponse } from 'next/server';

const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
const TALOS_INTERNAL_TOKEN = process.env.TALOS_INTERNAL_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const body = await req.json();
    const res = await fetch(`${TALOS_BACKEND_URL}/internal/snapshot/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talos-Internal-Token': TALOS_INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        session_cookie: cookieHeader,
        user_id: body.user_id || '',
        pending_delete_thread_ids: body.pending_delete_thread_ids || [],
      }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
