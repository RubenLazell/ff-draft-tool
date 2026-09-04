# FF Draft Tool

A fantasy football draft assistant: build your own player rankings, refine them head-to-head, print a draft-day cheat sheet, and see any real Sleeper or ESPN league ranked by strength — judged against *your* rankings, not a generic consensus. A companion Chrome extension overlays your board live on ESPN and Sleeper draft rooms.

**Live site:** [ff-draft-tool-neon.vercel.app](https://ff-draft-tool-neon.vercel.app)

## Features

- **Rankings board** — drag-and-drop your own big board, seeded from consensus ADP across five formats (PPR, Half-PPR, Standard, Superflex, Dynasty). Search, filter by position, jump a player straight to a rank, vs.-ADP deltas at a glance.
- **Head-to-head compare** — get dealt two players from your own board (gap size drawn from a binomial distribution, mostly close neighbors, occasionally a wider sanity check) and pick who you'd rather draft; your rankings reorder automatically whenever a pick disagrees with them.
- **Printable cheat sheet** — a clean, position-color-coded, print-ready sheet generated straight from your board.
- **League import** — paste a real Sleeper or ESPN league ID and see every team ranked by strength: each team's *optimal* starting lineup (respecting the league's actual roster slots and FLEX rules) is scored by Value Over Replacement Player against your own rankings, with a visual breakdown of which positions drive each team's score. Kickers/defenses are down-weighted to match how little they actually matter.
- **Guest mode** — every feature above works with no account. Guest data lives only in that browser (localStorage); sign up any time to save permanently and sync across devices.
- **Chrome extension** — a live draft-room overlay for ESPN and Sleeper. Pulls your saved rankings once, then filters out drafted players locally in real time as picks happen — no repeated network calls. Draggable, resizable, works on both Sleeper's current and legacy draft-room layouts.
- **AI insights** *(owner-only)* — on-demand strength/concern and injury-outlook writeups per player, gated behind a single allow-listed account since each call costs real money.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Server Components) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Supabase** — Postgres + Auth, Row-Level Security on every user-owned table
- **Anthropic API** — AI insights (owner-gated)
- Player/ADP data from [Sleeper's public API](https://docs.sleeper.com/) and [FantasyFootballCalculator's ADP API](https://help.fantasyfootballcalculator.com/article/42-adp-rest-api) — both free, no key required
- League import reads directly from Sleeper's public league API and ESPN's unofficial fantasy API (private ESPN leagues need the user's own `SWID`/`espn_s2` browser cookies — there's no OAuth flow a third party can use instead)
- Deployed on **Vercel**, with a daily Vercel Cron job keeping injury status, practice participation, ADP, and bye weeks fresh

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (`.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — guest mode's default rankings, league import's player matching, the data-sync scripts. Never exposed to the client. |
| `ANTHROPIC_API_KEY` | AI insights (owner-only feature) |
| `CRON_SECRET` | Authenticates Vercel Cron's scheduled hits to `/api/cron/sync-data` |

### Data sync

Player data (names, positions, injury status) and consensus ADP aren't bundled — they're synced from Sleeper and FantasyFootballCalculator into Supabase:

```bash
npm run seed:players    # players table: names, positions, injury status
npm run sync:consensus  # consensus_rankings: ADP per format, bye weeks
```

Both run automatically once a day in production via Vercel Cron (`/api/cron/sync-data`); the npm scripts are for local backfills or manual refreshes. The actual sync logic lives in `src/lib/sync/` and is shared between the CLI scripts and the cron route.

## Chrome extension

Source lives in `extension/` (plain Manifest V3, no build step). Load it unpacked via `chrome://extensions` in developer mode, or download the packaged version from the site's [`/extension`](https://ff-draft-tool-neon.vercel.app/extension) page.

## Project structure

```
src/app/            Routes (App Router) — rankings, compare, cheatsheet, leagues, auth, guest mode
src/lib/             Shared logic: rankings data access, league scoring (VORP), Sleeper/ESPN API clients, Supabase clients
scripts/             Standalone data-sync CLI scripts (service-role key, never imported from src/)
extension/           Chrome extension (content script, background worker, popup)
```
