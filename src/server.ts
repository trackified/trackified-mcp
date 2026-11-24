import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TRACKING_STATUSES, type Trackified, type TrackifiedError, WEBHOOK_EVENT_TYPES } from "trackified";
import { z } from "zod";

export const VERSION = "0.2.0";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }] };
  } catch (err) {
    const e = err as Partial<TrackifiedError> | undefined;
    // Duck-typed (API errors carry an HTTP status): a caller's Trackified copy may differ from the bundled one.
    const text =
      typeof e?.status === "number"
        ? JSON.stringify({
            error: { status: e?.status, code: e?.code, message: e?.message, request_id: e?.requestId },
          })
        : `Error: ${e?.message ?? String(err)}`;
    return { content: [{ type: "text", text }], isError: true };
  }
}

const id = (what: string) => z.string().min(1).describe(`${what} ID`);
const limit = (max: number) =>
  z.number().int().min(1).max(max).optional().describe(`Page size, 1-${max} (default 50)`);
const offset = z.number().int().min(0).optional().describe("Number of items to skip (default 0)");
const trackingInput = {
  tracking_number: z.string().min(1).describe("The carrier's tracking number"),
  carrier: z
    .string()
    .optional()
    .describe(
      "Carrier ID such as usps, ups, fedex, dhl, or a free-text carrier name ('USPS Priority Mail', 'Royal Mail', 'dhl_express'); the API maps it to our ID and the response shows that ID (an unknown name fails with carrier_not_supported; check it with resolve_carrier). Leave out to auto-detect; if detection is unsure the call fails with carrier_not_detected (use detect_carrier, then pass it).",
    ),
  custom_id: z.string().optional().describe("Your own reference, such as an order number"),
  customer_email: z.email().optional().describe("Recipient email to associate with the tracking"),
};
const RO = { readOnlyHint: true, openWorldHint: true } as const;

