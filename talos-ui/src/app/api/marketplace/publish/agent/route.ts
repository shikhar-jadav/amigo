import { NextRequest, NextResponse } from 'next/server';

const LOCAL_CLOUD_URL = 'http://127.0.0.1:8000';
const PRIMARY_CLOUD_URL = process.env.TALOS_CLOUD_URL || LOCAL_CLOUD_URL;

export async function POST(req: NextRequest) {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get('cookie');
  const authorization = req.headers.get('authorization');
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  for (const baseUrl of [PRIMARY_CLOUD_URL, ...(PRIMARY_CLOUD_URL === LOCAL_CLOUD_URL ? [] : [LOCAL_CLOUD_URL])]) {
    try {
      const response = await fetch(`${baseUrl}/v1/marketplace/publish/agent`, {
        method: 'POST',
        headers,
        body: await req.clone().formData(),
        signal: AbortSignal.timeout(30_000),
      });
      return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
    } catch {
      // Try the local cloud instance if the configured host is unreachable.
    }
  }

  return NextResponse.json({ error: 'Marketplace is unreachable.' }, { status: 503 });
}
