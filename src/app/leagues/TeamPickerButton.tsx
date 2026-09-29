"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getTeamNames, setMyTeam } from "./actions";

export function TeamPickerButton({
  leagueRowId,
  myRosterId,
}: {
  leagueRowId: string;
  myRosterId: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<{ rosterId: number; teamName: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    setError(null);
    if (teams) return; // already fetched once this page load
    startTransition(async () => {
      const result = await getTeamNames(leagueRowId);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setTeams(result.teams);
    });
  }

  function handlePick(rosterId: number) {
    startTransition(async () => {
      const result = await setMyTeam(leagueRowId, rosterId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        aria-expanded={false}
        className={`shrink-0 text-sm font-medium hover:underline ${
          myRosterId != null
            ? "text-zinc-600 dark:text-zinc-400"
            : "text-amber-700 dark:text-amber-400"
        }`}
      >
        {myRosterId != null ? "Change team" : "Set your team"}
      </button>
    );
  }

  return (
    <div className="flex w-full basis-full flex-col gap-2 rounded-md border border-black/[.08] p-2 dark:border-white/[.145]">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Which team is yours?</p>
      {pending && !teams && <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">Loading teams…</p>}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {teams && (
        <div className="flex flex-wrap gap-1.5">
          {teams.map((t) => (
            <button
              key={t.rosterId}
              type="button"
              onClick={() => handlePick(t.rosterId)}
              disabled={pending}
              aria-pressed={t.rosterId === myRosterId}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                t.rosterId === myRosterId
                  ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {t.teamName}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="self-start text-xs text-zinc-500 underline dark:text-zinc-400"
      >
        Cancel
      </button>
    </div>
  );
}
