import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AI_INSIGHTS_ALLOWED_EMAIL } from "@/lib/aiInsights";

const InsightSchema = z.object({
  strength: z.string(),
  concern: z.string(),
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
    .select("full_name, position, team")
    .eq("id", playerId)
    .single();
  if (error || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  try {
    const response = await anthropic.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      // Thinking is left on (adaptive, the default) rather than disabled —
      // disabling it alongside tool use risks the model writing the search
      // call as plain visible text instead of an actual tool_use block.
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
      output_config: {
        effort: "low",
        format: zodOutputFormat(InsightSchema),
      },
      messages: [
        {
          role: "user",
          content: `Search the web to confirm ${player.full_name}'s current NFL team, depth chart situation, and any recent news (trades, injuries, signings) — your training data may be outdated on this. Then give a fantasy football strength and a fantasy football concern for ${player.full_name} (${player.position}${player.team ? `, ${player.team}` : ""}). Each must be a single short sentence, no more than 15 words, specific to this player and grounded in current information. No preamble, no hedging, no filler phrases.`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { strength: "No insight available.", concern: "No insight available." }
      );
    }

    return NextResponse.json(response.parsed_output);
  } catch {
    return NextResponse.json({
      strength: "Unable to generate insight right now.",
      concern: "Unable to generate insight right now.",
    });
  }
}
