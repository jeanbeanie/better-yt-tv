// relative for anything recent, absolute short date once that's not useful
export function formatPublishedAt(iso: string): string {
  const publishedAt = new Date(iso);
  const diffMinutes = Math.floor((Date.now() - publishedAt.getTime()) / 60_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const sameYear = publishedAt.getFullYear() === new Date().getFullYear();
  return publishedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
