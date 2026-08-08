import { NextRequest, NextResponse } from "next/server";

// Server-only lesson adaptation endpoint. API credentials never reach the browser.

type RequestBody = {
  action?: string;
  content?: string;
  preferences?: { explanation?: string; tools?: string[]; interface?: string };
};

type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

type LessonAnalysis = {
  mainTopic: string;
  summary: string;
  simpleExplanation: string;
  keyPoints: string[];
  examples: string[];
  learningSteps: string[];
  quiz: QuizQuestion[];
};

type LessonResult = {
  title: string;
  summary: string;
  needs: string[];
  steps: string[];
  result: string;
  example: string;
};

const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "being",
  "between",
  "but",
  "can",
  "chapter",
  "could",
  "describe",
  "describes",
  "does",
  "doing",
  "equal",
  "for",
  "from",
  "have",
  "into",
  "lesson",
  "many",
  "notes",
  "show",
  "shows",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "tells",
  "using",
  "when",
  "where",
  "which",
  "while",
  "with",
  "you",
  "your",
]);

function sentenceCase(text: string) {
  const trimmed = text.trim();
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : "";
}

function splitSentences(content: string) {
  const sentences = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length ? sentences : [content.replace(/\s+/g, " ").trim()];
}

function truncateText(text: string, max = 180) {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function getKeywords(content: string) {
  const counts = new Map<string, { count: number; first: number }>();
  const words = content.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
  words.forEach((word, index) => {
    const clean = word.replace(/^-|-$/g, "");
    if (clean.length < 4 || stopWords.has(clean)) return;
    const current = counts.get(clean);
    counts.set(clean, { count: (current?.count || 0) + 1, first: current?.first ?? index });
  });
  return [...counts.entries()]
    .sort((a, b) => {
      const scoreA = a[1].count + (a[0].length >= 8 ? 5 : 0);
      const scoreB = b[1].count + (b[0].length >= 8 ? 5 : 0);
      return scoreB - scoreA || a[1].first - b[1].first;
    })
    .slice(0, 4)
    .sort((a, b) => a[1].first - b[1].first)
    .map(([word]) => sentenceCase(word));
}

function getTopic(content: string) {
  const firstSentence = splitSentences(content)[0] || content;
  const phraseMatch = firstSentence.match(/^(?:the\s+)?([A-Za-z][A-Za-z\s-]{2,60}?)\s+(?:is|are|was|were|means|refers to|describes|explains|happens|occurs|uses|contains|includes|helps)\b/i);
  if (phraseMatch?.[1]) {
    const rawPhrase = sentenceCase(phraseMatch[1].trim());
    return /^the\s/i.test(firstSentence.trim()) ? sentenceCase(`The ${rawPhrase}`) : rawPhrase;
  }
  const titleMatch = content.match(/^#?\s*([A-Za-z][A-Za-z0-9 ,:&-]{3,70})/);
  const keywords = getKeywords(content);
  const raw = titleMatch?.[1]?.replace(/[.!?].*$/, "").trim();
  if (raw && raw.split(/\s+/).length <= 8 && !/\b(is|are|show|shows|means|tells|uses|becomes)\b/i.test(raw) && !/^(paste|read|answer|explain|simplify)\b/i.test(raw)) return sentenceCase(raw);
  return keywords.length ? keywords.slice(0, 2).join(" and ") : "Your lesson";
}

function buildResultFromAnalysis(analysis: LessonAnalysis, action: string) {
  const loweredAction = action.toLowerCase();
  const wantsSimple = /simpl/.test(loweredAction);
  const wantsExample = /example|analogy/.test(loweredAction);
  const wantsDeep = /deep|normal|differently/.test(loweredAction);
  const wantsSteps = /step|break/.test(loweredAction);
  const summary = wantsSimple ? analysis.simpleExplanation : wantsDeep ? analysis.summary : analysis.simpleExplanation;
  const steps = wantsSteps ? analysis.learningSteps : analysis.learningSteps.slice(0, Math.min(4, analysis.learningSteps.length));
  const example = wantsExample
    ? analysis.examples[0] || `Think about ${analysis.mainTopic} using one real-world example.`
    : analysis.examples[1] || analysis.examples[0] || `Use a simple example to explain ${analysis.mainTopic}.`;
  return {
    title: analysis.mainTopic,
    summary,
    needs: analysis.keyPoints.slice(0, 6),
    steps,
    result: `You now have a clearer way to study ${analysis.mainTopic}.`,
    example,
  } satisfies LessonResult;
}

function buildLocalAnalysis(content: string) {
  const sentences = splitSentences(content);
  const main = sentences[0] || content;
  const detail = sentences.find((sentence) => sentence !== main && sentence.length > 35) || sentences[1] || main;
  const shortMain = truncateText(main, 220);
  const shortDetail = truncateText(detail, 190);
  const topic = getTopic(content);
  const keywords = getKeywords(content);
  const keyPoints = (keywords.length ? keywords : ["Main idea", "Key details", "Example"]).map((item) => item.replace(/\b\w/g, (letter) => letter.toUpperCase())).slice(0, 6);
  const isTopicOnly = sentences.length === 1 && !/[.!?]/.test(content) && content.trim().split(/\s+/).length <= 4;
  const shortOverview = sentences.slice(0, 3).map((sentence) => truncateText(sentence, 120));

  if (isTopicOnly) {
    return {
      mainTopic: topic,
      summary: `${topic} is a topic you can understand by learning what it is, its important parts, and a few clear examples.`,
      simpleExplanation: `${topic} is the main thing you are studying right now. Adapt can help explain the meaning, key ideas, and how to remember it.`,
      keyPoints: ["Definition", "Important parts", "Example", "How it works"],
      examples: [
        `Start by asking: what is ${topic}, what are its parts, and where do we see it in real life?`,
        `A good way to learn ${topic} is to define it first, then study one example.`,
      ],
      learningSteps: [
        `Write one short definition of ${topic}.`,
        `List the most important parts or ideas connected to ${topic}.`,
        `Find one real example of ${topic}.`,
        `Explain ${topic} in your own words.`,
      ],
      quiz: [
        {
          question: `What is the best first step when learning ${topic}?`,
          options: ["Define the topic", "Skip to a new topic", "Memorize without understanding"],
          answer: 0,
          explanation: "Starting with a simple definition gives you a base for the rest.",
        },
        {
          question: `What helps you understand ${topic} better?`,
          options: ["An example", "Random facts", "Only the title"],
          answer: 0,
          explanation: "Examples make an abstract topic easier to remember.",
        },
        {
          question: "How can you check understanding?",
          options: ["Explain it in your own words", "Avoid questions", "Read the title again"],
          answer: 0,
          explanation: "If you can explain it clearly, you usually understand it better.",
        },
      ],
    } satisfies LessonAnalysis;
  }

  return {
    mainTopic: topic,
    summary: shortOverview.length > 1
      ? `${topic} is mainly about this idea: ${shortOverview[0]} ${shortOverview[1]}`
      : `${topic} is mainly about this idea: ${shortMain}`,
    simpleExplanation: `In simple words, ${shortMain}`,
    keyPoints,
    examples: [
      `A good check is to explain ${topic} to a friend in two or three short sentences.`,
      `Connect ${topic} to one real-life example so the main idea is easier to remember.`,
    ],
    learningSteps: [
      `Start with the main idea: ${shortMain}`,
      `Circle or write down these key words: ${keyPoints.join(", ")}.`,
      `Add this important detail: ${shortDetail}`,
      "Cover the notes and explain the topic back in your own words.",
    ],
    quiz: [
      {
        question: `What is the main idea of ${topic}?`,
        options: ["The main idea in the lesson", "Only the longest word", "The page number"],
        answer: 0,
        explanation: "Start with the core idea before memorizing details.",
      },
      {
        question: "Which detail should you review next?",
        options: [keyPoints[0] || "Key point", "An unrelated fact", "Only the title"],
        answer: 0,
        explanation: "Important key points help rebuild understanding quickly.",
      },
      {
        question: "What is a useful study step?",
        options: ["Explain it in your own words", "Skip to a new topic", "Memorize without checking"],
        answer: 0,
        explanation: "Saying it in your own words shows whether you truly understand it.",
      },
    ],
  } satisfies LessonAnalysis;
}

function getPhotosynthesisAnalysis() {
  return {
    mainTopic: "Photosynthesis",
    summary: "Photosynthesis is the process plants use to capture light energy and store it as chemical energy in glucose. It mainly happens in chloroplasts, where chlorophyll absorbs light.",
    simpleExplanation: "Plants use sunlight, water, and carbon dioxide to make food and release oxygen.",
    keyPoints: ["Sunlight", "Water", "Carbon dioxide", "Chlorophyll", "Glucose", "Oxygen"],
    examples: [
      "Think of a plant as a small solar-powered food factory that uses light as power.",
      "Leaves act like tiny solar panels that help the plant make its own food.",
    ],
    learningSteps: [
      "Leaves collect sunlight.",
      "Roots absorb water from the soil.",
      "Leaves take in carbon dioxide from the air.",
      "Chlorophyll helps use light energy to make glucose.",
      "The plant stores food and releases oxygen.",
    ],
    quiz: [
      {
        question: "What is the main purpose of photosynthesis?",
        options: ["To make food for the plant", "To absorb oxygen", "To cool the leaves"],
        answer: 0,
        explanation: "Plants use light energy to make glucose, which stores food energy.",
      },
      {
        question: "Which gas do leaves take in?",
        options: ["Oxygen", "Carbon dioxide", "Hydrogen"],
        answer: 1,
        explanation: "Leaves take in carbon dioxide through tiny openings called stomata.",
      },
      {
        question: "What captures light energy in a plant?",
        options: ["Roots", "Chlorophyll", "Glucose"],
        answer: 1,
        explanation: "Chlorophyll is the green pigment that captures light energy.",
      },
    ],
  } satisfies LessonAnalysis;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const content = body.content?.trim().slice(0, 6000);
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
  "mainTopic": "short topic title",
  "summary": "2-4 concise sentences for normal explanation",
  "simpleExplanation": "1-3 short sentences for a simpler explanation",
  "keyPoints": ["3 to 6 concise key points"],
  "examples": ["1 to 2 accurate examples or analogies"],
  "learningSteps": ["3 to 5 concise study steps"],
  "quiz": [
    {
      "question": "one question",
      "options": ["three short options"],
      "answer": 0,
      "explanation": "one short explanation"
    }
  ]
}`;

      const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.6",
          max_output_tokens: 650,
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
                required: ["mainTopic", "summary", "simpleExplanation", "keyPoints", "examples", "learningSteps", "quiz"],
                properties: {
                  mainTopic: { type: "string" },
                  summary: { type: "string" },
                  simpleExplanation: { type: "string" },
                  keyPoints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
                  examples: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
                  learningSteps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                  quiz: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["question", "options", "answer", "explanation"],
                      properties: {
                        question: { type: "string" },
                        options: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
                        answer: { type: "integer", minimum: 0, maximum: 2 },
                        explanation: { type: "string" },
                      },
                    },
                  },
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
          const analysis = JSON.parse(outputText) as LessonAnalysis;
          return NextResponse.json({ mode: "LIVE_AI", preferencesApplied: body.preferences, analysis, result: buildResultFromAnalysis(analysis, action) });
        }
      }
    }

    const isPhotosynthesis = /photosynthesis|chlorophyll/i.test(content);
    if (isPhotosynthesis) {
      const analysis = getPhotosynthesisAnalysis();
      return NextResponse.json({
        mode: "DEMO_AI",
        preferencesApplied: body.preferences,
        analysis,
        result: buildResultFromAnalysis(analysis, action),
      });
    }

    const analysis = buildLocalAnalysis(content);
    return NextResponse.json({
      mode: "DEMO_AI",
      preferencesApplied: body.preferences,
      analysis,
      result: buildResultFromAnalysis(analysis, action),
    });
  } catch {
    return NextResponse.json({ error: "Unable to process this lesson." }, { status: 500 });
  }
}
