/**
 * Preview mode — set PREVIEW = false to use real Supabase data.
 * When true, store functions return the constants below instead of hitting the network.
 */
export const PREVIEW = false;

import type { Session, Task } from '../types';
import type { LeaderboardEntry } from '../store/social';

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const PREVIEW_TASKS: Task[] = [
  { id: 'pt-calc', label: 'Calculus',   color: '#3FAF72', weeklyGoalSecs: 5 * 3600 },
  { id: 'pt-phys', label: 'Physics',    color: '#6cb4f7', weeklyGoalSecs: 4 * 3600 },
  { id: 'pt-cs',   label: 'CS Theory',  color: '#7c6ff7', weeklyGoalSecs: 6 * 3600 },
  { id: 'pt-lit',  label: 'Literature', color: '#f7a76c' },
  { id: 'pt-esp',  label: 'Spanish',    color: '#f7d96c', weeklyGoalSecs: 3 * 3600 },
];

// ─── Sessions ─────────────────────────────────────────────────────────────────

const NOW  = Date.now();
const DAY  = 86_400_000;
const HOUR = 3_600_000;

/** Millisecond timestamp N days and H hours ago. */
function t(days: number, hour = 10): number {
  return NOW - days * DAY - (hour * HOUR);
}

let _id = 0;
function s(taskId: string, secs: number, days: number, hour = 10, note = ''): Session {
  return { id: `ps-${++_id}`, subjectId: taskId, secs, note, ts: t(days, hour) };
}

export const PREVIEW_SESSIONS: Session[] = [
  // ── This week (days 0–6) — feeds the home ring ────────────────────────────
  // Today
  s('pt-calc', 5100, 0, 14, 'Chain rule practice'),
  s('pt-phys', 2700, 0,  9),
  // Yesterday
  s('pt-cs',  7200, 1, 15, 'Big-O complexity'),
  s('pt-esp', 2100, 1, 11),
  // 2 days ago
  s('pt-calc', 3300, 2, 13),
  // 3 days ago
  s('pt-lit',  1800, 3,  9),
  // 4 days ago
  s('pt-phys', 4500, 4, 16),
  // 5 days ago (streak edge — adds 6-day run)
  s('pt-cs',  5400, 5, 14, 'Graph algorithms'),

  // ── Last week — fills heatmap ─────────────────────────────────────────────
  s('pt-calc', 7800, 8,  10),
  s('pt-esp',  2400, 9,  15),
  s('pt-calc', 4200, 10, 11),
  s('pt-phys', 3300, 11, 13),
  s('pt-cs',   5100, 12, 16),
  s('pt-lit',  2700, 13,  9),
  s('pt-calc', 4800, 14, 10),

  // ── 3 weeks ago ───────────────────────────────────────────────────────────
  s('pt-phys', 5400, 18, 14),
  s('pt-cs',   3600, 19, 11),
  s('pt-esp',  1800, 21,  9),
  s('pt-calc', 6000, 22, 15),
  s('pt-lit',  2100, 24, 10),
  s('pt-cs',   4200, 25, 13),
];

// This-week total: 5100+2700+7200+2100+3300+1800+4500+5400 = 32100 s ≈ 8h 55m
// Weekly goal: 36000 s (10 h) → ring at 89 %

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export const PREVIEW_LEADERBOARD: LeaderboardEntry[] = [
  // Sorted highest → lowest so rank indices align correctly
  { user_id: 'pu-1', display_name: 'Jamie Lee',   username: 'jamieleee', weekly_secs: 40000, is_studying: true,  is_me: false },
  { user_id: 'pu-2', display_name: 'Alex Kim',    username: 'alexkim',   weekly_secs: 36000, is_studying: true,  is_me: false },
  { user_id: 'pu-me',display_name: 'You',         username: null,        weekly_secs: 32100, is_studying: false, is_me: true  },
  { user_id: 'pu-3', display_name: 'Sam Rivera',  username: 'samr22',    weekly_secs: 18600, is_studying: false, is_me: false },
  { user_id: 'pu-4', display_name: 'Taylor Chen', username: 'taylorch',  weekly_secs: 10500, is_studying: false, is_me: false },
];

// ─── Settings ─────────────────────────────────────────────────────────────────

export const PREVIEW_SETTINGS = { weeklyGoalSecs: 36_000 }; // 10 h
