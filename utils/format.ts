export function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

// Aggregate/leaderboard duration formatter — minute granularity, "0m" for
// zero rather than "0s", used anywhere sub-minute precision doesn't matter
// (weekly totals, leaderboard rows). formatDuration above stays the
// canonical formatter for individual logged sessions.
export function formatStudyTime(secs: number): string {
  if (secs <= 0) return '0m';
  if (secs < 60) return '<1m';
  const totalMins = Math.floor(secs / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Clock-style countdown/stopwatch readout — h:mm:ss or mm:ss.
export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
