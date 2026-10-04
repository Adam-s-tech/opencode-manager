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
- An action `url` must start with `http://` or `https://`.
- A repository action whose `id` matches a personal action is not listed or run, and the dialog reports a warning, so personal actions always win. It is still part of the file's trusted content (see [Trust](#trust)).
- `.ocm` and `.ocm/project.json` must be regular files and directories. A symbolic link at either path is reported as an invalid file and is never written through.
- The file is read from the selected repository or workspace directory, so each worktree can carry its own version. Trust is stored once per project, so trusting the file in one worktree does not trust a different version of it in another.

Project actions are not available in the Assistant workspace.

## Moving Actions and Setup Commands

The Project Actions dialog moves items between personal settings and the repository file from each row's **⋯** menu:

- **Move to repository** writes the item into `.ocm/project.json` and removes it from personal settings. Because the user authored it, the file is trusted automatically.
- **Move to my settings** removes the item from `.ocm/project.json` (deleting the file if it becomes empty) and stores it in personal settings.

Moves are transactional: if the file write or the settings update fails, the file is restored.

## Trust

Commands in `.ocm/project.json` run on your machine, so the Manager does not run them until you trust the file:

- Trust covers everything in the file that can run or open: each action's `id`, `name`, `command`, `url` and `autoOpenUrl` (including actions hidden because a personal action has the same `id`), plus every setup command. Changing any of these resets trust; changing an icon does not.
- Both trust prompts — **Review** in the dialog and **Trust and run** in the header menu — list every action and setup command that trusting covers, not only the one you clicked.
- Trusting requires echoing the exact hash of the content shown, so a file cannot be swapped between review and trust.
- Untrusted repository commands never run — not from the header menu, and not as worktree setup commands.
- The dialog shows a banner above its tabs while the file is untrusted. **Review** lists the untrusted commands, and **Trust these commands** confirms. Attempting to run an untrusted action prompts for trust first.
- Moving an item into the file auto-trusts it, because the user authored it.

## Worktree Setup Commands

Setup commands run once after a new working directory is created — Manager worktrees and every OpenCode workspace, including workspaces created by multi-run and by agents through `ocm`. They run in a PTY with `set -e`, so the first failing command stops the rest.

- `$ROOT_PROJECT_PATH` is available in the environment and points at the repository's main checkout.
- Personal setup commands always run. Repository setup commands are skipped while the file is untrusted; the skipped result is reported.
- Setup commands are configured in the **Worktree setup** tab of the Project Actions dialog. Edits are saved together with **Save setup**, which is enabled once there are unsaved changes.

## Related

- [Terminal & Dev Loop](terminal.md) — the PTY terminals actions run in.
- [Preview](preview.md) — open an action's URL in the preview panel.
