// ESPN's public sports scoreboard API — distinct from their unofficial
// fantasy football API (src/lib/espn.ts): no auth, no cookies, a normal
// public sports-scores endpoint used broadly across the web. Gives the
// real NFL schedule for a week, used to group fantasy rosters by which
// actual NFL game each player's team is playing in.

import { normalizeTeamCode } from "@/lib/normalizeName";

export type NflGameStatus = { state: "pre" | "in" | "post"; detail: string };

export type NflGame = {
  gameId: string;
  shortName: string; // e.g. "NE @ SEA"
  kickoff: string; // ISO date
  homeTeam: string;
  awayTeam: string;
  slate: string; // broadcast slate label, e.g. "Sunday Early"
  status: NflGameStatus;
};

// Shared by matchupsByGame.ts (by-game grouping) and liveScoring.ts (live
// player lookups) — a player's NFL team appears in at most one game per
// week, so this is a plain lookup, built once per schedule fetch.
export function gameByTeam(schedule: NflGame[]): Map<string, NflGame> {
  const map = new Map<string, NflGame>();
  for (const game of schedule) {
    map.set(game.homeTeam, game);
    map.set(game.awayTeam, game);
  }
  return map;
}

// Standard NFL broadcast slates, bucketed by day/time in US Eastern (the
// conventional NFL broadcast timezone) regardless of the server's own
// timezone. "Sunday Morning" covers the occasional 9:30am ET
// international window; everything else follows the usual TV windows.
function getSlate(kickoffIso: string): string {
  const date = new Date(kickoffIso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;

  if (weekday === "Thu") return "Thursday Night";
  if (weekday === "Fri") return "Friday";
  if (weekday === "Sat") return "Saturday";
  if (weekday === "Mon") return "Monday Night";
  if (weekday === "Sun") {
    if (hour < 13) return "Sunday Morning";
    if (hour < 16) return "Sunday Early";
    if (hour < 20) return "Sunday Late";
    return "Sunday Night";
  }
  return "Other";
}

export async function fetchNflSchedule(week: number, season: string): Promise<NflGame[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=${season}`
  );
  if (!res.ok) throw new Error(`NFL schedule fetch failed: ${res.status}`);

  const data = (await res.json()) as {
    events?: {
      id: string;
      shortName: string;
      date: string;
      competitions: { competitors: { homeAway: string; team: { abbreviation: string } }[] }[];
      status?: { type?: { state?: string; shortDetail?: string } };
    }[];
  };

  return (data.events ?? [])
    .map((event) => {
      const competitors = event.competitions[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      const homeTeam = normalizeTeamCode(home?.team.abbreviation);
      const awayTeam = normalizeTeamCode(away?.team.abbreviation);
      if (!homeTeam || !awayTeam) return null;
      const state = event.status?.type?.state;
      return {
        gameId: event.id,
        shortName: event.shortName,
        kickoff: event.date,
        homeTeam,
        awayTeam,
        slate: getSlate(event.date),
        status: {
          state: state === "in" || state === "post" ? state : "pre",
          detail: event.status?.type?.shortDetail ?? "",
        },
      };
    })
    .filter((g): g is NflGame => g != null);
}
