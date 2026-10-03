# Terminal & Dev Loop

Run interactive shells against a repository or workspace directory without leaving the WebUI.

## Opening a Terminal

Open the terminal from either surface:

- **Desktop sidebar** — click **Terminal** in the tool list for a repository or session.
- **More drawer** — on mobile or from the overflow menu, open **More** and select **Terminal**.

The terminal panel opens as a dialog. If no terminal exists for the selected directory yet, the panel starts one automatically.

Terminals are scoped to the selected repository or OpenCode workspace directory. A terminal opened from a repo runs in that repo's path; a terminal opened from a session runs in the session's working directory. Switching directories shows that directory's terminals.

## Tabs and Reconnect

Each terminal runs in its own tab:

- Click **+** to create another terminal in the same directory.
- Click a tab to focus it.
- Click the **×** on a tab to close it. Closing a running terminal asks for confirmation, then stops the process.
- An exited terminal keeps its tab and shows `exited` with its exit code.

Terminals are backed by OpenCode PTYs, so they survive a browser close or reload: reopening the panel reattaches and replays the buffered output. They do **not** survive an OpenCode restart, which ends every PTY.

## Mobile Key Bar

On mobile, the panel shows a key bar above the keyboard with keys that are awkward to reach on a soft keyboard:

- **Esc**, **Tab**
- **Ctrl** — tap to arm, then tap a key to send the modified combination; arming is consumed by the next key.
- Arrow keys
- `|`, `~`, `/`

## Runtime and Environment

Terminals run as OpenCode PTYs on the host, using the user's configured shell. They are **not sandboxed**: sandbox enforcement applies to agent `shell` tool calls, not to PTY terminals (see [Agent Sandboxing](sandboxing.md)).

Each terminal receives environment resolved for its directory:

- the repository's GitHub token environment (`GH_TOKEN`, `GITHUB_TOKEN`), so `gh` authenticates with the repo's GitHub credential;
- the repository's assigned git commit identity, when one is assigned, so commits made in the terminal use that author.

`git` itself authenticates with the same credentials as the OpenCode server process, which the Manager configures from its saved git credentials.

## Related

- [Project Actions](project-actions.md) — run and stop long-lived commands as terminals from the header menu.
- [Preview](preview.md) — open a dev server started in a terminal.
