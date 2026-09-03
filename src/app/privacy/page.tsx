export const metadata = {
  title: "Privacy Policy — FF Draft Tool",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-black dark:text-zinc-50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Last updated September 2026
          </p>
        </div>

        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          FF Draft Tool (the website and its companion Chrome extension) is a
          personal fantasy football rankings and draft-assistant tool. This
          page explains what data it collects, why, and what it does with it.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">What we collect</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              <strong>Account info</strong> — your email address and password,
              used only to log you in. Passwords are handled directly by our
              authentication provider, Supabase; we never see or store them
              in plain text.
            </li>
            <li>
              <strong>Your rankings</strong> — the player order you create on
              the site, so it can be shown back to you (on the site and in
              the extension) and edited across sessions.
            </li>
            <li>
              <strong>AI insight requests</strong> (only if you enable that
              feature) — a player&apos;s name, position, and team are sent to
              Anthropic&apos;s Claude API to generate a short scouting note.
              No account or personal information is included in that
              request.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">The Chrome extension specifically</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              Stores your login session (an access token) locally in your
              browser via <code>chrome.storage</code>, so it can fetch your
              rankings on your behalf. This never leaves your browser except
              to authenticate directly with our database provider, Supabase.
            </li>
            <li>
              Reads the draft-room page you&apos;re viewing on ESPN or
              Sleeper (only to detect which players have already been
              drafted) entirely inside your browser. That page content is
              never transmitted anywhere or stored.
            </li>
            <li>
              Your chosen display settings (format, how many players to show)
              are stored locally via <code>chrome.storage</code> and are not
              sent to us.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Who we share it with</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            We don&apos;t sell your data or share it with advertisers. Data
            is processed by the infrastructure providers that run this
            service: Supabase (database and authentication), Vercel
            (hosting), and, only if you enable AI insights, Anthropic.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Cookies</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            The website uses a single session cookie to keep you logged in.
            We don&apos;t use tracking or advertising cookies.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Data retention &amp; deletion</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Your account and rankings are kept for as long as your account
            exists. To request deletion of your account and data, open an
            issue on{" "}
            <a
              href="https://github.com/RubenLazell/ff-draft-tool"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              the project&apos;s GitHub repository
            </a>{" "}
            from the email address on your account.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Children&apos;s privacy</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            This tool isn&apos;t directed at children and isn&apos;t knowingly
            used to collect data from anyone under 13.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Changes to this policy</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            If this policy changes, the &ldquo;last updated&rdquo; date above
            will change too. Continued use of the tool after an update means
            you accept the revised policy.
          </p>
        </section>
      </div>
    </div>
  );
}
