import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET() {
  try {
    const skillsDir = path.join(os.homedir(), '.talos', 'skills');
    if (!fs.existsSync(skillsDir)) {
      return NextResponse.json({ skills: [] });
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const slug = entry.name;
        const skillFolderPath = path.join(skillsDir, slug);
        const skillMdPath = path.join(skillFolderPath, 'SKILL.md');
        let name = slug;
        if (fs.existsSync(skillMdPath)) {
          try {
            const content = fs.readFileSync(skillMdPath, 'utf8');
            const match = content.match(/^name:\s*(.+)$/m);
            if (match && match[1]) {
              name = match[1].trim();
            }
          } catch {}
        }
        skills.push({
          id: 'local_' + slug,
          slug: slug,
          name: name,
        });
      }
    }

    return NextResponse.json({ skills });
  } catch (err: any) {
    return NextResponse.json({ skills: [], error: err.message });
  }
}
