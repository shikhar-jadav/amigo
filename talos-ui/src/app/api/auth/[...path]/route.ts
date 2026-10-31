import { NextRequest, NextResponse } from 'next/server';

const TALOS_CLOUD_AUTH_URL = process.env.TALOS_CLOUD_AUTH_URL || 'http://localhost:8000/v1/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const action = path?.[0]; // e.g. login, register, logout
    const body = await req.json().catch(() => ({}));
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(`${TALOS_CLOUD_AUTH_URL}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    const nextRes = NextResponse.json(data, { status: res.status });

    // Propagate Set-Cookie header from Talos Cloud (HttpOnly session cookie)
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      nextRes.headers.set('set-cookie', setCookie);
    }

    // If logging out, make sure the cookie is expired on the response even if cloud returned 401/error
    if (action === 'logout') {
      nextRes.cookies.set('talos_session', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return nextRes;
  } catch (err: any) {
    console.error('Error in POST /api/auth/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const action = path?.[0]; // e.g. me
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(`${TALOS_CLOUD_AUTH_URL}/${action}`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in GET /api/auth/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
