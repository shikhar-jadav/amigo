'use client';

import React, { useState } from 'react';
import { ThumbsUp, Flag, CornerDownRight, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { Review } from '../types';
import { StarRating } from './StarRating';

interface ReviewThreadProps {
  pluginId: string;
  isInstalled: boolean;
  isOwner?: boolean;
  reviews: Review[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSubmitReview: (body: string, stars: number) => Promise<{ success: boolean; error?: string }>;
  onVoteHelpful: (reviewId: string) => void;
  onReportReview: (reviewId: string, reason: string) => void;
}

export const ReviewThread: React.FC<ReviewThreadProps> = ({
  pluginId,
  isInstalled,
  isOwner,
  reviews,
  isLoading,
  hasMore,
  onLoadMore,
  onSubmitReview,
  onVoteHelpful,
  onReportReview,
}) => {
  const [stars, setStars] = useState(5);
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await onSubmitReview(body.trim(), stars);
      if (!res.success) {
        setSubmitError(res.error || 'Failed to submit review');
      } else {
        setBody('');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Error submitting review');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Review Submission Form / Gating Box */}
      <div className="p-4 rounded-2xl bg-[#111] border border-[#222]">
        {!isInstalled ? (
          <div className="flex items-center gap-3 text-xs text-[#888] py-2">
            <AlertCircle size={16} className="text-amber-400 shrink-0" />
            <p>
              Only users who have downloaded and installed this plugin can leave a star rating and written review.
            </p>
          </div>
        ) : isOwner ? (
          <div className="flex items-center gap-3 text-xs text-[#888] py-2">
            <AlertCircle size={16} className="text-indigo-400 shrink-0" />
            <p>You authored this plugin. Self-ratings and reviews are disabled.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white">Rate your experience:</span>
              <StarRating value={stars} onChange={setStars} size={18} />
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you think of this plugin? Mention workflows, speed, or accuracy..."
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl bg-[#181818] border border-[#2c2c2c] p-3 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#444] resize-none"
            />

            {submitError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/30 rounded-xl px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-[#555]">{body.length}/2000 chars</span>
              <button
                type="submit"
                disabled={!body.trim() || isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e0e0e0] disabled:opacity-40 transition-colors cursor-pointer"
              >
                {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                Submit Review
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {reviews.length === 0 && !isLoading ? (
          <p className="text-center text-xs text-[#666] py-6">
            No written reviews yet. Be the first to share your experience!
          </p>
        ) : (
          reviews.map((rev) => (
            <div key={rev.id} className="p-4 rounded-xl bg-[#0f0f0f] border border-[#1e1e1e] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{rev.reviewer_name}</span>
                  {rev.rating_stars && <StarRating value={rev.rating_stars} readOnly size={12} />}
                </div>
                <span className="text-[10px] text-[#555]">
                  {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : ''}
                </span>
              </div>

              {/* Secure Plaintext Rendering */}
              <p className="text-xs text-[#ccc] whitespace-pre-wrap leading-relaxed select-text">
                {rev.body}
              </p>

              {/* Helpful Vote & Report Buttons */}
              <div className="flex items-center gap-4 pt-1 text-[11px] text-[#666]">
                <button
                  type="button"
                  onClick={() => onVoteHelpful(rev.id)}
                  className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                >
                  <ThumbsUp size={11} />
                  <span>Helpful ({rev.helpful_count || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reason = prompt('Please describe why you are reporting this review:');
                    if (reason && reason.trim()) onReportReview(rev.id, reason.trim());
                  }}
                  className="flex items-center gap-1 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Flag size={11} />
                  <span>Report</span>
                </button>
              </div>

              {/* Nested Builder Replies */}
              {rev.replies && rev.replies.length > 0 && (
                <div className="mt-3 space-y-2 pl-3 border-l-2 border-indigo-500/50">
                  {rev.replies.map((rep) => (
                    <div key={rep.id} className="p-2.5 rounded-lg bg-[#161524] text-xs">
                      <div className="flex items-center gap-1.5 text-indigo-400 font-medium mb-1 text-[11px]">
                        <CornerDownRight size={10} />
                        <span>Builder Reply ({rep.author_name})</span>
                      </div>
                      <p className="text-[#ddd] whitespace-pre-wrap">{rep.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {hasMore && (
          <div className="text-center pt-2">
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-[#1a1a1a] text-xs font-medium text-white hover:bg-[#222] transition-colors cursor-pointer"
            >
              {isLoading ? 'Loading...' : 'Load more reviews'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
