import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings, isFormat, FORMATS, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { CompareView } from "../CompareView";

export default async function ComparePage({
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

  return (
    <CompareView
      initialRankings={rankings}
      format={format}
      formats={FORMATS}
      formatLabels={FORMAT_LABELS}
    />
  );
}
