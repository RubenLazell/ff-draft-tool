import Link from "next/link";

// Flip this to the real listing URL once the Chrome Web Store review
// finishes (item id nddmcgfljljjbfkajallenamhibhafdp) — everything below
// switches from "pending review" to a real install button automatically.
const CHROME_STORE_URL: string | null = null;

export const metadata = {
  title: "Chrome Extension — FF Draft Tool",
};

export default function ExtensionPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 text-black dark:text-zinc-50">
        <div>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Back home
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Live Draft Assistant (Chrome Extension)
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Overlays your rankings on ESPN and Sleeper draft rooms, filtering
            out picks live as they happen.
          </p>
        </div>

        <section className="rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="mb-2 text-base font-semibold">Get the extension</h2>
          {CHROME_STORE_URL ? (
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Add to Chrome
            </a>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                This extension has been submitted to the Chrome Web Store and
                is currently waiting on Google&apos;s review — this can take
                anywhere from a few hours to a few days. Once it&apos;s
                approved, the official install link will appear right here.
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                In the meantime, you can install it manually — see the steps
                below. It&apos;s the exact same extension, just installed a
                different way.
              </p>
              <a
                href="/downloads/ff-draft-tool-extension.zip"
                download
                className="inline-flex h-11 w-fit items-center justify-center rounded-full border border-black/[.08] px-5 font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              >
                Download extension (.zip)
              </a>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="mb-3 text-base font-semibold">
            Manual install (while the Chrome Web Store review is pending)
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              Click <strong>Download extension (.zip)</strong> above to save{" "}
              <code>ff-draft-tool-extension.zip</code>.
            </li>
            <li>
              Unzip it somewhere you&apos;ll keep it (right-click the file →{" "}
              <strong>Extract All</strong> on Windows, or double-click it on
              Mac) — don&apos;t delete this folder afterward, Chrome loads
              the extension from it directly.
            </li>
            <li>
              Open Chrome and go to{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
                chrome://extensions
              </code>
              .
            </li>
            <li>
              Turn on <strong>Developer mode</strong> — a toggle in the
              top-right corner of that page.
            </li>
            <li>
              Click <strong>Load unpacked</strong> (top-left) and select the
              unzipped <code>extension</code> folder — the one that directly
              contains a file named <code>manifest.json</code>.
            </li>
            <li>
              The FF Draft Tool icon should now appear in your browser
              toolbar. That&apos;s it — installed.
            </li>
          </ol>
        </section>

        <section className="rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="mb-3 text-base font-semibold">How to use it</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              Make sure you&apos;ve built your rankings first at{" "}
              <Link href="/rankings" className="underline">
                /rankings
              </Link>{" "}
              — the extension shows whatever board you&apos;ve set up here.
            </li>
            <li>
              Click the FF Draft Tool icon in your Chrome toolbar and log in
              with your account on this site (same email/password).
            </li>
            <li>
              Pick a scoring format and how many players you want to see —
              overall, and per position — then hit Save.
            </li>
            <li>
              Open a draft on ESPN or Sleeper (mock or real). A panel appears
              automatically showing your next-best available players,
              updating live as picks happen — no need to refresh or tab
              away.
            </li>
            <li>
              Drag the panel by its header to move it, resize it from the
              bottom-right corner, or click × to hide it (bring it back from
              the extension&apos;s popup with &ldquo;Show panel on this
              page&rdquo;). If it ever ends up somewhere awkward, the popup
              also has a &ldquo;Reset panel position&rdquo; button.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
