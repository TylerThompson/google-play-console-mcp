/**
 * Standalone Play + Reporting permission check (same logic as setup.sh / verify_setup).
 *
 * Usage:
 *   export GOOGLE_PLAY_CLIENT_EMAIL=...
 *   export GOOGLE_PLAY_PRIVATE_KEY='-----BEGIN...'   # or literal \n escapes
 *   export GOOGLE_PLAY_PROJECT_ID=...
 *   export GOOGLE_PLAY_PACKAGE_NAME=com.example.app
 *   npm run verify:permissions
 *
 * Or pass a service-account JSON path:
 *   npm run verify:permissions -- path/to/key.json com.example.app
 */
import fs from "node:fs";
import path from "node:path";
import { GooglePlayConsoleAPI } from "../src/api/client.js";
import { verifySetupPermissions } from "../src/api/permission-check.js";

function normalizePrivateKey(key: string): string {
  if (key.includes("\\n")) {
    return key.replace(/\\n/g, "\n");
  }
  return key;
}

function loadJsonCredentials(filePath: string): {
  clientEmail: string;
  privateKey: string;
  projectId: string;
} {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf-8");
  const data = JSON.parse(raw) as {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };
  if (!data.client_email || !data.private_key || !data.project_id) {
    throw new Error("JSON must include client_email, private_key, and project_id");
  }
  return {
    clientEmail: data.client_email,
    privateKey: normalizePrivateKey(data.private_key),
    projectId: data.project_id,
  };
}

async function main() {
  const jsonPath = process.argv[2];
  const packageArg = process.argv[3];

  let clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL || "";
  let privateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY || "";
  let projectId = process.env.GOOGLE_PLAY_PROJECT_ID || "";
  let packageName = packageArg || process.env.GOOGLE_PLAY_PACKAGE_NAME || "";

  if (jsonPath) {
    const loaded = loadJsonCredentials(jsonPath);
    clientEmail = clientEmail || loaded.clientEmail;
    privateKey = privateKey || loaded.privateKey;
    projectId = projectId || loaded.projectId;
  }

  privateKey = normalizePrivateKey(privateKey);

  if (!clientEmail || !privateKey || !projectId || !packageName) {
    console.error(
      "Missing credentials or package name.\n" +
        "Set GOOGLE_PLAY_CLIENT_EMAIL, GOOGLE_PLAY_PRIVATE_KEY, GOOGLE_PLAY_PROJECT_ID, GOOGLE_PLAY_PACKAGE_NAME\n" +
        "Or run: npm run verify:permissions -- /path/to/service-account.json com.example.app"
    );
    process.exit(1);
  }

  const api = new GooglePlayConsoleAPI({
    clientEmail,
    privateKey,
    projectId,
  });

  const result = await verifySetupPermissions(api, packageName);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
