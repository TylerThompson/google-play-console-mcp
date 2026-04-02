/**
 * Invoke any method on the googleapis androidpublisher v3 client using dot notation
 * that mirrors the Node client layout (e.g. edits.tracks.list, inappproducts.get).
 */

const ROOT_RESOURCES = new Set([
  "applications",
  "apprecovery",
  "edits",
  "externaltransactions",
  "generatedapks",
  "grants",
  "inappproducts",
  "internalappsharingartifacts",
  "monetization",
  "orders",
  "purchases",
  "reviews",
  "systemapks",
  "users",
]);

const BLOCKED_SEGMENTS = new Set([
  "context",
  "constructor",
  "prototype",
  "__proto__",
  "google",
]);

const SEGMENT_RE = /^[a-zA-Z][a-zA-Z0-9]*$/;

function assertSafeParams(params: Record<string, unknown>): void {
  if (params.media != null && typeof params.media === "object") {
    const m = params.media as Record<string, unknown>;
    if ("body" in m) {
      throw new Error(
        "Parameters include media.body: binary uploads (APK, App Bundle, deobfuscation, internal sharing) are not supported through MCP. Use Play Console or a custom script."
      );
    }
  }
}

export async function invokeAndroidPublisherOperation(
  publisher: any,
  operation: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const trimmed = operation.trim();
  if (!trimmed) {
    throw new Error("operation is required (e.g. edits.tracks.list)");
  }

  const parts = trimmed.split(".").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      "operation must be resource.path.to.method with at least two segments (e.g. edits.insert, purchases.subscriptionsv2.get)"
    );
  }

  for (const p of parts) {
    if (!SEGMENT_RE.test(p) || BLOCKED_SEGMENTS.has(p)) {
      throw new Error(`Invalid path segment: ${p}`);
    }
  }

  const root = parts[0];
  if (!ROOT_RESOURCES.has(root)) {
    throw new Error(
      `Unknown API root "${root}". Allowed roots: ${[...ROOT_RESOURCES].sort().join(", ")}`
    );
  }

  const methodName = parts[parts.length - 1];
  const resourcePath = parts.slice(0, -1);

  let target: any = publisher;
  for (let i = 0; i < resourcePath.length; i++) {
    const seg = resourcePath[i];
    target = target[seg];
    if (target == null || (typeof target !== "object" && typeof target !== "function")) {
      throw new Error(`No resource at "${resourcePath.slice(0, i + 1).join(".")}"`);
    }
  }

  const fn = target[methodName];
  if (typeof fn !== "function") {
    throw new Error(`No method "${methodName}" on ${resourcePath.join(".")}`);
  }

  assertSafeParams(params);

  return Promise.resolve(fn.call(target, params)).then((res: { data?: unknown }) =>
    res && "data" in res ? res.data : { ok: true }
  );
}

export function getAndroidPublisherRootResources(): string[] {
  return [...ROOT_RESOURCES].sort();
}

export function buildAndroidPublisherHelp(): string {
  const roots = getAndroidPublisherRootResources().join(", ");
  return [
    "Google Play Android Developer API (androidpublisher v3) — use tool `android_publisher_invoke`.",
    "",
    `Top-level client resources: ${roots}.`,
    "",
    "Operation string: dot-separated path ending with the method name, matching the Node googleapis layout.",
    "Examples:",
    "  edits.insert — params: { packageName } → returns edit with id",
    "  edits.tracks.list — params: { packageName, editId }",
    "  edits.bundles.list — params: { packageName, editId }",
    "  edits.details.get — params: { packageName, editId }",
    "  edits.listings.list — params: { packageName, editId }",
    "  inappproducts.list — params: { packageName, token? }",
    "  monetization.subscriptions.list — params: { packageName }",
    "  reviews.list — params: { packageName, maxResults?, token? }",
    "  reviews.get — params: { packageName, reviewId }",
    "  applications.deviceTierConfigs.list — params: { packageName }",
    "  purchases.subscriptionsv2.get — params: { packageName, token }",
    "  purchases.voidedpurchases.list — params: { packageName, ... }",
    "",
    "Nested names are camelCase (e.g. deviceTierConfigs, subscriptionsv2, voidedpurchases).",
    "Some methods use lowercase names (e.g. externaltransactions.createexternaltransaction).",
    "",
    "Full REST reference: https://developers.google.com/android-publisher/api-ref/rest/v3",
    "",
    "Limits: requests with media.body (APK/bundle/deobfuscation uploads) are rejected; use Play Console for binaries.",
    "Write operations (commit, patch, refund, etc.) need matching Play Console API permissions; they can change live data.",
  ].join("\n");
}
