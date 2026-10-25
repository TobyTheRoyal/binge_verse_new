export function formatRating(rating: number) {
  if (!rating) return "–";
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}
