import Link from "next/link";

export function GuestBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <span>
        <strong className="font-semibold">Guest mode</strong> — changes are saved only in this
        browser, not to an account.
      </span>
      <Link href="/signup" className="shrink-0 font-medium underline">
        Sign up to save permanently →
      </Link>
    </div>
  );
}
