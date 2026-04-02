#!/bin/bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  Interactive:
    ./setup.sh

  Non-interactive:
    ./setup.sh --non-interactive \
      --client <cursor|claude-code|claude-desktop|windsurf|antigravity|custom> \
      [--firebase-config "/path/to/service-account.json"] \
      [--client-email "<email>"] \
      [--private-key "<key with \n escapes>"] \
      [--project-id "<gcp-project-id>"] \
      --package-name "<com.example.app>" \
      [--config-path "/absolute/path/to/config.json"] \
      [--force]

Notes:
  - --config-path is required when --client custom.
  - Use --force to overwrite existing config without prompt.
  - If --firebase-config is provided, client email/private key/project id are read from it.
EOF
}

non_interactive=false
force_overwrite=false
client_slug=""
config_path_arg=""
client_email_arg=""
private_key_arg=""
project_id_arg=""
package_name_arg=""
firebase_config_arg=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --non-interactive)
      non_interactive=true
      shift
      ;;
    --force)
      force_overwrite=true
      shift
      ;;
    --client)
      client_slug="${2:-}"
      shift 2
      ;;
    --config-path)
      config_path_arg="${2:-}"
      shift 2
      ;;
    --client-email)
      client_email_arg="${2:-}"
      shift 2
      ;;
    --private-key)
      private_key_arg="${2:-}"
      shift 2
      ;;
    --project-id)
      project_id_arg="${2:-}"
      shift 2
      ;;
    --package-name)
      package_name_arg="${2:-}"
      shift 2
      ;;
    --firebase-config)
      firebase_config_arg="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

echo "Google Play Console MCP setup"
echo "============================="
echo ""
echo "This script writes ONE MCP config file for the editor/client you use."
echo "It does not create .env or extra example files."
echo ""

if [ ! -f "./dist/index.js" ]; then
  echo "Error: ./dist/index.js not found."
  echo "Run: npm install && npm run build"
  exit 1
fi

project_root="$(pwd)"
uname_s="$(uname -s)"

if [ "$uname_s" = "Darwin" ]; then
  claude_desktop_default="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [ "$uname_s" = "Linux" ]; then
  claude_desktop_default="$HOME/.config/Claude/claude_desktop_config.json"
else
  claude_desktop_default="%APPDATA%\\Claude\\claude_desktop_config.json"
fi

cursor_default="$project_root/.cursor/mcp.json"
claude_code_default="$project_root/.mcp.json"
windsurf_default="$HOME/.codeium/windsurf/mcp_config.json"
antigravity_default="$HOME/.gemini/antigravity/mcp_config.json"

config_path=""
client_name=""

if [ "$non_interactive" = false ]; then
  echo "Choose your MCP client/editor:"
  echo "  1) Cursor (project config)"
  echo "  2) Claude Code (project config)"
  echo "  3) Claude Desktop"
  echo "  4) Windsurf"
  echo "  5) Google Antigravity"
  echo "  6) Custom path"
  echo ""
  read -r -p "Selection [1-6]: " selection

  case "$selection" in
    1)
      client_name="Cursor"
      config_path="$cursor_default"
      ;;
    2)
      client_name="Claude Code"
      config_path="$claude_code_default"
      ;;
    3)
      client_name="Claude Desktop"
      config_path="$claude_desktop_default"
      ;;
    4)
      client_name="Windsurf"
      config_path="$windsurf_default"
      ;;
    5)
      client_name="Google Antigravity"
      config_path="$antigravity_default"
      ;;
    6)
      client_name="Custom"
      read -r -p "Enter full config path: " config_path
      ;;
    *)
      echo "Invalid selection."
      exit 1
      ;;
  esac
else
  case "$client_slug" in
    cursor)
      client_name="Cursor"
      config_path="$cursor_default"
      ;;
    claude-code)
      client_name="Claude Code"
      config_path="$claude_code_default"
      ;;
    claude-desktop)
      client_name="Claude Desktop"
      config_path="$claude_desktop_default"
      ;;
    windsurf)
      client_name="Windsurf"
      config_path="$windsurf_default"
      ;;
    antigravity)
      client_name="Google Antigravity"
      config_path="$antigravity_default"
      ;;
    custom)
      client_name="Custom"
      config_path="$config_path_arg"
      ;;
    *)
      echo "Invalid or missing --client value."
      usage
      exit 1
      ;;
  esac

  if [ -n "$config_path_arg" ]; then
    config_path="$config_path_arg"
  fi

  if [ -z "$package_name_arg" ]; then
    echo "Missing required --package-name flag."
    usage
    exit 1
  fi
  if [ -z "$firebase_config_arg" ] && { [ -z "$client_email_arg" ] || [ -z "$private_key_arg" ] || [ -z "$project_id_arg" ]; }; then
    echo "Missing credentials: provide --firebase-config OR (--client-email, --private-key, --project-id)."
    usage
    exit 1
  fi
fi

