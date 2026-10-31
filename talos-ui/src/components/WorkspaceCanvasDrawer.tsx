'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Folder,
  FileCode,
  FileText,
  FileSpreadsheet,
  Presentation,
  RotateCw,
  ExternalLink,
  Code2,
  Eye,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Search,
  Sparkles,
  Download,
  Globe,
  GitCompare,
  Film,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './chat/MermaidDiagram';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  const m = oldLines.length;
  const n = newLines.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) {
    return newLines.map((line, idx) => ({ type: 'added', text: line, newLineNumber: idx + 1 }));
  }
  if (n === 0) {
    return oldLines.map((line, idx) => ({ type: 'removed', text: line, oldLineNumber: idx + 1 }));
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  let oldLine = m;
  let newLine = n;

  const temp: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({
        type: 'unchanged',
        text: oldLines[i - 1],
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      i--;
      j--;
      oldLine--;
      newLine--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({
        type: 'added',
        text: newLines[j - 1],
        newLineNumber: newLine,
      });
      j--;
      newLine--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      temp.push({
        type: 'removed',
        text: oldLines[i - 1],
        oldLineNumber: oldLine,
      });
      i--;
      oldLine--;
    }
  }

  return temp.reverse();
}

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
}

export interface BrowserCanvasData {
  executionId: string;
  agentName: string;
  task?: string;
  screenshots: Array<{ url?: string; title?: string; image: string; timestamp?: string }>;
  activeIndex?: number;
}

export interface DocSlide {
  title?: string;
  bullets?: string[];
  notes?: string;
  text?: string;
  content?: string[];
}

export interface DocElement {
  type?: 'title' | 'h1' | 'h2' | 'h3' | 'paragraph' | 'bullet' | 'table';
  text?: string;
  rows?: string[][];
}

export interface DocSheet {
  name?: string;
  rows?: Array<Array<string | number | null>>;
}

export interface DocData {
  filename?: string;
  total_slides?: number;
  slides?: DocSlide[];
  elements?: DocElement[];
  sheets?: DocSheet[];
}

interface WorkspaceCanvasDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
  activePort?: number | null;
  selectedFilePath?: string | null;
  workspaceRefreshKey?: number;
  browserData?: BrowserCanvasData | null;
  browserUrl?: string | null;
  browserTitle?: string | null;
  onSelectBrowserScreenshot?: (idx: number) => void;
}

