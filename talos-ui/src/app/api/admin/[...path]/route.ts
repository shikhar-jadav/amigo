import { NextRequest, NextResponse } from 'next/server';

const TALOS_CLOUD_ADMIN_URL = process.env.TALOS_CLOUD_ADMIN_URL || 'http://localhost:8000/v1/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subpath = path.join('/');
    const cookieHeader = req.headers.get('cookie') || '';
    const searchParams = req.nextUrl.searchParams.toString();
    const queryStr = searchParams ? `?${searchParams}` : '';

    const res = await fetch(`${TALOS_CLOUD_ADMIN_URL}/${subpath}${queryStr}`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in GET /api/admin/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subpath = path.join('/');
    const body = await req.json().catch(() => ({}));
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(`${TALOS_CLOUD_ADMIN_URL}/${subpath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in POST /api/admin/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subpath = path.join('/');
    const body = await req.json().catch(() => ({}));
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(`${TALOS_CLOUD_ADMIN_URL}/${subpath}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in PUT /api/admin/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subpath = path.join('/');
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(`${TALOS_CLOUD_ADMIN_URL}/${subpath}`, {
      method: 'DELETE',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in DELETE /api/admin/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

