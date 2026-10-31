import { NextRequest, NextResponse } from 'next/server';

const LOCAL_CLOUD_URL = 'http://127.0.0.1:8000';
const CLOUD_URL = process.env.TALOS_CLOUD_URL || LOCAL_CLOUD_URL;

export async function GET(req: NextRequest) {
  const cookies = req.headers.get('cookie') || '';
  const targets = [CLOUD_URL];
  if (CLOUD_URL !== LOCAL_CLOUD_URL) {
    targets.push(LOCAL_CLOUD_URL);
  }

  for (const host of targets) {
    try {
      const res = await fetch(`${host}/v1/marketplace/user/plugins`, {
        headers: { cookie: cookies }
      });
      const data = await res.json();
      return NextResponse.json(data);
    } catch {
      // try next target
    }
  }

  return NextResponse.json({ installed: [] });
}
