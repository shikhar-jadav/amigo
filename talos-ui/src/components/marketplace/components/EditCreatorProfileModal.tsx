'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Upload, Trash2, Plus, Globe,
  Check, Lock, ExternalLink, Sparkles,
  AlertCircle, Search,
  ChevronRight, ArrowLeft
} from 'lucide-react';
import { Builder, Plugin } from '../types';

interface EditCreatorProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Builder | null;
  plugins: Plugin[];
  onProfileUpdated: (updatedProfile: Builder, updatedPlugins?: Plugin[]) => void;
}

export type LinkProvider = 'github' | 'x' | 'linkedin' | 'youtube' | 'discord' | 'website' | 'custom';

export interface SocialLinkItem {
  id: string;
  provider: LinkProvider;
  url: string;
  label?: string;
}

// Canonical Expertise Taxonomy
export const CANONICAL_EXPERTISE_TAXONOMY: Record<string, string[]> = {
  'AI & Agents': [
    'AI Agents',
    'Autonomous Agents',
    'Multi-Agent Systems',
    'A2A (Agent-to-Agent)',
    'Agent Memory',
    'LLMs',
    'RAG',
    'Computer Use',
    'Web Agents',
    'Agent Tooling'
  ],
  'Frameworks & SDKs': [
    'LangGraph',
    'LangChain',
    'MCP (Model Context Protocol)',
    'Remote MCP',
    'OpenAI SDK',
    'Anthropic SDK',
    'LlamaIndex',
    'Semantic Kernel'
  ],
  'Languages & Stack': [
    'Python',
    'TypeScript',
    'JavaScript',
    'Rust',
    'Go',
    'React',
    'Next.js',
    'FastAPI',
    'PostgreSQL',
    'Vector DBs'
  ],
  'Workflows & Automation': [
    'Automation',
    'Developer Tools',
    'Code Review',
    'Research & Synthesis',
    'Data Analysis',
    'DevOps & CI/CD',
    'Security Analysis',
    'Content Creation'
  ]
};

const ALL_CANONICAL_EXPERTISE = Object.values(CANONICAL_EXPERTISE_TAXONOMY).flat();

const SUGGESTED_EXPERTISE = [
  'AI Agents',
  'MCP',
  'LangGraph',
  'LLMs',
  'RAG',
  'Computer Use',
  'Web Agents',
  'TypeScript',
  'Python',
  'Automation'
];

// Platform Icons
const GitHubIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const XSocialIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
  </svg>
);

const YouTubeIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.82.42A2.5 2.5 0 0 0 2.42 7.2 26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.77A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81zM10 15.46V8.54L16 12l-6 3.46z"/>
  </svg>
);

const DiscordIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const PROVIDER_METADATA: Record<LinkProvider, { name: string; icon: React.ReactNode; placeholder: string; prefix: string; validate?: (u: string) => boolean }> = {
  github: {
    name: 'GitHub',
    icon: <GitHubIcon size={14} />,
    placeholder: 'https://github.com/username',
    prefix: 'https://github.com/',
    validate: (u) => u.toLowerCase().includes('github.com/')
  },
  x: {
    name: 'X (Twitter)',
    icon: <XSocialIcon size={13} />,
    placeholder: 'https://x.com/username',
    prefix: 'https://x.com/',
    validate: (u) => u.toLowerCase().includes('x.com/') || u.toLowerCase().includes('twitter.com/')
  },
  linkedin: {
    name: 'LinkedIn',
    icon: <LinkedInIcon size={14} />,
    placeholder: 'https://linkedin.com/in/username',
    prefix: 'https://linkedin.com/in/',
    validate: (u) => u.toLowerCase().includes('linkedin.com/')
  },
  youtube: {
    name: 'YouTube',
    icon: <YouTubeIcon size={14} />,
    placeholder: 'https://youtube.com/@handle',
    prefix: 'https://youtube.com/@',
    validate: (u) => u.toLowerCase().includes('youtube.com/')
  },
  discord: {
    name: 'Discord',
    icon: <DiscordIcon size={14} />,
    placeholder: 'https://discord.gg/invite or profile',
    prefix: 'https://discord.gg/',
    validate: (u) => u.toLowerCase().includes('discord.')
  },
  website: {
    name: 'Website',
    icon: <Globe size={14} />,
    placeholder: 'https://mysite.dev',
    prefix: 'https://',
    validate: (u) => u.startsWith('http://') || u.startsWith('https://')
  },
  custom: {
    name: 'Custom URL',
    icon: <ExternalLink size={14} />,
    placeholder: 'https://...',
    prefix: 'https://'
  }
};

