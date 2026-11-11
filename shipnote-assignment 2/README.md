# Shipnote

Shipnote is a small customer-facing changelog business. A founder asks Claude to turn product context into a release note; Shipnote stores the result, lets a human edit it, and hosts the approved update at a stable public URL.

There are no model calls, AI SDKs, AI API keys, prompt endpoints, or background AI jobs in this app. The only AI interaction happens in the customer's own Claude chat, which calls Shipnote through MCP.

## Run locally

Use Node 20 or later.

```bash
pnpm install
pnpm start
```

Open `http://localhost:3000`. The MCP endpoint is `http://localhost:3000/mcp`.

## Connect Claude

1. Deploy the app and set `APP_URL` to its public URL.
2. In Claude, open **Settings → Connectors → Add custom connector**.
3. Enter `https://your-domain.example/mcp`.
4. Ask Claude: `Create a Shipnote release for v2.4. It adds SSO and fixes a slow dashboard. Make it a draft.`
5. Open Shipnote, edit the saved draft, and set its visibility to Published.

The remote MCP endpoint uses the current Streamable HTTP transport in stateless JSON-response mode. It exposes five narrowly scoped tools: `create_release`, `update_release`, `publish_release`, `list_releases`, and `get_release`.

## Deploy for the assignment

This is a standard Node web service. On Render, Railway, or Fly:

- Build command: `pnpm install`
- Start command: `pnpm start`
- Environment variable: `APP_URL=https://your-live-domain`
- Add a small persistent disk and set `DATA_FILE` to a path on that disk, such as `/data/shipnote.json`.

The persistent disk matters because Shipnote's job is to keep Claude's work live after the chat ends. For a short demo without a disk, the release data still works until the service restarts.

## Demo flow

1. Open the Claude connector and type a request that includes the release facts.
2. Claude calls `create_release`; the tool returns the Shipnote edit URL.
3. Open Shipnote and change the headline, customer takeaway, or release details.
4. Change visibility to Published, save, and use Preview to show the public release page.
