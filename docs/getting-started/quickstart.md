# Quick Start

Get up and running with OpenCode Manager in minutes.

## 1. Start the Application

=== "Docker"

    ```bash
    git clone https://github.com/chriswritescode-dev/opencode-manager.git
    cd opencode-manager
    cp .env.example .env
    echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
    docker-compose up -d
    ```
    
    Open [http://localhost:5003](http://localhost:5003)

=== "Local Development"

    ```bash
    git clone https://github.com/chriswritescode-dev/opencode-manager.git
    cd opencode-manager
    pnpm install
    cp .env.example .env
    pnpm dev
    ```
    
    Open [http://localhost:5173](http://localhost:5173)

## 2. Create Admin Account

On first launch, you'll be redirected to the setup page:

1. Enter your **name**
2. Enter your **email**
3. Create a **password**
4. Click **Create Account**

!!! tip "Pre-configured Admin"
    For automated deployments, you can skip this step by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.

## 3. Configure AI Provider

Before chatting, you need to configure at least one AI provider:

1. Go to **Settings** (gear icon)
2. Select **Providers**
3. Choose a provider (e.g., Anthropic, OpenAI)
4. Enter your **API key** or click **Add OAuth** for supported providers
5. Click **Save**

## 4. Add Repositories

Choose the onboarding flow that matches your setup:

### Clone a Remote Repository

1. Click the **folder icon** in the sidebar
2. Click **Add Repository**
3. Select **Remote Repository**
4. Paste a repository URL (HTTPS or SSH)
5. Click **Add Repository**

### Discover Existing Local Repositories

1. Click the **folder icon** in the sidebar
2. Click **Add Repository**
3. Select **Folder Discovery**
4. Enter a parent folder such as `/Users/you/Development`
5. Click **Discover Repositories**

If you already used standalone OpenCode in those repositories, existing chats appear as soon as the discovered repo path matches the original OpenCode path.

!!! note "Private Repositories"
    For private repos, configure a GitHub Personal Access Token in Settings > Git > Credentials first.

## 5. Start Chatting

1. Select your repository from the sidebar
2. Click **New Session** or type `/new`
3. Type your message
4. Press **Cmd+Enter** (`Ctrl+Enter` on other platforms) to send, or **Enter** on mobile

### Useful Commands

| Command | Description |
|---------|-------------|
| `/help`, `/settings` | Open settings |
| `/new`, `/clear` | Start a new session |
| `/sessions`, `/resume`, `/continue` | List and switch between sessions |
| `/model`, `/models` | Open the model picker, also while a response is running |
| `/agent` | Switch to the next primary agent |
| `/variants` | Cycle the model's reasoning variant |
| `/compact` | Reduce session context |
| `/rename [title]` | Rename the session; with no title, regenerate it |
| `/fork` | Fork the session from a chosen message, or the entire conversation |
| `/timeline` | Jump to a loaded message in the conversation |
| `/btw <question>` | Ask a side question without adding it to the conversation |
| `/copy` | Copy the full transcript as Markdown |
| `/export` | Download the full transcript as Markdown |
| `/undo`, `/redo` | Undo or redo the last message |
| `/details` | Toggle tool execution details |
| `/mcp` | Manage MCP servers |
| `/skills` | Load a skill |
| `/connect` | Connect a provider |

Press **Enter** to run a command once its name is complete; use **Shift+Enter** to continue its text on a new line. Built-in commands use only the command text. Attached files and images are kept in the composer for your next message.

### File Mentions

Reference files in your prompts:

1. Type `@` in the chat input
2. Start typing a filename
3. Select from the autocomplete dropdown
4. The AI will have access to that file's contents

## 6. Explore Features

Now that you're set up, explore more features:

- **[Git Integration](../features/git.md)** - View diffs, manage branches
- **[File Browser](../features/files.md)** - Navigate and edit files
- **[MCP Servers](../features/mcp.md)** - Add tools and integrations
- **[Mobile PWA](../features/mobile.md)** - Install on your phone

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` / `Ctrl+Enter` | Send message |
| `Enter` | Run a slash command, such as `/btw <question>`; otherwise a new line on desktop, send on mobile |
| `Shift+Enter` | New line |

The app uses a configurable leader key system (`Cmd+O` on Mac, `Ctrl+O` on other platforms) for additional shortcuts. Customize in Settings > Keyboard Shortcuts.
