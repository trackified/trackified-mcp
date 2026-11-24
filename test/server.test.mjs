import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Trackified } from "trackified";
import { createServer, VERSION } from "../dist/server.js";

async function connect(responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new URL(url), ...init });
    const { status = 200, body } = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const server = createServer(new Trackified({ apiKey: "tk_test_x", fetch, maxRetries: 0 }));
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
}

test("versions agree across package.json, server.json and the server", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const reg = JSON.parse(readFileSync(new URL("../server.json", import.meta.url)));
  assert.equal(VERSION, pkg.version);
  assert.equal(reg.version, pkg.version);
  assert.equal(reg.packages[0].version, pkg.version);
  assert.equal(reg.name, pkg.mcpName);
});

test("lists every tool with schemas and hints", async () => {
  const { client } = await connect([]);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "bulk_create_trackings",
    "create_tracking",
    "create_webhook",
    "delete_webhook",
    "detect_carrier",
    "get_tracking",
    "get_usage",
    "list_carriers",
    "list_trackings",
    "list_webhook_deliveries",
    "list_webhooks",
    "retrack",
    "search_carriers",
    "stop_tracking",
    "update_tracking",
  ]);
  for (const t of tools) {
    assert.ok(t.description.length > 20, t.name);
    assert.equal(t.inputSchema.type, "object", t.name);
  }
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.equal(byName.get_tracking.annotations.readOnlyHint, true);
  assert.equal(byName.stop_tracking.annotations.destructiveHint, true);
  assert.deepEqual(byName.create_tracking.inputSchema.required, ["tracking_number"]);
  assert.ok(byName.list_trackings.inputSchema.properties.status.enum.includes("delivered"));
});

test("create_tracking calls the API and returns JSON", async () => {
  const { client, calls } = await connect([{ status: 201, body: { id: "trk_1", status: "in_transit" } }]);
  const res = await client.callTool({
    name: "create_tracking",
    arguments: { tracking_number: "9434650110837017316201", carrier: "usps" },
  });
  assert.equal(res.isError, undefined);
  assert.equal(JSON.parse(res.content[0].text).id, "trk_1");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url.pathname, "/v1/trackings");
  assert.ok(calls[0].headers["idempotency-key"]);
});

test("tools map to the right endpoints", async () => {
  const cases = [
    ["get_tracking", { id: "trk_1" }, "GET", "/v1/trackings/trk_1"],
    ["list_trackings", { status: "delivered", limit: 5 }, "GET", "/v1/trackings?status=delivered&limit=5"],
    ["update_tracking", { id: "trk_1", custom_id: "o1" }, "PUT", "/v1/trackings/trk_1"],
    ["stop_tracking", { id: "trk_1" }, "DELETE", "/v1/trackings/trk_1"],
    ["retrack", { id: "trk_1" }, "POST", "/v1/trackings/trk_1/retrack"],
    ["detect_carrier", { tracking_number: "1Z9" }, "GET", "/v1/carriers/detect?number=1Z9"],
    ["list_carriers", {}, "GET", "/v1/carriers"],
    ["search_carriers", { q: "dhl" }, "GET", "/v1/carriers/catalog?q=dhl"],
    ["create_webhook", { url: "https://example.com/h" }, "POST", "/v1/webhooks"],
    ["list_webhooks", {}, "GET", "/v1/webhooks"],
    ["delete_webhook", { id: "wh_1" }, "DELETE", "/v1/webhooks/wh_1"],
    ["list_webhook_deliveries", { limit: 3 }, "GET", "/v1/webhook-deliveries?limit=3"],
    ["get_usage", {}, "GET", "/v1/account/usage"],
    ["bulk_create_trackings", { trackings: [{ tracking_number: "1" }] }, "POST", "/v1/trackings/bulk"],
  ];
  for (const [name, args, method, path] of cases) {
    const { client, calls } = await connect([{ body: {} }]);
    const res = await client.callTool({ name, arguments: args });
    assert.equal(res.isError, undefined, name);
    assert.equal(calls[0].method, method, name);
    assert.equal(calls[0].url.pathname + calls[0].url.search, path, name);
  }
  const { client, calls } = await connect([{ body: {} }]);
  await client.callTool({ name: "update_tracking", arguments: { id: "trk_1", custom_id: "o1" } });
  assert.deepEqual(JSON.parse(calls[0].body), { custom_id: "o1" });
});

test("API errors come back as tool errors", async () => {
  const { client } = await connect([
    { status: 404, body: { error: { code: "not_found", message: "no such tracking", request_id: "r1" } } },
  ]);
  const res = await client.callTool({ name: "get_tracking", arguments: { id: "trk_x" } });
  assert.equal(res.isError, true);
  assert.deepEqual(JSON.parse(res.content[0].text).error, {
    status: 404,
    code: "not_found",
    message: "no such tracking",
    request_id: "r1",
  });
});

test("invalid arguments are rejected before any request", async () => {
  const { client, calls } = await connect([]);
  const res = await client.callTool({ name: "list_trackings", arguments: { status: "lost" } });
  assert.equal(res.isError, true);
  assert.equal(calls.length, 0);
});
