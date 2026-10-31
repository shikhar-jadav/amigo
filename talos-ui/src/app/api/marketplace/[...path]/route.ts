import { NextRequest, NextResponse } from 'next/server';

const LOCAL_MARKETPLACE_URL = 'http://127.0.0.1:8000/v1/marketplace';
const TALOS_CLOUD_MARKETPLACE_URL = process.env.TALOS_CLOUD_MARKETPLACE_URL || 
  (process.env.TALOS_CLOUD_URL ? `${process.env.TALOS_CLOUD_URL}/v1/marketplace` : LOCAL_MARKETPLACE_URL);
const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
const TALOS_INTERNAL_SECRET = process.env.TALOS_INTERNAL_SECRET || '';

function getMarketplaceTargets(): string[] {
  const targets = [TALOS_CLOUD_MARKETPLACE_URL];
  if (TALOS_CLOUD_MARKETPLACE_URL !== LOCAL_MARKETPLACE_URL) {
    targets.push(LOCAL_MARKETPLACE_URL);
  }
  return targets;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subPath = path?.join('/') || '';
    const search = req.nextUrl.search;
    const cookieHeader = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';

    const targets = getMarketplaceTargets();
    let lastError: any = null;
    let res: Response | null = null;

    for (const hostUrl of targets) {
      try {
        res = await fetch(`${hostUrl}/${subPath}${search}`, {
          method: 'GET',
          headers: {
            'Cookie': cookieHeader,
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            'Origin': 'http://localhost:3000',
          },
        });
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Marketplace Proxy] GET ${hostUrl} unreachable (${err.message}), trying next...`);
      }
    }

    if (!res) {
      throw lastError || new Error('All marketplace hosts unreachable');
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="skill.zip"',
        }
      });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in GET /api/marketplace/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subPath = path?.join('/') || '';
    const cookieHeader = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';
    const incomingContentType = req.headers.get('content-type') || '';

    if (incomingContentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const entries: [string, FormDataEntryValue][] = [];
      formData.forEach((value, key) => entries.push([key, value]));

      const createFormData = () => {
        const fd = new FormData();
        for (const [k, v] of entries) fd.append(k, v);
        return fd;
      };

      const targets = getMarketplaceTargets();
      let lastError: any = null;
      let res: Response | null = null;

      for (const hostUrl of targets) {
        try {
          res = await fetch(`${hostUrl}/${subPath}`, {
            method: 'POST',
            headers: {
              'Cookie': cookieHeader,
              ...(authHeader ? { 'Authorization': authHeader } : {}),
              'Origin': 'http://localhost:3000',
            },
            body: createFormData(),
          });
          break;
        } catch (err: any) {
          lastError = err;
          console.warn(`[Marketplace Proxy] Multipart POST ${hostUrl} unreachable (${err.message}), trying next...`);
        }
      }

      if (!res) throw lastError || new Error('All marketplace hosts unreachable');

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
        const buffer = await res.arrayBuffer();
        return new NextResponse(buffer, {
          status: res.status,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="skill.zip"',
            'X-Suggested-Slug': res.headers.get('x-suggested-slug') || 'custom-skill',
          }
        });
      }

      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    } else {
      const body = await req.json().catch(() => ({}));

      // Route github operations to local talos-backend (port 8001) first for instant response and local installation
      if (subPath.startsWith('github/')) {
        try {
          const backendRes = await fetch(`${TALOS_BACKEND_URL}/internal/${subPath}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Talos-Internal-Token': TALOS_INTERNAL_SECRET,
            },
            body: JSON.stringify(body),
          });

          const contentType = backendRes.headers.get('content-type') || '';
          if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
            const buffer = await backendRes.arrayBuffer();
            return new NextResponse(buffer, {
              status: backendRes.status,
              headers: {
                'Content-Type': contentType,
                'Content-Disposition': backendRes.headers.get('content-disposition') || 'attachment; filename="skill.zip"',
                'X-Suggested-Slug': backendRes.headers.get('x-suggested-slug') || 'custom-skill',
              }
            });
          }

          const data = await backendRes.json().catch(() => ({}));
          if (backendRes.ok) {
            return NextResponse.json(data, { status: backendRes.status });
          }
          if (backendRes.status !== 404) {
            return NextResponse.json(data, { status: backendRes.status });
          }
        } catch (backendErr) {
          console.warn('Local talos-backend unreachable for github operation, falling back to cloud:', backendErr);
        }
      }

      const targets = getMarketplaceTargets();
      let lastError: any = null;
      let res: Response | null = null;

      for (const hostUrl of targets) {
        try {
          res = await fetch(`${hostUrl}/${subPath}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': cookieHeader,
              ...(authHeader ? { 'Authorization': authHeader } : {}),
              'Origin': 'http://localhost:3000',
            },
            body: JSON.stringify(body),
          });
          break;
        } catch (err: any) {
          lastError = err;
          console.warn(`[Marketplace Proxy] POST ${hostUrl} unreachable (${err.message}), trying next...`);
        }
      }

      if (!res) throw lastError || new Error('All marketplace hosts unreachable');

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
        const buffer = await res.arrayBuffer();
        return new NextResponse(buffer, {
          status: res.status,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="skill.zip"',
            'X-Suggested-Slug': res.headers.get('x-suggested-slug') || 'custom-skill',
          }
        });
      }

      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }
  } catch (err: any) {
    console.error('Error in POST /api/marketplace/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subPath = path?.join('/') || '';
    const cookieHeader = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';
    const body = await req.json().catch(() => ({}));

    const targets = getMarketplaceTargets();
    let lastError: any = null;
    let res: Response | null = null;

    for (const hostUrl of targets) {
      try {
        res = await fetch(`${hostUrl}/${subPath}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify(body),
        });
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!res) throw lastError || new Error('All marketplace hosts unreachable');

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in PUT /api/marketplace/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subPath = path?.join('/') || '';
    const cookieHeader = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';
    const body = await req.json().catch(() => ({}));

    const targets = getMarketplaceTargets();
    let lastError: any = null;
    let res: Response | null = null;

    for (const hostUrl of targets) {
      try {
        res = await fetch(`${hostUrl}/${subPath}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify(body),
        });
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!res) throw lastError || new Error('All marketplace hosts unreachable');

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in PATCH /api/marketplace/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subPath = path?.join('/') || '';
    const cookieHeader = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';

    const targets = getMarketplaceTargets();
    let lastError: any = null;
    let res: Response | null = null;

    for (const hostUrl of targets) {
      try {
        res = await fetch(`${hostUrl}/${subPath}`, {
          method: 'DELETE',
          headers: {
            'Cookie': cookieHeader,
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            'Origin': 'http://localhost:3000',
          },
        });
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!res) throw lastError || new Error('All marketplace hosts unreachable');

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Error in DELETE /api/marketplace/[...path]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
