import { NextRequest, NextResponse } from 'next/server';

const LOCAL_CLOUD_URL = 'http://127.0.0.1:8000';
const CLOUD_URL = process.env.TALOS_CLOUD_URL || LOCAL_CLOUD_URL;

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cookies = req.headers.get('cookie') || '';
  const body = await req.json();

  const targets = [CLOUD_URL];
  if (CLOUD_URL !== LOCAL_CLOUD_URL) {
    targets.push(LOCAL_CLOUD_URL);
  }

  let lastError: any = null;
  for (const host of targets) {
    try {
      const res = await fetch(`${host}/v1/marketplace/user/plugins/${id}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: cookies },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err: any) {
      lastError = err;
    }
  }

  return NextResponse.json({ error: lastError?.message || 'Config update failed' }, { status: 500 });
}
