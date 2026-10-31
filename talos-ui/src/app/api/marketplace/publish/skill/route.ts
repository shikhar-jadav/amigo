import { NextRequest, NextResponse } from 'next/server';

const LOCAL_CLOUD_URL = 'http://127.0.0.1:8000';
const PRIMARY_CLOUD_URL = process.env.TALOS_CLOUD_URL || LOCAL_CLOUD_URL;

export async function POST(req: NextRequest) {
  try {
    const cookies = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';
    const formData = await req.formData();

    // Reconstruct entries so we can retry on fallback URL if needed
    const entries: [string, FormDataEntryValue][] = [];
    formData.forEach((value, key) => {
      entries.push([key, value]);
    });

    const createFormData = () => {
      const fd = new FormData();
      for (const [k, v] of entries) {
        fd.append(k, v);
      }
      return fd;
    };

    const headers: Record<string, string> = {
      ...(cookies ? { cookie: cookies } : {}),
      ...(authHeader ? { authorization: authHeader } : {}),
    };

    const targetUrls = [PRIMARY_CLOUD_URL];
    if (PRIMARY_CLOUD_URL !== LOCAL_CLOUD_URL) {
      targetUrls.push(LOCAL_CLOUD_URL);
    }

    let lastError: any = null;
    let res: Response | null = null;

    for (const baseUrl of targetUrls) {
      try {
        res = await fetch(`${baseUrl}/v1/marketplace/publish/skill`, {
          method: 'POST',
          headers,
          body: createFormData(),
        });
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Publish Skill] Cloud host ${baseUrl} unreachable (${err.message}), trying next...`);
      }
    }

    if (!res) {
      throw lastError || new Error('All cloud targets unreachable');
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in POST /api/marketplace/publish/skill:', err);
    return NextResponse.json({ error: err.message || 'Failed to publish skill' }, { status: 500 });
  }
}

