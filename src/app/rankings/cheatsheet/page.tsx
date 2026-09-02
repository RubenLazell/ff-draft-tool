import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings, isFormat, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { CheatsheetView } from "../CheatsheetView";

export default async function CheatsheetPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { format: rawFormat } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";

  const rankings = await getOrCreateUserRankings(supabase, user.id, format);
  // Cheat sheets skip kickers and defenses — most drafters handle those
  // last-minute/from memory rather than pre-ranking them on paper.
  const skillPlayersOnly = rankings.filter(
    (p) => p.position !== "K" && p.position !== "DEF"
  );

  return <CheatsheetView players={skillPlayersOnly} formatLabel={FORMAT_LABELS[format]} />;
}
