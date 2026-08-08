import { NextResponse } from "next/server";

// Server-only health endpoint used to show whether live or demo AI is active.

export async function GET() {
  return NextResponse.json({
    mode: process.env.OPENAI_API_KEY ? "LIVE_AI" : "DEMO_AI",
    model: process.env.OPENAI_API_KEY ? process.env.OPENAI_MODEL || "gpt-5.6" : null,
    ready: true,
  });
}
