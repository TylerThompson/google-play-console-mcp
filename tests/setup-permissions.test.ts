import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySetupError,
  verifySetupPermissions,
} from "../src/api/permission-check.js";

test("verifySetupPermissions passes when app and reporting checks succeed", async () => {
  const api = {
    getApp: async () => ({ title: "Example App" }),
    getCrashRateMetrics: async () => ({ rows: [] }),
  };

  const result = await verifySetupPermissions(api as any, "com.example.app");

  assert.equal(result.ok, true);
  assert.equal(result.checks.appAccess, "ok");
  assert.equal(result.checks.reportingApiAccess, "ok");
  assert.equal(result.missingPermissions.length, 0);
  assert.equal(result.requiredPermissions.length > 0, true);
});

test("verifySetupPermissions fails when app access is denied", async () => {
  const api = {
    getApp: async () => {
      throw new Error("The caller does not have permission");
    },
    getCrashRateMetrics: async () => ({ rows: [] }),
  };

  const result = await verifySetupPermissions(api as any, "com.example.app");

  assert.equal(result.ok, false);
  assert.equal(result.checks.appAccess, "failed");
  assert.equal(result.missingPermissions.length > 0, true);
  assert.match(
    result.missingPermissions.join(" "),
    /Play Console linkage and app permission/i
  );
  assert.match(result.failureReasons?.appAccess || "", /View app information/i);
  assert.match(result.message || "", /Play Console API access/i);
});

test("verifySetupPermissions fails when Reporting API is disabled", async () => {
  const api = {
    getApp: async () => ({ title: "Example App" }),
    getCrashRateMetrics: async () => {
      throw new Error(
        "Google Play Developer Reporting API has not been used in project 1010596137783 before or it is disabled."
      );
    },
  };

  const result = await verifySetupPermissions(api as any, "com.example.app");

  assert.equal(result.ok, false);
  assert.equal(result.checks.reportingApiAccess, "failed");
  assert.equal(result.missingPermissions.length > 0, true);
  assert.match(
    result.missingPermissions.join(" "),
    /Developer Reporting API enabled/i
  );
  assert.match(result.failureReasons?.reportingApiAccess || "", /disabled/i);
  assert.match(result.message || "", /Reporting API/i);
});

test("classifySetupError identifies permission and reporting issues", () => {
  const permission = classifySetupError(new Error("The caller does not have permission"));
  const reporting = classifySetupError(
    new Error("playdeveloperreporting.googleapis.com is disabled")
  );
  const credentials = classifySetupError(
    new Error("Failed to authenticate with Google Play Console: Error: error:1E08010C:DECODER routines::unsupported")
  );

  assert.equal(permission.kind, "play-console-permission");
  assert.equal(reporting.kind, "reporting-api-disabled");
  assert.equal(credentials.kind, "credentials-invalid");
});

test("classifySetupError does not match reporting API on hostname substrings", () => {
  const spoofedHost = classifySetupError(
    new Error("Request failed: https://evilplaydeveloperreporting.googleapis.com.evil/status")
  );

  assert.equal(spoofedHost.kind, "unknown");
});

test("verifySetupPermissions reports credential formatting failures distinctly", async () => {
  const authError =
    "Failed to authenticate with Google Play Console: Error: error:1E08010C:DECODER routines::unsupported";
  const api = {
    getApp: async () => {
      throw new Error(authError);
    },
    getCrashRateMetrics: async () => {
      throw new Error(authError);
    },
  };

  const result = await verifySetupPermissions(api as any, "com.example.app");

  assert.equal(result.ok, false);
  assert.match(result.message || "", /Authentication failed/i);
  assert.match(
    result.missingPermissions.join(" "),
    /Valid service account credentials/i
  );
});
