import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const LOCAL_CLOUD_URL = 'http://127.0.0.1:8000';
const CLOUD_URL = (process.env.TALOS_CLOUD_URL || LOCAL_CLOUD_URL).replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 4_000;
const BACKGROUND_REFRESH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 30_000;
const STALE_CACHE_TTL_MS = 5 * 60_000;
const FAILED_REFRESH_RETRY_MS = 5_000;
const MAX_CACHE_ENTRIES = 64;

interface PluginListResult {
  data: unknown;
  cacheable: boolean;
  serverTiming?: string;
}

interface PluginListCacheEntry {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
  retryAfter?: number;
}

const pluginListCache = new Map<string, PluginListCacheEntry>();
const inFlightRequests = new Map<string, Promise<PluginListResult>>();

function getCacheKey(cookies: string, params: URLSearchParams): string {
  const identity = createHash('sha256').update(cookies).digest('hex');
  return `${identity}:${params.toString()}`;
}

async function fetchPluginList(
  cookies: string,
  params: URLSearchParams,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<PluginListResult> {
  const hosts = CLOUD_URL === LOCAL_CLOUD_URL ? [LOCAL_CLOUD_URL] : [CLOUD_URL, LOCAL_CLOUD_URL];
  let lastError: Error | null = null;

  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/v1/marketplace/plugins?${params}`, {
        headers: { cookie: cookies },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const data: unknown = await response.json();
        if (
          data === null ||
          typeof data !== 'object' ||
          !Array.isArray((data as { plugins?: unknown }).plugins)
        ) {
          lastError = new Error('Marketplace service returned an invalid plugin catalog');
          continue;
        }
        return {
          data,
          cacheable: true,
          serverTiming: response.headers.get('server-timing') || undefined,
        };
      }
      lastError = new Error(`Marketplace service returned ${response.status}`);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  const message = lastError ? lastError.message : 'Marketplace service unreachable';
  return { data: { plugins: [], count: 0, error: message }, cacheable: false };
}

function cachePluginList(key: string, data: unknown): void {
  pluginListCache.delete(key);
  const now = Date.now();
  pluginListCache.set(key, {
    data,
    expiresAt: now + CACHE_TTL_MS,
    staleUntil: now + STALE_CACHE_TTL_MS,
  });

  while (pluginListCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = pluginListCache.keys().next().value;
    if (oldestKey === undefined) break;
    pluginListCache.delete(oldestKey);
  }
}

function startPluginListRefresh(
  key: string,
  cookies: string,
  params: URLSearchParams,
): Promise<PluginListResult> {
  const existingRequest = inFlightRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = fetchPluginList(cookies, params, BACKGROUND_REFRESH_TIMEOUT_MS);
  inFlightRequests.set(key, request);
  void request
    .then((result) => {
      if (result.cacheable) {
        cachePluginList(key, result.data);
        return;
      }

      const cached = pluginListCache.get(key);
      if (cached) {
        cached.retryAfter = Date.now() + FAILED_REFRESH_RETRY_MS;
        console.warn('Marketplace refresh failed; retaining the last successful catalog', result.data);
      } else {
        console.error('Marketplace plugin listing failed', result.data);
      }
    })
    .catch((error: unknown) => {
      const cached = pluginListCache.get(key);
      if (cached) {
        cached.retryAfter = Date.now() + FAILED_REFRESH_RETRY_MS;
        console.error('Marketplace refresh failed unexpectedly; retaining the last successful catalog', error);
      } else {
        console.error('Marketplace plugin listing failed unexpectedly', error);
      }
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) {
        inFlightRequests.delete(key);
      }
    });

  return request;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'all';
  const query = searchParams.get('query') || '';
  const sort = searchParams.get('sort') || 'popular';

  const params = new URLSearchParams();
  if (type && type !== 'all') params.set('type', type);
  if (query) params.set('query', query);
  params.set('sort', sort);

  const cookies = req.headers.get('cookie') || '';
  const cacheKey = getCacheKey(cookies, params);
  const cached = pluginListCache.get(cacheKey);
  const now = Date.now();

  // When identical requests arrive together (for example during initial UI hydration),
  // let the first request populate the cache and serve the rest without waiting on Neon.
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return NextResponse.json(
      { plugins: [], count: 0, loading: true },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Retry-After': '1',
          'X-Plugin-Cache': 'loading',
        },
      },
    );
  }

  if (cached && cached.expiresAt > now) {
    pluginListCache.delete(cacheKey);
    pluginListCache.set(cacheKey, cached);
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  if (cached && cached.staleUntil > now) {
    if (!cached.retryAfter || cached.retryAfter <= now) {
      void startPluginListRefresh(cacheKey, cookies, params);
    }

    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Plugin-Cache': 'stale',
      },
    });
  }

  if (cached) {
    pluginListCache.delete(cacheKey);
  }

  const request = startPluginListRefresh(cacheKey, cookies, params);

  const result = await request;
  if (!result.cacheable && cached && cached.staleUntil > now) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Plugin-Cache': 'stale',
      },
    });
  }
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (result.serverTiming) headers.set('Server-Timing', result.serverTiming);
  return NextResponse.json(result.data, {
    status: result.cacheable ? 200 : 503,
    headers,
  });
}
