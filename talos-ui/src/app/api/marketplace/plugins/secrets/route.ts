import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
const INTERNAL_SECRET = process.env.TALOS_INTERNAL_SECRET || '';

export async function POST(req: NextRequest) {
  const cookies = req.headers.get('cookie') || '';
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/internal/plugins/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talos-Internal-Token': INTERNAL_SECRET,
        cookie: cookies
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
