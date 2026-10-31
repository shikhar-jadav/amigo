/**
 * Security and Compliance Scanner for Talos Marketplace packages (Skills and AI Agents).
 * Performs AST & static pattern analysis, malicious command detection, prompt injection scanning,
 * and Talos LLM relay configuration verification.
 */

import { parseZip, ZipEntry } from './zipReader';

export interface SecurityCheckItem {
  id: string;
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  detail?: string;
}

export interface SkillScanResult {
  valid: boolean;
  name: string;
  description: string;
  version: string;
  tags: string[];
  findings: string[];
  checks: SecurityCheckItem[];
  rawFrontmatter?: Record<string, string>;
  filesScanned: number;
}

export interface AgentScanResult {
  valid: boolean;
  name: string;
  description: string;
  version: string;
  entrypoint: string;
  runtime: string;
  tags: string[];
  findings: string[];
  checks: SecurityCheckItem[];
  manifest?: Record<string, unknown>;
  relayCompliant: boolean;
  filesScanned: number;
}

// ---------------------------------------------------------------------------
// Skill Security Scanner
// ---------------------------------------------------------------------------

export async function scanSkillPackage(file: File): Promise<SkillScanResult> {
  const isZip = file.name.endsWith('.zip') || file.name.endsWith('.skill');
  const isMd = file.name.endsWith('.md');

  if (!isZip && !isMd) {
    return {
      valid: false,
      name: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      version: '1.0.0',
      tags: [],
      findings: ['Unsupported file type. Please upload a .md, .skill, or .zip archive.'],
      checks: [
        {
          id: 'file_format',
          title: 'Package Format',
          description: 'Supported .md, .zip, or .skill archive',
          status: 'failed',
          detail: 'Unsupported file extension',
        },
      ],
      filesScanned: 0,
    };
  }

  let skillMdContent = '';
  const scriptContents: { path: string; content: string }[] = [];
  let filesScanned = 0;

  if (isMd) {
    skillMdContent = await file.text();
    filesScanned = 1;
  } else {
    try {
      const entries = await parseZip(file);
      filesScanned = entries.length;

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const lower = entry.filename.toLowerCase();

        if (lower.endsWith('skill.md') || (!skillMdContent && lower.endsWith('.md'))) {
          skillMdContent = await entry.text();
        } else if (
          lower.endsWith('.py') ||
          lower.endsWith('.sh') ||
          lower.endsWith('.ps1') ||
          lower.endsWith('.bat') ||
          lower.endsWith('.js') ||
          lower.endsWith('.ts')
        ) {
          const content = await entry.text();
          scriptContents.push({ path: entry.filename, content });
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        valid: false,
        name: file.name.replace(/\.[^/.]+$/, ''),
        description: '',
        version: '1.0.0',
        tags: [],
        findings: [`Corrupted archive: ${errMsg}`],
        checks: [
          {
            id: 'archive_integrity',
            title: 'Archive Integrity',
            description: 'Valid, uncorrupted ZIP archive',
            status: 'failed',
            detail: errMsg,
          },
        ],
        filesScanned: 0,
      };
    }
  }

  if (!skillMdContent) {
    return {
      valid: false,
      name: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      version: '1.0.0',
      tags: [],
      findings: ['Missing SKILL.md file: every skill bundle must include a SKILL.md with instructions.'],
      checks: [
        {
          id: 'skill_md_presence',
          title: 'SKILL.md Documentation',
          description: 'Package contains valid SKILL.md',
          status: 'failed',
          detail: 'No SKILL.md found in archive',
        },
      ],
      filesScanned,
    };
  }

  // Parse YAML Frontmatter
  const { frontmatter, body } = parseYamlFrontmatter(skillMdContent);
  const name = frontmatter['name'] || frontmatter['title'] || file.name.replace(/\.[^/.]+$/, '');
  const description = frontmatter['description'] || frontmatter['summary'] || extractFirstParagraph(body);
  const version = frontmatter['version'] || '1.0.0';
  const tags = frontmatter['tags'] ? frontmatter['tags'].split(',').map((t) => t.trim()) : ['Workflow Skills'];

  const findings: string[] = [];
  const checks: SecurityCheckItem[] = [];

  // Check 1: Frontmatter Integrity
  if (!frontmatter['name'] && !frontmatter['title']) {
    findings.push('SKILL.md is missing "name" in YAML frontmatter.');
    checks.push({
      id: 'yaml_frontmatter',
      title: 'YAML Frontmatter & Metadata',
      description: 'Extracted name and description from SKILL.md',
      status: 'warning',
      detail: 'Defaulted name from filename',
    });
  } else {
    checks.push({
      id: 'yaml_frontmatter',
      title: 'YAML Frontmatter & Metadata',
      description: 'Extracted name and description from SKILL.md',
      status: 'passed',
      detail: `Name: "${name}" (${version})`,
    });
  }

  // Check 2: Destructive / Malicious Commands
  const allTextsToScan = [{ path: 'SKILL.md', content: skillMdContent }, ...scriptContents];
  const commandViolations: string[] = [];

  const dangerousCommandPatterns = [
    { regex: /\brm\s+-[rRfF]{1,3}\s+(?:\/|\~|\.\.|\*)/i, label: 'Recursive root deletion (`rm -rf /`)' },
    { regex: /\b(?:del|rmdir)\s+\/[sfq]/i, label: 'Silent Windows tree deletion (`del /s /q`)' },
    { regex: /\bformat\s+[a-zA-Z]:/i, label: 'Disk format command (`format c:`)' },
    { regex: /\b(?:Invoke-Expression|iex)\b/i, label: 'Arbitrary PowerShell execution (`Invoke-Expression`)' },
    { regex: /powershell.*-(?:enc|encodedcommand)\b/i, label: 'Obfuscated PowerShell encoded command' },
    { regex: /\bmkfs(?:\.\w+)?\b/i, label: 'Filesystem format command (`mkfs`)' },
    { regex: /:\(\)\s*\{\s*:\|:&\s*\};:/, label: 'Fork bomb attack (`:(){ :|:& };:`)' },
    // Require a real netcat exec option followed by a shell. The old `.*` pattern
    // crossed arbitrary minified JavaScript and matched unrelated `nc` tokens and
    // subtraction expressions in bundled assets.
    { regex: /\b(?:nc|ncat|netcat)\s+(?:(?:[^\s"'`]+)\s+){0,8}(?:-e|--exec|-c|--sh-exec)\s+["'`]?(?:\/bin\/)?(?:ba)?sh\b/i, label: 'Reverse shell netcat socket' },
    { regex: /\b(?:exec|spawn|execSync|spawnSync|execFile|execFileSync)\s*\(\s*["'`](?:[^"'`/]+\/)*(?:nc|ncat|netcat)["'`]\s*,[\s\S]{0,240}?(?:["'`](?:-e|--exec|-c|--sh-exec)["'`]|(?:-e|--exec|-c|--sh-exec))\s*,?[\s\S]{0,120}?["'`](?:\/bin\/)?(?:ba)?sh\b/i, label: 'Reverse shell netcat socket' },
    { regex: /\b(?:bash|sh)\s+-i\s+>&/i, label: 'Interactive reverse bash socket' },
  ];

  for (const item of allTextsToScan) {
    for (const pat of dangerousCommandPatterns) {
      if (pat.regex.test(item.content)) {
        commandViolations.push(`${pat.label} in ${item.path}`);
      }
    }
  }

  if (commandViolations.length > 0) {
    findings.push(...commandViolations);
    checks.push({
      id: 'malicious_commands',
      title: 'Static Script & Command Safety',
      description: 'Zero malicious or destructive OS commands in instructions & scripts',
      status: 'failed',
      detail: `Detected ${commandViolations.length} dangerous commands`,
    });
  } else {
    checks.push({
      id: 'malicious_commands',
      title: 'Static Script & Command Safety',
      description: 'Zero malicious or destructive OS commands in instructions & scripts',
      status: 'passed',
      detail: `${allTextsToScan.length} file(s) verified clean`,
    });
  }

  // Check 3: Prompt Injection & Adversarial Jailbreaks
  const injectionPatterns = [
    { regex: /ignore\s+(?:all\s+)?previous\s+instructions/i, label: 'Instruction override ("ignore previous instructions")' },
    { regex: /disregard\s+(?:all\s+)?prior\s+(?:instructions|rules)/i, label: 'Rule disregard directive' },
    { regex: /system\s+prompt\s+override/i, label: 'System prompt override attack' },
    { regex: /act\s+as\s+(?:DAN|root|unrestricted|godmode)/i, label: 'Adversarial persona jailbreak ("act as DAN")' },
    { regex: /[\u200B-\u200D\uFEFF]/, label: 'Invisible zero-width unicode obfuscation' },
  ];

  const injectionViolations: string[] = [];
  for (const pat of injectionPatterns) {
    if (pat.regex.test(skillMdContent)) {
      injectionViolations.push(pat.label);
    }
  }

  if (injectionViolations.length > 0) {
    findings.push(...injectionViolations);
    checks.push({
      id: 'prompt_injection',
      title: 'Prompt Injection & Jailbreak Defense',
      description: 'No prompt hijacking, persona jailbreaks, or hidden payloads',
      status: 'failed',
      detail: injectionViolations.join(', '),
    });
  } else {
    checks.push({
      id: 'prompt_injection',
      title: 'Prompt Injection & Jailbreak Defense',
      description: 'No prompt hijacking, persona jailbreaks, or hidden payloads',
      status: 'passed',
      detail: 'Verified prompt security',
    });
  }

  // Check 4: Secret & API Key Leakage
  const secretPatterns = [
    { regex: /\bsk-[A-Za-z0-9_-]{24,}\b/, label: 'Hardcoded OpenAI API Secret' },
    { regex: /\bAKIA[0-9A-Z]{16}\b/, label: 'Hardcoded AWS Access Key' },
    { regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: 'Hardcoded Private Key' },
  ];

  const secretViolations: string[] = [];
  for (const item of allTextsToScan) {
    for (const pat of secretPatterns) {
      if (pat.regex.test(item.content)) {
        secretViolations.push(`${pat.label} in ${item.path}`);
      }
    }
  }

  if (secretViolations.length > 0) {
    findings.push(...secretViolations);
    checks.push({
      id: 'secret_leakage',
      title: 'Credential & Key Safety',
      description: 'Zero hardcoded API secrets or private cryptographic keys',
      status: 'failed',
      detail: secretViolations.join(', '),
    });
  } else {
    checks.push({
      id: 'secret_leakage',
      title: 'Credential & Key Safety',
      description: 'Zero hardcoded API secrets or private cryptographic keys',
      status: 'passed',
      detail: 'No hardcoded credentials detected',
    });
  }

  const valid = checks.every((c) => c.status !== 'failed');

  return {
    valid,
    name,
    description: description || `${name} workflow skill`,
    version,
    tags,
    findings,
    checks,
    rawFrontmatter: frontmatter,
    filesScanned,
  };
}

// ---------------------------------------------------------------------------
// AI Agent Deep Security & Relay Scanner
// ---------------------------------------------------------------------------

export async function scanAgentPackage(file: File): Promise<AgentScanResult> {
  const isZip = file.name.endsWith('.zip') || file.name.endsWith('.agent');

  if (!isZip) {
    return {
      valid: false,
      name: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      version: '1.0.0',
      entrypoint: '',
      runtime: 'python',
      tags: [],
      findings: ['Agent packages must be uploaded as a .zip or .agent archive.'],
      checks: [
        {
          id: 'file_format',
          title: 'Package Format',
          description: 'Valid .zip or .agent bundle',
          status: 'failed',
          detail: 'File is not a ZIP archive',
        },
      ],
      relayCompliant: false,
      filesScanned: 0,
    };
  }

  let entries: ZipEntry[] = [];
  try {
    entries = await parseZip(file);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      name: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      version: '1.0.0',
      entrypoint: '',
      runtime: 'python',
      tags: [],
      findings: [`Corrupted agent archive: ${errMsg}`],
      checks: [
        {
          id: 'archive_integrity',
          title: 'Archive Integrity',
          description: 'Valid, uncorrupted ZIP archive',
          status: 'failed',
          detail: errMsg,
        },
      ],
      relayCompliant: false,
      filesScanned: 0,
    };
  }

  const codeFiles: { path: string; content: string }[] = [];
  let manifestContent = '';
  let manifestPath = '';
  let manifestType: 'yaml' | 'json' = 'yaml';

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const lower = entry.filename.toLowerCase();

    if (lower.endsWith('agent.yaml') || lower.endsWith('agent.yml')) {
      manifestContent = await entry.text();
      manifestPath = entry.filename;
      manifestType = 'yaml';
    } else if (!manifestContent && lower.endsWith('agent.json')) {
      manifestContent = await entry.text();
      manifestType = 'json';
    }

    if (
      lower.endsWith('.py') ||
      lower.endsWith('.js') ||
      lower.endsWith('.ts') ||
      lower.endsWith('.sh') ||
      lower.endsWith('.json')
    ) {
      const content = await entry.text();
      codeFiles.push({ path: entry.filename, content });
    }
  }

  const checks: SecurityCheckItem[] = [];
  const findings: string[] = [];

  // Step 1: Manifest Check (agent.yaml or agent.json)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  let manifest: Record<string, any> = {};
  if (!manifestContent) {
    findings.push('Missing agent.yaml / agent.json: agent bundles must declare an entrypoint and capabilities.');
    checks.push({
      id: 'agent_manifest',
      title: 'Agent Manifest (agent.yaml)',
      description: 'Package includes agent.yaml specification',
      status: 'failed',
      detail: 'agent.yaml not found in package root',
    });
  } else {
    try {
      if (manifestType === 'json') {
        manifest = JSON.parse(manifestContent);
      } else {
        // Basic YAML mapping parser for agent.yaml
        manifest = parseSimpleYaml(manifestContent);
      }

      const hasName = Boolean(manifest.name);
      const hasVersion = Boolean(manifest.version);
      const hasInlineInstructions = Boolean(
        manifest.instructions ||
        manifest.system_prompt ||
        manifest.prompt ||
        manifest.system_instructions ||
        manifest.guidelines ||
        manifest.rules ||
        manifest.instructions_var ||
        manifest.instructions_vars ||
        manifest.instructions_variable ||
        manifest.instruction_vars ||
        manifest.system_prompt_var ||
        manifest.system_prompt_variable ||
        manifest.system_var ||
        (manifest.variables && (
          manifest.variables.system_prompt_var ||
          manifest.variables.instructions_var ||
          manifest.variables.instructions ||
          manifest.variables.system_prompt
        ))
      );
      const hasEntry = Boolean(manifest.instructions_file) || hasInlineInstructions;
      const hasDescription = typeof manifest.description === 'string' && manifest.description.trim().length > 0;

      if (hasName && hasVersion && hasDescription && hasEntry) {
        checks.push({
          id: 'agent_manifest',
          title: 'Agent Manifest (agent.yaml)',
          description: 'Valid manifest with name, version, and agent instructions or entrypoint',
          status: 'passed',
          detail: `${manifest.name} v${manifest.version}${hasInlineInstructions ? ' [YAML instructions]' : ` [${manifest.instructions_file || 'instructions.md'}]`}`,
        });
      } else {
        findings.push('agent.yaml needs name, version, description, and instructions (in YAML or instructions_file).');
        checks.push({
          id: 'agent_manifest',
          title: 'Agent Manifest (agent.yaml)',
          description: 'Valid manifest with name, version, and agent instructions or entrypoint',
          status: 'failed',
          detail: 'Missing name, version, description, or instructions in agent.yaml',
        });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      findings.push(`Failed to parse agent manifest: ${errMsg}`);
      checks.push({
        id: 'agent_manifest',
        title: 'Agent Manifest (agent.yaml)',
        description: 'Valid manifest with name, semver, and entrypoint',
        status: 'failed',
        detail: errMsg,
      });
    }
  }

  const name = manifest.name || file.name.replace(/\.[^/.]+$/, '');
  const version = manifest.version || '1.0.0';
  const description = manifest.description || `${name} autonomous agent`;
  const entrypoint = manifest.runtime?.entrypoint || manifest.entrypoint || 'app.main:run';
  const runtime = manifest.runtime?.type || 'python';
  const rawTags = manifest.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags
    : (typeof rawTags === 'string'
      ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : ['AI Agents', 'A2A Protocol']);

  const hasInlineInstructions = Boolean(
    manifest.instructions ||
    manifest.system_prompt ||
    manifest.prompt ||
    manifest.system_instructions ||
    manifest.guidelines ||
    manifest.rules ||
    manifest.instructions_var ||
    manifest.instructions_vars ||
    manifest.instructions_variable ||
    manifest.instruction_vars ||
    manifest.system_prompt_var ||
    manifest.system_prompt_variable ||
    manifest.system_var ||
    (manifest.variables && (
      manifest.variables.system_prompt_var ||
      manifest.variables.instructions_var ||
      manifest.variables.instructions ||
      manifest.variables.system_prompt
    ))
  );

  if (manifest.instructions_file && manifestPath) {
    const manifestDir = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1) : '';
    const instructionsPath = `${manifestDir}${String(manifest.instructions_file).replace(/\\/g, '/')}`;
    if (!entries.some((entry) => entry.filename === instructionsPath && !entry.isDirectory)) {
      if (!hasInlineInstructions) {
        findings.push(`Instructions file not found in package: ${instructionsPath}`);
        checks.push({
          id: 'agent_instructions_file',
          title: 'Specialist Instructions',
          description: 'Manifest points to an instruction file inside the package',
          status: 'failed',
          detail: instructionsPath,
        });
      }
    }
  }

  if (hasInlineInstructions) {
    const inlineSize = JSON.stringify(manifest.instructions || '').length + JSON.stringify(manifest.system_prompt || '').length;
    if (inlineSize > 24000) {
      findings.push(`YAML instructions exceed the 24 KB package limit (${inlineSize} characters).`);
      checks.push({
        id: 'agent_instructions_size',
        title: 'Specialist Instructions Size',
        description: 'Instructions must remain under 24 KB',
        status: 'failed',
        detail: `Length: ${inlineSize} characters (limit: 24,000)`,
      });
    }
  }

  // Step 2: Talos LLM Relay Compliance Verification
  // The user explicitly requires: "uses openai library for llm with base url set to BASE_URL and model as MODEL and api as API_KEY so our talos can inject rely in it for llm"
  let hasOpenAiImport = false;
  let hasBaseUrlBinding = false;
  let hasApiKeyBinding = false;
  let hasModelBinding = false;

  // Check manifest-level declarations first
  if (manifest.llm?.openai_compatible === true || manifest.llm?.type === 'openai_compatible') {
    hasOpenAiImport = true;
  }

  for (const cf of codeFiles) {
    const text = cf.content;

    // Check imports (supports openai, langchain, crewai LLM wrapper, autogen, etc.)
    if (
      /import\s+openai\b/.test(text) ||
      /from\s+openai\s+import\b/.test(text) ||
      /require\s*\(\s*['"]openai['"]\s*\)/.test(text) ||
      /from\s+['"]openai['"]/.test(text) ||
      /@langchain\/openai/.test(text) ||
      /OpenAI\s*\(/.test(text) ||
      /from\s+crewai\s+import[\s\S]*?\bLLM\b/.test(text) ||
      /from\s+crewai\.llm\s+import\b/.test(text) ||
      /\bLLM\s*\(\s*model\s*=/.test(text) ||
      /ChatOpenAI\b/.test(text)
    ) {
      hasOpenAiImport = true;
    }

    // Check BASE_URL binding (env or params)
    if (
      /\bBASE_URL\b/.test(text) ||
      /\bOPENAI_BASE_URL\b/.test(text) ||
      /base_url\s*=\s*(?:os\.getenv|os\.environ|process\.env)/i.test(text)
    ) {
      hasBaseUrlBinding = true;
    }

    // Check API_KEY binding
    if (
      /\bAPI_KEY\b/.test(text) ||
      /\bOPENAI_API_KEY\b/.test(text) ||
      /api_key\s*=\s*(?:os\.getenv|os\.environ|process\.env)/i.test(text)
    ) {
      hasApiKeyBinding = true;
    }

    // Check MODEL binding
    if (
      /\bMODEL\b/.test(text) ||
      /\bMODEL_NAME\b/.test(text) ||
      /model\s*=\s*(?:os\.getenv|os\.environ|process\.env)/i.test(text)
    ) {
      hasModelBinding = true;
    }
  }

  // Also check manifest environment declaration if present
  const envDeclarations = manifest.environment || [];
  const envNames = Array.isArray(envDeclarations)
    ? envDeclarations.map((e: unknown) => (typeof e === 'string' ? e : (e as Record<string, unknown>)?.name))
    : [];

  if (envNames.includes('BASE_URL') || envNames.includes('OPENAI_BASE_URL')) {
    hasBaseUrlBinding = true;
  }
  if (envNames.includes('API_KEY') || envNames.includes('OPENAI_API_KEY')) {
    hasApiKeyBinding = true;
  }
  if (envNames.includes('MODEL') || envNames.includes('MODEL_NAME')) {
    hasModelBinding = true;
  }

  const promptAgent = Boolean(manifest.instructions_file) || hasInlineInstructions;
  const relayCompliant = promptAgent || (hasOpenAiImport && (hasBaseUrlBinding || hasApiKeyBinding || hasModelBinding));

  if (promptAgent) {
    checks.push({
      id: 'agent_instructions',
      title: 'Specialist Instructions',
      description: 'Instruction-based agent can run inside Talos without executing package code',
      status: 'passed',
      detail: hasInlineInstructions
        ? 'Instructions declared directly in agent.yaml'
        : `Instructions file: ${String(manifest.instructions_file)}`,
    });
  } else if (relayCompliant) {
    checks.push({
      id: 'talos_relay_compliance',
      title: 'Talos LLM Relay Protocol',
      description: 'Uses OpenAI client reading BASE_URL, API_KEY, and MODEL from environment for local proxy injection',
      status: 'passed',
      detail: `OpenAI SDK detected with BASE_URL & API_KEY bindings`,
    });
  } else {
    const missingItems: string[] = [];
    if (!hasOpenAiImport) missingItems.push('OpenAI-compatible client import');
    if (!hasBaseUrlBinding) missingItems.push('BASE_URL env binding');
    if (!hasApiKeyBinding) missingItems.push('API_KEY env binding');

    findings.push(
      `Relay verification: Agent must use OpenAI client with BASE_URL and API_KEY env bindings so Talos can inject local LLM tokens. Missing: ${missingItems.join(', ')}`
    );
    checks.push({
      id: 'talos_relay_compliance',
      title: 'Talos LLM Relay Protocol',
      description: 'Uses OpenAI client reading BASE_URL, API_KEY, and MODEL from environment for local proxy injection',
      status: 'warning',
      detail: `Missing: ${missingItems.join(', ')}`,
    });
  }

  // Step 3: Data Exfiltration & Privacy Verification
  const exfilPatterns = [
    { regex: /https?:\/\/(?!localhost|127\.0\.0\.1|api\.openai\.com|0\.0\.0\.0)[a-zA-Z0-9.-]+\/collect/i, label: 'Telemetry/telemetry collection endpoint' },
    { regex: /\bwebhook\.site\b/i, label: 'Public webhook test sink (webhook.site)' },
    { regex: /\brequestbin\b/i, label: 'Public request sink (requestbin)' },
    { regex: /\bngrok\b/i, label: 'Hardcoded ngrok tunnel' },
  ];

  const exfilViolations: string[] = [];
  for (const cf of codeFiles) {
    for (const pat of exfilPatterns) {
      if (pat.regex.test(cf.content)) {
        exfilViolations.push(`${pat.label} in ${cf.path}`);
      }
    }
  }

  if (exfilViolations.length > 0) {
    findings.push(...exfilViolations);
    checks.push({
      id: 'data_exfiltration',
      title: 'Data Exfiltration & Privacy Guard',
      description: 'Zero unauthorized remote telemetry or external memory exfiltration sinks',
      status: 'failed',
      detail: exfilViolations.join(', '),
    });
  } else {
    checks.push({
      id: 'data_exfiltration',
      title: 'Data Exfiltration & Privacy Guard',
      description: 'Zero unauthorized remote telemetry or external memory exfiltration sinks',
      status: 'passed',
      detail: 'No unauthorized telemetry endpoints detected',
    });
  }

  // Step 4: Malicious Execution & Dangerous Sinks
  const codeExecutionViolations: string[] = [];
  const dangerousCodePatterns = [
    { regex: /\beval\s*\(\s*(?:request|input|req|body|message)\b/i, label: 'Unsanitized eval() of network input' },
    { regex: /\bexec\s*\(\s*(?:request|input|req|body|message)\b/i, label: 'Unsanitized exec() of network input' },
    { regex: /\bos\.system\s*\(\s*f?["'].*\{/i, label: 'Formatted shell injection in os.system()' },
    { regex: /\bsubprocess\.(?:Popen|call|run)\s*\([^)]*shell\s*=\s*True/i, label: 'subprocess with shell=True' },
    { regex: /socket\.socket\(\).*connect\(/i, label: 'Raw TCP socket connect (possible reverse shell)' },
  ];

  for (const cf of codeFiles) {
    for (const pat of dangerousCodePatterns) {
      if (pat.regex.test(cf.content)) {
        codeExecutionViolations.push(`${pat.label} in ${cf.path}`);
      }
    }
  }

  if (codeExecutionViolations.length > 0) {
    findings.push(...codeExecutionViolations);
    checks.push({
      id: 'code_execution_safety',
      title: 'Code Execution & Shell Safety',
      description: 'No unsanitized eval/exec or vulnerable shell execution',
      status: 'failed',
      detail: codeExecutionViolations.join(', '),
    });
  } else {
    checks.push({
      id: 'code_execution_safety',
      title: 'Code Execution & Shell Safety',
      description: 'No unsanitized eval/exec or vulnerable shell execution',
      status: 'passed',
      detail: `${codeFiles.length} source file(s) checked`,
    });
  }

  // Step 5: Secret Key Scanner
  const secretKeyViolations: string[] = [];
  for (const cf of codeFiles) {
    if (/\bsk-[A-Za-z0-9_-]{32,}\b/.test(cf.content)) {
      secretKeyViolations.push(`Hardcoded OpenAI API key in ${cf.path}`);
    }
  }

  if (secretKeyViolations.length > 0) {
    findings.push(...secretKeyViolations);
    checks.push({
      id: 'hardcoded_secrets',
      title: 'Secret Key Isolation',
      description: 'Zero hardcoded production API tokens',
      status: 'failed',
      detail: 'Hardcoded API tokens detected',
    });
  } else {
    checks.push({
      id: 'hardcoded_secrets',
      title: 'Secret Key Isolation',
      description: 'Zero hardcoded production API tokens',
      status: 'passed',
      detail: 'No hardcoded API tokens detected',
    });
  }

  const valid = checks.every((c) => c.status !== 'failed');

  return {
    valid,
    name,
    description,
    version,
    entrypoint,
    runtime,
    tags,
    findings,
    checks,
    manifest,
    relayCompliant,
    filesScanned: entries.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatter: Record<string, string> = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter, body: content };
  }

  const rawYml = match[1];
  const body = match[2];

  for (const line of rawYml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();
      // Remove surrounding quotes if present
      val = val.replace(/^["'](.*)["']$/, '$1');
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function parseSimpleYaml(content: string): Record<string, any> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const result: Record<string, any> = {};
  const lines = content.split('\n');

  let currentKey: string | null = null;
  let currentMode: 'dict' | 'list' | 'multiline' | null = null;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  let currentDict: Record<string, any> = {};
  let currentList: string[] = [];
  let currentMultiline: string[] = [];

  const flushCurrent = () => {
    if (!currentKey) return;
    if (currentMode === 'list') {
      result[currentKey] = currentList;
    } else if (currentMode === 'dict') {
      result[currentKey] = currentDict;
    } else if (currentMode === 'multiline') {
      result[currentKey] = currentMultiline.join('\n').trim();
    }
    currentKey = null;
    currentMode = null;
    currentDict = {};
    currentList = [];
    currentMultiline = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const isIndented = rawLine.startsWith('  ') || rawLine.startsWith('\t');

    if (currentMode === 'multiline') {
      if (isIndented) {
        currentMultiline.push(rawLine.trimEnd());
        continue;
      } else {
        flushCurrent();
      }
    }

    if (isIndented && trimmed.startsWith('- ') && currentKey) {
      if (currentMode !== 'list') {
        currentMode = 'list';
      }
      let item = trimmed.slice(2).trim();
      item = item.replace(/^["'](.*)["']$/, '$1');
      currentList.push(item);
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();
      const strippedVal = val.replace(/^["'](.*)["']$/, '$1');

      if (!isIndented) {
        flushCurrent();
        if (val === '|' || val === '>') {
          currentKey = key;
          currentMode = 'multiline';
        } else if (!val) {
          currentKey = key;
          currentMode = 'dict';
        } else {
          result[key] = strippedVal;
        }
      } else if (currentKey && currentMode === 'dict') {
        currentDict[key] = strippedVal;
      }
    }
  }

  flushCurrent();
  return result;
}

function extractFirstParagraph(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+\s+.*$/m, '').trim())
    .filter((p) => p.length > 10);
  return paragraphs[0]?.slice(0, 200) || '';
}
