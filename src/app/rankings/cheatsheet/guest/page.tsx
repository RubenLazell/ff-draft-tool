import { createServiceRoleClient } from "@/lib/supabase/service";
import { getDefaultRankings, isFormat, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { CheatsheetView } from "../../CheatsheetView";

export default async function GuestCheatsheetPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format: rawFormat } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";

  const supabase = createServiceRoleClient();
  const rankings = await getDefaultRankings(supabase, format);
  const skillPlayersOnly = rankings.filter((p) => p.position !== "K" && p.position !== "DEF");

  return (
    <CheatsheetView
      players={skillPlayersOnly}
      formatLabel={FORMAT_LABELS[format]}
      guestMode
      format={format}
    />
  );
}