export const EditCreatorProfileModal: React.FC<EditCreatorProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  plugins,
  onProfileUpdated,
}) => {
  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  // Structured Links State
  const [linksList, setLinksList] = useState<SocialLinkItem[]>([]);
  const [showAddLinkChooser, setShowAddLinkChooser] = useState(false);
  const [selectedProviderToAdd, setSelectedProviderToAdd] = useState<LinkProvider | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [linkInputError, setLinkInputError] = useState<string | null>(null);

  // Expertise State
  const [expertise, setExpertise] = useState<string[]>([]);
  const [expertiseSearch, setExpertiseSearch] = useState('');
  const [isExpertiseDropdownOpen, setIsExpertiseDropdownOpen] = useState(false);
  const expertiseInputRef = useRef<HTMLInputElement>(null);

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // File upload refs & drag states
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);

  // Read local file as Data URL helper
  const handleImageFile = (file: File, type: 'avatar' | 'cover') => {
    if (!file.type.startsWith('image/')) {
      setSaveError('Please select a valid image file (PNG, JPG, SVG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image file size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (type === 'avatar') {
        setAvatarUrl(result);
      } else {
        setCoverUrl(result);
      }
      setSaveError(null);
    };
    reader.onerror = () => {
      setSaveError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  // Sync initial data whenever modal opens
  useEffect(() => {
    if (isOpen && profile) {
      setDisplayName(profile.display_name || '');
      const links = profile.social_links || {};
      setHeadline(links.headline || 'AI Engineer · Building agents, skills & developer tools for Talos');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
      setCoverUrl(links.cover_url || '');

      // Parse structured links
      const parsedLinks: SocialLinkItem[] = [];
      if (Array.isArray(links.structured_links)) {
        parsedLinks.push(...links.structured_links);
      } else {
        // Fallback / Migrate legacy individual handles
        if (links.github) {
          parsedLinks.push({
            id: 'legacy-gh',
            provider: 'github',
            url: links.github.startsWith('http') ? links.github : `https://github.com/${links.github}`
          });
        }
        if (links.twitter) {
          parsedLinks.push({
            id: 'legacy-x',
            provider: 'x',
            url: links.twitter.startsWith('http') ? links.twitter : `https://x.com/${links.twitter}`
          });
        }
        if (profile.website_url) {
          parsedLinks.push({
            id: 'legacy-web',
            provider: 'website',
            url: profile.website_url.startsWith('http') ? profile.website_url : `https://${profile.website_url}`
          });
        }
        if (Array.isArray(links.custom_links)) {
          links.custom_links.forEach((cl: any) => {
            parsedLinks.push({
              id: cl.id || `custom-${Date.now()}-${Math.random()}`,
              provider: 'custom',
              url: cl.url,
              label: cl.label
            });
          });
        }
      }
      setLinksList(parsedLinks);

      // Parse expertise
      if (Array.isArray(links.specialties) && links.specialties.length > 0) {
        setExpertise(links.specialties);
      } else {
        setExpertise(['AI Agents', 'Automation', 'Developer Tools']);
      }

      setSaveError(null);
      setShowAddLinkChooser(false);
      setSelectedProviderToAdd(null);
    }
  }, [isOpen, profile]);

  // Derived filtered expertise for autocomplete
  const filteredExpertiseOptions = useMemo(() => {
    if (!expertiseSearch.trim()) return [];
    const query = expertiseSearch.toLowerCase();
    return ALL_CANONICAL_EXPERTISE.filter(
      item => item.toLowerCase().includes(query) && !expertise.includes(item)
    );
  }, [expertiseSearch, expertise]);

  if (!isOpen) return null;

  const username = profile?.username || 'builder';
  const initial = (displayName || username).charAt(0).toUpperCase();

  // Expertise Handlers
  const handleAddExpertise = (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    if (expertise.length >= 8) {
      setSaveError('You can select a maximum of 8 expertise areas');
      return;
    }
    if (!expertise.includes(clean)) {
      setExpertise([...expertise, clean]);
      setExpertiseSearch('');
      setIsExpertiseDropdownOpen(false);
      setSaveError(null);
    }
  };

  const handleRemoveExpertise = (tag: string) => {
    setExpertise(expertise.filter(e => e !== tag));
  };

  // Structured Link Handlers
  const handleStartAddLink = (provider: LinkProvider) => {
    setSelectedProviderToAdd(provider);
    setNewLinkUrl('');
    setNewLinkLabel('');
    setLinkInputError(null);
  };

  const handleConfirmAddLink = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProviderToAdd) return;

    let finalUrl = newLinkUrl.trim();
    if (!finalUrl) {
      setLinkInputError('Please enter a URL');
      return;
    }

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const meta = PROVIDER_METADATA[selectedProviderToAdd];
    if (meta.validate && !meta.validate(finalUrl)) {
      setLinkInputError(`Please provide a valid ${meta.name} URL`);
      return;
    }

    const newLink: SocialLinkItem = {
      id: `link-${Date.now()}`,
      provider: selectedProviderToAdd,
      url: finalUrl,
      label: selectedProviderToAdd === 'custom' ? (newLinkLabel.trim() || 'Link') : meta.name
    };

    setLinksList([...linksList, newLink]);
    setSelectedProviderToAdd(null);
    setShowAddLinkChooser(false);
    setNewLinkUrl('');
    setNewLinkLabel('');
    setLinkInputError(null);
  };

  const handleRemoveLink = (id: string) => {
    setLinksList(linksList.filter(l => l.id !== id));
  };

  // Save changes
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      // Derive legacy fields for backwards compatibility with web templates
      const primaryGh = linksList.find(l => l.provider === 'github')?.url.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '') || '';
      const primaryX = linksList.find(l => l.provider === 'x')?.url.replace(/^https?:\/\/(x|twitter)\.com\//, '').replace(/\/$/, '') || '';
      const primaryWeb = linksList.find(l => l.provider === 'website')?.url || '';

      const social_links: Record<string, any> = {
        ...(profile?.social_links || {}),
        headline: headline.trim(),
        specialties: expertise,
        structured_links: linksList,
        github: primaryGh || null,
        twitter: primaryX || null,
        cover_url: coverUrl.trim() || null,
        custom_links: linksList.filter(l => l.provider === 'custom').map(l => ({ id: l.id, label: l.label, url: l.url }))
      };

      const res = await fetch('/api/marketplace/studio/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim(),
          website_url: primaryWeb || null,
          avatar_url: avatarUrl.trim() || null,
          social_links,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        let errMessage = 'Failed to update profile';
        if (typeof data?.detail === 'string') {
          errMessage = data.detail;
        } else if (Array.isArray(data?.detail)) {
          errMessage = data.detail.map((d: any) => d?.msg || JSON.stringify(d)).join(', ');
        } else if (data?.error) {
          errMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        } else {
          errMessage = `Failed to update profile (${res.status})`;
        }
        throw new Error(errMessage);
      }

      onProfileUpdated(data);
      onClose();
    } catch (err: any) {
      console.error('Save profile error:', err);
      setSaveError(err.message || 'Unable to save profile changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl h-[92vh] max-h-[840px] rounded-3xl bg-[#111111] border border-[#262626] shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#202020] bg-[#141414] shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-400" />
              Edit Creator Profile
            </h3>
            <p className="text-[11px] text-[#777] mt-0.5">
              Your public identity across the Talos creator ecosystem.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#777] hover:text-white hover:bg-[#222] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Split Screen */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Scrollable Curator Form */}
          <form id="edit-profile-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-7">
            {/* 1. VISUAL IDENTITY */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold tracking-wider text-[#aaa] uppercase">
                  Visual Identity
                </h4>
                <div className="flex items-center gap-3 text-[10px]">
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="text-red-400/80 hover:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={10} /> Remove photo
                    </button>
                  )}
                  {coverUrl && (
                    <button
                      type="button"
                      onClick={() => setCoverUrl('')}
                      className="text-red-400/80 hover:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={10} /> Reset banner
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Profile Photo Dropzone */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[#888]">Profile Photo</span>
                    {avatarUrl && (
                      <span className="text-[10px] text-emerald-400 font-mono">Image attached</span>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file, 'avatar');
                    }}
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingAvatar(true);
                    }}
                    onDragLeave={() => setIsDraggingAvatar(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingAvatar(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleImageFile(file, 'avatar');
                    }}
                    onClick={() => avatarInputRef.current?.click()}
                    className={`relative w-full h-[120px] rounded-2xl border border-dashed transition-all cursor-pointer flex flex-col justify-between px-4 py-3 select-none ${
                      isDraggingAvatar
                        ? 'border-indigo-400 bg-indigo-950/20'
                        : 'border-[#26282d] bg-[#0f1013] hover:border-[#3a3d45] hover:bg-[#121417]'
                    }`}
                  >
                    {/* Centered 'Drop file or [icon]' */}
                    <div className="flex-1 flex items-center justify-center gap-2.5">
                      <span className="text-[13px] text-[#8e959e] font-normal tracking-wide">
                        Drop file or
                      </span>
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full bg-[#1e2228] hover:bg-[#272c34] border border-[#2d333d] flex items-center justify-center text-[#c8d0da] transition-all shadow-sm"
                        tabIndex={-1}
                      >
                        <Upload size={14} className="stroke-[1.75]" />
                      </button>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="flex items-center justify-between text-[11px] text-[#555a62] font-sans tracking-tight">
                      <span>Formats: JPG, PNG</span>
                      <span>Max size: 500 KB</span>
                    </div>
                  </div>
                </div>

                {/* Cover Banner Dropzone */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[#888]">Cover Banner</span>
                    {coverUrl && (
                      <span className="text-[10px] text-emerald-400 font-mono">Banner attached</span>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file, 'cover');
                    }}
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingCover(true);
                    }}
                    onDragLeave={() => setIsDraggingCover(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingCover(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleImageFile(file, 'cover');
                    }}
                    onClick={() => coverInputRef.current?.click()}
                    className={`relative w-full h-[120px] rounded-2xl border border-dashed transition-all cursor-pointer flex flex-col justify-between px-4 py-3 select-none ${
                      isDraggingCover
                        ? 'border-indigo-400 bg-indigo-950/20'
                        : 'border-[#26282d] bg-[#0f1013] hover:border-[#3a3d45] hover:bg-[#121417]'
                    }`}
                  >
                    {/* Centered 'Drop file or [icon]' */}
                    <div className="flex-1 flex items-center justify-center gap-2.5">
                      <span className="text-[13px] text-[#8e959e] font-normal tracking-wide">
                        Drop file or
                      </span>
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full bg-[#1e2228] hover:bg-[#272c34] border border-[#2d333d] flex items-center justify-center text-[#c8d0da] transition-all shadow-sm"
                        tabIndex={-1}
                      >
                        <Upload size={14} className="stroke-[1.75]" />
                      </button>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="flex items-center justify-between text-[11px] text-[#555a62] font-sans tracking-tight">
                      <span>Formats: JPG, PNG</span>
                      <span>Max size: 500 KB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. IDENTITY */}
            <div className="space-y-3 pt-2 border-t border-[#1f1f1f]">
              <h4 className="text-xs font-bold tracking-wider text-[#aaa] uppercase">
                Identity
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#888] font-medium block mb-1">Display Name</label>
                  <input
                    required
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Shikhar Jadav"
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#888] font-medium block">Username</label>
                    <span className="text-[10px] text-[#666] flex items-center gap-1">
                      <Lock size={10} /> Locked
                    </span>
                  </div>
                  <input
                    disabled
                    value={`@${username}`}
                    className="w-full px-3 py-2 rounded-xl bg-[#121212] border border-[#222] text-xs text-[#777] cursor-not-allowed"
                  />
                  <span className="text-[10px] text-[#555] mt-1 block">Username is your permanent handle</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-[#888] font-medium block">Headline</label>
                  <span className="text-[10px] text-[#666]">{headline.length} / 120</span>
                </div>
                <input
                  maxLength={120}
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="AI Engineer · Building agents, automation & open AI systems"
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-[#888] font-medium block">About</label>
                  <span className="text-[10px] text-[#666]">{bio.length} / 500</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Building useful AI systems with Talos. I create agents, workflows and developer experiences for the open AI ecosystem."
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-xs text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* 3. LINKS (Incremental Chooser & Validation) */}
            <div className="space-y-3 pt-2 border-t border-[#1f1f1f]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-[#aaa] uppercase">
                    Links
                  </h4>
                  <p className="text-[11px] text-[#666] mt-0.5">
                    Add the places where people can find your work.
                  </p>
                </div>
                <span className="text-[10px] text-[#555]">{linksList.length} linked</span>
              </div>

              {/* Active Links List */}
              <div className="space-y-2">
                {linksList.map((link) => {
                  const meta = PROVIDER_METADATA[link.provider] || PROVIDER_METADATA.custom;
                  return (
                    <div
                      key={link.id}
                      className="p-2.5 px-3 rounded-2xl bg-[#151515] border border-[#252525] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-lg bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-[#aaa] shrink-0">
                          {meta.icon}
                        </div>
                        <span className="font-semibold text-white shrink-0">
                          {link.provider === 'custom' ? link.label : meta.name}
                        </span>
                        <span className="text-[11px] text-[#777] font-mono truncate">
                          {link.url}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLink(link.id)}
                        className="p-1 text-[#666] hover:text-red-400 transition-colors cursor-pointer shrink-0"
                        title="Remove link"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add Link Trigger or Subdialog */}
              {!showAddLinkChooser && !selectedProviderToAdd ? (
                <button
                  type="button"
                  onClick={() => setShowAddLinkChooser(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#181818] hover:bg-[#202020] border border-[#282828] text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add link</span>
                </button>
              ) : showAddLinkChooser && !selectedProviderToAdd ? (
                /* Platform Chooser Sheet */
                <div className="p-4 rounded-2xl bg-[#141414] border border-[#282828] space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[#202020]">
                    <span className="text-xs font-bold text-white">Select platform to link</span>
                    <button
                      type="button"
                      onClick={() => setShowAddLinkChooser(false)}
                      className="text-xs text-[#777] hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(PROVIDER_METADATA) as LinkProvider[]).map((prov) => {
                      const meta = PROVIDER_METADATA[prov];
                      return (
                        <button
                          key={prov}
                          type="button"
                          onClick={() => handleStartAddLink(prov)}
                          className="flex items-center gap-2 p-2.5 rounded-xl bg-[#1a1a1a] hover:bg-[#242424] border border-[#282828] text-xs text-white transition-all cursor-pointer text-left"
                        >
                          <span className="text-[#aaa]">{meta.icon}</span>
                          <span className="font-medium truncate">{meta.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : selectedProviderToAdd && (
                /* Targeted URL Config Form */
                <div className="p-4 rounded-2xl bg-[#141414] border border-indigo-500/30 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[#202020]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProviderToAdd(null);
                        setShowAddLinkChooser(true);
                      }}
                      className="flex items-center gap-1 text-xs text-[#888] hover:text-white cursor-pointer"
                    >
                      <ArrowLeft size={12} /> Back to chooser
                    </button>
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                      {PROVIDER_METADATA[selectedProviderToAdd].icon}
                      Add {PROVIDER_METADATA[selectedProviderToAdd].name}
                    </span>
                  </div>

                  {selectedProviderToAdd === 'custom' && (
                    <div>
                      <label className="text-[11px] text-[#888] block mb-1">Custom Link Label</label>
                      <input
                        value={newLinkLabel}
                        onChange={e => setNewLinkLabel(e.target.value)}
                        placeholder="e.g. My Technical Blog"
                        className="w-full px-3 py-2 rounded-xl bg-[#0e0e0e] border border-[#2b2b2b] text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-[#888] block mb-1">Profile / Page URL</label>
                    <input
                      autoFocus
                      value={newLinkUrl}
                      onChange={e => {
                        setNewLinkUrl(e.target.value);
                        setLinkInputError(null);
                      }}
                      placeholder={PROVIDER_METADATA[selectedProviderToAdd].placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-[#0e0e0e] border border-[#2b2b2b] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {linkInputError && (
                    <p className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} /> {linkInputError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProviderToAdd(null);
                        setShowAddLinkChooser(false);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs text-[#888] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmAddLink}
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Add link
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. EXPERTISE (Taxonomy & Autocomplete Search) */}
            <div className="space-y-3 pt-2 border-t border-[#1f1f1f]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-[#aaa] uppercase">
                    Expertise
                  </h4>
                  <p className="text-[11px] text-[#666] mt-0.5">
                    Help people discover what you build. Choose up to 8 specialties.
                  </p>
                </div>
                <span className="text-[10px] text-[#666]">{expertise.length} / 8</span>
              </div>

              {/* Selected Expertise Chips */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-2xl bg-[#141414] border border-[#242424] min-h-[44px]">
                {expertise.length === 0 ? (
                  <span className="text-xs text-[#666] px-2">No expertise selected yet.</span>
                ) : (
                  expertise.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#1a1a24] border border-indigo-500/30 text-xs font-medium text-indigo-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveExpertise(tag)}
                        className="text-indigo-400/60 hover:text-indigo-200 cursor-pointer text-xs"
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Autocomplete Input Search */}
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] focus-within:border-indigo-500 transition-colors">
                  <Search size={13} className="text-[#666]" />
                  <input
                    ref={expertiseInputRef}
                    value={expertiseSearch}
                    onChange={(e) => {
                      setExpertiseSearch(e.target.value);
                      setIsExpertiseDropdownOpen(true);
                    }}
                    onFocus={() => setIsExpertiseDropdownOpen(true)}
                    placeholder="Search canonical expertise (e.g. Agents, MCP, LangGraph, Python)..."
                    className="w-full bg-transparent text-xs text-white focus:outline-none placeholder:text-[#555]"
                  />
                  {expertiseSearch && (
                    <button
                      type="button"
                      onClick={() => setExpertiseSearch('')}
                      className="text-xs text-[#666] hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Dropdown Options */}
                {isExpertiseDropdownOpen && filteredExpertiseOptions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl bg-[#141414] border border-[#2e2e2e] shadow-2xl py-1 divide-y divide-[#1e1e1e]">
                    {filteredExpertiseOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleAddExpertise(opt)}
                        className="w-full px-3 py-2 text-left text-xs text-[#ddd] hover:text-white hover:bg-indigo-950/40 transition-colors flex items-center justify-between"
                      >
                        <span>{opt}</span>
                        <span className="text-[10px] text-indigo-400 font-medium">+ Add</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggested Specialties Pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold tracking-wider text-[#666] uppercase block">
                  Suggested Canonical Specialties
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_EXPERTISE.map((sug) => {
                    const isSelected = expertise.includes(sug);
                    return (
                      <button
                        key={sug}
                        type="button"
                        disabled={isSelected || expertise.length >= 8}
                        onClick={() => handleAddExpertise(sug)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#181818] text-[#555] border border-[#222] cursor-not-allowed'
                            : 'bg-[#181818] hover:bg-[#222] text-[#aaa] hover:text-white border border-[#282828]'
                        }`}
                      >
                        {isSelected ? `✓ ${sug}` : `+ ${sug}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {saveError && (
              <div className="p-3 rounded-2xl bg-red-950/40 border border-red-800/40 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{saveError}</span>
              </div>
            )}
          </form>

          {/* RIGHT: LIVE PROFILE PREVIEW */}
          <div className="w-[330px] shrink-0 border-l border-[#202020] bg-[#0c0c0c] p-5 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#1c1c1c] mb-4">
                <span className="text-[10px] font-bold tracking-wider text-[#777] uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Profile Preview
                </span>
                <span className="text-[10px] text-[#555]">Real-time</span>
              </div>

              {/* Preview Card */}
              <div className="rounded-2xl bg-[#141414] border border-[#282828] overflow-hidden shadow-lg">
                {/* Banner */}
                <div
                  className="h-20 w-full bg-gradient-to-r from-[#17192b] via-[#211636] to-[#121c32] relative bg-cover bg-center"
                  style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
                >
                  <div className="absolute inset-0 bg-black/20" />
                </div>

                {/* Avatar + Info */}
                <div className="px-3.5 pb-4 -mt-7 relative">
                  <div className="w-14 h-14 rounded-xl bg-[#171827] border-2 border-[#141414] flex items-center justify-center text-lg font-bold text-indigo-400 shadow-md overflow-hidden mb-2">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      initial
                    )}
                  </div>

                  <p className="text-xs font-bold text-white truncate">{displayName || 'Talos Creator'}</p>
                  <p className="text-[10px] text-[#777]">@{username}</p>

                  <p className="text-[11px] text-[#aaa] mt-1.5 line-clamp-2 leading-relaxed">
                    {headline || 'AI Engineer · Building agents, skills & developer tools for Talos'}
                  </p>

                  {bio && (
                    <p className="text-[10px] text-[#777] mt-1.5 line-clamp-2 italic">
                      "{bio}"
                    </p>
                  )}

                  {/* Expertise Chips in Preview */}
                  {expertise.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {expertise.slice(0, 4).map(e => (
                        <span key={e} className="px-1.5 py-0.5 rounded text-[9px] bg-[#1d1d2b] text-indigo-300 border border-indigo-500/20 font-medium">
                          {e}
                        </span>
                      ))}
                      {expertise.length > 4 && (
                        <span className="text-[9px] text-[#666] self-center">+{expertise.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Structured Links Preview */}
                  {linksList.length > 0 && (
                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[#1f1f1f] text-[#777] flex-wrap">
                      {linksList.slice(0, 4).map(l => {
                        const meta = PROVIDER_METADATA[l.provider] || PROVIDER_METADATA.custom;
                        return (
                          <span key={l.id} className="text-[#888] hover:text-white" title={l.url}>
                            {meta.icon}
                          </span>
                        );
                      })}
                      {linksList.length > 4 && (
                        <span className="text-[10px] text-indigo-400">+{linksList.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Plugins Count */}
                  <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2.5 border-t border-[#1f1f1f] text-center">
                    <div className="p-1.5 rounded-lg bg-[#181818]">
                      <p className="text-xs font-bold text-white">{plugins.length}</p>
                      <p className="text-[9px] text-[#777]">Plugins</p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-[#181818]">
                      <p className="text-xs font-bold text-white">
                        {profile?.install_count || 0}
                      </p>
                      <p className="text-[9px] text-[#777]">Installs</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Public Link reminder */}
            <div className="pt-4 border-t border-[#1c1c1c] text-[10px] text-[#666]">
              <p>Your profile is public and can be shared as:</p>
              <p className="text-indigo-400 font-mono mt-0.5 truncate">
                talos.ai/builders/@{username}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Bar */}
        <div className="px-6 py-3.5 border-t border-[#202020] bg-[#141414] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-[#777]">
            Changes are visible immediately after saving
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#888] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-profile-form"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-[#eaeaea] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving changes...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
