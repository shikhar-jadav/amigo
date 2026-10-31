'use client';

import React from 'react';

interface RatingHistogramProps {
  hist?: number[];
  totalRatings?: number;
}

export const RatingHistogram: React.FC<RatingHistogramProps> = ({
  hist = [0, 0, 0, 0, 0],
  totalRatings = 0,
}) => {
  const safeHist = hist && hist.length === 5 ? hist : [0, 0, 0, 0, 0];
  const safeTotal = totalRatings > 0 ? totalRatings : 0;

  return (
    <div className="space-y-1.5 p-3 rounded-xl bg-[#111] border border-[#222]">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = safeHist[stars - 1] || 0;
        const pct = safeTotal > 0 ? Math.round((count / safeTotal) * 100) : 0;

        return (
          <div key={stars} className="flex items-center gap-2 text-xs text-[#888]">
            <span className="w-7 text-right font-mono">{stars}★</span>
            <div className="flex-1 h-2 rounded-full bg-[#1c1c1c] overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono text-[11px] text-[#666]">{count}</span>
          </div>
        );
      })}
    </div>
  );
};
