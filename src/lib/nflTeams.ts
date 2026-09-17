// Static NFL team reference data, keyed by the same canonical abbreviation
// normalizeTeamCode() produces (so this lines up exactly with
// NflGame.homeTeam/awayTeam) — used to let a search match "Seahawks" or
// "Seattle" against a game whose schedule data only carries "SEA".
export type NflTeamInfo = { city: string; nickname: string; fullName: string };

function team(city: string, nickname: string): NflTeamInfo {
  return { city, nickname, fullName: `${city} ${nickname}` };
}

export const NFL_TEAMS: Record<string, NflTeamInfo> = {
  ARI: team("Arizona", "Cardinals"),
  ATL: team("Atlanta", "Falcons"),
  BAL: team("Baltimore", "Ravens"),
  BUF: team("Buffalo", "Bills"),
  CAR: team("Carolina", "Panthers"),
  CHI: team("Chicago", "Bears"),
  CIN: team("Cincinnati", "Bengals"),
  CLE: team("Cleveland", "Browns"),
  DAL: team("Dallas", "Cowboys"),
  DEN: team("Denver", "Broncos"),
  DET: team("Detroit", "Lions"),
  GB: team("Green Bay", "Packers"),
  HOU: team("Houston", "Texans"),
  IND: team("Indianapolis", "Colts"),
  JAC: team("Jacksonville", "Jaguars"),
  KC: team("Kansas City", "Chiefs"),
  LAC: team("Los Angeles", "Chargers"),
  LAR: team("Los Angeles", "Rams"),
  LV: team("Las Vegas", "Raiders"),
  MIA: team("Miami", "Dolphins"),
  MIN: team("Minnesota", "Vikings"),
  NE: team("New England", "Patriots"),
  NO: team("New Orleans", "Saints"),
  NYG: team("New York", "Giants"),
  NYJ: team("New York", "Jets"),
  PHI: team("Philadelphia", "Eagles"),
  PIT: team("Pittsburgh", "Steelers"),
  SEA: team("Seattle", "Seahawks"),
  SF: team("San Francisco", "49ers"),
  TB: team("Tampa Bay", "Buccaneers"),
  TEN: team("Tennessee", "Titans"),
  WAS: team("Washington", "Commanders"),
};