parse_service_account_json() {
  local json_path="$1"
  if [ ! -f "$json_path" ]; then
    echo "Firebase/service-account JSON file not found: $json_path"
    exit 1
  fi

  local parsed
  if ! parsed="$(python3 - "$json_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

client_email = data.get("client_email", "")
private_key = data.get("private_key", "")
project_id = data.get("project_id", "")

if not client_email or not private_key or not project_id:
    print("ERROR", end="")
    sys.exit(2)

# Keep \n escapes so resulting JSON is single-line-safe.
private_key_escaped = private_key.replace("\r\n", "\n").replace("\n", "\\n")
print(client_email)
print(private_key_escaped)
print(project_id)
PY
)"; then
    echo "Failed to parse service-account JSON. Ensure it contains client_email, private_key, and project_id."
    exit 1
  fi

  if [ "$parsed" = "ERROR" ]; then
    echo "Service-account JSON missing required keys: client_email, private_key, project_id."
    exit 1
  fi

  client_email="$(printf '%s\n' "$parsed" | sed -n '1p')"
  private_key="$(printf '%s\n' "$parsed" | sed -n '2p')"
  project_id="$(printf '%s\n' "$parsed" | sed -n '3p')"
}

if [ -z "$config_path" ]; then
  echo "No config path selected."
  exit 1
fi

if [ "$non_interactive" = true ] && [ "$client_slug" = "custom" ] && [ -z "$config_path_arg" ]; then
  echo "--config-path is required when --client custom."
  exit 1
fi

if [ -f "$config_path" ]; then
  if [ "$force_overwrite" = false ]; then
    if [ "$non_interactive" = true ]; then
      echo "Config already exists at '$config_path'. Re-run with --force to overwrite."
      exit 1
    fi
    read -r -p "File exists at '$config_path'. Overwrite? (y/N): " response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
      echo "Setup cancelled."
      exit 0
    fi
  fi
fi

echo ""
if [ "$non_interactive" = false ]; then
  read -r -p "Path to Firebase/service-account JSON (optional): " firebase_config_input
  if [ -n "$firebase_config_input" ]; then
    parse_service_account_json "$firebase_config_input"
    echo "Loaded credentials from: $firebase_config_input"
  else
    echo "Enter Google Play service account values."
    echo "Private key should use escaped newlines (\\n), all on one line."
    echo ""
    read -r -p "Service Account Email: " client_email
    read -r -p "Private Key: " private_key
    read -r -p "Project ID: " project_id
  fi
  read -r -p "Default package name (com.example.app): " package_name
else
  if [ -n "$firebase_config_arg" ]; then
    parse_service_account_json "$firebase_config_arg"
  else
    client_email="$client_email_arg"
    private_key="$private_key_arg"
    project_id="$project_id_arg"
  fi
  package_name="$package_name_arg"
fi

if [ -z "${client_email:-}" ] || [ -z "${private_key:-}" ] || [ -z "${project_id:-}" ] || [ -z "${package_name:-}" ]; then
  echo "Missing required values after input parsing."
  exit 1
fi

mkdir -p "$(dirname "$config_path")"

cat > "$config_path" <<EOF
{
  "mcpServers": {
    "google-play-console": {
      "command": "node",
      "args": ["$project_root/dist/index.js"],
      "env": {
        "GOOGLE_PLAY_CLIENT_EMAIL": "$client_email",
        "GOOGLE_PLAY_PRIVATE_KEY": "$private_key",
        "GOOGLE_PLAY_PROJECT_ID": "$project_id",
        "GOOGLE_PLAY_PACKAGE_NAME": "$package_name"
      }
    }
  }
}
EOF

echo ""
echo "Created $client_name MCP config:"
echo "  $config_path"
echo ""
echo "Running setup verification..."
set +e
verify_output="$(
  GOOGLE_PLAY_CLIENT_EMAIL="$client_email" \
  GOOGLE_PLAY_PRIVATE_KEY="$private_key" \
  GOOGLE_PLAY_PROJECT_ID="$project_id" \
  GOOGLE_PLAY_PACKAGE_NAME="$package_name" \
  node --input-type=module -e '
    import { GooglePlayConsoleAPI } from "./dist/api/client.js";
    import { verifySetupPermissions } from "./dist/api/permission-check.js";

    const api = new GooglePlayConsoleAPI({
      clientEmail: process.env.GOOGLE_PLAY_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PLAY_PRIVATE_KEY,
      projectId: process.env.GOOGLE_PLAY_PROJECT_ID,
    });

    const result = await verifySetupPermissions(
      api,
      process.env.GOOGLE_PLAY_PACKAGE_NAME
    );

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  ' 2>&1
)"
verify_status=$?
set -e

echo "$verify_output"
echo ""

if [ "$verify_status" -ne 0 ]; then
  echo "Setup verification failed."
  echo "Fix the reported permissions/API issues, then rerun setup."
  echo "Guide: $project_root/docs/permissions-setup.md"
  exit 1
fi

echo "Setup verification passed."
echo ""
echo "Next steps:"
echo "1) Fully restart $client_name"
echo "2) Ask: \"What apps do I have access to?\""
