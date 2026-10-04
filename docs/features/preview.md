# Preview

Open a running dev server inside the WebUI through an authenticated gateway.

The Preview panel lists the loopback ports that are currently listening, then proxies the selected one through a dedicated gateway origin. This lets you view a Vite, Next.js, or other dev server without exposing its raw port or weakening the Manager's own origin.

## Port List

Open **Preview** from the desktop sidebar tool list or the **More** drawer, including in the Assistant workspace. The port menu at the start of the toolbar lists every listening loopback port on the host as `:PORT command`, with the process's working directory underneath. Type in the menu to filter by port, command or directory. Working directories are read on Linux hosts (including the Docker image) and macOS; ports whose process runs inside the selected repository or workspace directory are grouped under **This repo** at the top, and the rest under **Other ports**. Other platforms list no ports.

Until a port is selected, the panel body lists the dev servers of this repo so one click opens the preview, and counts the other listening ports. When nothing is listening, it points to the Terminal and Actions to start a dev server.

The list excludes reserved ports — the Manager port (`PORT`, default 5003), the OpenCode server port (default 5551) and the preview gateway port itself — and only includes ports at or above 1024. Any other listening loopback port can be previewed; there is no per-port allow-list. This grants nothing an authenticated user does not already have, because the [Terminal](terminal.md) can reach the same ports.

Until a preview is open, the port list refreshes every 2 seconds. While a preview is open it refreshes only when you open the port menu.

Selecting a port creates a preview session and renders the target in an iframe on the gateway origin. The iframe keeps that origin (`allow-same-origin`) so dev servers can use cookies and storage; isolation from the Manager comes from the separate origin, not from an opaque sandbox. Selecting a different port starts a new session for it.

When preview is unavailable — `PREVIEW_PORT=0`, or the gateway could not listen on its port — the panel shows **Preview is unavailable**.

If the requested port is not listening yet, the panel shows **Waiting for port N…** and refetches the list every 2 seconds for up to 60 seconds, then shows an error with a **Retry** button.

## Gateway

The preview gateway listens on `PREVIEW_PORT` (default 5004) on its own origin. It is a separate origin from the Manager on purpose: preview content is untrusted and must not share the Manager origin. Setting `PREVIEW_PORT=0` disables the gateway. If the port is already in use, the Manager still starts, logs a warning, and reports preview as unavailable.

Access requires an authenticated preview session:

1. The Manager API mints a **single-use start token** for a listening port.
2. The browser navigates to `/__ocm_preview/start?token=…&path=…` on the gateway origin.
3. The gateway consumes the token (it expires after 60 seconds and cannot be reused) and sets an `ocm_preview` session cookie.

Requests then carry the cookie. Manager auth cookies are stripped before proxying, because host-scoped cookies are shared across ports; the preview target never sees them. In the other direction, any `Set-Cookie` from the preview target that names a Manager auth cookie or `ocm_preview` is dropped, so preview content cannot overwrite the Manager session. The start `path` must stay on the gateway origin; anything else redirects to `/`.

The gateway asks the target for uncompressed responses. When you use the preview remotely, put a compressing reverse proxy in front of it.

The gateway also proxies **WebSocket upgrades** on the same origin, so dev-server HMR works through the panel.

### Isolation level

A gateway on another port of the same host — or a `PREVIEW_PUBLIC_URL` on a subdomain of the Manager's domain — is a different origin but the **same site** as the Manager, so the browser still sends the Manager's `SameSite=Lax` session cookie with requests from preview content. The Manager therefore rejects state-changing API requests (`POST`, `PUT`, `PATCH`, `DELETE`) whose `Sec-Fetch-Site` is `same-site` or `cross-site` unless their `Origin` is listed in `AUTH_TRUSTED_ORIGINS`. Never add the preview gateway origin to `AUTH_TRUSTED_ORIGINS`.

A browser can hold one preview target per gateway origin at a time: the `ocm_preview` cookie names a single session. Opening a different port replaces the current target.

## Opening Previews

A preview can be opened from more than one place:

- **Port menu** — pick a port in the toolbar, or a dev server listed in the panel body.
- **Terminal links** — clicking a local dev URL (`http://localhost:PORT`, `127.0.0.1`, `0.0.0.0`, or `[::1]`) printed in a terminal opens the Preview panel at that port and path instead of a new browser tab. External links still open in a new tab.
- **Project actions** — an action's resolved URL opens in the Preview panel when **Auto-open URL** is enabled.

## Toolbar

- **Port** — the port menu described in [Port List](#port-list). Press Escape to close the menu without closing the panel.
- **Path** — enter a path and press **Go** (or Enter) to start a session for that path.
- **Reload** — remounts the iframe.
- **Open in new tab** — creates a fresh session and opens its start URL in a new tab with `noopener`. Start tokens are single-use, so this always mints a new one.
- **Viewport** — switch between Mobile (390 px), Tablet (820 px), and Full width. Hidden on small screens, where the panel is already phone-width.

## Behind HTTPS or a Reverse Proxy

By default the panel builds the gateway origin as `${location.protocol}//${location.hostname}:${PREVIEW_PORT}`. When the Manager is served over HTTPS (directly or behind a reverse proxy), the browser blocks the iframe for two reasons:

- **Mixed content** — an `https://` page cannot embed an `http://` preview.
- **Third-party cookies** — the `ocm_preview` cookie is blocked in a cross-site iframe.

Set `PREVIEW_PUBLIC_URL` to a same-site HTTPS origin that proxies the preview gateway, for example `https://preview.example.com`. Do not add it to `AUTH_TRUSTED_ORIGINS` (see [Isolation level](#isolation-level)). The panel then builds preview URLs from that origin instead, however the Manager itself was opened. As a fallback, **Open in new tab** opens the preview as a top-level page, where the session cookie is first-party.

!!! warning "Turn off caching for the preview origin"
    The gateway passes the dev server's cache headers through unchanged, and every port shares the one preview origin. A CDN or caching proxy in front of the gateway can therefore serve stale files, mix files between projects, and serve cached files without the preview login. Bypass caching for the preview hostname.

For a complete setup through a Cloudflare Tunnel, including the cache rule and Cloudflare Access, see [Cloudflare Tunnel](../configuration/cloudflare-tunnel.md).

## Related

- [Environment Variables](../configuration/environment.md) — `PREVIEW_PORT` and `PREVIEW_PUBLIC_URL`.
- [Docker](../configuration/docker.md) — exposing the preview gateway port.
- [Terminal & Dev Loop](terminal.md) — start a dev server in a terminal.