export const WorkspaceCanvasDrawer: React.FC<WorkspaceCanvasDrawerProps> = ({
  isOpen,
  onClose,
  threadId,
  activePort = null,
  selectedFilePath = null,
  workspaceRefreshKey = 0,
  browserData = null,
  browserUrl = null,
  browserTitle = null,
  onSelectBrowserScreenshot,
}) => {
  // State
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(selectedFilePath);
  const [fileContent, setFileContent] = useState<string>('');
  const [docData, setDocData] = useState<DocData | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Tab mode: 'browser' or 'workspace'
  const [activeTab, setActiveTab] = useState<'browser' | 'workspace'>('workspace');
  const [activeBrowserIndex, setActiveBrowserIndex] = useState<number>(0);
  const [fullscreenScreenshot, setFullscreenScreenshot] = useState<string | null>(null);

  // View mode: 'preview' (Eye), 'code' (</>), or 'diff' (GitCompare)
  const [viewMode, setViewMode] = useState<'preview' | 'code' | 'diff'>('preview');
  const [fileBaselines, setFileBaselines] = useState<Record<string, string>>({});
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishedToast, setPublishedToast] = useState(false);

  // Port and web server
  const [currentPort, setCurrentPort] = useState<number | null>(activePort);
  const [reloadKey, setReloadKey] = useState(0);
  const [previousBrowserUrl, setPreviousBrowserUrl] = useState(browserUrl);
  if (browserUrl && browserUrl !== previousBrowserUrl) {
    setPreviousBrowserUrl(browserUrl);
    setActiveTab('browser');
  }

  // PPT slide index
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Excel sheet index and search
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetSearch, setSheetSearch] = useState('');

  // Dropdown ref
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine file types
  const lowerFile = (selectedFile || '').toLowerCase();
  const isHtml = lowerFile.endsWith('.html') || lowerFile.endsWith('.htm');
  const isPpt = lowerFile.endsWith('.pptx') || lowerFile.endsWith('.ppt');
  const isDocx = lowerFile.endsWith('.docx') || lowerFile.endsWith('.doc');
  const isExcel = lowerFile.endsWith('.xlsx') || lowerFile.endsWith('.xls') || lowerFile.endsWith('.csv');
  const isPdf = lowerFile.endsWith('.pdf');
  const isVideo = lowerFile.endsWith('.mp4') || lowerFile.endsWith('.webm');
  const isImage = lowerFile.endsWith('.png') || lowerFile.endsWith('.jpg') || lowerFile.endsWith('.jpeg') || lowerFile.endsWith('.webp') || lowerFile.endsWith('.gif') || lowerFile.endsWith('.svg');
  const isMarkdown = lowerFile.endsWith('.md');
  const isMermaid = lowerFile.endsWith('.mermaid') || lowerFile.endsWith('.mmd');
  const isWebApp = isHtml || !!currentPort;

  const activeBaseline = selectedFile && fileBaselines[selectedFile] !== undefined ? fileBaselines[selectedFile] : '';
  const diffLines = React.useMemo(() => {
    if (!selectedFile || viewMode !== 'diff') return [];
    return computeLineDiff(activeBaseline, fileContent);
  }, [selectedFile, viewMode, activeBaseline, fileContent]);

  // Adjust state during render when props change (React 19 pattern)
  const [prevSelectedFilePath, setPrevSelectedFilePath] = useState(selectedFilePath);
  if (selectedFilePath && selectedFilePath !== prevSelectedFilePath) {
    setPrevSelectedFilePath(selectedFilePath);
    setSelectedFile(selectedFilePath);
    setActiveTab('workspace');
  }

  const [prevActivePort, setPrevActivePort] = useState(activePort);
  if (activePort && activePort !== prevActivePort) {
    setPrevActivePort(activePort);
    setCurrentPort(activePort);
  }

  const [prevBrowserExecId, setPrevBrowserExecId] = useState(browserData?.executionId);
  const [prevScreenshotsLen, setPrevScreenshotsLen] = useState(browserData?.screenshots?.length || 0);
  const currentScreenshotsLen = browserData?.screenshots?.length || 0;
  if (browserData?.executionId !== prevBrowserExecId || currentScreenshotsLen !== prevScreenshotsLen) {
    setPrevBrowserExecId(browserData?.executionId);
    setPrevScreenshotsLen(currentScreenshotsLen);
    if (browserData?.screenshots && browserData.screenshots.length > 0 && !selectedFilePath) {
      setActiveTab('browser');
    }
  }

  const [prevBrowserActiveIdx, setPrevBrowserActiveIdx] = useState(browserData?.activeIndex);
  if (browserData?.activeIndex !== prevBrowserActiveIdx) {
    setPrevBrowserActiveIdx(browserData?.activeIndex);
    if (typeof browserData?.activeIndex === 'number') {
      setActiveBrowserIndex(browserData.activeIndex);
    }
  }

  const [prevSelectedFileForViewMode, setPrevSelectedFileForViewMode] = useState<string | null>(selectedFile);
  if (selectedFile !== prevSelectedFileForViewMode) {
    setPrevSelectedFileForViewMode(selectedFile);
    if (isWebApp || isMarkdown || isMermaid || isPpt || isDocx || isExcel || isPdf || isImage) {
      setViewMode('preview');
    } else {
      setViewMode('code');
    }
    setActiveSlideIndex(0);
    setActiveSheetIndex(0);
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Poll for a detected app port so generated web apps can use their live server.
  useEffect(() => {
    if (!isOpen || !threadId || currentPort || !isWebApp) return;
    const fetchDetectedPort = async () => {
      try {
        const res = await fetch(`/api/workspaces/${threadId}/terminal`, {
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.detected_port) {
            setCurrentPort(data.detected_port);
          }
        }
      } catch {}
    };
    fetchDetectedPort();
    const interval = setInterval(fetchDetectedPort, 4000);
    return () => clearInterval(interval);
  }, [isOpen, threadId, currentPort, isWebApp]);

  // Fetch file list
  const fetchWorkspaceFiles = React.useCallback(async (signal?: AbortSignal) => {
    if (!threadId) return;
    try {
      setIsLoadingFiles(true);
      const res = await fetch(`/api/workspaces/${threadId}/files`, { signal });
      const data = await res.json();
      if (signal?.aborted) return;
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Could not load workspace files');
      }
      const fileList: FileItem[] = data.files || [];
      setFiles(fileList);
      setWorkspaceError(null);
      const selectedFileExists = fileList.some((file) => !file.is_dir && file.path === selectedFile);
      if (!selectedFileExists) {
        setSelectedFile(fileList.find((file) => !file.is_dir)?.path || null);
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.warn('Error fetching workspace files:', err);
      setWorkspaceError(err instanceof Error ? err.message : 'Could not load workspace files');
    } finally {
      if (!signal?.aborted) setIsLoadingFiles(false);
    }
  }, [threadId, selectedFile]);

  // Load workspace file tree
  useEffect(() => {
    if (!isOpen || !threadId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        void fetchWorkspaceFiles(controller.signal);
      }
    });
    return () => controller.abort();
  }, [isOpen, threadId, workspaceRefreshKey, fetchWorkspaceFiles]);

  // Load file content when selectedFile changes
  useEffect(() => {
    if (!isOpen || !threadId || !selectedFile) return;
    let isMounted = true;

    const loadContent = async () => {
      try {
        setIsLoadingContent(true);
        setFileError(null);
        if (isVideo) {
          setDocData(null);
          setFileContent('');
          return;
        }
        const res = await fetch(`/api/workspaces/${threadId}/file?path=${encodeURIComponent(selectedFile)}`);
        const data = await res.json();
        if (!isMounted) return;
        if (!res.ok) {
          throw new Error(data.error || data.detail || `Could not load ${selectedFile}`);
        }
        if (data.is_document) {
          setDocData(data.doc_data);
          setFileContent('');
        } else {
          setDocData(null);
          let rawContent = data.content || '';

          // If HTML, auto-inline local sibling .css and .js files so iframe srcDoc runs 100% self-contained
          if (selectedFile.toLowerCase().endsWith('.html') || selectedFile.toLowerCase().endsWith('.htm')) {
            try {
              const cssRegex = /<link\s+[^>]*?href=["']([^"':]+)["'][^>]*?>/gi;
              let match;
              const cssReplacements: Array<{ tag: string; path: string }> = [];
              while ((match = cssRegex.exec(rawContent)) !== null) {
                const fullTag = match[0];
                const cssPath = match[1];
                if (!cssPath.startsWith('http') && !cssPath.startsWith('//') && cssPath.endsWith('.css')) {
                  cssReplacements.push({ tag: fullTag, path: cssPath });
                }
              }

              for (const item of cssReplacements) {
                try {
                  const cssRes = await fetch(`/api/workspaces/${threadId}/file?path=${encodeURIComponent(item.path)}`);
                  if (cssRes.ok) {
                    const cssData = await cssRes.json();
                    if (cssData.content) {
                      rawContent = rawContent.replace(item.tag, `<style>/* inlined: ${item.path} */\n${cssData.content}\n</style>`);
                    }
                  }
                } catch {}
              }

              const jsRegex = /<script\s+[^>]*?src=["']([^"':]+)["'][^>]*?>\s*<\/script>/gi;
              const jsReplacements: Array<{ tag: string; path: string }> = [];
              while ((match = jsRegex.exec(rawContent)) !== null) {
                const fullTag = match[0];
                const jsPath = match[1];
                if (!jsPath.startsWith('http') && !jsPath.startsWith('//') && jsPath.endsWith('.js')) {
                  jsReplacements.push({ tag: fullTag, path: jsPath });
                }
              }

              for (const item of jsReplacements) {
                try {
                  const jsRes = await fetch(`/api/workspaces/${threadId}/file?path=${encodeURIComponent(item.path)}`);
                  if (jsRes.ok) {
                    const jsData = await jsRes.json();
                    if (jsData.content) {
                      rawContent = rawContent.replace(item.tag, `<script>/* inlined: ${item.path} */\n${jsData.content}\n</script>`);
                    }
                  }
                } catch {}
              }
            } catch (e) {
              console.warn('[HTML Inliner] Sibling inlining notice:', e);
            }
          }

          if (!isMounted) return;
          setFileContent(rawContent);
          setFileBaselines((prev) => (prev[selectedFile] !== undefined ? prev : { ...prev, [selectedFile]: rawContent }));
        }
      } catch (err) {
        if (!isMounted) return;
        setFileError(err instanceof Error ? err.message : `Could not load ${selectedFile}`);
        setFileContent('');
        setDocData(null);
      } finally {
        if (isMounted) {
          setIsLoadingContent(false);
        }
      }
    };

    queueMicrotask(() => {
      if (isMounted) {
        loadContent();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, threadId, selectedFile, workspaceRefreshKey, isVideo]);

  const handleSelectFile = (filePath: string) => {
    setSelectedFile(filePath);
  };

  const handleCopy = () => {
    const textToCopy = fileContent || (docData ? JSON.stringify(docData, null, 2) : '');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = () => {
    setPublishedToast(true);
    setTimeout(() => setPublishedToast(false), 3000);
  };

  // Injected HTML console interceptor for live Web App preview
  const getInjectedHtml = (rawHtml: string) => {
    const previewBase = '<base href="about:srcdoc">';
    const headTag = /<head\b[^>]*>/i;
    const existingBaseTag = /<base\b[^>]*>/i;
    const hasBaseTag = existingBaseTag.test(rawHtml);
    const htmlWithBase = hasBaseTag ? rawHtml.replace(existingBaseTag, previewBase) : rawHtml;
    if (headTag.test(htmlWithBase)) {
      return htmlWithBase.replace(headTag, (tag) => `${tag}${hasBaseTag ? '' : previewBase}`);
    }
    return `${previewBase}${htmlWithBase}`;
  };

  if (!isOpen) return null;

  return (
    <div className="w-[580px] lg:w-[720px] xl:w-[780px] h-full bg-[#111111] border-l border-[#222222] flex flex-col select-none shrink-0 text-neutral-200 z-30 animate-in slide-in-from-right duration-200 shadow-2xl">
      {/* ── TOP HEADER (EXACT REFERENCE DESIGN) ── */}
      <div className="h-12 px-3 border-b border-[#222222] flex items-center justify-between bg-[#141414]">
        {/* Left: Tab Switcher (Browser vs Files) & View Mode */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Tab Pill if Browser Data is available */}
          {((browserData && browserData.screenshots && browserData.screenshots.length > 0) || browserUrl) && (
            <div className="flex items-center bg-[#1c1c1c] p-0.5 rounded-lg border border-[#2b2b2b] shrink-0">
              <button
                onClick={() => setActiveTab('browser')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'browser'
                    ? 'bg-[#2d2d2d] text-white shadow-sm'
                    : 'text-[#888888] hover:text-[#cccccc]'
                }`}
              >
                <Globe size={13} className="text-blue-400" />
                <span>{browserTitle || (browserData?.screenshots?.length ? `Browser (${browserData.screenshots.length})` : 'Browser')}</span>
              </button>
              <button
                onClick={() => setActiveTab('workspace')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'workspace'
                    ? 'bg-[#2d2d2d] text-white shadow-sm'
                    : 'text-[#888888] hover:text-[#cccccc]'
                }`}
              >
                <Folder size={13} className="text-amber-400" />
                <span>Files</span>
              </button>
            </div>
          )}

          {/* Browser Step Navigation in Header */}
          {activeTab === 'browser' && browserData && browserData.screenshots.length > 0 && (
            <div className="flex items-center gap-1 bg-[#1a1a1a] px-2 py-1 rounded-lg border border-[#282828] text-xs font-medium text-neutral-300">
              <button
                disabled={activeBrowserIndex <= 0}
                onClick={() => {
                  const nextIdx = Math.max(0, activeBrowserIndex - 1);
                  setActiveBrowserIndex(nextIdx);
                  onSelectBrowserScreenshot?.(nextIdx);
                }}
                className="p-0.5 rounded hover:bg-[#282828] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Previous step"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="font-mono text-[11px] px-1">
                Step {activeBrowserIndex + 1} of {browserData.screenshots.length}
              </span>
              <button
                disabled={activeBrowserIndex >= browserData.screenshots.length - 1}
                onClick={() => {
                  const nextIdx = Math.min(browserData.screenshots.length - 1, activeBrowserIndex + 1);
                  setActiveBrowserIndex(nextIdx);
                  onSelectBrowserScreenshot?.(nextIdx);
                }}
                className="p-0.5 rounded hover:bg-[#282828] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Next step"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* Workspace Controls (Segmented [ Eye | </> | Diff ] button) */}
          {activeTab === 'workspace' && !isDocx && !isExcel && !isPdf && (
            <div className="flex items-center bg-[#1c1c1c] p-0.5 rounded-lg border border-[#2b2b2b]">
              <button
                onClick={() => setViewMode('preview')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'preview'
                    ? 'bg-[#2d2d2d] text-white shadow-sm'
                    : 'text-[#777777] hover:text-[#cccccc]'
                }`}
                title="Preview"
              >
                <Eye size={15} />
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'code'
                    ? 'bg-[#2d2d2d] text-white shadow-sm'
                    : 'text-[#777777] hover:text-[#cccccc]'
                }`}
                title="Code"
              >
                <Code2 size={15} />
              </button>
              <button
                onClick={() => setViewMode('diff')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'diff'
                    ? 'bg-[#2d2d2d] text-white shadow-sm'
                    : 'text-[#777777] hover:text-[#cccccc]'
                }`}
                title="Unified Line Diff"
              >
                <GitCompare size={15} />
              </button>
            </div>
          )}

          {/* Version / File Dropdown */}
          {activeTab === 'workspace' && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1a1a1a] hover:bg-[#222222] border border-[#282828] text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
              >
                <span>{selectedFile ? selectedFile.split('/').pop() : 'v1'}</span>
                <ChevronDown size={13} className="text-neutral-400" />
              </button>

              {/* Dropdown Menu */}
              {showVersionDropdown && (
                <div className="absolute left-0 mt-1.5 w-64 bg-[#181818] border border-[#2c2c2c] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-between border-b border-[#242424]">
                    <span>Workspace Files</span>
                    <button
                      onClick={() => fetchWorkspaceFiles()}
                      className="text-neutral-400 hover:text-white transition-colors"
                    >
                      <RotateCw size={11} className={isLoadingFiles ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {files.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-neutral-500 italic">No files found</div>
                    ) : (
                      files.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => {
                            if (!file.is_dir) {
                              handleSelectFile(file.path);
                              setShowVersionDropdown(false);
                            }
                          }}
                          disabled={file.is_dir}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                            selectedFile === file.path
                              ? 'bg-[#262626] text-white font-medium'
                              : file.is_dir
                              ? 'text-neutral-500 font-semibold'
                              : 'text-neutral-300 hover:bg-[#202020]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {file.is_dir ? (
                              <Folder size={13} className="text-amber-400 shrink-0" />
                            ) : file.name.endsWith('.pptx') ? (
                              <Presentation size={13} className="text-orange-400 shrink-0" />
                            ) : file.name.endsWith('.xlsx') || file.name.endsWith('.csv') ? (
                              <FileSpreadsheet size={13} className="text-emerald-400 shrink-0" />
                            ) : file.name.endsWith('.docx') ? (
                              <FileText size={13} className="text-blue-400 shrink-0" />
                            ) : (
                              <FileCode size={13} className="text-neutral-400 shrink-0" />
                            )}
                            <span className="truncate">{file.name}</span>
                          </div>
                          {selectedFile === file.path && <Check size={13} className="text-emerald-400 shrink-0 ml-2" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === 'browser' ? (
            <>
              {browserUrl && (
                <button
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                  title="Reload embedded browser"
                >
                  <RotateCw size={14} />
                </button>
              )}
              {browserData?.screenshots && browserData.screenshots[activeBrowserIndex]?.image && (
                <button
                  onClick={() => setFullscreenScreenshot(browserData.screenshots[activeBrowserIndex].image)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                  title="Expand to Fullscreen"
                >
                  <ExternalLink size={14} />
                </button>
              )}
              {browserData?.screenshots && browserData.screenshots[activeBrowserIndex]?.image && (
                <a
                  href={browserData.screenshots[activeBrowserIndex].image}
                  download={`browser-step-${activeBrowserIndex + 1}.png`}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                  title="Download Image"
                >
                  <Download size={14} />
                </a>
              )}
            </>
          ) : (
            <>
              {/* Refresh button */}
              <button
                onClick={() => {
                  fetchWorkspaceFiles();
                  if (selectedFile) void handleSelectFile(selectedFile);
                  setReloadKey((k) => k + 1);
                }}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                title="Reload content"
              >
                <RotateCw size={14} className={isLoadingContent ? 'animate-spin' : ''} />
              </button>

              {selectedFile && (
                <a
                  href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile)}`}
                  download={selectedFile.split('/').pop()}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                  title={`Download ${selectedFile.split('/').pop()}`}
                  aria-label={`Download ${selectedFile.split('/').pop()}`}
                >
                  <Download size={14} />
                </a>
              )}

              {/* Copy Button */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2b2b2b] text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <span>Copy</span>
                    <ChevronDown size={11} className="text-neutral-400" />
                  </>
                )}
              </button>

              {/* White Pill "Publish" Button */}
              <button
                onClick={handlePublish}
                className="bg-white text-black font-semibold text-xs px-3.5 py-1.5 rounded-full hover:bg-neutral-200 transition-colors shadow-sm cursor-pointer"
              >
                Publish
              </button>
            </>
          )}

          {/* Close X */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer ml-1"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Published Toast Banner */}
      {publishedToast && (
        <div className="bg-emerald-950/80 border-b border-emerald-800/60 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-400" />
            <span>Artifact published successfully to your project showcase!</span>
          </div>
          <button onClick={() => setPublishedToast(false)} className="text-emerald-400 hover:text-white">
            <X size={12} />
          </button>
        </div>
      )}

      {(workspaceError || fileError) && (
        <div role="alert" className="border-b border-red-900/50 bg-red-950/30 px-4 py-2 text-xs text-red-300 flex items-center justify-between gap-3">
          <span className="truncate">{workspaceError || fileError}</span>
          <button
            onClick={() => {
              if (workspaceError) fetchWorkspaceFiles();
              if (fileError && selectedFile) void handleSelectFile(selectedFile);
            }}
            className="shrink-0 underline underline-offset-2 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── MAIN CONTENT CANVAS ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0e0e0e] relative">
        {activeTab === 'browser' && browserUrl ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0a0a0a]">
            <div className="px-3.5 py-2.5 bg-[#141414] border-b border-[#222] flex items-center gap-2 text-xs shrink-0">
              <Globe size={13} className="text-blue-400 shrink-0" />
              <span className="truncate text-neutral-300 font-mono select-text" title={browserUrl}>{browserUrl}</span>
              <span className="ml-auto text-[10px] text-neutral-500 shrink-0">Embedded browser</span>
            </div>
            <iframe
              key={`${browserUrl}:${reloadKey}`}
              src={browserUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              referrerPolicy="no-referrer"
              className="flex-1 w-full border-none bg-white"
              title={browserTitle || 'Talos embedded browser'}
            />
          </div>
        ) : activeTab === 'browser' && browserData && browserData.screenshots && browserData.screenshots.length > 0 ? (
          /* ── BROWSER VIEWPORT CANVAS (LIVE SUBAGENT SCREENSHOTS) ── */
          (() => {
            const screenshots = browserData.screenshots;
            const currentIdx = Math.min(Math.max(0, activeBrowserIndex), screenshots.length - 1);
            const activeShot = screenshots[currentIdx] || screenshots[screenshots.length - 1];

            return (
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0a0a]">
                {/* Browser Mockup Chrome Bar */}
                <div className="px-3.5 py-2.5 bg-[#141414] border-b border-[#222222] flex items-center justify-between gap-3 text-xs shrink-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Traffic lights */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/80 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/80 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/80 inline-block" />
                    </div>

                    {/* URL Pill Bar */}
                    <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-[#0a0a0a] rounded-xl border border-[#262626] text-[11px] font-mono text-neutral-300 min-w-0">
                      <Globe size={12} className="text-blue-400 shrink-0" />
                      <span className="truncate flex-1 select-text">
                        {activeShot?.url || 'https://browser-session.talos'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setFullscreenScreenshot(activeShot?.image || null)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#222] transition-colors cursor-pointer"
                      title="Fullscreen"
                    >
                      <ExternalLink size={13} />
                    </button>
                    {activeShot?.image && (
                      <a
                        href={activeShot.image}
                        download={`browser-step-${currentIdx + 1}.png`}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#222] transition-colors cursor-pointer"
                        title="Download Screenshot"
                      >
                        <Download size={13} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Main Viewport Container */}
                <div 
                  className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-[#070707] relative cursor-zoom-in"
                  onClick={() => setFullscreenScreenshot(activeShot?.image || null)}
                >
                  {activeShot?.image ? (
                    <div className="relative max-w-full max-h-full rounded-xl overflow-hidden border border-[#222] bg-black shadow-2xl group">
                      <img
                        src={activeShot.image}
                        alt={activeShot.title || `Browser step ${currentIdx + 1}`}
                        className="w-full h-auto object-contain max-h-[calc(100vh-230px)] block"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <span className="px-3.5 py-1.5 rounded-xl bg-black/80 text-white text-xs font-medium border border-white/20 flex items-center gap-1.5 shadow-xl">
                          <Eye size={13} /> Click to expand full resolution
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-neutral-500 text-xs italic">No screenshot captured for this step.</div>
                  )}
                </div>

                {/* Bottom Step Filmstrip */}
                {screenshots.length > 1 && (
                  <div className="h-24 bg-[#111111] border-t border-[#222222] px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
                    {screenshots.map((shot, sIdx) => {
                      const isSelected = currentIdx === sIdx;
                      return (
                        <button
                          key={sIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBrowserIndex(sIdx);
                            onSelectBrowserScreenshot?.(sIdx);
                          }}
                          className={`h-full aspect-[16/10] rounded-lg p-1 flex flex-col justify-between text-left transition-all shrink-0 cursor-pointer border ${
                            isSelected
                              ? 'border-blue-500 bg-[#1e293b]/60 shadow-md ring-1 ring-blue-500/50'
                              : 'border-[#262626] bg-[#161616] hover:border-[#383838] opacity-75 hover:opacity-100'
                          }`}
                        >
                          <div className="w-full flex-1 rounded overflow-hidden bg-black mb-1 relative">
                            <img src={shot.image} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex items-center justify-between text-[10px] px-0.5">
                            <span className={`font-mono font-medium truncate ${isSelected ? 'text-blue-300' : 'text-neutral-400'}`}>
                              Step {sIdx + 1}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        ) : isLoadingContent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-3">
            <RotateCw size={24} className="animate-spin text-neutral-400" />
            <span className="text-xs font-mono">Loading workspace deliverable...</span>
          </div>
        ) : viewMode === 'diff' ? (
          /* ── UNIFIED LINE-BY-LINE DIFF VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            {/* Diff Sub-header */}
            <div className="px-4 py-2.5 bg-[#121212] border-b border-[#202020] flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <GitCompare size={14} className="text-blue-400" />
                <span className="font-mono text-neutral-200 font-medium truncate">{selectedFile || 'File'}</span>
                <span className="text-[11px] text-neutral-500 font-mono">(Baseline vs Current)</span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px] font-mono">
                <span className="text-emerald-400 font-medium">+{diffLines.filter((l) => l.type === 'added').length} additions</span>
                <span className="text-neutral-600">•</span>
                <span className="text-red-400 font-medium">-{diffLines.filter((l) => l.type === 'removed').length} deletions</span>
              </div>
            </div>

            {/* Diff Lines Table */}
            <div className="flex-1 overflow-auto flex text-xs font-mono leading-relaxed bg-[#0a0a0a] select-text">
              <div className="w-full py-2">
                {diffLines.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500 italic">No changes between versions.</div>
                ) : (
                  diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start w-full px-3 py-0.5 font-mono ${
                        line.type === 'added'
                          ? 'bg-emerald-950/30 text-emerald-300'
                          : line.type === 'removed'
                          ? 'bg-red-950/30 text-red-300 opacity-80'
                          : 'text-neutral-400 hover:bg-[#141414]'
                      }`}
                    >
                      <div className="w-9 text-right pr-2 text-neutral-600 select-none shrink-0 text-[11px]">
                        {line.oldLineNumber ?? ''}
                      </div>
                      <div className="w-9 text-right pr-3 text-neutral-600 select-none shrink-0 text-[11px]">
                        {line.newLineNumber ?? ''}
                      </div>
                      <div className="w-4 select-none shrink-0 font-bold">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </div>
                      <pre className="flex-1 overflow-x-auto whitespace-pre font-mono text-xs">
                        {line.text}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : isMermaid && viewMode === 'preview' ? (
          /* ── INTERACTIVE MERMAID DIAGRAM VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            <div className="px-5 py-2.5 bg-[#121212] border-b border-[#202020] flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-blue-400" />
                <span className="font-mono text-neutral-200 font-medium truncate">{selectedFile}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span>{fileContent.split('\n').length} lines</span>
                <span className="text-neutral-600">•</span>
                <span className="px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/30">Mermaid Vector</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#090909]">
              <div className="w-full h-full max-w-4xl">
                <MermaidDiagram chartCode={fileContent} />
              </div>
            </div>
          </div>
        ) : isVideo ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            <div className="px-4 py-2.5 bg-[#141414] border-b border-[#202020] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Film size={15} className="text-blue-400 shrink-0" />
                <span className="font-semibold text-white truncate">{selectedFile}</span>
              </div>
              <a
                href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                download={selectedFile?.split('/').pop()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium transition-colors"
              >
                <Download size={12} />
                <span>Download Video</span>
              </a>
            </div>
            <div className="flex-1 min-h-0 p-5 flex items-center justify-center bg-[#080808]">
              <video
                key={selectedFile}
                controls
                playsInline
                className="max-h-full max-w-full rounded-xl border border-[#222] bg-black shadow-2xl"
                aria-label={selectedFile || 'Workspace video'}
              >
                <source
                  src={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                  type={lowerFile.endsWith('.webm') ? 'video/webm' : 'video/mp4'}
                />
                Your browser does not support video playback.
              </video>
            </div>
          </div>
        ) : isImage ? (
          /* ── WORKSPACE IMAGE VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            <div className="px-4 py-2.5 bg-[#141414] border-b border-[#202020] flex items-center justify-between text-xs">
              <span className="font-semibold text-white truncate">{selectedFile}</span>
              <a
                href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                download={selectedFile?.split('/').pop()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium transition-colors"
              >
                <Download size={12} />
                <span>Download Image</span>
              </a>
            </div>
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-[#080808]">
              <img
                src={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                alt={selectedFile || 'Workspace image'}
                className="max-h-[75vh] max-w-full object-contain rounded-xl border border-[#222] shadow-2xl"
              />
            </div>
          </div>
        ) : isPpt ? (
          /* ── 1. POWERPOINT PRESENTATION VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            {/* Presentation Navigation Header */}
            <div className="px-4 py-2 bg-[#141414] border-b border-[#202020] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Presentation size={15} className="text-orange-400" />
                <span className="font-semibold text-white">
                  Slide {docData?.slides?.length ? activeSlideIndex + 1 : 1} of {docData?.total_slides || 1}
                </span>
                <span className="text-neutral-500 text-[11px] font-mono">({docData?.filename || selectedFile})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={activeSlideIndex <= 0}
                  onClick={() => setActiveSlideIndex((i) => Math.max(0, i - 1))}
                  className="p-1 rounded bg-[#202020] hover:bg-[#282828] disabled:opacity-30 disabled:cursor-not-allowed text-white cursor-pointer"
                  title="Previous slide"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={!docData?.slides || activeSlideIndex >= docData.slides.length - 1}
                  onClick={() => setActiveSlideIndex((i) => Math.min((docData?.slides?.length || 1) - 1, i + 1))}
                  className="p-1 rounded bg-[#202020] hover:bg-[#282828] disabled:opacity-30 disabled:cursor-not-allowed text-white cursor-pointer"
                  title="Next slide"
                >
                  <ChevronRight size={14} />
                </button>
                <a
                  href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                  download={selectedFile?.split('/').pop()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 text-xs font-medium transition-colors"
                >
                  <Download size={12} />
                  <span>Download PPTX</span>
                </a>
              </div>
            </div>

            {/* Central Slide Display */}
            <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center">
              {docData?.slides && docData.slides[activeSlideIndex] ? (
                <div className="w-full max-w-2xl aspect-[16/9] bg-gradient-to-br from-[#181818] via-[#141414] to-[#121212] border border-[#2a2a2a] rounded-2xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div>
                    <div className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-mono text-orange-400 mb-3 uppercase tracking-wider">
                      Slide {activeSlideIndex + 1}
                    </div>
                    <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight leading-snug mb-4">
                      {docData.slides[activeSlideIndex].title}
                    </h2>
                    <ul className="space-y-3">
                      {docData.slides[activeSlideIndex].content?.map((point: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2.5 text-neutral-300 text-xs lg:text-sm leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-4 border-t border-[#222222]">
                    <span>Talos Presentation Deck</span>
                    <span>{activeSlideIndex + 1} / {docData.slides.length}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-neutral-500 text-xs">
                  <p>Slide content preview unavailable.</p>
                  <a
                    href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                    download={selectedFile?.split('/').pop()}
                    className="mt-3 inline-flex items-center gap-1 text-orange-400 hover:underline"
                  >
                    <Download size={12} /> Download Presentation File
                  </a>
                </div>
              )}
            </div>

            {/* Bottom Slide Strip */}
            {docData?.slides && docData.slides.length > 1 && (
              <div className="h-20 bg-[#121212] border-t border-[#222222] p-2 flex items-center gap-2 overflow-x-auto">
                {docData.slides.map((s: DocSlide, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`h-full aspect-[16/9] rounded-lg p-2 flex flex-col justify-between text-left text-[9px] font-medium transition-all shrink-0 cursor-pointer border ${
                      activeSlideIndex === idx
                        ? 'border-orange-500 bg-[#222222] text-white shadow-md'
                        : 'border-[#262626] bg-[#161616] text-neutral-400 hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <span className="truncate w-full font-bold">{s.title || `Slide ${idx + 1}`}</span>
                    <span className="text-neutral-500">{idx + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : isDocx ? (
          /* ── 2. WORD DOCUMENT VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            <div className="px-4 py-2.5 bg-[#141414] border-b border-[#202020] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-blue-400" />
                <span className="font-semibold text-white">{docData?.filename || selectedFile}</span>
                <span className="text-neutral-500 text-[11px]">Word Document</span>
              </div>
              <a
                href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                download={selectedFile?.split('/').pop()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors"
              >
                <Download size={12} />
                <span>Download DOCX</span>
              </a>
            </div>

            <div className="flex-1 overflow-auto p-6 flex justify-center">
              <div className="w-full max-w-2xl bg-[#141414] border border-[#242424] rounded-xl p-8 shadow-xl space-y-4 text-neutral-200">
                {docData?.elements?.length ? (
                  docData.elements.map((el: DocElement, idx: number) => {
                    if (el.type === 'title') {
                      return <h1 key={idx} className="text-2xl font-bold text-white border-b border-[#2a2a2a] pb-2">{el.text}</h1>;
                    } else if (el.type === 'h1') {
                      return <h2 key={idx} className="text-xl font-bold text-white mt-6 mb-2">{el.text}</h2>;
                    } else if (el.type === 'h2') {
                      return <h3 key={idx} className="text-lg font-semibold text-neutral-100 mt-4 mb-2">{el.text}</h3>;
                    } else if (el.type === 'h3') {
                      return <h4 key={idx} className="text-sm font-semibold text-neutral-300 mt-3">{el.text}</h4>;
                    } else if (el.type === 'bullet') {
                      return (
                        <div key={idx} className="flex items-start gap-2 text-xs text-neutral-300 pl-4">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                          <span>{el.text}</span>
                        </div>
                      );
                    } else if (el.type === 'table') {
                      return (
                        <div key={idx} className="overflow-x-auto my-4 border border-[#2c2c2c] rounded-lg">
                          <table className="w-full text-xs text-left">
                            <tbody>
                              {el.rows?.map((row: string[], rIdx: number) => (
                                <tr key={rIdx} className={rIdx === 0 ? 'bg-[#1e1e1e] font-semibold text-white' : 'border-t border-[#262626]'}>
                                  {row.map((cell: string, cIdx: number) => (
                                    <td key={cIdx} className="px-3 py-2 border-r border-[#262626] last:border-r-0">{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    return <p key={idx} className="text-xs leading-relaxed text-neutral-300">{el.text}</p>;
                  })
                ) : (
                  <div className="text-neutral-500 text-xs italic">Empty or non-text document structure.</div>
                )}
              </div>
            </div>
          </div>
        ) : isExcel ? (
          /* ── 3. EXCEL / CSV SPREADSHEET VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            <div className="px-4 py-2.5 bg-[#141414] border-b border-[#202020] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-emerald-400" />
                <span className="font-semibold text-white">{docData?.filename || selectedFile}</span>
                <span className="text-neutral-500 text-[11px]">Spreadsheet</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-2 text-neutral-500" />
                  <input
                    type="text"
                    value={sheetSearch}
                    onChange={(e) => setSheetSearch(e.target.value)}
                    placeholder="Search table..."
                    className="w-36 pl-7 pr-2 py-1 rounded-lg bg-[#1c1c1c] border border-[#2b2b2b] text-[11px] text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <a
                  href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                  download={selectedFile?.split('/').pop()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                >
                  <Download size={12} />
                  <span>Download XLSX</span>
                </a>
              </div>
            </div>

            {/* Spreadsheet Table View */}
            <div className="flex-1 overflow-auto p-4">
              {docData?.sheets && docData.sheets[activeSheetIndex] ? (
                <div className="border border-[#262626] rounded-xl overflow-hidden bg-[#111111]">
                  <table className="w-full text-xs font-mono text-left border-collapse">
                    <tbody>
                      {docData.sheets[activeSheetIndex].rows
                        ?.filter((row) => !sheetSearch || row.some((c) => String(c ?? '').toLowerCase().includes(sheetSearch.toLowerCase())))
                        .map((row, rIdx: number) => (
                          <tr
                            key={rIdx}
                            className={`border-b border-[#1e1e1e] ${
                              rIdx === 0
                                ? 'bg-[#181818] font-bold text-white sticky top-0'
                                : rIdx % 2 === 0
                                ? 'bg-[#101010] text-neutral-300'
                                : 'bg-[#121212] text-neutral-300'
                            }`}
                          >
                            <td className="w-10 px-2 py-1.5 bg-[#141414] border-r border-[#262626] text-neutral-500 text-[10px] text-center select-none">
                              {rIdx + 1}
                            </td>
                            {row.map((cell, cIdx: number) => (
                              <td key={cIdx} className="px-3 py-1.5 border-r border-[#1f1f1f] last:border-r-0 truncate max-w-xs">
                                {String(cell ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-neutral-500 text-xs italic">No spreadsheet data to display.</div>
              )}
            </div>

            {/* Sheet Tabs */}
            {docData?.sheets && docData.sheets.length > 1 && (
              <div className="h-9 bg-[#141414] border-t border-[#222222] px-3 flex items-center gap-1 overflow-x-auto">
                {docData.sheets.map((s: DocSheet, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSheetIndex(idx)}
                    className={`px-3 py-1 rounded-t-md text-xs font-medium transition-colors cursor-pointer ${
                      activeSheetIndex === idx
                        ? 'bg-[#1e1e1e] text-emerald-400 border-t-2 border-emerald-500'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {s.name || `Sheet ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : isPdf ? (
          /* ── 4. PDF VIEWER ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            <div className="px-4 py-2 bg-[#141414] border-b border-[#202020] flex items-center justify-between text-xs">
              <span className="font-semibold text-white truncate">{selectedFile}</span>
              <a
                href={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                download={selectedFile?.split('/').pop()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium transition-colors"
              >
                <Download size={12} />
                <span>Download PDF</span>
              </a>
            </div>
            <div className="flex-1 w-full h-full bg-neutral-900">
              <iframe
                src={`/api/workspaces/${threadId}/raw?path=${encodeURIComponent(selectedFile || '')}`}
                className="w-full h-full border-none"
                title="PDF Document"
              />
            </div>
          </div>
        ) : isWebApp && viewMode === 'preview' ? (
          /* ── 5. INTERACTIVE WEB APP PREVIEW (EXACT SCREENSHOT 1 MATCH) ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0a0a]">
            {/* Live WebApp View Frame */}
            <div className="flex-1 relative overflow-hidden bg-[#0c0c0c]">
              <iframe
                key={reloadKey}
                src={currentPort ? `http://localhost:${currentPort}` : undefined}
                srcDoc={!currentPort && isHtml ? getInjectedHtml(fileContent) : undefined}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                className="w-full h-full border-none bg-[#121212]"
                title="Live Application Preview"
              />
            </div>

          </div>
        ) : isMarkdown && viewMode === 'preview' ? (
          /* ── 5b. FORMATTED MARKDOWN READER VIEW ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            {/* Header info */}
            <div className="px-5 py-2.5 bg-[#121212] border-b border-[#202020] flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-blue-400" />
                <span className="font-mono text-neutral-200 font-medium truncate">{selectedFile}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span>{fileContent.split('\n').length} lines</span>
                <span className="text-neutral-600">•</span>
                <span className="px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/30">Markdown Rendered</span>
              </div>
            </div>

            {/* Formatted Markdown Body */}
            <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12 flex justify-center bg-[#0d0d0d]">
              <div className="w-full max-w-3xl text-neutral-200 text-sm leading-relaxed space-y-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold text-white tracking-tight pb-3 border-b border-[#222] mt-6 mb-4">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-semibold text-white tracking-tight mt-8 mb-3 pb-1 border-b border-[#1c1c1c]">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-semibold text-neutral-100 mt-6 mb-2">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <div className="text-neutral-300 leading-relaxed mb-4 text-[14px]">
                        {children}
                      </div>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-outside pl-6 space-y-1.5 my-3 text-neutral-300 text-[14px]">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside pl-6 space-y-1.5 my-3 text-neutral-300 text-[14px]">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed pl-1">
                        {children}
                      </li>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-blue-500/60 pl-4 py-1 italic text-neutral-400 my-4 bg-blue-950/10 rounded-r">
                        {children}
                      </blockquote>
                    ),
                    pre: ({ children }) => (
                      <div className="my-4 rounded-xl border border-[#222] bg-[#121212] overflow-hidden">
                        <pre className="p-4 overflow-x-auto text-xs font-mono text-neutral-200 leading-relaxed">
                          {children}
                        </pre>
                      </div>
                    ),
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match && typeof children === 'string' && !children.includes('\n');
                      if (isInline) {
                        return (
                          <code className="px-1.5 py-0.5 rounded bg-[#1e1e1e] text-blue-300 font-mono text-[12px] border border-[#2c2c2c]" {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="text-xs font-mono text-neutral-200" {...props}>
                          {children}
                        </code>
                      );
                    },
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-blue-500/40 hover:decoration-blue-400 transition-colors"
                      >
                        {children}
                      </a>
                    ),
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto border border-[#222] rounded-xl">
                        <table className="w-full text-xs text-left border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-[#181818] text-white border-b border-[#222]">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-[#1e1e1e]">{children}</tbody>,
                    tr: ({ children }) => <tr className="hover:bg-[#141414] transition-colors">{children}</tr>,
                    th: ({ children }) => <th className="px-4 py-2.5 font-semibold text-neutral-200">{children}</th>,
                    td: ({ children }) => <td className="px-4 py-2 text-neutral-300">{children}</td>,
                    hr: () => <hr className="my-6 border-[#222]" />
                  }}
                >
                  {fileContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          /* ── 6. PURE CODE / TEXT EDITOR VIEW (EXACT SCREENSHOT 2 MATCH) ── */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
            {/* Editor Sub-header info */}
            <div className="px-4 py-2 bg-[#121212] border-b border-[#202020] flex items-center justify-between text-xs text-neutral-400">
              <span className="font-mono text-neutral-300 truncate">{selectedFile || 'Editor'}</span>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span>{fileContent.split('\n').length} lines</span>
                <span className="text-neutral-600">•</span>
                <span>UTF-8</span>
              </div>
            </div>

            {/* Code Content with Line Numbers */}
            <div className="flex-1 overflow-auto flex text-xs font-mono leading-relaxed bg-[#0d0d0d] select-text">
              {/* Line Numbers Column */}
              <div className="w-12 py-4 bg-[#0a0a0a] border-r border-[#1a1a1a] text-right pr-3 text-neutral-600 select-none shrink-0">
                {fileContent.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Code Lines */}
              <div className="flex-1 p-4 overflow-x-auto text-[#e2e8f0]">
                <pre className="font-mono whitespace-pre">{fileContent}</pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Screenshot Overlay */}
      {fullscreenScreenshot && (
        <div 
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm"
          onClick={() => setFullscreenScreenshot(null)}
        >
          <div className="relative max-w-6xl max-h-[92vh] flex flex-col items-center">
            <button
              onClick={() => setFullscreenScreenshot(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white p-1 rounded-full bg-white/10 cursor-pointer"
            >
              <X size={20} />
            </button>
            <img
              src={fullscreenScreenshot}
              alt="Browser Full View"
              className="max-h-[88vh] max-w-full rounded-xl shadow-2xl object-contain border border-[#333]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
