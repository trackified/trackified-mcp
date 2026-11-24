# Changelog

## 0.2.0

- Built on `trackified@^0.2.0`.
- New tools: `resolve_carrier` (T-5), `update_webhook` with url / event types / enabled (T-11), `health` (T-4).
- `create_tracking` and `bulk_create_trackings` accept free-text carrier names (T-5).
- Rotating a webhook secret is deliberately not a tool: its response contains the new secret.

## 0.1.0

- First release: stdio MCP server with 15 tools covering trackings, carriers, webhooks,
  webhook deliveries and usage, built on `trackified@^0.1.0`. Registry manifest `server.json`
  (`io.github.trackified/trackified-mcp`).
