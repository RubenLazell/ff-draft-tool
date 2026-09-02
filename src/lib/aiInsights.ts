// Plain constants, not in src/app/actions.ts — a "use server" module may
// only export async functions, so shared non-function values live here.
export const AI_INSIGHTS_COOKIE = "ai_insights_enabled";

// AI insights call a paid API per click, so — beyond just requiring login —
// only this account can turn them on at all. Checked wherever the toggle is
// rendered/set, and again in the API routes that actually spend money.
export const AI_INSIGHTS_ALLOWED_EMAIL = "rubenlazell7@aol.com";
