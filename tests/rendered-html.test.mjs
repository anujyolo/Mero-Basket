import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function render(path = "/") {
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Padhai Yatra application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Padhai Yatra/);
  assert.match(html, /Learn anytime, anywhere/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("exposes the structured lesson adaptation endpoint", async () => {
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "Simplify", content: "Photosynthesis uses sunlight, water and carbon dioxide." }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mode, "DEMO_AI");
  assert.match(data.result.title, /Photosynthesis/i);
  assert.ok(data.result.steps.length >= 3);
});

test("adapts non-photosynthesis lessons without canned photosynthesis content", async () => {
  workerUrl.searchParams.set("non-photo-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "Simplify",
        content: "Fractions show parts of a whole. The denominator tells how many equal parts the whole is divided into. The numerator tells how many parts are being counted.",
      }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.result.title, /Fractions|Denominator|Numerator/i);
  assert.doesNotMatch(JSON.stringify(data.result), /Photosynthesis|chlorophyll|plant/i);
});

test("explains topic-only lessons with a useful starter explanation", async () => {
  workerUrl.searchParams.set("topic-only-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "Simplify", content: "Zoology" }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.result.title, "Zoology");
  assert.match(data.result.summary, /Zoology/i);
  assert.ok(data.result.summary.length > "Zoology".length);
});

test("creates topic-specific demand curve quiz questions", async () => {
  workerUrl.searchParams.set("demand-curve-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "Simplify", content: "A demand curve" }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.analysis.mainTopic, /Demand curve/i);
  assert.equal(data.analysis.quiz.length, 5);
  assert.match(JSON.stringify(data.analysis.quiz), /price|quantity demanded|law of demand/i);
  assert.doesNotMatch(JSON.stringify(data.analysis.quiz), /Only the longest word|The page number|main idea in the lesson/i);
});

test("fallback quiz stays on the requested topic", async () => {
  workerUrl.searchParams.set("topic-quiz-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "Simplify",
        content: "Migration means the movement of people from one place to another for work, education, safety, or better living conditions.",
      }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  const quiz = JSON.stringify(data.analysis.quiz);
  assert.equal(data.analysis.quiz.length, 5);
  assert.match(quiz, /Migration|movement|people|place/i);
  assert.doesNotMatch(quiz, /Only the longest word|The page number|Skip to a new topic|Memorize without checking|What is a useful study step/i);
});

test("uses the real topic when adapting a full paragraph", async () => {
  workerUrl.searchParams.set("paragraph-topic-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "Simplify",
        content: "The water cycle describes how water moves through evaporation, condensation, precipitation, and collection. Heat from the sun causes water in oceans, rivers, and lakes to evaporate into vapor.",
      }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.result.title, /water cycle/i);
  assert.match(data.result.summary, /evaporation|condensation|precipitation/i);
});

test("creates assignment steps from typed homework", async () => {
  workerUrl.searchParams.set("assignment-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/assignment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Solve questions 1 to 5 on algebra and show your work." }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.tasks.length >= 1);
  assert.match(data.detectedHomework, /algebra/i);
});

test("reports a ready AI mode without exposing credentials", async () => {
  workerUrl.searchParams.set("status-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/status"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ready, true);
  assert.match(data.mode, /^(LIVE_AI|DEMO_AI)$/);
  assert.equal("apiKey" in data, false);
});
