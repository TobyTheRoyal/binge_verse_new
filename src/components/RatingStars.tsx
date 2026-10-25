import { useState } from "react";
import { Star } from "lucide-react";
import { formatRating } from "@/lib/format-rating";

export function RatingStars({
  currentRating,
  onRate,
  ariaPrefix,
  starClassName = "size-5",
}: {
  currentRating: number;
  onRate?: (rating: number) => void;
  ariaPrefix: string;
  starClassName?: string;
}) {
  const [hover, setHover] = useState(0);
  const displayRating = hover || currentRating;
  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHover(0)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(0);
      }}
    >
      {Array.from({ length: 10 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, displayRating - index)) * 100;
        return (
          <div key={index} className={`relative shrink-0 ${starClassName}`}>
            <Star
              className={`absolute inset-0 ${starClassName} text-muted-foreground/35`}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0 overflow-hidden text-[var(--color-gold)]"
              style={{ width: `${fill}%` }}
              aria-hidden="true"
            >
              <Star className={`${starClassName} fill-[var(--color-gold)]`} />
            </span>
            {onRate &&
              [index + 0.5, index + 1].map((rating, half) => (
                <button
                  key={rating}
                  type="button"
                  onMouseEnter={() => setHover(rating)}
                  onFocus={() => setHover(rating)}
                  onClick={() => onRate(rating)}
                  aria-pressed={currentRating === rating}
                  className={`absolute inset-y-0 z-10 w-1/2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${half ? "right-0 rounded-r-sm" : "left-0 rounded-l-sm"}`}
                  aria-label={`${ariaPrefix}: ${rating} von 10 Sternen`}
                />
              ))}
          </div>
        );
      })}
      <span className="ml-3 min-w-[4ch] text-sm font-bold text-[var(--color-gold)]">
        {formatRating(displayRating)}/10
      </span>
    </div>
  );
}
