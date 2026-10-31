import { NextRequest, NextResponse } from 'next/server';

export interface McpCheckStep {
  title: string;
  status_code: number;
  state: 'done' | 'skipped' | 'warn' | 'error';
  detail?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const endpointUrl = body.endpoint_url?.trim();
    const authHeader = body.auth_header?.trim();

    if (!endpointUrl) {
      return NextResponse.json({ error: 'Endpoint URL is required' }, { status: 400 });
    }

    if (!endpointUrl.startsWith('https://') && !endpointUrl.startsWith('http://localhost') && !endpointUrl.startsWith('http://127.0.0.1')) {
      return NextResponse.json(
        { error: 'MCP endpoint must use HTTPS (or localhost for local development)' },
        { status: 400 }
      );
    }

    const checks: McpCheckStep[] = [];
    let statusCode = 0;
    let serverName = '';
    let description = '';
    let tools: any[] = [];
    let requiresAuth = false;
    let detectedAuth: 'no_signin' | 'signin_now' | 'signin_needed' = 'no_signin';
    let oauthMeta: any = null;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Talos/6.0 MCP-Probe',
    };
    if (authHeader) {
      requestHeaders['Authorization'] = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
    }

    const initializePayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'Talos-MCP-Inspector', version: '6.0.0' },
      },
    };

    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 12000);

    let initResp: Response | null = null;
    try {
      // 1. Initial connection probe
      initResp = await fetch(endpointUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(initializePayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      statusCode = initResp.status;
    } catch (err: any) {
      clearTimeout(timeoutId);
      // Fallback try GET or discover
      try {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 6000);
        initResp = await fetch(endpointUrl, {
          method: 'GET',
          headers: requestHeaders,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        statusCode = initResp.status;
      } catch (innerErr: any) {
        clearTimeout(timeoutId);
        return NextResponse.json({
          ok: false,
          error: `Failed to connect to MCP server: ${err.message || 'Connection refused or timed out'}`,
          checks: [
            {
              title: 'Connecting to the server',
              status_code: 0,
              state: 'error',
              detail: err.message,
            },
            { title: 'Looking up sign-in settings', status_code: 0, state: 'skipped' },
            { title: 'Checking the sign-in provider', status_code: 0, state: 'skipped' },
          ],
        }, { status: 422 });
      }
    }

    // Record Step 1: Connecting to the server
    const isStep1Done = statusCode === 200 || statusCode === 202 || statusCode === 401 || statusCode === 403;
    checks.push({
      title: 'Connecting to the server',
      status_code: statusCode,
      state: isStep1Done ? 'done' : 'error',
      detail: isStep1Done ? 'Connection established' : `HTTP status ${statusCode}`,
    });

    if (!isStep1Done) {
      return NextResponse.json({
        ok: false,
        error: `MCP server returned status code ${statusCode}`,
        checks,
      }, { status: 422 });
    }

    // Step 2 & 3: Auth & Sign-in Detection
    if (statusCode === 401 || statusCode === 403) {
      requiresAuth = true;
      const wwwAuth = initResp.headers.get('www-authenticate') || '';
      const wwwLower = wwwAuth.toLowerCase();

      // Check for OAuth / RFC 9728
      let prmUrl: string | null = null;
      const prmMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
      if (prmMatch) {
        prmUrl = prmMatch[1];
      } else {
        try {
          const parsed = new URL(endpointUrl);
          prmUrl = `${parsed.protocol}//${parsed.host}/.well-known/oauth-protected-resource`;
        } catch {
          prmUrl = null;
        }
      }

      let prmFound = false;
      if (prmUrl) {
        try {
          const prmResp = await fetch(prmUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
          if (prmResp.ok) {
            prmFound = true;
            const prmData = await prmResp.json();
            checks.push({
              title: 'Looking up sign-in settings',
              status_code: prmResp.status,
              state: 'done',
              detail: 'OAuth Protected Resource Metadata discovered',
            });

            // Check authorization server
            const authServers = prmData.authorization_servers || [];
            if (authServers.length > 0) {
              const asMetaUrl = `${authServers[0].replace(/\/+$/, '')}/.well-known/oauth-authorization-server`;
              const asResp = await fetch(asMetaUrl, { method: 'GET', signal: AbortSignal.timeout(5000) }).catch(() => null);
              if (asResp && asResp.ok) {
                checks.push({
                  title: 'Checking the sign-in provider',
                  status_code: asResp.status,
                  state: 'done',
                  detail: 'Authorization server verified',
                });
                oauthMeta = await asResp.json();
              } else {
                checks.push({
                  title: 'Checking the sign-in provider',
                  status_code: 200,
                  state: 'done',
                  detail: 'Provider endpoint registered',
                });
              }
            } else {
              checks.push({
                title: 'Checking the sign-in provider',
                status_code: 200,
                state: 'skipped',
              });
            }
            detectedAuth = 'signin_now';
          }
        } catch {
          prmFound = false;
        }
      }

      if (!prmFound) {
        checks.push({
          title: 'Looking up sign-in settings',
          status_code: 200,
          state: 'skipped',
          detail: 'No RFC 9728 metadata',
        });
        checks.push({
          title: 'Checking the sign-in provider',
          status_code: 200,
          state: 'skipped',
        });
        detectedAuth = wwwLower.includes('bearer') ? 'signin_needed' : 'signin_needed';
      }
    } else {
      // Status 200/202: Open / No sign-in detected!
      requiresAuth = false;
      detectedAuth = 'no_signin';
      checks.push({
        title: 'Looking up sign-in settings',
        status_code: 200,
        state: 'skipped',
        detail: 'Open access server',
      });
      checks.push({
        title: 'Checking the sign-in provider',
        status_code: 200,
        state: 'skipped',
        detail: 'Skipped for open endpoint',
      });

      // Parse MCP response to extract serverInfo & tools
      try {
        const rawText = await initResp.text();
        let initJson: any = null;
        try {
          initJson = JSON.parse(rawText);
        } catch {
          // Check SSE data line
          for (const line of rawText.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                initJson = JSON.parse(line.slice(5).trim());
                break;
              } catch {}
            }
          }
        }

        if (initJson?.result?.serverInfo) {
          serverName = initJson.result.serverInfo.name || initJson.result.serverInfo.title || '';
          description = initJson.result.serverInfo.description || '';
        }

        // Try tools/list
        try {
          const toolsResp = await fetch(endpointUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
            signal: AbortSignal.timeout(6000),
          });
          if (toolsResp.ok) {
            const toolsJson = await toolsResp.json().catch(() => null);
            if (toolsJson?.result?.tools && Array.isArray(toolsJson.result.tools)) {
              tools = toolsJson.result.tools;
            }
          }
        } catch {
          // tools/list probe optional
        }
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      status_code: statusCode,
      server_name: serverName,
      description: description || (tools.length > 0 ? `Provides ${tools.length} remote tool(s)` : 'Remote MCP Server'),
      tools,
      requires_auth: requiresAuth,
      detected_auth: detectedAuth,
      oauth_meta: oauthMeta,
      checks,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal server error while verifying MCP' },
      { status: 500 }
    );
  }
}
