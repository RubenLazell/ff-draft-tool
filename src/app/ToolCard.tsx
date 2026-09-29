import Link from "next/link";
import type { SiteTool } from "@/lib/siteNav";
import { ToolIcon } from "./ToolIcon";

// The whole card is one link (bigger tap target than a text link at the
// bottom), with the title as the link's accessible name via aria-labelledby
// so screen readers don't read the full description as the link text.
export function ToolCard({
  tool,
  href,
  cta,
  note,
}: {
  tool: SiteTool;
  href: string;
  cta: string;
  note?: string;
}) {
  const titleId = `tool-${tool.key}-title`;
  return (
    <Link
      href={href}
      aria-labelledby={titleId}
      aria-describedby={`tool-${tool.key}-desc`}
      className="group flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-emerald-400/50"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <ToolIcon tool={tool.key} />
        </span>
        <h3 id={titleId} className="font-semibold text-black dark:text-zinc-50">
          {tool.label}
        </h3>
      </div>
      <p id={`tool-${tool.key}-desc`} className="flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {tool.description}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-sm font-medium text-emerald-700 group-hover:underline dark:text-emerald-400">
          {cta} <span aria-hidden="true">→</span>
        </span>
        {note && (
          <span className="whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {note}
          </span>
        )}
      </div>
    </Link>
  );
}
