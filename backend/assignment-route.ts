import { NextRequest, NextResponse } from "next/server";

type RequestBody = {
  text?: string;
  imageData?: string;
};

type AssignmentTask = {
  title: string;
  minutes: number;
};

function splitAssignment(text: string) {
  return text
    .split(/\n|,|;|\band\b/i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function buildLocalTasks(text: string, hasImage: boolean) {
  const parts = splitAssignment(text);
  if (parts.length) {
    return parts.map((part, index) => ({
      title: index === 0 ? `Start: ${part}` : part,
      minutes: part.length > 80 ? 15 : 10,
    }));
  }
  if (hasImage) {
    return [
      { title: "Open the attached homework photo", minutes: 2 },
      { title: "Read the question carefully", minutes: 5 },
      { title: "Write the important numbers or instructions", minutes: 5 },
      { title: "Solve one part at a time", minutes: 15 },
      { title: "Check the final answer", minutes: 5 },
    ];
  }
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const text = body.text?.trim().slice(0, 3000) || "";
    const imageData = body.imageData?.startsWith("data:image/") ? body.imageData : "";
    if (!text && !imageData) return NextResponse.json({ error: "Assignment text or photo is required." }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && imageData) {
      const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.6",
          max_output_tokens: 650,
          input: [
            {
              role: "developer",
              content: [{
                type: "input_text",
                text: "Read the homework photo and optional typed instructions. Return concise JSON only: {\"detectedHomework\":\"short description\",\"tasks\":[{\"title\":\"short step\",\"minutes\":10}],\"answer\":\"short answer or next step\"}. If the image is unclear, say what to retake.",
              }],
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: text || "Read this homework photo and help me answer it step by step." },
                { type: "input_image", image_url: imageData },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "assignment_help",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["detectedHomework", "tasks", "answer"],
                properties: {
                  detectedHomework: { type: "string" },
                  tasks: {
                    type: "array",
                    minItems: 3,
                    maxItems: 8,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["title", "minutes"],
                      properties: {
                        title: { type: "string" },
                        minutes: { type: "integer", minimum: 1, maximum: 30 },
                      },
                    },
                  },
                  answer: { type: "string" },
                },
              },
            },
          },
        }),
      });

      if (openAIResponse.ok) {
        const openAIData = await openAIResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
        const outputText = openAIData.output_text || openAIData.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
        if (outputText) return NextResponse.json({ mode: "LIVE_AI", ...JSON.parse(outputText) });
      }
    }

    const tasks: AssignmentTask[] = buildLocalTasks(text, Boolean(imageData));
    return NextResponse.json({
      mode: "DEMO_AI",
      detectedHomework: text || "Homework photo attached",
      tasks,
      answer: imageData && !apiKey
        ? "Photo is attached. Live AI can read the image when an API key is configured; demo mode created a safe step-by-step plan without spending credits."
        : "Follow the steps one by one, then use the final step to check your answer.",
    });
  } catch {
    return NextResponse.json({ error: "Unable to process this assignment." }, { status: 500 });
  }
}
