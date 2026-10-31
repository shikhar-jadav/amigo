'use client';

import React, { useState } from 'react';
import {
  Globe,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  FileCode,
  Terminal,
  FileText,
} from 'lucide-react';

export interface ToolEventData {
  toolName: string;
  args?: any;
  output?: string;
  status: 'running' | 'completed';
}

interface StepLineProps {
  toolsExecuted: ToolEventData[];
}

interface ParsedSource {
  title: string;
  url: string;
  domain: string;
}

export const StepLine: React.FC<StepLineProps> = ({ toolsExecuted }) => {
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});

  if (!toolsExecuted || toolsExecuted.length === 0) return null;

  const toggleExpand = (index: number) => {
    setExpandedIndices((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Helper to extract clean query string from args
  const getSearchQuery = (args: any): string => {
    if (!args) return '';
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        return parsed.query || args;
      } catch {
        return args;
      }
    }
    return args.query || JSON.stringify(args);
  };

  // Helper to parse sources from Tavily output
  const parseSources = (output?: string): ParsedSource[] => {
    if (!output) return [];

    const sources: ParsedSource[] = [];

    // 1. Try parsing JSON structured response
    try {
      const obj = JSON.parse(output);
      if (Array.isArray(obj.sources)) {
        for (const s of obj.sources) {
          if (s.url) {
            try {
              const urlObj = new URL(s.url);
              sources.push({
                title: s.title || urlObj.hostname,
                url: s.url,
                domain: urlObj.hostname.replace(/^www\./, ''),
              });
            } catch {
              sources.push({ title: s.title || s.url, url: s.url, domain: s.url });
            }
          }
        }
        if (sources.length > 0) return sources;
      }
    } catch {}

    // 2. Parse text regex matches (URL: https://...)
    const urlRegex = /(?:URL:\s*)(https?:\/\/[^\s\n]+)/g;
    const titleRegex = /(?:\d+\.\s*)([^\n]+)/g;

    const titles: string[] = [];
    let titleMatch;
    while ((titleMatch = titleRegex.exec(output)) !== null) {
      titles.push(titleMatch[1].trim());
    }

    let urlMatch;
    let idx = 0;
    while ((urlMatch = urlRegex.exec(output)) !== null) {
      const rawUrl = urlMatch[1].trim();
      try {
        const urlObj = new URL(rawUrl);
        sources.push({
          title: titles[idx] || urlObj.hostname,
          url: rawUrl,
          domain: urlObj.hostname.replace(/^www\./, ''),
        });
      } catch {
        sources.push({
          title: titles[idx] || rawUrl,
          url: rawUrl,
          domain: rawUrl,
        });
      }
      idx++;
    }

    return sources;
  };

  // Helper for favicon
  const getFaviconUrl = (domain: string) => {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  };

  return (
    <div className="my-2.5 space-y-2 select-none font-sans">
      {toolsExecuted.map((t, idx) => {
        const isRunning = t.status === 'running';
        const isExpanded = !!expandedIndices[idx];
        const isSearch = t.toolName === 'web_search';
        const query = getSearchQuery(t.args);
        const sources = isSearch ? parseSources(t.output) : [];

        // Determine tool label (e.g., "Searched the web" or "Created file")
        let toolLabel = 'Searched the web';
        if (t.toolName === 'create_file') toolLabel = 'Created 1 file';
        else if (t.toolName === 'run_command') toolLabel = 'Ran terminal command';
        else if (!isSearch) toolLabel = `Used ${t.toolName}`;

        return (
          <div key={idx} className="flex flex-col">
            {/* Claude/Perplexity style Collapsible Header Pill */}
            <div
              onClick={() => toggleExpand(idx)}
              className="inline-flex items-center gap-2 text-[13px] text-[#cccccc] hover:text-white cursor-pointer py-1 px-1 rounded transition-colors group w-fit"
            >
              <div className="flex items-center gap-1.5">
                {isRunning ? (
                  <Loader2 size={14} className="text-[#a3a3a3] animate-spin" />
                ) : (
                  <Globe size={14} className="text-[#999999] group-hover:text-white transition-colors" />
                )}
                <span className="font-normal text-[#d4d4d4] group-hover:text-white">
                  {toolLabel}
                </span>
                {query && (
                  <span className="text-[#888888] font-normal max-w-[340px] truncate">
                    {query}
                  </span>
                )}
              </div>

              {isExpanded ? (
                <ChevronDown size={14} className="text-[#777777] group-hover:text-white" />
              ) : (
                <ChevronRight size={14} className="text-[#777777] group-hover:text-white" />
              )}
            </div>

            {/* Expandable Perplexity/Claude Result Box (matching uploaded screenshot) */}
            {isExpanded && (
              <div className="mt-1.5 ml-1 mr-2 p-3 rounded-2xl bg-[#141414] border border-[#222222] text-xs shadow-lg max-w-[680px] transition-all">
                {/* Search Header inside the card */}
                {isSearch && query && (
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#222222] text-[13px]">
                    <div className="flex items-center gap-2 text-[#cccccc] min-w-0">
                      <span className="text-[#888888]">Searched the web</span>
                      <span className="font-medium text-white truncate">{query}</span>
                    </div>
                  </div>
                )}

                {/* Sources List (Clean Google Favicon + Title + Domain) */}
                {sources.length > 0 ? (
                  <div className="space-y-1.5">
                    {sources.map((s, sIdx) => (
                      <a
                        key={sIdx}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-[#1e1e1e] transition-colors group/item"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                          <img
                            src={getFaviconUrl(s.domain)}
                            alt=""
                            className="w-4 h-4 rounded-sm shrink-0 bg-[#222222]"
                            onError={(e) => {
                              // Fallback to globe if favicon not found
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <span className="text-[12px] text-[#e0e0e0] group-hover/item:text-white truncate">
                            {s.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#737373] group-hover/item:text-[#a3a3a3] shrink-0">
                          <span>{s.domain}</span>
                          <ExternalLink size={10} className="opacity-0 group-hover/item:opacity-100 transition-opacity" />
                        </div>
                      </a>
                    ))}
                  </div>
                ) : isRunning ? (
                  <div className="flex items-center gap-2 text-xs text-[#888888] py-2 px-1">
                    <Loader2 size={13} className="animate-spin text-white" />
                    <span>Searching live sources...</span>
                  </div>
                ) : (
                  <div className="text-xs text-[#888888] py-1.5 px-1 italic">
                    Search completed.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
