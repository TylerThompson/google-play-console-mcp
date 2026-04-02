# Google Play Console MCP Server

An MCP (Model Context Protocol) server that provides access to Google Play Console analytics and reporting data. This server allows you to query app metrics, crash reports, ANR data, and performance insights directly from your Google Play Console account.

## Features

- **App overview**: Vitals-based user reach (`distinctUsers`), crash/ANR rates with estimated affected users, and review-derived ratings (Play does not expose install/acquisition counts through these APIs; the tool returns `notes` explaining that)
- **Play Developer Reporting**: Crash and ANR rates, error counts/issues/reports, and performance vitals (wakeups, slow rendering/startup, wakelocks, LMK)
- **Android Publisher API**: Full access via **`android_publisher_invoke`** (tracks, listings, bundles, in-app products, subscriptions, reviews, purchases, orders, and more—see **`android_publisher_help`** and the [official REST reference](https://developers.google.com/android-publisher/api-ref/rest/v3))
- **App search**: Find apps linked to your Play Console account
- **Setup verification**: Confirm credentials and API access with **`verify_setup`**

## Prerequisites

1. **Google Play Console Account**: You need access to a Google Play Console account with at least one published app
2. **Service Account**: Create a service account in Google Cloud Console with access to the Google Play Developer API
3. **API Access**: Enable the Google Play Developer API and Play Developer Reporting API in your Google Cloud project

## Setup

### 1. Create a Service Account

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Go to "IAM & Admin" → "Service Accounts"
4. Click "Create Service Account"
5. Give it a name (e.g., "play-console-api")
6. Grant it the "Play Developer Admin" role or appropriate permissions
7. Click "Done"

### 2. Generate Service Account Key

1. Find your service account in the list
2. Click the three dots → "Manage keys"
3. Click "Add Key" → "Create new key"
4. Choose "JSON" format
5. Download the key file and keep it secure

### 3. Grant API Access

1. Go to the [Google Play Console](https://play.google.com/console)
2. Select your app
3. Go to "Setup" → "API access"
4. Click "Create Service Account"
5. Follow the instructions to link your service account
6. Grant the necessary permissions (at minimum: "View app information")

### 4. Install the MCP Server

```bash
cd /path/to/your/mcp-servers
git clone git@github.com:TylerThompson/google-play-console-mcp.git
cd mcp-google-play-console
npm install
npm run build
```

### 5. Generate your MCP config automatically

Run the setup script and choose your client/editor (Cursor, Claude Code, Claude Desktop, Windsurf, or Antigravity). It generates exactly one config file for that client.

```bash
./setup.sh
```

The script writes a valid `mcpServers` entry using your credentials and your local `dist/index.js` path.

For CI/onboarding scripts, you can run setup non-interactively:

```bash
./setup.sh --non-interactive \
  --client cursor \
  --firebase-config "/path/to/service-account.json" \
  --package-name "com.example.yourapp" \
  --force
```

You can also pass `--client-email`, `--private-key`, and `--project-id` directly instead of `--firebase-config`.

## Usage

This server uses **MCP over stdio** (spawn `node` with the compiled `dist/index.js`). Any client that supports the standard `mcpServers` block—`command`, `args`, and optional `env`—can run it.

**Before configuring a client:** run `npm install && npm run build` and use an **absolute path** to `dist/index.js` in `args` (unless your client documents a reliable working directory).

### MCP client config locations

| Client | Where to add the server |
|--------|-------------------------|
| **Cursor** | **Project:** `.cursor/mcp.json` · **User:** `~/.cursor/mcp.json` (macOS/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows). Cursor merges both; project entries override user entries with the same name. |
| **Claude Code** | **Project (git-friendly):** `.mcp.json` in the repo root · **User/local:** `~/.claude.json`. Supports `${VAR}` and `${VAR:-default}` in `.mcp.json`—see [Claude Code MCP](https://docs.claude.com/en/docs/claude-code/mcp). You can also run `claude mcp add --transport stdio <name> -- node /path/to/dist/index.js` and pass secrets via `--env` flags. |
| **Claude Desktop** | **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json` · **Windows:** `%APPDATA%\Claude\claude_desktop_config.json` · **Linux:** `~/.config/Claude/claude_desktop_config.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows), or **Command Palette** → “Windsurf: Configure MCP Servers”. |
| **Google Antigravity** | `~/.gemini/antigravity/mcp_config.json` (macOS/Linux) or `%UserProfile%\.gemini\antigravity\mcp_config.json` (Windows). Open Antigravity once so the folder exists. See [Antigravity MCP](https://antigravity.google/docs/mcp). |

Use the same `mcpServers` JSON shape for all of the above: merge the generated object into your file’s existing `mcpServers` if you already have other servers.

**After editing config:** fully restart the app (quit, not just close the window) so it reloads MCP.

### Example `mcpServers` entry (generated by `setup.sh`)

```json
{
  "mcpServers": {
    "google-play-console": {
      "command": "node",
      "args": ["/absolute/path/to/google-play-console-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PLAY_CLIENT_EMAIL": "your-service-account@your-project.iam.gserviceaccount.com",
        "GOOGLE_PLAY_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
        "GOOGLE_PLAY_PROJECT_ID": "your-project-id",
        "GOOGLE_PLAY_PACKAGE_NAME": "com.example.yourapp"
      }
    }
  }
}
```

### Available Tools

#### `get_app_overview`
Snapshot of vitals and reviews: crash/ANR rates, affected users (from `distinctUsers`), active-user-style rollups from vitals, ratings from `reviews.list`, plus `notes` (install counts are not available from Google APIs here).

**Parameters:**
- `packageName` (optional): Package name of the app
- `timeRange` (optional): Time range for metrics ("7d", "30d", "90d")

#### `get_crash_metrics`
Get crash rate metrics for your app with detailed breakdowns.

**Parameters:**
- `packageName` (optional): Package name of the app
- `versionCode` (optional): Filter by specific app version code
- `apiLevel` (optional): Filter by Android API level
- `deviceModel` (optional): Filter by device model
- `country` (optional): Filter by country code
- `timeRange` (optional): Time range for metrics ("1d", "7d", "30d")

#### `get_anr_metrics`
Get ANR (Application Not Responding) rate metrics for your app.

**Parameters:** Same as `get_crash_metrics`

#### `get_error_counts`
Get error count metrics for your app.

**Parameters:** Same as `get_crash_metrics`

#### `get_error_issues`
Search and list error issues for your app.

**Parameters:**
- Same as `get_crash_metrics`
- `pageSize` (optional): Number of results to return (default: 20)
- `pageToken` (optional): Pagination token for next page

#### `get_error_reports`
Get detailed error reports for a specific error issue.

**Parameters:**
- `packageName` (optional): Package name of the app
- `issueId` (required): ID of the error issue to get reports for
- Same filters as `get_crash_metrics`
- `pageSize` (optional): Number of results to return (default: 20)
- `pageToken` (optional): Pagination token for next page

#### `get_performance_metrics`
Get performance metrics (excessive wakeups, slow rendering, slow starts, etc.).

**Parameters:**
- `packageName` (optional): Package name of the app
- `metricType` (required): Type of performance metric to retrieve
  - "excessivewakeuprate"
  - "slowrenderingrate"
  - "slowstartrate"
  - "stuckbackgroundwakelockrate"
  - "lmkrate"
- Same filters as `get_crash_metrics`

#### `search_apps`
Search for apps in your Google Play Console account.

**Parameters:**
- `query` (required): Search query to find apps
- `pageSize` (optional): Number of results to return (default: 10)

#### `verify_setup`
Verify setup and permissions for your service account and app access.

**Checks performed:**
- Play Console app access (`getApp` call works)
- Play Developer Reporting API access (`getCrashRateMetrics` call works)

**Parameters:**
- `packageName` (optional): Package name of the app (uses configured package by default)

#### `android_publisher_help`
Returns usage notes for **`android_publisher_invoke`**: allowed API roots, path examples, and a link to the [Android Publisher API v3 REST reference](https://developers.google.com/android-publisher/api-ref/rest/v3).

#### `android_publisher_invoke`
Call any **googleapis** `androidpublisher` v3 method using dot notation (`edits.tracks.list`, `inappproducts.get`, `monetization.subscriptions.list`, etc.). Pass method parameters in **`requestParams`**. Binary uploads that require `media.body` are not supported through this tool.

**Parameters:**
- `operation` (required): e.g. `edits.insert`, `edits.bundles.list`, `reviews.reply`
- `requestParams` (optional): Same fields the API expects (`packageName`, `editId`, `track`, `requestBody`, `token`, …)
- `packageName` (optional): Fills `requestParams.packageName` when omitted there; otherwise the configured default package is used

Grant your service account the **Play Console permissions** that match what you call (view vs manage releases, financial data, etc.). See [permissions-setup.md](./docs/permissions-setup.md).

## Questions you can ask (for rich answers)

Ask your MCP-connected assistant in plain language. It should pick the right tools, chain calls when needed (for example `edits.insert` → `edits.tracks.list` → `edits.delete` for a read-only draft), and interpret `notes` and API errors.

### Stability, errors, and performance (Reporting API tools)

- *“Give me a health overview of my app for the last 30 days—crashes, ANRs, ratings, and anything I should know from the notes field.”* → `get_app_overview`
- *“What’s our crash rate over the last 7 days, and roughly how many users are affected?”* → `get_crash_metrics` (and overview for `distinctUsers`-based context)
- *“Are ANRs getting worse? Show ANR metrics for the last 30 days.”* → `get_anr_metrics`
- *“List the top Play error issues from the last week and summarize patterns.”* → `get_error_issues` (then drill in with `get_error_reports` on an `issueId`)
- *“Pull detailed stack traces / reports for error issue X.”* → `get_error_reports` with that `issueId`
- *“How noisy are platform error reports this week?”* → `get_error_counts`
- *“Are we seeing slow cold starts or excessive wakeups?”* → `get_performance_metrics` for `slowstartrate`, `excessivewakeuprate`, etc.
- *“Compare crash signals for version code 420 vs 430 in the US.”* → `get_crash_metrics` with `versionCode` and `country` filters

### Store presence, releases, and artifacts (Android Publisher)

Use **`android_publisher_help`** once if the model needs path examples, then **`android_publisher_invoke`**.

- *“What tracks exist and what’s rolled out on production (versions, rollout %)?”* → `edits.insert` then `edits.tracks.list` and/or `edits.tracks.get` with `track: "production"` (discard the edit with `edits.delete` if you only wanted a read)
- *“What App Bundles or APKs are attached to this edit?”* → `edits.bundles.list`, `edits.apks.list`
- *“What are our default listing title and short description?”* → `edits.listings.list` / `edits.listings.get` with `language`
- *“Which countries is this track available in?”* → `edits.countryavailability.get` with `track`
- *“List device tier configs for this app.”* → `applications.deviceTierConfigs.list`

### Monetization and catalog

- *“List all in-app products (SKUs) for the package.”* → `inappproducts.list` (paginate with `token` in `requestParams` if needed)
- *“Show details for SKU `premium_unlock`.”* → `inappproducts.get` with `sku`
- *“List subscription products and inspect a specific subscription’s base plans and offers.”* → `monetization.subscriptions.list`, then `monetization.subscriptions.get` with `productId` (use `android_publisher_help` and the [REST docs](https://developers.google.com/android-publisher/api-ref/rest/v3) for `basePlans` / `offers` sub-resources)

### Reviews

- *“Summarize recent reviews: themes, star distribution, and rough sentiment.”* → `reviews.list` via **`android_publisher_invoke`** (the overview tool already aggregates some rating stats but listing gives text)
- *“Fetch the full text of review id …”* → `reviews.get` with `reviewId`

### Purchases, subscriptions, and orders (sensitive)

Only if your service account has the right **financial / order** permissions.

- *“Look up subscription state for purchase token …”* → `purchases.subscriptionsv2.get` with `token`
- *“List recent voided purchases.”* → `purchases.voidedpurchases.list` with the required time/query params from the REST docs

### Discovery and setup

- *“Which Play apps can this account see? Search for ‘Wisco’.”* → `search_apps`
- *“Is our MCP setup valid for reporting and this package?”* → `verify_setup`

### What you cannot answer from this MCP alone

- *“Exact Play Console install / acquisition / revenue dashboards”* — not exposed on Developer Reporting + Publisher the same way as the Statistics UI; use Play Console or an export/BigQuery pipeline, then wire that data to your assistant separately.

## Example tool calls (JSON)

### Overview and vitals

```json
{
  "tool": "get_app_overview",
  "arguments": {
    "timeRange": "30d"
  }
}
```

### Crashes for a specific version

```json
{
  "tool": "get_crash_metrics",
  "arguments": {
    "versionCode": "123",
    "timeRange": "7d"
  }
}
```

### Error issues then drill-down

```json
{
  "tool": "get_error_issues",
  "arguments": {
    "timeRange": "7d",
    "pageSize": 10
  }
}
```

```json
{
  "tool": "get_error_reports",
  "arguments": {
    "issueId": "abc123def456",
    "pageSize": 5
  }
}
```

### Production track (Publisher API: create edit → list tracks → delete edit)

```json
{
  "tool": "android_publisher_invoke",
  "arguments": {
    "operation": "edits.insert",
    "requestParams": {}
  }
}
```

```json
{
  "tool": "android_publisher_invoke",
  "arguments": {
    "operation": "edits.tracks.get",
    "requestParams": {
      "editId": "<id-from-insert>",
      "track": "production"
    }
  }
}
```

```json
{
  "tool": "android_publisher_invoke",
  "arguments": {
    "operation": "edits.delete",
    "requestParams": {
      "editId": "<same-id>"
    }
  }
}
```

### List in-app products

```json
{
  "tool": "android_publisher_invoke",
  "arguments": {
    "operation": "inappproducts.list",
    "requestParams": {}
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure your service account has the correct permissions and is linked to your Google Play Console
2. **App Not Found**: Verify the package name is correct and you have access to the app
3. **Rate Limiting**: The Google Play APIs have rate limits. If you hit them, wait a few minutes before trying again
4. **Missing Data**: Some metrics may not be available if your app doesn't have enough users or data

For full permission setup and validation guidance, see:
- [Google Play Permissions Setup Guide](./docs/permissions-setup.md)

### Debug Mode

Run the server in debug mode to see detailed logs:

```bash
DEBUG=* npm run dev
```

## Development

### Building

```bash
npm run build
```

### Running in Development

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Verify Play permissions (no config rewrite)

```bash
npm run verify:permissions -- /path/to/service-account.json com.example.app
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section above
- File an issue on the GitHub repository
- Review the Google Play Developer API documentation
