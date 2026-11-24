# trackified-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the [Trackified](https://trackified.net)
parcel-tracking API. It lets Claude, Cursor and other MCP clients add trackings, read their events,
detect carriers and manage webhooks. Built on the official [`trackified`](https://github.com/trackified/trackified-node) SDK.

Runs locally over stdio. Needs Node.js 18+ and a Trackified API key (`tk_live_…` or `tk_test_…`).

## Setup

### Claude Code

```sh
claude mcp add trackified -e TRACKIFIED_API_KEY=tk_live_... -- npx -y trackified-mcp
```

### Claude Desktop

Settings → Developer → Edit Config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "trackified": {
      "command": "npx",
      "args": ["-y", "trackified-mcp"],
      "env": { "TRACKIFIED_API_KEY": "tk_live_..." }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "trackified": {
      "command": "npx",
      "args": ["-y", "trackified-mcp"],
      "env": { "TRACKIFIED_API_KEY": "tk_live_..." }
    }
  }
}
```

Other clients: run `npx -y trackified-mcp` with `TRACKIFIED_API_KEY` in the environment.
`TRACKIFIED_BASE_URL` overrides the API URL (default `https://api.trackified.net`).

## Tools

| Tool | What it does | Read-only |
| --- | --- | --- |
| `create_tracking` | Start tracking a parcel (carrier auto-detected if omitted) | |
| `bulk_create_trackings` | Add a batch of trackings, per-row results | |
| `get_tracking` | One tracking with its full event history | yes |
| `list_trackings` | List/filter trackings by status, carrier, custom_id, number | yes |
| `update_tracking` | Change carrier, custom_id or customer_email | |
| `stop_tracking` | Stop tracking and remove a parcel (destructive) | |
| `retrack` | Ask for a fresh carrier check within a minute | |
| `detect_carrier` | Guess the carrier for a tracking number | yes |
| `list_carriers` | Carriers Trackified tracks | yes |
| `search_carriers` | Search the full carrier catalog by name | yes |
| `create_webhook` | Register a webhook endpoint (returns its secret once) | |
| `list_webhooks` | List webhook endpoints | yes |
| `delete_webhook` | Remove a webhook endpoint (destructive) | |
| `list_webhook_deliveries` | Recent delivery attempts, for debugging endpoints | yes |
| `get_usage` | This month's quota, usage and rate limit | yes |

API key management is deliberately not exposed as tools. Use the dashboard or the SDK.

Try asking: *"Track 9434650110837017316201 with USPS for order 1001"*, *"Which of my parcels have an exception?"*,
*"Why are my webhooks failing?"*, *"How much of my quota is left?"*

## Development

```sh
npm install
npm test        # builds and runs the tests: in-memory MCP client + mocked fetch, plus a stdio smoke test
npm run lint && npm run typecheck
```

Runtime dependencies: `trackified`, `@modelcontextprotocol/sdk` and `zod`.

## License

MIT
