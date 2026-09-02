import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AI_INSIGHTS_ALLOWED_EMAIL } from "@/lib/aiInsights";

const OutlookSchema = z.object({
  summary: z.string(),
  expectedReturn: z.string(),
});

const anthropic = new Anthropic();

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.email !== AI_INSIGHTS_ALLOWED_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  const { data: player, error } = await supabase
    .from("players")
    .select("full_name, position, team, injury_status, injury_body_part")
    .eq("id", playerId)
    .single();
  if (error || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (!player.injury_status) {
    return NextResponse.json({ error: "Player has no injury designation" }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      output_config: {
        effort: "low",
        format: zodOutputFormat(OutlookSchema),
      },
      messages: [
        {
          role: "user",
          content: `Search the web for the latest news on ${player.full_name}'s (${player.position}${player.team ? `, ${player.team}` : ""}) current injury (listed status: ${player.injury_status}${player.injury_body_part ? `, ${player.injury_body_part}` : ""}). Find the most recent reporting on severity and recovery timeline. Give: (1) "summary" — one sentence, under 25 words, on what the injury is and current severity/consensus, including nuance or caveats here; (2) "expectedReturn" — a short label only, 6 words max (e.g. "Week 12", "2-3 weeks", "Week-to-week", "Unclear") — no explanation or caveats in this field, those belong in summary. No hedging filler, no preamble.`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json({
        summary: "No outlook available.",
        expectedReturn: "Unknown",
      });
    }

    return NextResponse.json(response.parsed_output);
  } catch {
    return NextResponse.json({
      summary: "Unable to research this injury right now.",
      expectedReturn: "Unknown",
    });
  }
}
