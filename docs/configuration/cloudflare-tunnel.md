# Cloudflare Tunnel

Reach an OpenCode Manager running on your local network from anywhere over HTTPS, without opening ports on your router. This guide covers the Manager itself and the [Preview](../features/preview.md) panel, which needs a hostname of its own.

## What You Need

- A domain managed by Cloudflare, for example `example.com`.
- A Cloudflare Tunnel with `cloudflared` running on a machine that can reach the Manager. See Cloudflare's [Create a tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/) guide.
- Two hostnames on that domain:

| Hostname | Serves | Manager port |
|----------|--------|--------------|
| `oc.example.com` | The Manager | 5003 |
| `preview.example.com` | The [preview gateway](../features/preview.md#gateway) | 5004 |

The examples below use these names; replace them with your own.

!!! info "Why Preview needs its own hostname"
    Preview shows pages from dev servers you run, which is untrusted content. It is served from a separate origin so it can never act as the Manager. Both hostnames must be on the **same domain**: the preview login cookie is `SameSite=Lax`, which the browser only sends to a frame on the same site as the page around it.

!!! warning "Quick tunnels are not supported"
    `trycloudflare.com` quick tunnels get a random hostname each time they start, so `PREVIEW_PUBLIC_URL` would change on every restart. Use a named tunnel on your own domain.

## 1. Publish Both Hostnames

In your tunnel, add a **published application route** for each hostname. The service URL depends on where `cloudflared` runs.

=== "cloudflared in Docker Compose"

    Run `cloudflared` next to the Manager in the same `docker-compose.yml`, so it reaches the Manager over the Compose network:

    ```yaml
    services:
      app:
        # the existing OpenCode Manager service

      cloudflared:
        image: cloudflare/cloudflared:latest
        command: tunnel --no-autoupdate run
        environment:
          - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
        restart: unless-stopped
    ```

    Put the tunnel token from the Cloudflare dashboard in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, then add these routes:

    | Hostname | Service |
    |----------|---------|
    | `oc.example.com` | `http://app:5003` |
    | `preview.example.com` | `http://app:5004` |

=== "cloudflared on another machine"

    Point the routes at the Manager's LAN address:

    | Hostname | Service |
    |----------|---------|
    | `oc.example.com` | `http://192.168.1.10:5003` |
    | `preview.example.com` | `http://192.168.1.10:5004` |

    With Docker, ports 5003 and 5004 must be published, as they are in the default `docker-compose.yml`.

=== "Locally managed tunnel"

    For a tunnel configured with a `config.yml` file:

    ```yaml
    tunnel: <TUNNEL-ID>
    credentials-file: /etc/cloudflared/<TUNNEL-ID>.json

    ingress:
      - hostname: oc.example.com
        service: http://192.168.1.10:5003
      - hostname: preview.example.com
        service: http://192.168.1.10:5004
      - service: http_status:404
    ```

## 2. Configure the Manager

Add to `.env`:

```bash
AUTH_TRUSTED_ORIGINS=https://oc.example.com
AUTH_SECURE_COOKIES=true

PASSKEY_RP_ID=oc.example.com
PASSKEY_ORIGIN=https://oc.example.com

PREVIEW_PUBLIC_URL=https://preview.example.com
```

Then restart the Manager. With Docker: `docker compose up -d`.

| Variable | Why |
|----------|-----|
| `AUTH_TRUSTED_ORIGINS` | Lets the browser sign in from the tunnel hostname. |
| `AUTH_SECURE_COOKIES` | The tunnel serves HTTPS, so session cookies are marked secure. |
| `PASSKEY_RP_ID`, `PASSKEY_ORIGIN` | Passkeys are bound to the hostname. Passkeys added under another hostname (such as `localhost`) do not work here; add a new one from **Settings > Account**. |
| `PREVIEW_PUBLIC_URL` | Without it, the Preview panel loads `https://oc.example.com:5004`, which the tunnel does not serve, and the preview stays blank. |

!!! danger "Never add the preview hostname to `AUTH_TRUSTED_ORIGINS`"
    The Manager rejects state-changing requests from other origins on the same site unless they are trusted. Trusting the preview hostname would let any page you preview act as you in the Manager. See [Isolation level](../features/preview.md#isolation-level).

## 3. Turn Off Caching for the Preview Hostname

**This step is required.** Cloudflare caches JavaScript, CSS, images and fonts by default, and keeps responses that have no cache headers for up to two hours ([Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)). The cache cannot tell dev servers or users apart. Every dev server shares the one preview hostname, and the gateway picks the target from your login cookie. Without this rule:

- Changes to your files do not appear for up to two hours.
- Two projects that serve the same path, such as `/main.js`, can receive each other's files.
- Cloudflare serves a cached file without going through the preview login, so anyone with its URL can download it.

Create a cache rule in the Cloudflare dashboard:

1. Go to **Caching > Cache Rules** and select **Create rule**.
2. Name it, for example `OpenCode Manager preview: bypass cache`.
3. Under **When incoming requests match**, choose **Custom filter expression**: **Hostname** **equals** `preview.example.com`.
4. Under **Cache eligibility**, select **Bypass cache**.
5. Select **Deploy**.

The Manager hostname does not need this rule.

## 4. Check WebSockets

The Terminal and Preview live reload (HMR) use WebSockets. On your domain's **Network** page in the Cloudflare dashboard, make sure **WebSockets** is **On**.

## 5. Cloudflare Access (Optional)

If you protect `oc.example.com` with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/), choose one of these for the preview hostname:

- **Add it to the same Access application.** In an application with several domains, Access issues the login cookie for the other domains after you sign in once, so the Preview frame never shows a login page ([multi-domain applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/#multi-domain-applications)).
- **Leave it out of Access.** The preview gateway has its own login: it only opens a preview from a single-use token issued by a signed-in Manager, and answers every other request with `401`.

Do not put the preview hostname in a **separate** Access application. The Preview frame would be sent to the Access login page, which cannot be shown inside a frame, and the preview stays blank.

## Using the LAN Address as Well

`PREVIEW_PUBLIC_URL` applies however you open the Manager:

- **Through the tunnel** (`https://oc.example.com`): Preview works in the panel.
- **Through a LAN address** (`http://192.168.1.10:5003`): the panel still loads the preview from `https://preview.example.com`. That is a different site, so the browser blocks the preview cookie inside the frame. Use **Open in new tab** in the Preview toolbar, or use the tunnel hostname.

With `AUTH_SECURE_COOKIES=true` you also cannot sign in over plain HTTP, because browsers do not store secure cookies for `http://` addresses. Sign in through the tunnel hostname.

## Check the Setup

1. Open `https://oc.example.com` and sign in.
2. Start a dev server from the [Terminal](../features/terminal.md) or [Actions](../features/project-actions.md).
3. Open **Preview** and select its port. The page appears in the panel.
4. Edit a file the dev server serves. The change appears after live reload or a refresh.
5. Optional: open `https://preview.example.com` in a private window. It shows **Preview session expired. Reopen it from OpenCode Manager.** (or the Access login page, if the hostname is behind Access), which confirms that the preview cannot be opened without signing in.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Preview stays blank or cannot connect | `PREVIEW_PUBLIC_URL` is not set, so the panel uses port 5004 on the Manager hostname | Set `PREVIEW_PUBLIC_URL` and restart the Manager |
| **Preview session is invalid or expired.** inside the panel | The browser blocked the preview cookie: the hostnames are on different domains, or the Manager was opened by its LAN address | Put both hostnames on the same domain and open the Manager through the tunnel, or use **Open in new tab** |
| **Preview must run on a different origin than OpenCode Manager.** | `PREVIEW_PUBLIC_URL` points at the Manager's own hostname | Use a separate hostname for the preview |
| Old file contents, or another project's files | Cloudflare cached the files | Add the [cache rule](#3-turn-off-caching-for-the-preview-hostname), then purge the cache under **Caching > Configuration** |
| Live reload does not work, or the Terminal does not connect | WebSockets are off | Turn on [WebSockets](#4-check-websockets) |
| Access login page or a blank frame in the Preview panel | The preview hostname is in a separate Access application | Follow [Cloudflare Access](#5-cloudflare-access-optional) |
| Sign-in fails on the tunnel hostname | `AUTH_TRUSTED_ORIGINS` does not include `https://oc.example.com` | Add it and restart the Manager |

## Related

- [Preview](../features/preview.md) — how the preview gateway works.
- [Authentication](authentication.md) — trusted origins, secure cookies and passkeys.
- [Docker](docker.md) — ports and environment variables.
- [Environment Variables](environment.md#preview-gateway) — `PREVIEW_PORT` and `PREVIEW_PUBLIC_URL`.