export function createServer(client: Trackified): McpServer {
  const server = new McpServer({ name: "trackified", title: "Trackified", version: VERSION });

  server.registerTool(
    "create_tracking",
    {
      title: "Add a tracking",
      description:
        "Start tracking a parcel. carrier may be our ID or a free-text carrier name. Returns the tracking (id, status, events). Counts against the monthly quota (see get_usage). Safe to retry: an idempotency key is sent automatically.",
      inputSchema: trackingInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (args) => run(() => client.trackings.create(args)),
  );

  server.registerTool(
    "bulk_create_trackings",
    {
      title: "Add several trackings",
      description:
        "Add a batch of trackings in one call. Each row succeeds or fails on its own; the result lists ok/tracking/error per row. Max batch size depends on the plan.",
      inputSchema: { trackings: z.array(z.object(trackingInput)).min(1).describe("Trackings to add") },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ trackings }) => run(() => client.trackings.createBulk(trackings)),
  );

  server.registerTool(
    "get_tracking",
    {
      title: "Get a tracking",
      description:
        "Get one tracking with its full event history (newest first), status, estimated delivery and delivered_at. Use list_trackings with tracking_number to find the ID from a number.",
      inputSchema: { id: id("Tracking (trk_…)") },
      annotations: RO,
    },
    ({ id }) => run(() => client.trackings.get(id)),
  );

  server.registerTool(
    "list_trackings",
    {
      title: "List trackings",
      description:
        "List trackings, newest first, with optional filters. Returns { data, pagination: { limit, offset, total } }; page with offset.",
      inputSchema: {
        status: z.enum(TRACKING_STATUSES).optional().describe("Only trackings in this status"),
        carrier: z.string().optional().describe("Only this carrier ID"),
        custom_id: z.string().optional().describe("Only trackings with this custom_id"),
        tracking_number: z.string().optional().describe("Only this tracking number"),
        limit: limit(100),
        offset,
      },
      annotations: RO,
    },
    (args) => run(() => client.trackings.list(args)),
  );

  server.registerTool(
    "update_tracking",
    {
      title: "Update a tracking",
      description:
        "Change a tracking's carrier, custom_id or customer_email. Only the fields you pass change.",
      inputSchema: {
        id: id("Tracking (trk_…)"),
        carrier: z.string().optional().describe("Correct carrier ID"),
        custom_id: z.string().optional().describe("Your own reference"),
        customer_email: z.email().optional().describe("Recipient email"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ id, ...params }) => run(() => client.trackings.update(id, params)),
  );

  server.registerTool(
    "stop_tracking",
    {
      title: "Stop tracking",
      description: "Stop tracking a parcel and remove it. This cannot be undone.",
      inputSchema: { id: id("Tracking (trk_…)") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ id }) => run(() => client.trackings.delete(id)),
  );

  server.registerTool(
    "retrack",
    {
      title: "Refresh a tracking now",
      description:
        "Ask Trackified to check the carrier again within about a minute instead of waiting for the next scheduled check. Returns { queued, tracking }; call get_tracking later for new events.",
      inputSchema: { id: id("Tracking (trk_…)") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ id }) => run(() => client.trackings.retrack(id)),
  );

  server.registerTool(
    "detect_carrier",
    {
      title: "Detect the carrier",
      description:
        "Guess which carrier a tracking number belongs to. Returns candidates with confidence (0-1) and the reason, best first. Does not create a tracking.",
      inputSchema: { tracking_number: z.string().min(1).describe("The tracking number to inspect") },
      annotations: RO,
    },
    ({ tracking_number }) => run(() => client.carriers.detect(tracking_number)),
  );

  server.registerTool(
    "resolve_carrier",
    {
      title: "Resolve a carrier name",
      description:
        "Map a free-text carrier name or another provider's slug ('FedEx SmartPost', 'Correos de España', 'royal-mail') to the Trackified carrier ID. Returns { carrier, name, confidence, matched }, or { carrier: null } when the carrier is unknown or not supported.",
      inputSchema: { name: z.string().min(1).describe("Carrier name, service name or provider slug") },
      annotations: RO,
    },
    ({ name }) => run(async () => (await client.carriers.resolve(name)) ?? { carrier: null, confidence: 0 }),
  );

  server.registerTool(
    "list_carriers",
    {
      title: "List supported carriers",
      description: "List the carriers Trackified actively tracks (IDs to pass as carrier). Paged.",
      inputSchema: { limit: limit(100), offset },
      annotations: RO,
    },
    (args) => run(() => client.carriers.list(args)),
  );

  server.registerTool(
    "search_carriers",
    {
      title: "Search the carrier catalog",
      description:
        "Search the full carrier catalog (thousands of carriers) by name, with each carrier's support level: scraper/api (trackable) or unsupported.",
      inputSchema: {
        q: z.string().optional().describe("Name or ID to search for, e.g. 'dhl'"),
        support: z.enum(["scraper", "api", "unsupported"]).optional().describe("Only this support level"),
        limit: limit(200),
      },
      annotations: RO,
    },
    (args) => run(() => client.carriers.search(args)),
  );

  server.registerTool(
    "create_webhook",
    {
      title: "Add a webhook endpoint",
      description:
        "Register an HTTPS URL to receive signed tracking events. The response contains the signing secret ONCE; tell the user to store it. Leave event_types out to receive all events.",
      inputSchema: {
        url: z.url().describe("HTTPS endpoint that will receive POSTed events"),
        event_types: z.array(z.enum(WEBHOOK_EVENT_TYPES)).optional().describe("Events to send (default all)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (args) => run(() => client.webhooks.create(args)),
  );

  server.registerTool(
    "list_webhooks",
    {
      title: "List webhook endpoints",
      description: "List registered webhook endpoints with their event types and enabled state.",
      inputSchema: { limit: limit(100), offset },
      annotations: RO,
    },
    (args) => run(() => client.webhooks.list(args)),
  );

  server.registerTool(
    "update_webhook",
    {
      title: "Update a webhook endpoint",
      description:
        "Change a webhook's URL, event types or enabled state (a disabled webhook receives nothing). Pass at least one field; the others stay as they are. The signing secret does not change.",
      inputSchema: {
        id: id("Webhook (wh_…)"),
        url: z.url().optional().describe("New HTTPS endpoint"),
        event_types: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional().describe("Events to send"),
        enabled: z.boolean().optional().describe("false to pause deliveries, true to resume"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ id, url, event_types, enabled }) =>
      run(async () => {
        if (url === undefined && event_types === undefined && enabled === undefined) {
          throw new Error("Pass at least one of url, event_types or enabled.");
        }
        return client.webhooks.update(id, { url, eventTypes: event_types, enabled });
      }),
  );

  server.registerTool(
    "delete_webhook",
    {
      title: "Remove a webhook endpoint",
      description: "Delete a webhook endpoint; it stops receiving events. This cannot be undone.",
      inputSchema: { id: id("Webhook (wh_…)") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ id }) => run(() => client.webhooks.delete(id)),
  );

  server.registerTool(
    "list_webhook_deliveries",
    {
      title: "List webhook deliveries",
      description:
        "List recent webhook delivery attempts, newest first: event type, endpoint URL, HTTP status returned, attempts and error. Use it to debug a failing endpoint.",
      inputSchema: { limit: limit(100), offset },
      annotations: RO,
    },
    (args) => run(() => client.webhookDeliveries.list(args)),
  );

  server.registerTool(
    "get_usage",
    {
      title: "Get usage and limits",
      description:
        "This month's usage (UTC calendar month): plan, trackings used/limit/remaining, rate limit per minute, webhook deliveries and volume per carrier.",
      inputSchema: {},
      annotations: RO,
    },
    () => run(() => client.usage.get()),
  );

  server.registerTool(
    "health",
    {
      title: "Check API health",
      description:
        'Check whether the Trackified API is up. Returns { status: "ok" }; when it is degraded the call fails with status 503.',
      inputSchema: {},
      annotations: RO,
    },
    () => run(() => client.health()),
  );

  return server;
}
