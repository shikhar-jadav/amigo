'use client';

import React, { useState, useRef } from 'react';
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Tag,
  Clock,
  Globe,
  Search,
  Check,
  CheckSquare,
  Square,
  X,
  FolderGit2,
} from 'lucide-react';
import { scanSkillPackage, SkillScanResult } from '@/lib/securityScanner';

interface SkillPublishModalProps {
  isOpen: boolean;
  onBack: () => void;
  onClose: () => void;
  onSuccess: (plugin?: any) => void;
}

interface DiscoveredSkill {
  name: string;
  slug: string;
  description: string;
  path: string;
  skill_md_path: string;
  version?: string;
  tags?: string[];
}

interface RepoInspectionResult {
  owner: string;
  repo: string;
  branch: string;
  url: string;
  count: number;
  skills: DiscoveredSkill[];
}

export const SkillPublishModal: React.FC<SkillPublishModalProps> = ({
  isOpen,
  onBack,
  onClose,
  onSuccess,
}) => {
  const [sourceMode, setSourceMode] = useState<'upload' | 'github'>('upload');

  // File & Scan State
  const [file, setFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<SkillScanResult | null>(null);

  // GitHub Import State
  const [githubUrl, setGithubUrl] = useState('');
  const [isInspectingGh, setIsInspectingGh] = useState(false);
  const [ghInspection, setGhInspection] = useState<RepoInspectionResult | null>(null);
  const [selectedGhSkills, setSelectedGhSkills] = useState<DiscoveredSkill[]>([]);
  const [isPackagingGh, setIsPackagingGh] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);

  // Editable metadata (pre-filled from SKILL.md frontmatter for single-skill upload)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [changelog, setChangelog] = useState('Initial release');
  const [category, setCategory] = useState('Workflow Skills');
  const [tags, setTags] = useState('Workflow Skills, Automation');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setUploadError(null);
    setSuccessMessage(null);
    setIsScanning(true);

    try {
      const result = await scanSkillPackage(selectedFile);
      setScanResult(result);

      // Auto-populate metadata from YAML frontmatter
      if (result.name) setName(result.name);
      if (result.description) setDescription(result.description);
      if (result.version) setVersion(result.version);
      if (result.tags && result.tags.length > 0) {
        setTags(result.tags.join(', '));
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to scan skill file');
    } finally {
      setIsScanning(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Inspect GitHub repository for skills (supports monorepos like npx skills add)
  const handleInspectGithub = async (urlToInspect?: string) => {
    const targetUrl = (urlToInspect || githubUrl).trim();
    if (!targetUrl) {
      setUploadError('Please enter a GitHub repository URL or shorthand (e.g. vercel-labs/agent-skills)');
      return;
    }

    setIsInspectingGh(true);
    setUploadError(null);
    setGhInspection(null);
    setSelectedGhSkills([]);
    setSkillFilter('');

    try {
      const res = await fetch('/api/marketplace/github/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to inspect GitHub repository');
      }

      setGhInspection(data);

      // If exactly 1 skill found, automatically select and package it
      if (data.skills && data.skills.length === 1) {
        setSelectedGhSkills([data.skills[0]]);
        await handlePackageAndPreview(data.skills[0], data);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to inspect GitHub repository');
    } finally {
      setIsInspectingGh(false);
    }
  };

  // Package target skill subfolder from GitHub and run local security scan for preview/single publish
  const handlePackageAndPreview = async (skill: DiscoveredSkill, inspectionContext?: RepoInspectionResult) => {
    const context = inspectionContext || ghInspection;
    if (!context) return;

    setIsPackagingGh(true);
    setUploadError(null);

    try {
      const res = await fetch('/api/marketplace/github/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          path: skill.path,
          subpath: skill.path,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to package skill from GitHub');
      }

      const blob = await res.blob();
      const slug = skill.slug || 'custom-skill';
      const packagedFile = new File([blob], `${slug}.zip`, { type: 'application/zip' });

      // Run local AST security scan and prefill
      await handleFileChange(packagedFile);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to slice and package skill from GitHub');
    } finally {
      setIsPackagingGh(false);
    }
  };

  // Toggle skill selection in multi-skill mode
  const toggleGhSkill = async (skill: DiscoveredSkill) => {
    const exists = selectedGhSkills.some((s) => s.path === skill.path);
    const updated = exists
      ? selectedGhSkills.filter((s) => s.path !== skill.path)
      : [...selectedGhSkills, skill];

    setSelectedGhSkills(updated);

    if (updated.length === 1) {
      await handlePackageAndPreview(updated[0]);
    } else {
      setFile(null);
      setScanResult(null);
    }
  };

  // Select all / Deselect all
  const handleSelectAllGhSkills = () => {
    if (!ghInspection) return;
    const filtered = ghInspection.skills.filter((s) => {
      if (!skillFilter.trim()) return true;
      const q = skillFilter.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.path && s.path.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    });

    const allSelected = filtered.every((f) => selectedGhSkills.some((s) => s.path === f.path));
    if (allSelected) {
      const remaining = selectedGhSkills.filter((s) => !filtered.some((f) => f.path === s.path));
      setSelectedGhSkills(remaining);
      if (remaining.length === 1) {
        handlePackageAndPreview(remaining[0]);
      } else {
        setFile(null);
        setScanResult(null);
      }
    } else {
      const newItems = filtered.filter((f) => !selectedGhSkills.some((s) => s.path === f.path));
      const updated = [...selectedGhSkills, ...newItems];
      setSelectedGhSkills(updated);
      if (updated.length === 1) {
        handlePackageAndPreview(updated[0]);
      } else {
        setFile(null);
        setScanResult(null);
      }
    }
  };

  // Batch Publish multiple selected skills individually
  const handleBatchPublish = async () => {
    if (selectedGhSkills.length === 0 || !ghInspection) return;

    setIsUploading(true);
    setUploadError(null);
    setSuccessMessage(null);
    setBatchProgress({ current: 0, total: selectedGhSkills.length, currentName: '' });

    let successCount = 0;
    const failed: string[] = [];
    const failedSkills: DiscoveredSkill[] = [];

    for (let i = 0; i < selectedGhSkills.length; i++) {
      const skill = selectedGhSkills[i];
      setBatchProgress({
        current: i + 1,
        total: selectedGhSkills.length,
        currentName: skill.name,
      });

      try {
        // 1. Package target skill
        const res = await fetch('/api/marketplace/github/package', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: ghInspection.owner,
            repo: ghInspection.repo,
            branch: ghInspection.branch,
            path: skill.path,
            subpath: skill.path,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.detail || errJson.error || `Failed to package ${skill.name}`);
        }

        const blob = await res.blob();
        const slug = skill.slug || 'skill';
        const packagedFile = new File([blob], `${slug}.zip`, { type: 'application/zip' });

        // 2. Scan skill package
        const scan = await scanSkillPackage(packagedFile);
        if (!scan.valid) {
          throw new Error(`Security check failed (${scan.findings?.join('; ') || 'malformed structure'})`);
        }

        // 3. Publish to registry individually
        const formData = new FormData();
        formData.append('file', packagedFile);
        formData.append('name', skill.name || scan.name || slug);
        formData.append('description', skill.description || scan.description || `Workflow skill: ${skill.name}`);
        formData.append('version', skill.version || scan.version || '1.0.0');
        formData.append('changelog', 'Imported from GitHub');
        formData.append('category', 'Workflow Skills');
        formData.append('tags', Array.isArray(skill.tags) ? skill.tags.join(', ') : (skill.tags || 'Workflow Skills'));

        const pubRes = await fetch('/api/marketplace/publish/skill', {
          method: 'POST',
          body: formData,
        });

        if (!pubRes.ok) {
          const errData = await pubRes.json().catch(() => ({}));
          throw new Error(errData.detail || errData.error || `Publish failed HTTP ${pubRes.status}`);
        }

        successCount++;
      } catch (err: any) {
        console.error(`Failed to publish skill ${skill.name}:`, err);
        failed.push(`${skill.name}: ${err.message}`);
        failedSkills.push(skill);
      }
    }

    setIsUploading(false);
    setBatchProgress(null);

    if (failed.length > 0) {
      const attemptedCount = selectedGhSkills.length;
      setSelectedGhSkills(failedSkills);
      setUploadError(`Published ${successCount}/${attemptedCount} skills. Only the ${failedSkills.length} failed skill(s) remain selected for retry: ${failed.join('; ')}`);
    } else {
      setSuccessMessage(`Successfully published all ${successCount} skills individually to the Marketplace!`);
      setTimeout(() => {
        onSuccess({});
        onClose();
      }, 1500);
    }
  };

  // Publish to Cloud Marketplace registry (single or batch)
  const handlePublish = async () => {
    if (sourceMode === 'github' && selectedGhSkills.length > 1) {
      await handleBatchPublish();
      return;
    }

    if (!file || !scanResult?.valid) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name || scanResult.name);
      formData.append('description', description || scanResult.description);
      formData.append('version', version || '1.0.0');
      formData.append('changelog', changelog || 'Initial release');
      formData.append('category', category);
      formData.append('tags', tags);

      const res = await fetch('/api/marketplace/publish/skill', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to publish skill');
      }

      onSuccess(data.plugin || data);
      onClose();
    } catch (err: any) {
      setUploadError(err.message || 'Error uploading skill');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-[660px] max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0e0e0e] border border-[#202020] shadow-2xl p-6 sm:p-8 text-[#ccc]">
        {/* Back breadcrumb */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft size={14} />
          <span>Skills</span>
        </button>

        {/* Title & Subtitle */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Add a skill</h2>
            <p className="text-xs text-[#7a7a7a] mt-0.5 leading-relaxed">
              Import from GitHub or upload files. A security scan runs on import.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-violet-950/40 text-violet-300 border border-violet-800/40">
            Talos Skills
          </span>
        </div>

        {/* Source Mode Switcher */}
        <div className="mt-5 flex items-center gap-1.5 p-1 rounded-2xl bg-[#141414] border border-[#222]">
          <button
            type="button"
            onClick={() => setSourceMode('upload')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              sourceMode === 'upload'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-[#888] hover:text-white'
            }`}
          >
            <Upload size={13} />
            <span>Upload File (.zip, .md)</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('github')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              sourceMode === 'github'
                ? 'bg-violet-600 text-white font-semibold shadow-sm shadow-violet-900/50'
                : 'text-[#888] hover:text-white'
            }`}
          >
            <FolderGit2 size={13} />
            <span>Import from GitHub (npx skills)</span>
          </button>
        </div>

        {/* ── Mode 1: GitHub / Monorepo Import ── */}
        {sourceMode === 'github' && (
          <div className="mt-5 space-y-4 animate-in fade-in duration-150">
            <div>
              <label className="block text-xs font-semibold text-white mb-1.5">
                GitHub Repository or Subfolder URL
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleInspectGithub();
                      }
                    }}
                    placeholder="e.g. vercel-labs/agent-skills or github.com/owner/repo/tree/main/skills/subpath"
                    className="w-full rounded-xl bg-[#141414] border border-[#282828] pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-[#555] focus:outline-none focus:border-violet-500 font-mono"
                  />
                  <Globe size={14} className="absolute left-3 top-3 text-[#666]" />
                </div>
                <button
                  type="button"
                  onClick={() => handleInspectGithub()}
                  disabled={isInspectingGh || !githubUrl.trim()}
                  className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {isInspectingGh ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                  <span>Inspect</span>
                </button>
              </div>

              {/* Preset suggestion pills */}
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-[11px] text-[#666]">
                <span>Popular:</span>
                {[
                  'vercel-labs/agent-skills',
                  'humanlayer/skills',
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setGithubUrl(s);
                      handleInspectGithub(s);
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#181818] hover:bg-[#222] text-[#aaa] hover:text-white border border-[#262626] transition-colors cursor-pointer font-mono"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Packaging Spinner */}
            {isPackagingGh && (
              <div className="p-4 rounded-2xl bg-violet-950/20 border border-violet-800/40 text-xs text-violet-300 flex items-center gap-2.5 animate-pulse">
                <Loader2 size={15} className="animate-spin text-violet-400" />
                <span>Downloading subfolder and packaging into standard skill ZIP...</span>
              </div>
            )}

            {/* Monorepo Skill Discovery Cards */}
            {ghInspection && ghInspection.skills.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-[#888]">
                  <span className="flex items-center gap-1.5">
                    <span>Found {ghInspection.count} skill(s) in {ghInspection.owner}/{ghInspection.repo}</span>
                    {selectedGhSkills.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-950/60 text-violet-300 border border-violet-800/40">
                        {selectedGhSkills.length} selected
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSelectAllGhSkills}
                      className="text-[11px] font-medium text-violet-400 hover:text-violet-300 underline cursor-pointer"
                    >
                      {ghInspection.skills.filter((s) => {
                        if (!skillFilter.trim()) return true;
                        const q = skillFilter.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          (s.path && s.path.toLowerCase().includes(q)) ||
                          (s.description && s.description.toLowerCase().includes(q))
                        );
                      }).every((f) => selectedGhSkills.some((s) => s.path === f.path)) && selectedGhSkills.length > 0
                        ? 'Deselect All'
                        : `Select All (${
                            ghInspection.skills.filter((s) => {
                              if (!skillFilter.trim()) return true;
                              const q = skillFilter.toLowerCase();
                              return (
                                s.name.toLowerCase().includes(q) ||
                                (s.path && s.path.toLowerCase().includes(q)) ||
                                (s.description && s.description.toLowerCase().includes(q))
                              );
                            }).length
                          })`}
                    </button>
                    <span className="text-[11px] font-mono text-emerald-400">Branch: {ghInspection.branch}</span>
                  </div>
                </div>

                {ghInspection.skills.length > 5 && (
                  <input
                    type="text"
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    placeholder="Search discovered skills..."
                    className="w-full px-3 py-1.5 rounded-xl bg-[#141414] border border-[#222] text-xs text-white placeholder-[#555] focus:outline-none focus:border-violet-500/60"
                  />
                )}

                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {ghInspection.skills
                    .filter((s) => {
                      if (!skillFilter.trim()) return true;
                      const q = skillFilter.toLowerCase();
                      return (
                        s.name.toLowerCase().includes(q) ||
                        (s.path && s.path.toLowerCase().includes(q)) ||
                        (s.description && s.description.toLowerCase().includes(q))
                      );
                    })
                    .map((s) => {
                      const isSelected = selectedGhSkills.some((sel) => sel.path === s.path);
                      return (
                        <div
                          key={s.path}
                          onClick={() => toggleGhSkill(s)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-left ${
                            isSelected
                              ? 'bg-violet-950/40 border-violet-500 shadow-md ring-1 ring-violet-500/50'
                              : 'bg-[#121212] border-[#222] hover:border-[#383838] hover:bg-[#161616]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`p-0.5 rounded text-xs ${isSelected ? 'text-violet-400' : 'text-[#555]'}`}>
                              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-semibold text-white truncate">{s.name}</h4>
                                <span className="text-[10px] font-mono text-[#666] truncate">{s.path || 'root'}</span>
                              </div>
                              <p className="text-[11px] text-[#888] line-clamp-1 mt-0.5">{s.description}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-colors shrink-0 ${
                              isSelected
                                ? 'bg-violet-600 text-white'
                                : 'bg-[#1f1f1f] text-[#ccc] hover:bg-[#282828] hover:text-white'
                            }`}
                          >
                            {isSelected ? '✓ Selected' : 'Select'}
                          </button>
                        </div>
                      );
                    })}
                </div>

                {/* Multi-skill selected preview chips */}
                {selectedGhSkills.length > 1 && (
                  <div className="p-3.5 rounded-2xl bg-violet-950/20 border border-violet-800/40 space-y-2 mt-2">
                    <div className="flex items-center justify-between text-xs text-violet-300 font-semibold">
                      <span>Ready to publish {selectedGhSkills.length} skills individually:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGhSkills([]);
                          setFile(null);
                          setScanResult(null);
                        }}
                        className="text-[11px] text-[#888] hover:text-white underline cursor-pointer"
                      >
                        Clear selection
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {selectedGhSkills.map((s) => (
                        <span
                          key={s.path}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-900/40 border border-violet-700/40 text-[11px] text-violet-200"
                        >
                          <span>{s.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGhSkill(s);
                            }}
                            className="text-violet-400 hover:text-white cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#888] pt-1">
                      Each skill will be automatically extracted from its subfolder, security scanned, and published as its own independent listing in the Marketplace.
                    </p>
                  </div>
                )}

                {/* Batch Publishing Progress Bar */}
                {batchProgress && (
                  <div className="p-4 rounded-2xl bg-[#141414] border border-violet-500/40 space-y-2 animate-pulse mt-2">
                    <div className="flex items-center justify-between text-xs text-white font-medium">
                      <span className="flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin text-violet-400" />
                        <span>Publishing {batchProgress.current} of {batchProgress.total}: <strong>{batchProgress.currentName}</strong>...</span>
                      </span>
                      <span className="font-mono text-violet-400">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-600 transition-all duration-300"
                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {ghInspection && ghInspection.skills.length === 0 && (
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#222] text-xs text-[#888] text-center">
                No `SKILL.md` found in this repository. Ensure the target directory contains a valid `SKILL.md` file.
              </div>
            )}
          </div>
        )}

        {/* ── Mode 2: File Upload ── */}
        {sourceMode === 'upload' && (
          <div className="mt-5 animate-in fade-in duration-150">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.skill,.zip"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed transition-all cursor-pointer ${
                file
                  ? 'border-violet-500/50 bg-violet-950/10'
                  : 'border-[#282828] bg-[#121212] hover:border-[#383838] hover:bg-[#151515]'
              }`}
            >
              <div className="p-3 rounded-full bg-[#1c1c1c] mb-3 text-[#aaa]">
                <Upload size={18} />
              </div>
              <p className="text-xs text-[#bbb] text-center font-medium">
                {file ? (
                  <span className="text-white font-semibold flex items-center gap-1.5">
                    <FileCode size={14} className="text-violet-400" />
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                ) : (
                  'Drag and drop skill files here, or browse — .md or .zip archive'
                )}
              </p>
            </div>

            <ul className="mt-3 space-y-1 text-[11px] text-[#6e6e6e] list-disc list-inside">
              <li>.md file must contain skill name and description formatted in YAML</li>
              <li>.zip or .skill file must include a SKILL.md file</li>
            </ul>
          </div>
        )}

        {/* Section: Security scan & Metadata (Visible for single skill or file upload) */}
        {!(sourceMode === 'github' && selectedGhSkills.length > 1) && (
          <>
            {/* Section: Security scan */}
            <div className="mt-5">
          {!file ? (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#141414] border border-[#222] text-xs text-[#888]">
              <span className="font-medium text-[#aaa]">Security scan</span>
              <span>Runs automatically when selected</span>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#141414] border border-[#252525] space-y-3">
              <div className="flex items-center justify-between border-b border-[#202020] pb-2.5">
                <div className="flex items-center gap-2">
                  {isScanning ? (
                    <Loader2 size={14} className="animate-spin text-violet-400" />
                  ) : scanResult?.valid ? (
                    <ShieldCheck size={16} className="text-emerald-400" />
                  ) : (
                    <ShieldAlert size={16} className="text-red-400" />
                  )}
                  <span className="text-xs font-semibold text-white">Security scan</span>
                </div>
                <span className="text-[11px] text-[#777]">
                  {isScanning ? 'Inspecting code...' : scanResult?.valid ? 'All checks passed' : 'Action required'}
                </span>
              </div>

              {scanResult?.checks && (
                <div className="space-y-2">
                  {scanResult.checks.map((chk) => (
                    <div key={chk.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2">
                        {chk.status === 'passed' ? (
                          <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                        ) : chk.status === 'failed' ? (
                          <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                        ) : (
                          <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="text-[#ccc] font-medium text-[12px]">{chk.title}</p>
                          <p className="text-[11px] text-[#666]">{chk.description}</p>
                          {chk.detail && (
                            <p className="text-[10px] text-[#888] font-mono mt-0.5">{chk.detail}</p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          chk.status === 'passed'
                            ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-900/40'
                            : chk.status === 'failed'
                            ? 'text-red-400 bg-red-950/40 border border-red-900/40'
                            : 'text-amber-400 bg-amber-950/40 border border-amber-900/40'
                        }`}
                      >
                        {chk.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {scanResult?.findings && scanResult.findings.length > 0 && (
                <div className="mt-2 p-2.5 rounded-xl bg-red-950/30 border border-red-900/40 text-xs text-red-300 space-y-1">
                  <p className="font-semibold text-red-200">Security warnings detected:</p>
                  {scanResult.findings.map((f, idx) => (
                    <p key={idx} className="text-[11px] leading-relaxed">• {f}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Metadata & Versioning UI (visible once scanned) */}
        {scanResult && (
          <div className="mt-5 space-y-3.5 border-t border-[#1e1e1e] pt-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs text-[#aaa] font-medium mb-1">Skill Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. React Best Practices"
                className="w-full rounded-xl bg-[#161616] border border-[#262626] px-3.5 py-2 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#aaa] font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief summary of what this skill does"
                className="w-full rounded-xl bg-[#161616] border border-[#262626] px-3.5 py-2 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#444] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#aaa] font-medium mb-1 flex items-center gap-1.5">
                  <Clock size={11} />
                  <span>Version (Semver)</span>
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="w-full rounded-xl bg-[#161616] border border-[#262626] px-3 py-1.5 text-xs text-white font-mono placeholder-[#555] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-[#aaa] font-medium mb-1 flex items-center gap-1.5">
                  <Tag size={11} />
                  <span>Changelog</span>
                </label>
                <input
                  type="text"
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  placeholder="Initial release"
                  className="w-full rounded-xl bg-[#161616] border border-[#262626] px-3 py-1.5 text-xs text-white placeholder-[#555] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </>
    )}

        {/* Error / Success Banners */}
        {uploadError && (
          <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400">
            {uploadError}
          </div>
        )}
        {successMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-[#1c1c1c] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePublish}
              disabled={
                isUploading ||
                isScanning ||
                isPackagingGh ||
                (sourceMode === 'github'
                  ? selectedGhSkills.length === 0 || (selectedGhSkills.length === 1 && !scanResult?.valid)
                  : !file || !scanResult?.valid)
              }
              className="px-4 py-2 rounded-xl bg-white hover:bg-[#e0e0e0] text-black text-xs font-semibold disabled:opacity-30 disabled:hover:bg-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isUploading && <Loader2 size={12} className="animate-spin" />}
              <span>
                {isUploading
                  ? batchProgress
                    ? `Publishing (${batchProgress.current}/${batchProgress.total})...`
                    : 'Publishing...'
                  : sourceMode === 'github' && selectedGhSkills.length > 1
                  ? `Publish ${selectedGhSkills.length} Skills to Marketplace`
                  : 'Publish to Marketplace'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-xs font-medium text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <span className="text-[11px] font-medium text-[#888]">
            {sourceMode === 'github'
              ? selectedGhSkills.length === 0
                ? ghInspection?.skills?.length
                  ? '👈 Select one or more skills above'
                  : 'Enter a repository URL to inspect'
                : selectedGhSkills.length === 1
                ? scanResult?.valid
                  ? 'Ready to publish 1 skill'
                  : 'Security check failed'
                : `${selectedGhSkills.length} skills selected for publishing`
              : !file
              ? 'Select or drop a skill file.'
              : scanResult?.valid
              ? 'Ready to publish'
              : 'Security check failed'}
          </span>
        </div>
      </div>
    </div>
  );
};
