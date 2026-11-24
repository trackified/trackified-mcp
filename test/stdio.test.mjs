import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("the bin speaks MCP over stdio", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../dist/index.js", import.meta.url).pathname],
    env: { TRACKIFIED_API_KEY: "tk_test_dummy", PATH: process.env.PATH ?? "" },
  });
  const client = new Client({ name: "test", version: "0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "get_tracking"));
  assert.equal(client.getServerVersion().name, "trackified");
  await client.close();
});
