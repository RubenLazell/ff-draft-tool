// ESPN's public sports scoreboard API — distinct from their unofficial
// fantasy football API (src/lib/espn.ts): no auth, no cookies, a normal
// public sports-scores endpoint used broadly across the web. Gives the
// real NFL schedule for a week, used to group fantasy rosters by which
// actual NFL game each player's team is playing in.

import { normalizeTeamCode } from "@/lib/normalizeName";

export type NflGame = {
  gameId: string;
  shortName: string; // e.g. "NE @ SEA"
  kickoff: string; // ISO date
  homeTeam: string;
  awayTeam: string;
};

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
      return { gameId: event.id, shortName: event.shortName, kickoff: event.date, homeTeam, awayTeam };
    })
    .filter((g): g is NflGame => g != null);
}
