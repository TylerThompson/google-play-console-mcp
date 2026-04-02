import { GooglePlayConsoleAPI } from "./client.js";

type SetupErrorKind =
  | "credentials-invalid"
  | "play-console-permission"
  | "reporting-api-disabled"
  | "package-not-found"
  | "server-misconfiguration"
  | "unknown";

export interface SetupErrorClassification {
  kind: SetupErrorKind;
  details: string;
}

export interface SetupPermissionResult {
  ok: boolean;
  checks: {
    appAccess: "ok" | "failed";
    reportingApiAccess: "ok" | "failed";
  };
  requiredPermissions: string[];
  missingPermissions: string[];
  failureReasons?: {
    appAccess?: string;
    reportingApiAccess?: string;
  };
  message?: string;
}

export function classifySetupError(error: unknown): SetupErrorClassification {
  const details = error instanceof Error ? error.message : String(error);
  const lowered = details.toLowerCase();

  if (lowered.includes("does not have permission")) {
    return { kind: "play-console-permission", details };
  }

  if (
    lowered.includes("failed to authenticate with google play console") ||
    lowered.includes("decoder routines::unsupported") ||
    lowered.includes("invalid_grant") ||
    lowered.includes("private key")
  ) {
    return { kind: "credentials-invalid", details };
  }

  if (
    lowered.includes("playdeveloperreporting.googleapis.com") ||
    lowered.includes("developer reporting api has not been used") ||
    lowered.includes("reporting api")
  ) {
    return { kind: "reporting-api-disabled", details };
  }

  if (
    lowered.includes("not found") ||
    lowered.includes("package") && lowered.includes("cannot be found")
  ) {
    return { kind: "package-not-found", details };
  }

  if (lowered.includes("is not a function")) {
    return { kind: "server-misconfiguration", details };
  }

  return { kind: "unknown", details };
}

function buildSetupMessage(appError?: SetupErrorClassification, reportingError?: SetupErrorClassification): string {
  if (appError?.kind === "credentials-invalid" || reportingError?.kind === "credentials-invalid") {
    return "Authentication failed. Verify service account email/private key values, ensure private key newlines are preserved correctly, and confirm the key is active.";
  }

  if (appError?.kind === "play-console-permission") {
    return "Play Console API access check failed. Ensure the service account is linked in Google Play Console API access and granted app permissions (at least View app information).";
  }

  if (appError?.kind === "package-not-found") {
    return "App access check failed. Verify GOOGLE_PLAY_PACKAGE_NAME is correct and the service account can view this app.";
  }

  if (reportingError?.kind === "reporting-api-disabled") {
    return "Reporting API check failed. Enable Google Play Developer Reporting API for the configured GCP project and retry.";
  }

  if (appError?.kind === "server-misconfiguration") {
    return "Server setup appears misconfigured. Verify googleapis client methods and rebuild the MCP server.";
  }

  return "Setup permission checks failed. Verify service account linkage, app permissions, package name, and required Google APIs.";
}

function buildFailureReason(error: SetupErrorClassification | undefined): string | undefined {
  if (!error) {
    return undefined;
  }

  switch (error.kind) {
    case "credentials-invalid":
      return "Service account credentials appear invalid (email/key mismatch, revoked key, or malformed private key with incorrect newline formatting).";
    case "play-console-permission":
      return "Service account is not linked in Play Console API access or lacks app-level permission (View app information).";
    case "reporting-api-disabled":
      return "Google Play Developer Reporting API is disabled or not enabled for this GCP project.";
    case "package-not-found":
      return "Package is not found or service account cannot access this package.";
    case "server-misconfiguration":
      return "MCP server appears misconfigured (unexpected API client method path).";
    default:
      return error.details;
  }
}

export async function verifySetupPermissions(
  api: GooglePlayConsoleAPI,
  packageName: string
): Promise<SetupPermissionResult> {
  let appError: SetupErrorClassification | undefined;
  let reportingError: SetupErrorClassification | undefined;

  try {
    await api.getApp(packageName);
  } catch (error) {
    appError = classifySetupError(error);
  }

  try {
    await api.getCrashRateMetrics(packageName, { timeRange: "7d" });
  } catch (error) {
    reportingError = classifySetupError(error);
  }

  const appAccess = appError ? "failed" : "ok";
  const reportingApiAccess = reportingError ? "failed" : "ok";
  const ok = appAccess === "ok" && reportingApiAccess === "ok";

  if (ok) {
    return {
      ok: true,
      checks: {
        appAccess,
        reportingApiAccess,
      },
      requiredPermissions: [
        "Google Play Console API access linked to this service account",
        "Play Console app permission: View app information (or higher)",
        "Google Play Android Developer API enabled",
        "Google Play Developer Reporting API enabled"
      ],
      missingPermissions: [],
    };
  }

  const missingPermissions: string[] = [];
  const hasCredentialFailure =
    appError?.kind === "credentials-invalid" ||
    reportingError?.kind === "credentials-invalid";

  if (hasCredentialFailure) {
    missingPermissions.push(
      "Valid service account credentials (correct client email + active private key with proper newline formatting)"
    );
  }

  if (appError) {
    if (appError.kind === "play-console-permission" || appError.kind === "package-not-found") {
      missingPermissions.push(
        "Play Console linkage and app permission (View app information or higher)"
      );
    }
  }
  if (reportingError) {
    if (reportingError.kind === "reporting-api-disabled") {
      missingPermissions.push(
        "Google Play Developer Reporting API enabled for the configured GCP project"
      );
    }
  }

  return {
    ok: false,
    checks: {
      appAccess,
      reportingApiAccess,
    },
    requiredPermissions: [
      "Google Play Console API access linked to this service account",
      "Play Console app permission: View app information (or higher)",
      "Google Play Android Developer API enabled",
      "Google Play Developer Reporting API enabled"
    ],
    missingPermissions,
    failureReasons: {
      appAccess: buildFailureReason(appError),
      reportingApiAccess: buildFailureReason(reportingError),
    },
    message: buildSetupMessage(appError, reportingError),
  };
}
