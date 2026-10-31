'use client';

import React, { useEffect, useState, useRef, useId } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  Copy,
  Check,
  RotateCcw,
  Maximize2,
  Minimize2,
  Download,
  AlertTriangle,
  Code2,
} from 'lucide-react';

interface MermaidDiagramProps {
  chartCode: string;
}

// Configure mermaid once on load with strict security settings
if (typeof window !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    darkMode: true,
    fontFamily: 'inherit',
    themeVariables: {
      background: '#0c0c0c',
      primaryColor: '#1d4ed8',
      primaryTextColor: '#f8fafc',
      primaryBorderColor: '#3b82f6',
      lineColor: '#64748b',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a',
    },
  });
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chartCode }) => {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/:/g, '')}`;

  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showRawCode, setShowRawCode] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const cleanCode = chartCode.trim();

    const renderChart = async () => {
      if (!cleanCode) {
        if (isMounted) {
          setSvgContent('');
          setIsLoading(false);
        }
        return;
      }

      try {
        if (isMounted) {
          setIsLoading(true);
          setError(null);
        }

        // Asynchronously render using Mermaid with strict security
        const renderId = `${diagramId}-${Date.now()}`;
        const { svg } = await mermaid.render(renderId, cleanCode);

        if (!isMounted) return;

        // Security: Sanitize SVG via DOMPurify before inserting into DOM
        const sanitized = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });

        setSvgContent(sanitized);
        setError(null);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Invalid Mermaid syntax';
        setError(msg);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chartCode, diagramId]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(chartCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy diagram code:', e);
    }
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={containerRef}
      className={`my-3 rounded-2xl border border-[#222222] bg-[#0c0c0c] overflow-hidden transition-all duration-200 select-none ${
        isFullscreen
          ? 'fixed inset-4 z-[9999] flex flex-col shadow-2xl bg-[#0a0a0a] border-[#333]'
          : 'relative w-full'
      }`}
    >
      {/* Top Action Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1c1c1c] bg-[#111111]/90 backdrop-blur-sm text-xs text-[#888888]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-medium text-blue-400">mermaid</span>
          <span className="text-neutral-600">·</span>
          <span className="text-[11px] text-neutral-400">Interactive Diagram</span>
        </div>

        <div className="flex items-center gap-1.5">
          {error && (
            <button
              onClick={() => setShowRawCode((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#222222] hover:text-white transition-colors cursor-pointer text-[11px]"
              title="Toggle raw Mermaid code"
            >
              <Code2 size={12} />
              <span>{showRawCode ? 'Hide Code' : 'View Code'}</span>
            </button>
          )}

          <button
            onClick={handleCopyCode}
            className="p-1.5 rounded-lg hover:bg-[#222222] hover:text-white transition-colors cursor-pointer"
            title="Copy Mermaid code"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          {svgContent && !error && (
            <button
              onClick={handleDownloadSvg}
              className="p-1.5 rounded-lg hover:bg-[#222222] hover:text-white transition-colors cursor-pointer"
              title="Download SVG"
            >
              <Download size={13} />
            </button>
          )}

          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-lg hover:bg-[#222222] hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Main Diagram Viewport */}
      {error ? (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-950/20 border border-amber-900/40 p-3 rounded-xl">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="truncate">Unable to render diagram (syntax incomplete or unsupported)</span>
          </div>
          {showRawCode && (
            <pre className="p-3 rounded-xl bg-[#141414] border border-[#222] text-xs font-mono text-neutral-300 overflow-x-auto whitespace-pre">
              {chartCode}
            </pre>
          )}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center p-8 text-neutral-500 text-xs gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <span>Rendering diagram…</span>
        </div>
      ) : (
        <div className={`relative ${isFullscreen ? 'flex-1 overflow-hidden' : 'h-[360px] md:h-[420px]'}`}>
          <TransformWrapper
            initialScale={1}
            minScale={0.3}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.08 }}
          >
            {({ resetTransform }) => (
              <>
                {/* Reset button pill */}
                <button
                  onClick={() => resetTransform()}
                  className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141414]/80 hover:bg-[#222] text-[#888] hover:text-white border border-[#262626] backdrop-blur-sm text-[11px] transition-colors cursor-pointer shadow-md"
                  title="Reset Zoom & Pan"
                >
                  <RotateCcw size={11} />
                  <span>Reset</span>
                </button>

                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                  }}
                >
                  <div
                    className="flex items-center justify-center pointer-events-auto"
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      )}
    </div>
  );
};

export default MermaidDiagram;
