"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLeague } from "./actions";

export function AddLeagueForm() {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addLeague(leagueId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLeagueId("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1.5">
        <input
          type="text"
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          placeholder="Sleeper league ID"
          className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={pending || !leagueId.trim()}
        className="flex h-10 shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {pending ? "Adding…" : "Add league"}
      </button>
    </form>
  );
}
