# Preview

Open a running dev server inside the WebUI through an authenticated gateway.

The Preview panel lists the loopback ports that are currently listening, then proxies the selected one through a dedicated gateway origin. This lets you view a Vite, Next.js, or other dev server without exposing its raw port or weakening the Manager's own origin.

## Port List

Open **Preview** from the desktop sidebar tool list or the **More** drawer. The panel lists every listening loopback port on the host, with its port number, process command, and working directory. Ports inside the selected repository or workspace directory are badged **this repo** and sorted first.

The list excludes reserved ports — the Manager port (`PORT`, default 5003), the OpenCode server port (default 5551) and the preview gateway port itself — and only includes ports at or above 1024.

Selecting a port creates a preview session and renders the target in a sandboxed iframe. Selecting a different port starts a new session for it.

When preview is disabled the panel shows **Preview is disabled (PREVIEW_PORT=0)**.

If the requested port is not listening yet, the panel shows **Waiting for port N…** and refetches the list every 2 seconds for up to 60 seconds, then shows an error with a **Retry** button.

## Gateway

The preview gateway listens on `PREVIEW_PORT` (default 5004) on its own origin. It is a separate origin from the Manager on purpose: preview content is untrusted and must not share the Manager origin. Setting `PREVIEW_PORT=0` disables the gateway.

Access requires an authenticated preview session:

1. The Manager API mints a **single-use start token** for a listening port.
2. The browser navigates to `/__ocm_preview/start?token=…&path=…` on the gateway origin.
3. The gateway consumes the token (it expires after 60 seconds and cannot be reused) and sets an `ocm_preview` session cookie.

Requests then carry the cookie. Manager auth cookies are stripped before proxying, because host-scoped cookies are shared across ports; the preview target never sees them.

The gateway also proxies **WebSocket upgrades** on the same origin, so dev-server HMR works through the panel.

A browser can hold one preview target per gateway origin at a time: the `ocm_preview` cookie names a single session. Opening a different port replaces the current target.

## Opening Previews

A preview can be opened from more than one place:

- **Port list** — select a port in the panel.
- **Terminal links** — clicking a local dev URL (`http://localhost:PORT`, `127.0.0.1`, `0.0.0.0`, or `[::1]`) printed in a terminal opens the Preview panel at that port and path instead of a new browser tab. External links still open in a new tab.
- **Project actions** — an action's resolved URL opens in the Preview panel when **Auto-open URL** is enabled.

## Toolbar

- **Path** — enter a path and press **Go** (or Enter) to start a session for that path.
- **Reload** — remounts the iframe.
- **Open in new tab** — creates a fresh session and opens its start URL in a new tab with `noopener`. Start tokens are single-use, so this always mints a new one.
- **Viewport** — switch between Mobile (390 px), Tablet (820 px), and Full width.

## Behind HTTPS or a Reverse Proxy

By default the panel builds the gateway origin as `${location.protocol}//${location.hostname}:${PREVIEW_PORT}`. When the Manager is served over HTTPS (directly or behind a reverse proxy), the browser blocks the iframe for two reasons:

- **Mixed content** — an `https://` page cannot embed an `http://` preview.
- **Third-party cookies** — the `ocm_preview` cookie is blocked in a cross-site iframe.

Set `PREVIEW_PUBLIC_URL` to a same-site HTTPS origin that proxies the preview gateway, for example `https://preview.example.com`. The panel then builds preview URLs from that origin instead. As a fallback, **Open in new tab** opens the preview as a top-level page, where the session cookie is first-party.

## Related

- [Environment Variables](../configuration/environment.md) — `PREVIEW_PORT` and `PREVIEW_PUBLIC_URL`.
- [Docker](../configuration/docker.md) — exposing the preview gateway port.
- [Terminal & Dev Loop](terminal.md) — start a dev server in a terminal.
