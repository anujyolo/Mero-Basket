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

test("renders the AdaptEd AI application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /AdaptEd AI/);
  assert.match(html, /Learning that adapts to you|One lesson/);
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
