import type { MatchScore as MatchScoreData } from "@/lib/tmdb.functions";

const COLOR_CLASSES: Record<string, string> = {
  "dark-green": "bg-emerald-900 text-emerald-50 border-emerald-500/50",
  "light-green": "bg-emerald-500/20 text-emerald-200 border-emerald-400/50",
  yellow: "bg-yellow-400/20 text-yellow-100 border-yellow-300/50",
  orange: "bg-orange-500/20 text-orange-100 border-orange-400/50",
  red: "bg-red-500/20 text-red-100 border-red-400/50",
  neutral: "bg-surface/90 text-muted-foreground border-border",
};

export function MatchScore({
  score,
  size = "compact",
}: {
  score?: MatchScoreData | null;
  size?: "compact" | "large";
}) {
  if (!score) return null;

  const classes = COLOR_CLASSES[score.color] ?? COLOR_CLASSES.neutral;
  const value = score.score == null ? "DNA" : `${score.score}%`;

  if (size === "large") {
    return (
      <div className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 ${classes}`}>
        <div className="grid size-12 place-items-center rounded-full border border-current/25 text-lg font-black">
          {value}
        </div>
        <div>
          <div className="text-sm font-extrabold">{score.label}</div>
          <div className="text-xs opacity-80">TasteMatch Confidence {score.confidence}%</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wide ${classes}`}
      title={score.label}
    >
      {value}
    </div>
  );
}
