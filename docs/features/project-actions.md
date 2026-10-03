# Project Actions

Define repeatable commands for a repository and run them from the header menu.

Project actions are long-lived commands — a dev server, a build watcher, a test runner — that run in a terminal. They are configured in one of two places:

- **My settings** (personal) — stored in the Manager database, keyed to the repository's main checkout, so they apply across the repository and all its worktrees.
- **The repository file** — `.ocm/project.json` at the repo root, committed and shared with everyone who clones it.

Both sources are merged in the **Project Actions** dialog and the header menu.

## Actions

An action has these fields:

| Field | Description |
|-------|-------------|
| `id` | Stable identifier. Letters, digits, `_` and `-`, up to 64 characters. |
| `name` | Label shown in the menu, up to 60 characters. |
| `command` | Shell command, up to 4000 characters. |
| `icon` | Optional icon: `play`, `build`, `test`, `lint`, `terminal`, `server`, `bug`, or `rocket`. |
| `url` | Optional URL template opened for the action. |
| `autoOpenUrl` | When enabled, the resolved URL opens automatically after the action starts. |

Actions run as `/bin/sh -c <command>` in a PTY. Starting an action that is already running focuses its existing terminal instead of starting a second process. Stopping an action removes its PTY.

### URL Templates

The `url` field accepts two placeholders:

| Placeholder | Resolves to |
|-------------|-------------|
| `{worktree}` | The basename of the current directory. |
| `{branch}` | The current git branch of the directory, from `git rev-parse --abbrev-ref HEAD`. |

For example, `http://localhost:5173/{worktree}` becomes `http://localhost:5173/feature-login` in a worktree named `feature-login`. If `{branch}` cannot be resolved (for example, a detached HEAD with no branch), the template is left unchanged.

When the resolved URL is a local dev URL (`http://localhost:PORT`, `127.0.0.1`, `0.0.0.0`, or `[::1]`), it opens in the [Preview](preview.md) panel rather than a new browser tab.

## Running and Stopping

The repository and session headers show a **Project actions** play button. The menu lists every configured action:

- Select an action to start it. The terminal opens automatically.
- A running action shows a dot. Select **Stop** under it to remove its PTY.
- Select **Manage actions…** to open the Project Actions dialog.

Actions defined in the repository file never run until trusted (see [Trust](#trust)).

## Repository Configuration File

`.ocm/project.json` defines actions and worktree setup commands for the repository. The format:

```json
{
  "version": 1,
  "projectActions": [
    {
      "id": "dev",
      "name": "Dev server",
      "command": "pnpm dev",
      "icon": "server",
      "url": "http://localhost:5173/{worktree}",
      "autoOpenUrl": true
    }
  ],
  "setupWorktree": [
    "pnpm install"
  ]
}
```

- `version` is required and must be `1`.
- `projectActions` and `setupWorktree` are optional. Up to 50 actions and 20 setup commands are allowed.
- A repository action whose `id` matches a personal action is ignored, and the dialog reports a warning, so personal actions always win.

## Moving Actions and Setup Commands

The Project Actions dialog moves items between personal settings and the repository file:

- **Move to repository** writes the item into `.ocm/project.json` and removes it from personal settings. Because the user authored it, the file is trusted automatically.
- **Move to my settings** removes the item from `.ocm/project.json` (deleting the file if it becomes empty) and stores it in personal settings.

Moves are transactional: if the file write or the settings update fails, the file is restored.

## Trust

Commands in `.ocm/project.json` run on your machine, so the Manager does not run them until you trust the file:

- Trust is a hash of the file's **executable content only**: each action's `id`, `command` and `url`, plus the setup commands. Changing an action's name, icon, or `autoOpenUrl` does not affect trust; changing a command, URL, or setup command does.
- Trusting requires echoing the exact hash shown, so a file cannot be swapped between review and trust.
- Untrusted repository commands never run — not from the header menu, and not as worktree setup commands.
- The dialog shows the untrusted commands and a **Trust these commands** button. Attempting to run an untrusted action prompts for trust first.
- Moving an item into the file auto-trusts it, because the user authored it.

## Worktree Setup Commands

Setup commands run once after a new working directory is created — both Manager worktrees and OpenCode workspaces. They run in a PTY with `set -e`, so the first failing command stops the rest.

- `$ROOT_PROJECT_PATH` is available in the environment and points at the repository's main checkout.
- Personal setup commands always run. Repository setup commands are skipped while the file is untrusted; the skipped result is reported.
- Setup commands are configured in the **Worktree setup** section of the Project Actions dialog.

## Related

- [Terminal & Dev Loop](terminal.md) — the PTY terminals actions run in.
- [Preview](preview.md) — open an action's URL in the preview panel.
