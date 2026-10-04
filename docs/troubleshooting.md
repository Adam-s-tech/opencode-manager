# Troubleshooting

Common issues and their solutions.

## Installation Issues

### Docker Container Won't Start

**Symptoms:** Container exits immediately or fails health check

**Solutions:**

1. Check logs:
```bash
docker-compose logs -f
```

Once the Manager is running, **Settings → Logs** shows the Manager's own log lines in-app, plus the OpenCode server's stdout/stderr, which the Manager captures in memory and does **not** forward to the container console — so those OpenCode-server lines are visible in-app only. If the container or the Manager itself fails before the Manager's HTTP server is up, use `docker-compose logs`; the in-app viewer has nothing to show at that point.

2. Verify Docker resources (2GB RAM minimum)

 3. Check ports aren't in use:
```bash
lsof -i :5003
```

4. Rebuild without cache:
```bash
docker-compose build --no-cache
```

### Reset a Broken OpenCode Binary

**Symptoms:** Container won't start after an OpenCode upgrade, or the OpenCode settings show a malformed binary

OpenCode versions installed from Settings live in their own named volume (`opencode-bin`); the bundled version is part of the image. On start, the entrypoint already removes a persisted binary that is malformed or outside the supported range. If a persisted version still misbehaves, remove only that volume so the container falls back to the bundled binary, without touching the workspace or database volumes:

```bash
docker-compose down
# <project> is the Compose project name, usually the directory containing docker-compose.yml
docker volume rm <project>_opencode-bin
docker-compose up -d
```

Or via the package scripts:

```bash
pnpm docker:down
docker volume rm <project>_opencode-bin
pnpm docker:up
```

Do not use `docker-compose down -v` (or `pnpm docker:reset`) here: that also deletes the workspace and database volumes.

### Port Already in Use

**Symptoms:** Error about port 5003 being in use

**Solutions:**

1. Find process using port:
```bash
lsof -i :5003
```

2. Stop the process or change port in `docker-compose.yml`:
```yaml
ports:
  - "8080:5003"  # Use different host port
```

Then add the new URL to the allowed origins in `.env`, or sign-in fails with an invalid-origin error:

```bash
AUTH_TRUSTED_ORIGINS=http://localhost:8080
PASSKEY_ORIGIN=http://localhost:8080
```

### Permission Denied Errors

**Symptoms:** Container can't write to volumes

Startup tolerates workspace directories that already exist with wrong ownership; permission errors then appear on the first write into the directory rather than at startup.

**Solutions:**

1. In Docker, the entrypoint re-owns `/app/data` and `/workspace` on every start, so a host-side `chown` is overwritten. When you bind-mount a host directory with `OCM_WORKSPACE_HOST_PATH`, set `PUID` and `PGID` in `.env` to the host user that owns it:
```bash
PUID=1000
PGID=1000
```

2. For local development, fix ownership of the local directories:
```bash
sudo chown -R $(id -u):$(id -g) ./workspace ./data
```

## Authentication Issues

### Can't Log In

**Solutions:**

1. Clear browser cookies
2. Try incognito/private mode
3. Check `AUTH_SECRET` is set in production
4. Verify `AUTH_TRUSTED_ORIGINS` includes your URL

### Session Keeps Expiring

**Solutions:**

1. Ensure `AUTH_SECRET` is persistent across restarts
2. Check browser isn't blocking cookies
3. Verify `AUTH_SECURE_COOKIES=false` if using HTTP

### OAuth Redirect Error

**Solutions:**

1. Verify callback URL matches exactly in provider settings
2. Check for trailing slashes
3. Ensure protocol matches (http vs https)

### Passkey Not Working

**Solutions:**

1. Verify `PASSKEY_RP_ID` matches your domain
2. Check `PASSKEY_ORIGIN` includes correct protocol and port
3. Try a different browser
4. Ensure WebAuthn is supported

### Password Reset Not Working

**Solutions:**

1. Set all required variables:
```bash
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=new-password
ADMIN_PASSWORD_RESET=true
```

2. Recreate the container so it picks up the new environment variables:
```bash
docker compose up -d --force-recreate app
```
3. Remove `ADMIN_PASSWORD_RESET=true` and recreate the container again:
```bash
docker compose up -d --force-recreate app
```

## Git Issues

### Clone Fails for Private Repository

**Solutions:**

1. Configure GitHub PAT in Settings > Git > Credentials
2. Ensure PAT has `repo` scope
3. Check PAT hasn't expired

### Push/Pull Fails

**Solutions:**

1. Verify GitHub PAT is valid
2. Check PAT has write permissions
3. Verify remote URL: `git remote -v`

### Worktree Creation Fails

**Solutions:**

1. Ensure branch doesn't already exist
2. Check disk space
3. Verify repo isn't in detached HEAD state

## Chat Issues

### Messages Not Sending

**Solutions:**

1. Check OpenCode server is running:
```bash
docker exec opencode-manager ps aux | grep opencode
```

2. Verify model is configured
3. Check API key is valid

### Streaming Stops Unexpectedly

**Solutions:**

1. Check network connection
2. Look for errors in browser console (F12)
3. Check container logs for errors

### File Mentions Not Working

**Solutions:**

1. Ensure repository is selected
2. Check file exists
3. Refresh the file browser

## File Browser Issues

### Files Not Loading

**Solutions:**

1. Refresh the page
2. Check repository is properly cloned
3. Verify workspace volume is mounted

### Upload Fails

**Solutions:**

1. Check file size
2. Verify write permissions
3. Check browser console for errors

## Performance Issues

### Slow Response Times

**Solutions:**

1. Check Docker resources:
```bash
docker stats
```

2. Clear old sessions
3. Use `/compact` to reduce session size

### High Memory Usage

**Solutions:**

1. Limit session count
2. Delete unused sessions
3. Restart container:
```bash
docker-compose restart
```

### Database Errors

**Solutions:**

1. Stop the container without removing it:
```bash
docker compose stop app
```
2. Back up the data directory from the stopped container (`DATABASE_PATH=/app/data/opencode.db` in Compose), including any SQLite WAL/SHM sidecar files:
```bash
mkdir -p ./opencode-data-backup
docker cp opencode-manager:/app/data/. ./opencode-data-backup/
```
3. Start the container again:
```bash
docker compose start app
```

## Mobile Issues

### Keyboard Doesn't Close

**Solutions:**

1. Tap outside input field
2. Update device OS
3. Try Safari on iOS

### PWA Won't Install

**Solutions:**

1. iOS: Must use Safari
2. Android: Must use Chrome
3. Check HTTPS is enabled

### Touch Gestures Not Working

**Solutions:**

1. Start the swipe within 30px of the screen edge
2. Swipe at least 80px
3. Check no UI element is blocking

## Getting More Help

If your issue isn't covered:

1. Check [GitHub Issues](https://github.com/chriswritescode-dev/opencode-manager/issues)
2. Search [GitHub Discussions](https://github.com/chriswritescode-dev/opencode-manager/discussions)
3. Open a new issue with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Container logs: `docker-compose logs` — required when the Manager fails to start; **Settings → Logs** in-app covers the same Manager lines plus captured OpenCode server output once the Manager is up
   - Browser console errors
   - Environment info (OS, browser, Docker version)
