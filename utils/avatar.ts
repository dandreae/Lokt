// Single source of truth for turning a name/userId into initials + a
// deterministic color. Previously duplicated across index.tsx, friends.tsx,
// and groups/[id].tsx with copy-pasted drift between them.

export const AVATAR_COLORS = [
  '#7c6ff7', '#6cb4f7', '#5ee8b0', '#f7a76c',
  '#f7d96c', '#f76cbf', '#f76c6c', '#5ee8e8',
] as const;

export function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
