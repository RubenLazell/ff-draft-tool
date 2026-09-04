import { createServiceRoleClient } from "@/lib/supabase/service";
import { getDefaultRankings, isFormat, type Format } from "@/lib/rankings";
import { RankingsBoard } from "../RankingsBoard";

export default async function GuestRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; t?: string }>;
}) {
  const { format: rawFormat, t } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";

  const supabase = createServiceRoleClient();
  const rankings = await getDefaultRankings(supabase, format);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
          My Rankings
        </h1>
        <p className="mb-4 text-sm text-zinc-600 sm:mb-6 dark:text-zinc-400">
          Drag players to reorder your big board.
        </p>
        <RankingsBoard
          key={`${format}:${t ?? ""}`}
          initialRankings={rankings}
          format={format}
          aiInsightsEnabled={false}
          guestMode
        />
      </div>
    </div>
  );
}
