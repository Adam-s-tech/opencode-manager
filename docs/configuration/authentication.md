# Authentication

OpenCode Manager uses single-user authentication designed for personal deployments.

## Overview

The authentication system supports:

- Email/password login
- Passkey/WebAuthn authentication
- OAuth social login (optional)
- Session-based auth with secure cookies

## First-Run Setup

On first launch with no admin account:

1. You're redirected to the Setup page
2. Create your admin account
3. Optionally configure providers
4. Start using the application

## Pre-Configured Admin

Skip interactive setup for automated deployments:

```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
```

When set:

- Admin user is created automatically
- Setup wizard is skipped
- New account registration is rejected server-side, including account creation through OAuth; the registration page is hidden too. Internal startup provisioning can create the configured admin account.

Both variables must be set. This does not revoke existing accounts or sessions, or restrict API access to an admin role: authenticated users can access Manager resources. Without a preconfigured admin, registration remains enabled. Use Manager for trusted personal deployments, not as a multi-user isolation boundary.

## Password Reset

If you forget your password:

1. Set environment variables:

```bash
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=new-password
ADMIN_PASSWORD_RESET=true
```

2. Recreate the container so it picks up the new environment variables:

```bash
docker compose up -d --force-recreate app
```

3. Log in with new password

4. Remove `ADMIN_PASSWORD_RESET=true` from environment and recreate again:

```bash
docker compose up -d --force-recreate app
```

!!! warning
    Remove the reset flag after successful reset to prevent accidental password changes.

## Session Security

### AUTH_SECRET

Required for production. Signs session cookies, so changing it signs every user out.

Generate:
```bash
openssl rand -base64 32
```

Configure:
```bash
AUTH_SECRET=your-generated-secret
```

### Session Duration

Sessions last 7 days and slide: once a session is more than a day old, the next request extends it by another 7 days, so an active session does not expire. A new session is created on each login.

### Secure Cookies

Outside Docker, secure cookies default to `true` when `NODE_ENV=production` and `false` otherwise. The default `docker-compose.yml` forwards `AUTH_SECURE_COOKIES=${AUTH_SECURE_COOKIES:-false}`, so a Compose deployment defaults to non-secure cookies even though Compose sets `NODE_ENV=production`. Set it explicitly:

```bash
# HTTPS
AUTH_SECURE_COOKIES=true

# For HTTP on trusted networks only
AUTH_SECURE_COOKIES=false
```

## Remote Access

### Local Network (HTTP)

For accessing via IP on a local network:

```bash
# Include every URL you open the Manager from
AUTH_TRUSTED_ORIGINS=http://localhost:5003,http://192.168.1.244:5003

# Disable secure cookies for HTTP
AUTH_SECURE_COOKIES=false
```

!!! note "Origin order"
    The first entry in `AUTH_TRUSTED_ORIGINS` is the Manager's auth base URL, which OAuth providers redirect back to. Put the URL you sign in from first. For `pnpm dev`, that is `http://localhost:5173`.

### Production (HTTPS)

For production with HTTPS:

```bash
AUTH_TRUSTED_ORIGINS=https://yourdomain.com
AUTH_SECURE_COOKIES=true
```

### Cloudflare Tunnel

To reach a Manager on your local network through a Cloudflare Tunnel, including the Preview panel, follow [Cloudflare Tunnel](cloudflare-tunnel.md).

## Passkeys

Passwordless authentication using WebAuthn.

### Setup

Configure your domain:

```bash
# Docker or a production build on this machine
PASSKEY_RP_ID=localhost
PASSKEY_RP_NAME=OpenCode Manager
PASSKEY_ORIGIN=http://localhost:5003

# Local development with pnpm dev (the page is served by Vite)
PASSKEY_RP_ID=localhost
PASSKEY_RP_NAME=OpenCode Manager
PASSKEY_ORIGIN=http://localhost:5173

# Production
PASSKEY_RP_ID=yourdomain.com
PASSKEY_RP_NAME=OpenCode Manager
PASSKEY_ORIGIN=https://yourdomain.com
```

!!! note "Origin selection"
    - `PASSKEY_ORIGIN` must be the origin of the page you sign in from, which is the URL in the browser's address bar
    - `PASSKEY_RP_ID` must be that page's hostname or a parent domain of it
    - Browsers only offer passkeys on HTTPS or `localhost`, so plain-HTTP access by LAN IP cannot use passkeys. For LAN or remote access, serve the Manager over HTTPS on a domain (for example, through a [Cloudflare Tunnel](cloudflare-tunnel.md)) and use that domain

### Adding a Passkey

1. Log in with password
2. Go to **Settings > Account**
3. Optionally enter a passkey name
4. Click **Add Passkey**
5. Follow browser/device prompts

### Supported Authenticators

- Touch ID / Face ID (macOS, iOS)
- Windows Hello
- Hardware security keys (YubiKey, etc.)
- Android fingerprint/face

### Passkey Requirements

- RP ID must match the domain
- Origin must match exactly (including port)
- HTTPS recommended (required for some browsers)

## Troubleshooting

### Can't Log In

1. Clear browser cookies
2. Check credentials are correct
3. Verify AUTH_SECRET hasn't changed
4. Check AUTH_TRUSTED_ORIGINS includes your URL

### Session Keeps Expiring

1. Check AUTH_SECRET is persistent across restarts
2. Verify cookies aren't being blocked
3. Check AUTH_SECURE_COOKIES setting

### Passkey Not Working

1. Verify PASSKEY_RP_ID matches domain
2. Check PASSKEY_ORIGIN is exact
3. Try a different browser
4. Ensure WebAuthn is supported
