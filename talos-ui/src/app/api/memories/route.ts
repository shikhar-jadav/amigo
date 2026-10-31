import { NextRequest, NextResponse } from 'next/server';

const TALOS_CLOUD_URL = process.env.TALOS_CLOUD_URL ? process.env.TALOS_CLOUD_URL.replace('/v1/chat', '') : 'http://127.0.0.1:8000';

export async function DELETE(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const res = await fetch(`${TALOS_CLOUD_URL}/v1/memories`, {
      method: 'DELETE',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
