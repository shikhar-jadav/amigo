import { NextRequest, NextResponse } from 'next/server';

const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
const TALOS_INTERNAL_TOKEN = process.env.TALOS_INTERNAL_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${TALOS_BACKEND_URL}/internal/snapshot/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talos-Internal-Token': TALOS_INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        session_cookie: cookieHeader,
        user_id: body.user_id || '',
      }),
    });
    const data = await res.json().catch(() => ({ status: 'ok' }));
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ status: 'warning', error: err.message }, { status: 200 });
  }
}
