#!/bin/sh
set -eu

OCM_REF="${OCM_REF:-main}"
OCM_DIR="${OCM_DIR:-$HOME/opencode-manager}"
OCM_RAW_URL="https://raw.githubusercontent.com/chriswritescode-dev/opencode-manager/$OCM_REF"
OCM_PROJECT="ocm"
OCM_LOCAL_URL="http://localhost:5003"
OCM_DOCS_URL="https://opencodemanager.app/docs"
HEALTH_TIMEOUT_SECONDS=180

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    fail "Docker is required. Install Docker Desktop (macOS, Windows) or Docker Engine (Linux): https://docs.docker.com/get-docker/"
  fi
  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but not reachable. Start Docker Desktop or the docker service, and make sure your user can run 'docker info'."
  fi
  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 ('docker compose') is required: https://docs.docker.com/compose/install/"
  fi
}

require_no_conflicting_install() {
  if [ -e "$OCM_DIR/.git" ] || [ -f "$OCM_DIR/Dockerfile" ]; then
    fail "$OCM_DIR is a source checkout of OpenCode Manager. Keep updating it with ./scripts/docker-upgrade.sh, or set OCM_DIR to install somewhere else."
  fi
  running_project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' opencode-manager 2>/dev/null || true)"
  if [ -z "$running_project" ] && docker inspect opencode-manager >/dev/null 2>&1; then
    fail "A container named opencode-manager already exists outside Docker Compose. Remove it with 'docker rm -f opencode-manager' (its volumes are kept) and re-run."
  fi
  if [ -n "$running_project" ] && [ "$running_project" != "$OCM_PROJECT" ]; then
    running_dir="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' opencode-manager 2>/dev/null || true)"
    fail "OpenCode Manager is already installed from ${running_dir:-another Compose project}. Keep using that install, or stop it there with 'docker compose down' before installing here. The two installs keep separate data."
  fi
}

can_prompt() {
  (: </dev/tty) 2>/dev/null
}

ask_yes_no() {
  if [ "$2" = y ]; then
    ask_hint="[Y/n]"
  else
    ask_hint="[y/N]"
  fi
  printf '%s %s ' "$1" "$ask_hint" >/dev/tty
  read -r ask_answer </dev/tty || ask_answer=""
  case "${ask_answer:-$2}" in
    [Yy] | [Yy][Ee][Ss]) return 0 ;;
    *) return 1 ;;
  esac
}

ask_value() {
  printf '%s: ' "$1" >/dev/tty
  read -r ask_answer </dev/tty || ask_answer=""
  printf '%s' "$ask_answer"
}

expand_home() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s/%s' "$HOME" "${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

env_line() {
  case "$2" in
    *"'"*) fail "Paths containing a single quote are not supported: $2" ;;
  esac
  printf "%s='%s'\n" "$1" "$2"
}

find_opencode_config_file() {
  for config_name in opencode.jsonc opencode.json config.json; do
    if [ -f "$1/$config_name" ]; then
      printf '%s' "$config_name"
      return 0
    fi
  done
}

detect_lan_ip() {
  case "$(uname -s)" in
    Darwin) ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true ;;
    *) ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }' ;;
  esac
}

write_override() {
  {
    printf 'services:\n  app:\n'
    if [ -n "$2" ] || [ "$3" = 1 ]; then
      printf '    environment:\n'
      if [ -n "$2" ]; then
        printf '      - OPENCODE_IMPORT_CONFIG_PATH=/import/opencode-config/%s\n' "$2"
      fi
      if [ "$3" = 1 ]; then
        printf '      - OPENCODE_IMPORT_STATE_PATH=/import/opencode-state\n'
      fi
    fi
    printf '    volumes:\n'
    if [ -n "$2" ]; then
      write_bind_mount '${OCM_OPENCODE_CONFIG_HOST_PATH}' /import/opencode-config true
    fi
    if [ "$3" = 1 ]; then
      write_bind_mount '${OCM_OPENCODE_STATE_HOST_PATH}' /import/opencode-state true
    fi
    if [ "$4" = 1 ]; then
      write_bind_mount '${OCM_REPOS_HOST_PATH}' '${OCM_REPOS_HOST_PATH}' false
    fi
  } >"$1"
}

write_bind_mount() {
  printf '      - type: bind\n        source: "%s"\n        target: "%s"\n        read_only: %s\n' "$1" "$2" "$3"
}

