import { NextRequest, NextResponse } from 'next/server';

const TALOS_BACKEND_URL = process.env.TALOS_BACKEND_URL || 'http://localhost:8001';
const TALOS_CLOUD_AUTH_URL = process.env.TALOS_CLOUD_AUTH_URL || 'http://127.0.0.1:8000/v1/auth';
const TALOS_CLOUD_URL = process.env.TALOS_CLOUD_URL ? process.env.TALOS_CLOUD_URL.replace('/v1/chat', '') : 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, thread_id, model, resume } = body;
    if (thread_id !== undefined && thread_id !== null && (
      typeof thread_id !== 'string' || thread_id.length < 1 || thread_id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(thread_id)
    )) {
      return NextResponse.json({ error: 'Invalid conversation ID.' }, { status: 400 });
    }
    const runId = typeof body.run_id === 'string' && body.run_id.trim()
      ? body.run_id.trim()
      : `req_${Date.now()}`;

    if (!prompt && resume === undefined && !body.cancel_run_id) {
      return NextResponse.json({ error: 'Prompt or resume payload is required' }, { status: 400 });
    }

    const cookieHeader = req.headers.get('cookie') || '';

    // Chat and thread state are private: verify session against cloud auth authority.
    let userId: string = 'default_user';
    try {
      const authRes = await fetch(`${TALOS_CLOUD_AUTH_URL}/me`, {
        method: 'GET',
        headers: { 'Cookie': cookieHeader, 'Origin': 'http://localhost:3000' },
        signal: AbortSignal.timeout(4000),
      });
      if (authRes.ok) {
        const authData = await authRes.json();
        if (typeof authData?.user?.id === 'string' && authData.user.id) {
          userId = authData.user.id;
        }
      } else if (cookieHeader) {
        // Explicit invalid cookie
        return NextResponse.json({ error: 'Please sign in or create an account to start chatting with Talos.' }, { status: 401 });
      }
    } catch {
      // Cloud auth unavailable — fallback to local default user for local dev/offline
    }

    // Pre-flight check: ensure user has spendable credits before launching agent run
    if (!body.cancel_run_id) {
      try {
        const billingRes = await fetch(`${TALOS_CLOUD_URL}/v1/billing/balance`, {
          method: 'GET',
          headers: { 'Cookie': cookieHeader, 'Origin': 'http://localhost:3000' },
          signal: AbortSignal.timeout(4000),
        });
        if (billingRes.ok) {
          const billingData = await billingRes.json();
          const spendable = billingData?.balance?.spendable_credits;
          if (typeof spendable === 'number' && spendable <= 0) {
            return NextResponse.json(
              {
                error: 'Your credit balance is exhausted (0 credits remaining). Please add credits or renew your subscription in Settings > Usage to continue.',
                code: 'CREDITS_EXHAUSTED',
              },
              { status: 402 }
            );
          }
        }
      } catch {
        // If billing service check times out, permit backend reservation gate to handle it
      }
    }

    if (typeof body.cancel_run_id === 'string' && body.cancel_run_id.trim()) {
      const cancelRes = await fetch(
        `${TALOS_BACKEND_URL}/ag-ui/runs/${encodeURIComponent(body.cancel_run_id.trim())}`,
        {
          method: 'DELETE',
          headers: {
            'X-Talos-Internal-Token': process.env.TALOS_INTERNAL_SECRET || '',
            'X-Talos-User-ID': userId,
            'X-Talos-Request-ID': `cancel_${Date.now()}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      const cancelData = await cancelRes.json().catch(() => ({}));
      if (!cancelRes.ok) {
        return NextResponse.json({ error: cancelData.detail || cancelData.error || 'Could not stop the run' }, { status: cancelRes.status });
      }
      return NextResponse.json(cancelData);
    }

    // Claim new threads atomically; reject IDs already owned by another account.
    if (thread_id && userId !== 'default_user') {
      try {
        const title = String(prompt).trim().substring(0, 32);
        const ownershipRes = await fetch(`${TALOS_CLOUD_URL}/v1/threads/authorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,
            'Origin': 'http://localhost:3000'
          },
          body: JSON.stringify({ thread_id, title }),
          signal: AbortSignal.timeout(4000),
        });
        if (!ownershipRes.ok) {
          const ownershipError = await ownershipRes.json().catch(() => ({}));
          return NextResponse.json(
            { error: ownershipError.detail || 'Could not verify conversation ownership.' },
            { status: ownershipRes.status === 403 ? 403 : 503 },
          );
        }
      } catch {
        // Continue if ownership service is unreachable locally
      }
    }

    // Stream SSE directly from local Talos Backend (where checkpoints and workspace state live)
    const backendRes = await fetch(`${TALOS_BACKEND_URL}/ag-ui`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talos-Internal-Token': (process.env.TALOS_INTERNAL_SECRET || ''),
        'X-Talos-User-ID': userId,
        'X-Talos-Request-ID': runId
      },
      body: JSON.stringify({ prompt: prompt || '', thread_id, model: model || 'talos-code', resume }),
      signal: req.signal,
    });

    if (!backendRes.ok) {
      let errorText = await backendRes.text();
      if (errorText.toLowerCase().includes('<!doctype') || errorText.toLowerCase().includes('<html') || errorText.toLowerCase().includes('<title>blocked</title>')) {
        errorText = 'Upstream gateway blocked the connection (HTTP 403 / Cloudflare Challenge). Request safely intercepted.';
      }
      return NextResponse.json(
        { error: `Backend Error (${backendRes.status}): ${errorText}` },
        { status: backendRes.status }
      );
    }

    // Stream SSE back to browser
    return new Response(backendRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('Error in Next.js /api/chat route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get('run_id') || '';
    const after = req.nextUrl.searchParams.get('after') || '0';
    if (!runId) {
      return NextResponse.json({ error: 'run_id is required' }, { status: 400 });
    }

    const cookieHeader = req.headers.get('cookie') || '';
    const authRes = await fetch(`${TALOS_CLOUD_AUTH_URL}/me`, {
      method: 'GET',
      headers: { Cookie: cookieHeader, Origin: 'http://localhost:3000' },
      signal: AbortSignal.timeout(8000),
    });
    if (!authRes.ok) {
      return NextResponse.json({ error: 'Authentication required to resume this run' }, { status: authRes.status });
    }
    const authData = await authRes.json();
    const userId = authData?.user?.id;
    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json({ error: 'Could not determine authenticated user' }, { status: 401 });
    }

    const backendRes = await fetch(
      `${TALOS_BACKEND_URL}/ag-ui/runs/${encodeURIComponent(runId)}?after=${encodeURIComponent(after)}`,
      {
        method: 'GET',
        headers: {
          'X-Talos-Internal-Token': process.env.TALOS_INTERNAL_SECRET || '',
          'X-Talos-User-ID': userId,
          'X-Talos-Request-ID': runId,
        },
        signal: req.signal,
      },
    );
    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json({ error: `Backend Error (${backendRes.status}): ${errorText}` }, { status: backendRes.status });
    }
    return new Response(backendRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Error in Next.js run-resume route:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
