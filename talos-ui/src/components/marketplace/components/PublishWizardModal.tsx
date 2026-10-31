'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Zap,
  Globe,
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { Plugin, PluginType } from '../types';

interface PublishWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished: (plugin?: any) => void;
  existingPlugin?: Plugin | null;
}

type WizardStep = 'type' | 'basic' | 'package' | 'capabilities' | 'review' | 'success';

const CATEGORIES = [
  'Workflow Skills',
  'Coding & Development',
  'Research & Data',
  'MCP Servers',
  'Productivity',
];

const SUGGESTED_TAGS: Record<PluginType, string[]> = {
  skill: ['Workflow Skills', 'Productivity', 'Prompts', 'Automation', 'Utilities', 'Talos Native'],
  mcp: ['MCP Servers', 'Tool Calling', 'Remote Tools', 'SaaS Integration', 'Database', 'API Gateway'],
  agent: ['AI Agents', 'Research', 'Writing', 'Analysis', 'Specialist'],
};

export const PublishWizardModal: React.FC<PublishWizardModalProps> = ({
  isOpen,
  onClose,
  onPublished,
  existingPlugin = null,
}) => {
  // Wizard Navigation
  const [step, setStep] = useState<WizardStep>(existingPlugin ? 'package' : 'type');
  const [pluginType, setPluginType] = useState<PluginType>(existingPlugin?.plugin_type || 'skill');

  // Step 1: Basic Info
  const [name, setName] = useState(existingPlugin?.name || '');
  const [slug, setSlug] = useState(existingPlugin?.slug || '');
  const [shortDesc, setShortDesc] = useState(existingPlugin?.short_desc || existingPlugin?.description || '');
  const [category, setCategory] = useState(existingPlugin?.category || 'Workflow Skills');
  const [iconChar, setIconChar] = useState(existingPlugin?.name ? existingPlugin.name.charAt(0).toUpperCase() : '⚡');

  // Step 2: Package / Connection
  const [packageFile, setPackageFile] = useState<File | null>(null);

  // For Remote MCP:
  const [mcpEndpoint, setMcpEndpoint] = useState(existingPlugin?.endpoint_url || '');
  const [authOption, setAuthOption] = useState<'no_signin' | 'bearer' | 'header'>('no_signin');
  const [authHeaderValue, setAuthHeaderValue] = useState('');
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<any>(null);

  // Step 3: Capabilities & Tags
  const [selectedTags, setSelectedTags] = useState<string[]>(existingPlugin?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [permissions, setPermissions] = useState({
    network: true,
    browser: false,
  });
  const [capabilitiesList, setCapabilitiesList] = useState<string[]>([
    'Automated Execution',
    'Custom Workflows',
  ]);
  const [newCapInput, setNewCapInput] = useState('');

  // Step 4: Release & Review
  const [releaseVersion, setReleaseVersion] = useState(existingPlugin ? '1.1.0' : '1.0.0');
  const [changelog, setChangelog] = useState(existingPlugin ? 'Bug fixes and improvements' : 'Initial release');
  const [isDraft, setIsDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!existingPlugin) {
      const generatedSlug = val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
      setSlug(generatedSlug);
      setIconChar(val.charAt(0).toUpperCase() || '⚡');
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else if (selectedTags.length < 5) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !selectedTags.includes(trimmed) && selectedTags.length < 5) {
      setSelectedTags([...selectedTags, trimmed]);
      setTagInput('');
    }
  };

  const handleFileDrop = (file: File) => {
    setPackageFile(file);
    setPublishError(null);
  };

  const handleTestMCP = async () => {
    if (!mcpEndpoint) return;
    setMcpTesting(true);
    setMcpTestResult(null);
    try {
      const res = await fetch('/api/marketplace/mcp/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint_url: mcpEndpoint,
          auth_type: authOption === 'no_signin' ? 'none' : 'bearer',
          auth_value: authHeaderValue || undefined,
        }),
      });
      const data = await res.json();
      setMcpTestResult(data);
    } catch {
      setMcpTestResult({ ok: false, error: 'Connection probe failed' });
    } finally {
      setMcpTesting(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);

    try {
      if (pluginType === 'skill') {
        if (!packageFile) throw new Error('Skill file or ZIP is required');
        const formData = new FormData();
        formData.append('file', packageFile);
        formData.append('name', name);
        formData.append('description', shortDesc || `${name} skill`);
        formData.append('category', category);
        formData.append('version', releaseVersion);
        formData.append('changelog', changelog);
        formData.append('short_desc', shortDesc);
        if (selectedTags.length > 0) formData.append('tags', selectedTags.join(','));

        const res = await fetch('/api/marketplace/publish/skill', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to publish skill');
        setStep('success');
        onPublished(data.plugin);
      } else if (pluginType === 'mcp') {
        if (!mcpEndpoint || !name || !slug) throw new Error('Please fill required MCP fields');
        const res = await fetch('/api/marketplace/publish/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            slug,
            description: shortDesc || `${name} remote MCP server`,
            endpoint_url: mcpEndpoint,
            version: releaseVersion,
            auth_type: authOption === 'no_signin' ? 'none' : 'bearer',
            auth_value: authHeaderValue || undefined,
            category,
            changelog,
            tags: selectedTags,
            short_desc: shortDesc,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to publish MCP');
        setStep('success');
        onPublished(data.plugin);
      }
    } catch (err: any) {
      setPublishError(err.message || 'Publishing error');
    } finally {
      setIsPublishing(false);
    }
  };

  const stepOrder: WizardStep[] = ['type', 'basic', 'package', 'capabilities', 'review'];
  const currentStepIdx = stepOrder.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[820px] rounded-3xl bg-[#0c0c0c] border border-[#222] shadow-2xl flex flex-col overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#1c1c1c] bg-[#111]">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">
              {existingPlugin
                ? `New Version · ${existingPlugin.name}`
                : step === 'type'
                ? 'Create a Plugin'
                : `Publish ${pluginType === 'skill' ? 'Skill' : 'Remote MCP'}`}
            </h2>
            {isDraft && (
              <span className="text-[11px] text-[#888] bg-[#1a1a1a] px-2.5 py-0.5 rounded-full border border-[#2b2b2b]">
                Draft saved
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[#202020] text-[#777] hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        {step !== 'type' && step !== 'success' && (
          <div className="px-7 py-3 border-b border-[#1c1c1c] bg-[#0e0e0e] flex items-center justify-between text-xs">
            <div className="flex items-center gap-6">
              {[
                { id: 'basic', label: '1. Basic Info' },
                { id: 'package', label: pluginType === 'mcp' ? '2. Connection' : '2. Package' },
                { id: 'capabilities', label: '3. Capabilities' },
                { id: 'review', label: '4. Review & Release' },
              ].map((s, idx) => {
                const isCurrent = step === s.id;
                const isPast = stepOrder.indexOf(step) > stepOrder.indexOf(s.id as WizardStep);
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 font-medium ${
                      isCurrent
                        ? 'text-white'
                        : isPast
                        ? 'text-emerald-400'
                        : 'text-[#555]'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isCurrent
                          ? 'bg-white text-black'
                          : isPast
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-[#1c1c1c] text-[#666]'
                      }`}
                    >
                      {isPast ? '✓' : idx + 1}
                    </span>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] text-[#666]">
              Step {currentStepIdx} of 4
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-7">
          {/* STEP 0: TYPE */}
          {step === 'type' && (
            <div className="max-w-2xl mx-auto space-y-6 py-4">
              <div className="text-center space-y-1">
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Choose what you're publishing
                </h3>
                <p className="text-xs text-[#888]">
                  Select the package type to create for the Talos ecosystem.
                </p>
              </div>

              <div className="space-y-3.5 pt-2">
                <button
                  onClick={() => {
                    setPluginType('skill');
                    setStep('basic');
                  }}
                  className="w-full p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-[#222] hover:border-[#383838] transition-all text-left flex items-start justify-between group cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                      <Zap size={22} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">SKILL</h4>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/30">
                          Lightweight
                        </span>
                      </div>
                      <p className="text-xs text-[#888] leading-relaxed">
                        Teach Talos how to perform a specific task via instructions, prompts, and local scripts.
                      </p>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-[#555] group-hover:text-white group-hover:translate-x-1 transition-all mt-3" />
                </button>

                <button
                  onClick={() => {
                    setPluginType('mcp');
                    setStep('basic');
                  }}
                  className="w-full p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-[#222] hover:border-[#383838] transition-all text-left flex items-start justify-between group cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Globe size={22} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">REMOTE MCP SERVER</h4>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/30">
                          External
                        </span>
                      </div>
                      <p className="text-xs text-[#888] leading-relaxed">
                        Connect live tools, resources, and databases via the open Model Context Protocol.
                      </p>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-[#555] group-hover:text-white group-hover:translate-x-1 transition-all mt-3" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: BASIC INFO */}
          {step === 'basic' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Basic Information</h3>
                <p className="text-xs text-[#777] mt-0.5">
                  General details visible in marketplace discovery.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#aaa] mb-1">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. GitHub Automation Skill"
                    className="w-full rounded-xl bg-[#141414] border border-[#262626] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#aaa] mb-1">
                    Slug <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="github-automation"
                    className="w-full font-mono rounded-xl bg-[#141414] border border-[#262626] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#aaa] mb-1">
                    Tagline / Short Description
                  </label>
                  <input
                    value={shortDesc}
                    onChange={(e) => setShortDesc(e.target.value)}
                    placeholder="A concise summary of capabilities"
                    className="w-full rounded-xl bg-[#141414] border border-[#262626] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#aaa] mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl bg-[#141414] border border-[#262626] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PACKAGE / CONNECTION */}
          {step === 'package' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {pluginType === 'mcp' ? 'Remote Server Endpoint' : 'Upload Skill Package'}
                </h3>
                <p className="text-xs text-[#777] mt-0.5">
                  {pluginType === 'mcp'
                    ? 'Provide the HTTPS endpoint for your remote Model Context Protocol server.'
                    : 'Upload a SKILL.md file or ZIP bundle containing your skill workflows.'}
                </p>
              </div>

              {pluginType === 'skill' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 border-2 border-dashed border-[#282828] hover:border-[#444] rounded-2xl bg-[#111] text-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.md"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileDrop(e.target.files[0]);
                    }}
                  />
                  <Upload size={28} className="mx-auto mb-2 text-[#666]" />
                  <p className="text-xs text-white font-medium">
                    {packageFile ? packageFile.name : 'Click to select or drop SKILL.md / ZIP file'}
                  </p>
                  <p className="text-[11px] text-[#666] mt-1">Supports .md or .zip archives up to 50MB</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#aaa] mb-1">
                      Endpoint URL <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={mcpEndpoint}
                      onChange={(e) => setMcpEndpoint(e.target.value)}
                      placeholder="https://mcp.example.com/sse"
                      className="w-full font-mono rounded-xl bg-[#141414] border border-[#262626] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleTestMCP}
                    disabled={!mcpEndpoint || mcpTesting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2d2d2d] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {mcpTesting ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-white" />
                        <span>Testing endpoint...</span>
                      </>
                    ) : (
                      <>
                        <Globe size={13} />
                        <span>Test Endpoint</span>
                      </>
                    )}
                  </button>

                  {mcpTestResult && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      <span>Endpoint is reachable</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: CAPABILITIES */}
          {step === 'capabilities' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Discovery & Tags</h3>
                <p className="text-xs text-[#777] mt-0.5">
                  Select tags to help users find your plugin in the marketplace.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(SUGGESTED_TAGS[pluginType] || []).map((t) => {
                    const isSelected = selectedTags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white text-black border-white'
                            : 'bg-[#141414] text-[#888] border-[#222] hover:text-white hover:border-[#333]'
                        }`}
                      >
                        {isSelected ? `✓ ${t}` : `+ ${t}`}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 max-w-sm pt-1">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add custom tag..."
                    className="flex-1 rounded-xl bg-[#141414] border border-[#262626] px-3 py-1.5 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    className="px-3 py-1.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2b2b2b] text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW */}
          {step === 'review' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Review & Release</h3>
                <p className="text-xs text-[#777] mt-0.5">
                  Confirm release metadata before publishing to the Talos Marketplace.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#121212] border border-[#222] space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#aaa] mb-1">
                    Version <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={releaseVersion}
                    onChange={(e) => setReleaseVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full font-mono rounded-xl bg-[#181818] border border-[#2a2a2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#aaa] mb-1">
                    Changelog
                  </label>
                  <textarea
                    rows={3}
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder="What's new in this release?"
                    className="w-full rounded-xl bg-[#181818] border border-[#2a2a2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#444] resize-none"
                  />
                </div>
              </div>

              {publishError && (
                <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-800/40 text-xs text-red-300">
                  {publishError}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: SUCCESS */}
          {step === 'success' && (
            <div className="max-w-md mx-auto text-center space-y-4 py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Published Successfully!
              </h3>
              <p className="text-xs text-[#888] leading-relaxed">
                {name || 'Your plugin'} (v{releaseVersion}) is now live on the Talos Marketplace.
              </p>
              <div className="pt-4">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-[#e4e4e4] transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step !== 'type' && step !== 'success' && (
          <div className="px-7 py-4 border-t border-[#1c1c1c] bg-[#111] flex items-center justify-between">
            <button
              onClick={() => {
                if (step === 'basic') setStep('type');
                else if (step === 'package') setStep('basic');
                else if (step === 'capabilities') setStep('package');
                else if (step === 'review') setStep('capabilities');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#181818] hover:bg-[#222] border border-[#282828] text-xs font-medium text-[#ccc] hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-2.5">
              {step !== 'review' ? (
                <button
                  onClick={() => {
                    if (step === 'basic') {
                      if (!name) {
                        setPublishError('Please enter a plugin name');
                        return;
                      }
                      setPublishError(null);
                      setStep('package');
                    } else if (step === 'package') {
                      if (pluginType !== 'mcp' && !packageFile) {
                        setPublishError('Please upload a package file');
                        return;
                      }
                      if (pluginType === 'mcp' && !mcpEndpoint) {
                        setPublishError('Please enter an MCP endpoint');
                        return;
                      }
                      setPublishError(null);
                      setStep('capabilities');
                    } else if (step === 'capabilities') {
                      setStep('review');
                    }
                  }}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e4e4e4] transition-colors cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight size={13} />
                </button>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-black" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <span>Publish v{releaseVersion}</span>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublishWizardModal;
