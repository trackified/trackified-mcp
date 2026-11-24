#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Trackified } from "trackified";
import { createServer } from "./server.js";

if (!process.env.TRACKIFIED_API_KEY) {
  // stdout is the MCP channel; diagnostics go to stderr.
  console.error("trackified-mcp: set TRACKIFIED_API_KEY (create a key at https://trackified.net).");
  process.exit(1);
}

const server = createServer(new Trackified());
await server.connect(new StdioServerTransport());
