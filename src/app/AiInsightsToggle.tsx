"use client";

import { useState, useTransition } from "react";
import { setAiInsightsEnabled } from "./actions";

export function AiInsightsToggle({
  enabled,
  disabled,
  disabledReason,
}: {
  enabled: boolean;
  disabled?: boolean;
  disabledReason?: "logged-out" | "not-authorized";
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (disabled) return;
    const next = !isEnabled;
    setIsEnabled(next); // optimistic
    startTransition(async () => {
      const result = await setAiInsightsEnabled(next);
      if (result.error) setIsEnabled(!next); // revert on failure
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      title={
        disabled
          ? disabledReason === "not-authorized"
            ? "AI player insights aren't available on this account"
            : "Log in to enable AI player insights"
          : undefined
      }
      className={`flex h-12 items-center justify-center rounded-full border px-5 text-base font-medium transition-colors ${
        disabled
          ? "cursor-not-allowed border-black/[.08] text-zinc-400 dark:border-white/[.08] dark:text-zinc-600"
          : isEnabled
            ? "border-transparent bg-green-600 text-white hover:bg-green-700"
            : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
      } disabled:opacity-60`}
    >
      {disabled
        ? disabledReason === "not-authorized"
          ? "AI insights (unavailable)"
          : "AI insights (log in required)"
        : isEnabled
          ? "AI insights: On"
          : "Enable AI insights"}
    </button>
  );
}
