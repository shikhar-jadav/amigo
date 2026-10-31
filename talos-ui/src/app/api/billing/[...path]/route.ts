import { NextRequest, NextResponse } from 'next/server';

const TALOS_CLOUD_BILLING_URL = process.env.TALOS_CLOUD_BILLING_URL || 'http://localhost:8000/v1/billing';

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

    const res = await fetch(`${TALOS_CLOUD_BILLING_URL}/${subpath}${queryStr}`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:3000',
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in GET /api/billing/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
