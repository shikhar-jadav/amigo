import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const CLOUD_URL = process.env.TALOS_CLOUD_URL || 'http://127.0.0.1:8000';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const cookies = req.headers.get('cookie') || '';
    
    // 1. Call cloud endpoint to mark uninstalled in database
    const res = await fetch(`${CLOUD_URL}/v1/marketplace/plugins/${id}/uninstall`, {
      method: 'POST',
      headers: { cookie: cookies }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    // 2. Remove only the package directory identified by the cloud record.
    try {
      const talosBase = path.join(os.homedir(), '.talos');
      const slug = typeof data.slug === 'string' ? data.slug : '';
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) {
        return NextResponse.json({ ...data, local_cleanup: 'skipped_invalid_slug' }, { status: res.status });
      }
      const packageRoot = data.plugin_type === 'agent'
        ? path.join(talosBase, 'packages', 'agents')
        : data.plugin_type === 'skill'
          ? path.join(talosBase, 'skills')
          : path.join(talosBase, 'mcp');
      const target = path.resolve(packageRoot, slug);
      if (path.dirname(target) !== path.resolve(packageRoot)) {
        throw new Error('Resolved package path escaped the plugin directory.');
      }
      await fs.rm(target, { recursive: true, force: true });
    } catch (cleanErr) {
      console.warn('Could not clean local plugin directory:', cleanErr);
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to uninstall plugin' },
      { status: 500 }
    );
  }
}