configure_new_install() {
  env_content=""
  import_config_name=""
  import_state=0
  mount_repos=0

  if ! can_prompt; then
    say "No terminal available, installing with defaults (no host folders shared)."
    return 0
  fi

  config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
  state_dir="${XDG_DATA_HOME:-$HOME/.local/share}/opencode"
  found_config_name="$(find_opencode_config_file "$config_dir")"
  found_state=0
  if [ -f "$state_dir/opencode.db" ]; then
    found_state=1
  fi

  if [ -n "$found_config_name" ] || [ "$found_state" = 1 ]; then
    say ""
    say "Found OpenCode on this machine."
    if [ "$found_state" = 1 ]; then
      say "  Chat history and provider logins: $state_dir ($(du -sh "$state_dir" 2>/dev/null | cut -f1))"
    fi
    if [ -n "$found_config_name" ]; then
      say "  Config: $config_dir/$found_config_name"
    fi
    if ask_yes_no "Copy them into OpenCode Manager? They are shared read-only and copied once on first start." n; then
      IMPORTED_OPENCODE=1
      if [ -n "$found_config_name" ]; then
        import_config_name="$found_config_name"
        env_content="$env_content$(env_line OCM_OPENCODE_CONFIG_HOST_PATH "$config_dir")
"
      fi
      if [ "$found_state" = 1 ]; then
        import_state=1
        env_content="$env_content$(env_line OCM_OPENCODE_STATE_HOST_PATH "$state_dir")
"
      fi
    fi
  fi

  say ""
  if ask_yes_no "Share a folder of existing repositories with OpenCode Manager? Agents can read and change files in it." n; then
    repos_answer="$(expand_home "$(ask_value "Repositories folder (absolute path)")")"
    case "$repos_answer" in
      /*)
        if [ -d "$repos_answer" ]; then
          mount_repos=1
          REPOS_DIR="${repos_answer%/}"
          env_content="$env_content$(env_line OCM_REPOS_HOST_PATH "$REPOS_DIR")
"
        else
          say "Skipping: $repos_answer is not a folder."
        fi
        ;;
      "") say "Skipping: no folder entered." ;;
      *) say "Skipping: $repos_answer is not an absolute path." ;;
    esac
  fi

  if [ "$(uname -s)" = Linux ] && [ "$(id -u)" != 0 ] && { [ -n "$import_config_name" ] || [ "$import_state" = 1 ] || [ "$mount_repos" = 1 ]; }; then
    env_content="${env_content}PUID=$(id -u)
PGID=$(id -g)
"
  fi

  lan_ip="$(detect_lan_ip)"
  if [ -n "$lan_ip" ]; then
    say ""
    if ask_yes_no "Allow sign-in from other devices on your network, like your phone (http://$lan_ip:5003)?" y; then
      LAN_URL="http://$lan_ip:5003"
      env_content="${env_content}AUTH_TRUSTED_ORIGINS=$OCM_LOCAL_URL,$LAN_URL
"
    fi
  fi

  if [ -n "$env_content" ]; then
    printf '%s' "$env_content" >"$OCM_DIR/.env"
  fi
  if [ -n "$import_config_name" ] || [ "$import_state" = 1 ] || [ "$mount_repos" = 1 ]; then
    write_override "$OCM_DIR/docker-compose.override.yml" "$import_config_name" "$import_state" "$mount_repos"
  fi
}

wait_for_health() {
  waited=0
  until curl -fsS -o /dev/null "$OCM_LOCAL_URL/api/health" 2>/dev/null; do
    if [ "$waited" -ge "$HEALTH_TIMEOUT_SECONDS" ]; then
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

print_summary() {
  say ""
  say "OpenCode Manager is running."
  say ""
  say "  Open:            $OCM_LOCAL_URL"
  if [ -n "$LAN_URL" ]; then
    say "  On your network: $LAN_URL"
  fi
  say ""
  if [ "$IMPORTED_OPENCODE" = 1 ]; then
    say "Next: create your admin account. Your OpenCode providers and chats are imported on first start."
  else
    say "Next: create your admin account, then connect a model provider in Settings > Providers."
  fi
  if [ -n "$REPOS_DIR" ]; then
    say "Add your repositories with Add Repository > Folder > $REPOS_DIR"
  fi
  say ""
  say "Manage it from $OCM_DIR:"
  say "  docker compose logs -f    View logs"
  say "  docker compose down       Stop (your data is kept)"
  say "  Re-run the installer      Update to the latest release"
  say ""
  say "Customize with .env or docker-compose.override.yml; docker-compose.yml is replaced on update."
  say "Docs: $OCM_DOCS_URL"
}

main() {
  require_docker
  require_no_conflicting_install
  REPOS_DIR=""
  LAN_URL=""
  IMPORTED_OPENCODE=0

  if [ -f "$OCM_DIR/docker-compose.yml" ]; then
    say "Updating OpenCode Manager in $OCM_DIR (your settings are kept)."
  else
    say "Installing OpenCode Manager into $OCM_DIR"
    mkdir -p "$OCM_DIR"
    configure_new_install
  fi

  curl -fsSL "$OCM_RAW_URL/docker-compose.release.yml" -o "$OCM_DIR/docker-compose.yml.download" ||
    fail "Could not download docker-compose.release.yml from $OCM_RAW_URL"
  mv "$OCM_DIR/docker-compose.yml.download" "$OCM_DIR/docker-compose.yml"

  cd "$OCM_DIR"
  say ""
  say "Pulling the OpenCode Manager image (about 1.2 GB the first time)..."
  docker compose pull
  docker compose up -d || fail "Could not start the container. Check the error above, then re-run the installer."

  say "Waiting for OpenCode Manager to start..."
  if ! wait_for_health; then
    fail "OpenCode Manager did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s. Check the logs: cd $OCM_DIR && docker compose logs"
  fi
  print_summary
}

main "$@"
