# Lokt

A social study tracking app for university students. Log study sessions, compete on leaderboards with friends and classmates, and stay accountable together.

Built with Expo (React Native) and Supabase.

## Features

- Stopwatch and countdown timer with session logging
- Weekly progress tracking with per-task goals
- Friends leaderboard with real-time presence ("studying now")
- School leaderboard — join via verified school email
- Activity heatmap, streaks, and session history
- Focus mode, haptic feedback, animated UI

## Setup

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A [Supabase](https://supabase.com) project

### Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project credentials:

```sh
cp .env.example .env
```

Both values are your project's **public anon key** — safe to use on the client. Find them in your Supabase dashboard under **Settings → API**.

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Install and run

```sh
npm install
npx expo start
```

### Supabase setup

The app expects the following tables and functions in your Supabase project:

**Tables:** `profiles`, `sessions`, `tasks`, `presence`, `friendships`, `schools`, `settings`

**RPC functions:** `get_friends_leaderboard`, `get_school_leaderboard`, `claim_school_membership`

**Triggers:** `on_auth_user_created` (creates a profile row on signup), `trigger_auto_join_school` (auto-joins users with school email domains)

SQL for all of the above is maintained separately and should be run in the Supabase SQL editor before first use.

## Tech stack

- [Expo](https://expo.dev) ~54 / React Native 0.81
- [Expo Router](https://expo.github.io/router) v6
- [Supabase](https://supabase.com) (auth, database, realtime)
- TypeScript, Nunito + DM Mono fonts
