'use client';

import React from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange?: (val: number) => void;
  readOnly?: boolean;
  size?: number;
}

export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  readOnly = false,
  size = 16
}) => {
  const [hoverVal, setHoverVal] = React.useState<number | null>(null);

  const displayVal = hoverVal !== null ? hoverVal : value;

  return (
    <div
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `${value} out of 5 stars` : 'Rate this plugin from 1 to 5 stars'}
      className="inline-flex items-center gap-1 select-none"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayVal;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            aria-checked={value === star}
            role={readOnly ? undefined : 'radio'}
            tabIndex={readOnly ? -1 : 0}
            onClick={() => !readOnly && onChange && onChange(star)}
            onMouseEnter={() => !readOnly && setHoverVal(star)}
            onMouseLeave={() => !readOnly && setHoverVal(null)}
            onKeyDown={(e) => {
              if (readOnly || !onChange) return;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange(Math.min(5, value + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange(Math.max(1, value - 1));
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(star);
              }
            }}
            className={`p-0.5 rounded transition-transform ${
              readOnly
                ? 'cursor-default'
                : 'hover:scale-110 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer'
            }`}
          >
            <Star
              size={size}
              className={`${
                isFilled
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-transparent text-[#444]'
              } transition-colors`}
            />
          </button>
        );
      })}
    </div>
  );
};
