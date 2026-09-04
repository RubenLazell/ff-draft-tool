import { createServiceRoleClient } from "@/lib/supabase/service";
import { getDefaultRankings, isFormat, FORMATS, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { CompareView } from "../../CompareView";

export default async function GuestComparePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format: rawFormat } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";

  const supabase = createServiceRoleClient();
  const rankings = await getDefaultRankings(supabase, format);

  return (
    <CompareView
      initialRankings={rankings}
      format={format}
      formats={FORMATS}
      formatLabels={FORMAT_LABELS}
      guestMode
    />
  );
}
