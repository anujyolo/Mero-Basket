import { NextRequest, NextResponse } from "next/server";

// Server-only lesson adaptation endpoint. API credentials never reach the browser.

type RequestBody = {
  action?: string;
  content?: string;
  preferences?: { explanation?: string; tools?: string[]; interface?: string };
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const content = body.content?.trim();
    if (!content) return NextResponse.json({ error: "Learning material is required." }, { status: 400 });

    const action = body.action || "Simplify";
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      const preferenceText = [
        `Explanation depth: ${body.preferences?.explanation || "Normal"}`,
        `Helpful tools: ${(body.preferences?.tools || []).join(", ") || "Examples and key points"}`,
        `Interface preference: ${body.preferences?.interface || "Normal"}`,
      ].join("\n");
      const developerPrompt = `You are Adapt, a precise and encouraging educational assistant for students of different ages and learning preferences.

Adapt the supplied educational material without removing facts or changing its educational meaning. Use age-neutral, respectful language. Never diagnose autism, ADHD, dyslexia, a learning disability, intelligence, or any medical or psychological condition. Never infer a condition from preferences, answers, or scores. Do not use guilt, shame, or infantilizing language.

Student preferences:
${preferenceText}

Requested action: ${action}

Return only one JSON object with this exact shape:
{
  "title": "short topic title",
  "summary": "clear core explanation",
  "needs": ["up to four short key ingredients or facts"],
  "steps": ["three to six accurate, ordered learning steps"],
  "result": "one-sentence outcome or key takeaway",
  "example": "one accurate, concrete example or analogy"
}`;

      const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.6",
          input: [
            { role: "developer", content: [{ type: "input_text", text: developerPrompt }] },
            { role: "user", content: [{ type: "input_text", text: content }] },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "adapted_lesson",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["title", "summary", "needs", "steps", "result", "example"],
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  needs: { type: "array", items: { type: "string" }, maxItems: 4 },
                  steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
                  result: { type: "string" },
                  example: { type: "string" },
                },
              },
            },
          },
        }),
      });

      if (openAIResponse.ok) {
        const openAIData = await openAIResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
        const outputText = openAIData.output_text || openAIData.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
        if (outputText) {
          const result = JSON.parse(outputText);
          return NextResponse.json({ mode: "LIVE_AI", preferencesApplied: body.preferences, result });
        }
      }
    }

    const isPhotosynthesis = /photosynthesis|plant|chlorophyll/i.test(content);
    const isDeep = /deep|normal/i.test(action);
    const isExample = /example|analogy/i.test(action);
    const isSteps = /step/i.test(action);

    if (isPhotosynthesis) {
      return NextResponse.json({
        mode: "DEMO_AI",
        preferencesApplied: body.preferences,
        result: {
          title: isDeep ? "Photosynthesis: how light becomes stored energy" : "Photosynthesis",
          summary: isDeep
            ? "Photosynthesis is the process plants use to capture light energy and store it as chemical energy in glucose. It occurs mainly in chloroplasts, where chlorophyll absorbs light."
            : "Plants use sunlight to make their own food.",
          needs: ["☀ Sunlight", "💧 Water", "◌ Carbon dioxide"],
          steps: isExample
            ? ["A plant collects sunlight through its leaves.", "Its roots bring water up from the soil.", "The leaves take carbon dioxide from the air.", "The plant uses these materials to make glucose and releases oxygen."]
            : isSteps || !isDeep
              ? ["The leaves receive sunlight.", "The roots absorb water.", "The leaves take in carbon dioxide.", "Light energy helps turn these materials into glucose."]
              : ["Chlorophyll absorbs light energy inside chloroplasts.", "Light-dependent reactions create energy-carrying molecules.", "The Calvin cycle uses that energy to build sugars from carbon dioxide."],
          result: "The plant stores energy as glucose and releases oxygen into the air.",
          example: isExample
            ? "Imagine a plant as a tiny solar-powered kitchen: sunlight supplies the power, water and carbon dioxide are the ingredients, and glucose is the food it prepares."
            : "A plant works like a small solar-powered food factory.",
        },
      });
    }

    const clean = content.replace(/\s+/g, " ");
    const short = clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
    return NextResponse.json({
      mode: "DEMO_AI",
      preferencesApplied: body.preferences,
      result: {
        title: "Your adapted lesson",
        summary: action.toLowerCase().includes("simpl") ? `In simple terms: ${short}` : short,
        needs: ["Main idea", "Important details", "A useful example"],
        steps: ["Read the main idea once.", "Identify the key words.", "Connect the idea to something you already know."],
        result: "You now have a shorter structure to review before returning to the original material.",
        example: `Think of the topic as a system: each important detail has a role in explaining the main idea.`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to process this lesson." }, { status: 500 });
  }
}
