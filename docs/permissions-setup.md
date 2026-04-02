# Google Play Permissions Setup Guide

Use this guide when `verify_setup` or `setup.sh` reports missing permissions or authentication failures.

## What must be configured

Your MCP setup needs all of the following:

1. A valid Google Cloud service account key (`client_email`, `private_key`, `project_id`)
2. Google Play Console API access linked to that service account
3. App-level Play Console permission (minimum: **View app information**)
4. Google APIs enabled in the same GCP project:
   - Google Play Android Developer API
   - Google Play Developer Reporting API

## Step 1: Create service account and key

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select the project that should own your Play API access.
3. Go to **IAM & Admin** -> **Service Accounts**.
4. Create (or select) a service account.
5. Create a JSON key and download it.
6. Confirm the JSON contains:
   - `client_email`
   - `private_key`
   - `project_id`

## Step 2: Enable required Google APIs

In the same GCP project:

1. Open **APIs & Services** -> **Library**.
2. Enable:
   - **Google Play Android Developer API**
   - **Google Play Developer Reporting API**

If you just enabled an API, wait a few minutes before retrying setup.

## Step 3: Link service account in Play Console

1. Open [Google Play Console](https://play.google.com/console/).
2. Go to **Setup** -> **API access**.
3. Link the same Google Cloud project.
4. Grant access to the service account.
5. Ensure app-level permission includes at least:
   - **View app information**

If you want broader tooling support, grant additional read permissions as needed.

## Step 4: Verify package and credentials

When running setup:

- Use the correct package name (example: `com.example.app`)
- Use the JSON key from Step 1 (or pass values directly)

## Common failure messages and fixes

### "credentials-invalid" / "Authentication failed"

Usually means one of:

- Key revoked or deleted
- Email/key mismatch (service account email from one key, private key from another)
- Private key formatting issue

Fixes:

1. Regenerate a fresh JSON key in Google Cloud.
2. Use the JSON file directly with:
   - `./setup.sh --firebase-config "/path/to/key.json" ...`
3. If passing `--private-key` manually, preserve newlines correctly.
   - The script expects escaped `\n` sequences when passed as a CLI arg.

If setup verification showed **credentials-invalid** or OpenSSL **DECODER** errors even though Play Console permissions are correct, the private key may have been passed with literal `\n` characters instead of real newlines. The MCP server now normalizes that automatically; rebuild (`npm run build`) and run `./setup.sh` again.

### "play-console-permission"

The service account is not properly linked in Play Console, or lacks app permission.

Fix:

- Revisit **Play Console -> Setup -> API access**
- Re-link project/account
- Grant at least **View app information** for the app

### "reporting-api-disabled"

The Reporting API is not enabled in GCP.

Fix:

- Enable **Google Play Developer Reporting API** in **APIs & Services**.

### "package-not-found"

The package name is wrong, or the service account cannot access that app.

Fix:

- Verify `GOOGLE_PLAY_PACKAGE_NAME`
- Confirm app-level permissions cover the target app

## Validate after changes

Run setup again and confirm verification passes:

```bash
./setup.sh
```

Or run the same check without re-writing MCP config:

```bash
npm run verify:permissions -- ./path/to/service-account.json com.example.app
```

(You can also use `GOOGLE_PLAY_*` env vars instead of the JSON path.)

Or use the MCP tool directly:

```json
{
  "tool": "verify_setup",
  "arguments": {
    "packageName": "com.example.app"
  }
}
```
