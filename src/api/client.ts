import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { invokeAndroidPublisherOperation } from "./android-publisher-invoke.js";

export interface GooglePlayCredentials {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

function normalizePrivateKey(key: string): string {
  // JSON / setup.sh often store PEM as one line with literal "\n" pairs; JWT needs real newlines.
  if (key.includes("\\n")) {
    return key.replace(/\\n/g, "\n");
  }
  return key;
}

export class GooglePlayConsoleAPI {
  private auth: JWT;
  private androidPublisher: any;
  private playDeveloperReporting: any;

  constructor(credentials: GooglePlayCredentials) {
    const privateKey = normalizePrivateKey(credentials.privateKey);
    this.auth = new JWT({
      email: credentials.clientEmail,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/androidpublisher",
        "https://www.googleapis.com/auth/playdeveloperreporting",
      ],
      projectId: credentials.projectId,
    });

    this.androidPublisher = google.androidpublisher({ version: "v3", auth: this.auth });
    this.playDeveloperReporting = google.playdeveloperreporting({ version: "v1beta1", auth: this.auth });
  }

  async authenticate(): Promise<void> {
    try {
      await this.auth.authorize();
    } catch (error) {
      throw new Error(`Failed to authenticate with Google Play Console: ${error}`);
    }
  }

  /**
   * Confirms Android Publisher access for the package (edits + details).
   * v3 has no applications.get; we use edits.insert + edits.details.get.
   */
  async getApp(packageName: string) {
    await this.authenticate();
    const insertRes = await this.androidPublisher.edits.insert({
      packageName,
      requestBody: {},
    });
    const editId = insertRes.data.id;
    if (!editId) {
      throw new Error("Android Publisher edits.insert did not return an edit id");
    }
    const detailsRes = await this.androidPublisher.edits.details.get({
      packageName,
      editId,
    });
    return { ...detailsRes.data, packageName };
  }

  async getEdit(packageName: string, editId?: string) {
    await this.authenticate();
    if (editId) {
      return await this.androidPublisher.edits.get({
        packageName,
        editId,
      });
    }
    return await this.androidPublisher.edits.insert({
      packageName,
      requestBody: {},
    });
  }

  async getTracks(packageName: string, editId: string) {
    await this.authenticate();
    const response = await this.androidPublisher.edits.tracks.get({
      packageName,
      editId,
    });
    return response.data;
  }

  async getApks(packageName: string, editId: string) {
    await this.authenticate();
    const response = await this.androidPublisher.edits.apks.get({
      packageName,
      editId,
    });
    return response.data;
  }

  async getRelease(packageName: string, editId: string, track: string) {
    await this.authenticate();
    const response = await this.androidPublisher.edits.tracks.get({
      packageName,
      editId,
      track,
    });
    return response.data;
  }

  /** Lists accessible apps; optional text filter is applied client-side in tools. */
  async searchApps(_query: string, pageSize: number = 100) {
    await this.authenticate();
    const response = await this.playDeveloperReporting.apps.search({
      pageSize: Math.min(pageSize, 1000),
    });
    return response.data;
  }

  async getCrashRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.crashrate.query({
      name: `apps/${packageName}/crashRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["crashRate", "distinctUsers"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  async getANRRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.anrrate.query({
      name: `apps/${packageName}/anrRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["anrRate", "distinctUsers"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  /** One page of Play Console reviews (star ratings and text). Used to aggregate rating stats. */
  async listReviewsPage(
    packageName: string,
    options: { maxResults?: number; token?: string; translationLanguage?: string } = {}
  ) {
    await this.authenticate();
    const response = await this.androidPublisher.reviews.list({
      packageName,
      maxResults: options.maxResults ?? 100,
      token: options.token,
      translationLanguage: options.translationLanguage,
    });
    return response.data;
  }

  async getErrorCountMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.errors.counts.query({
      name: `apps/${packageName}/errorCountMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["errorReportCount"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  async searchErrorIssues(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildErrorIssuesFilter(filters);
    const response = await this.playDeveloperReporting.vitals.errors.issues.search({
      parent: `apps/${packageName}`,
      filter: filter || undefined,
      pageSize: filters.pageSize || 20,
      pageToken: filters.pageToken,
    });
    return response.data;
  }

  async searchErrorReports(packageName: string, issueId: string, filters: any = {}) {
    await this.authenticate();
    const parts = [`errorIssueId = ${issueId}`];
    const extra = this.buildErrorReportsFilter(filters);
    if (extra) {
      parts.push(`(${extra})`);
    }
    const filter = parts.join(" AND ");
    const response = await this.playDeveloperReporting.vitals.errors.reports.search({
      parent: `apps/${packageName}`,
      filter,
      pageSize: filters.pageSize || 20,
      pageToken: filters.pageToken,
    });
    return response.data;
  }

  async getExcessiveWakeupRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.excessivewakeuprate.query({
      name: `apps/${packageName}/excessiveWakeupRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["excessiveWakeupRate"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  async getSlowRenderingRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.slowrenderingrate.query({
      name: `apps/${packageName}/slowRenderingRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["slowRenderingRate"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  async getSlowStartRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.slowstartrate.query({
      name: `apps/${packageName}/slowStartRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["slowStartRate"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  async getStuckBackgroundWakelockRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.stuckbackgroundwakelockrate.query({
      name: `apps/${packageName}/stuckBackgroundWakelockRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["stuckBackgroundWakelockRate"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  async getLMKRateMetrics(packageName: string, filters: any = {}) {
    await this.authenticate();
    const filter = this.buildReportingFilter(filters);
    const response = await this.playDeveloperReporting.vitals.lmkrate.query({
      name: `apps/${packageName}/lowMemoryKillerRateMetricSet`,
      requestBody: {
        dimensions: this.buildReportingDimensions(filters),
        metrics: ["lowMemoryKillerRate"],
        ...(filter ? { filter } : {}),
        timelineSpec: this.buildDailyTimelineSpec(filters.timeRange || "7d"),
        pageSize: 1000,
      },
    });
    return response.data;
  }

  private toLaDateOnly(d: Date): {
    year: number;
    month: number;
    day: number;
    timeZone: { id: string };
  } {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(d);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return { year, month, day, timeZone: { id: "America/Los_Angeles" } };
  }

  /** Daily timelines for vitals metric sets require America/Los_Angeles (API constraint). */
  private buildDailyTimelineSpec(timeRange: string) {
    const now = new Date();
    const days =
      timeRange === "1d"
        ? 1
        : timeRange === "30d"
          ? 30
          : timeRange === "90d"
            ? 90
            : 7;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    return {
      aggregationPeriod: "DAILY",
      startTime: this.toLaDateOnly(start),
      // Exclusive end must stay within Reporting API "freshness" (using "tomorrow" often exceeds it).
      endTime: this.toLaDateOnly(now),
    };
  }

  private buildReportingDimensions(filters: any): string[] {
    const dimensions: string[] = [];
    if (filters.versionCode) {
      dimensions.push("versionCode");
    }
    if (filters.apiLevel) {
      dimensions.push("apiLevel");
    }
    if (filters.deviceModel) {
      dimensions.push("deviceModel");
    }
    if (filters.country) {
      dimensions.push("countryCode");
    }
    return dimensions;
  }

  /** AIP-160 style filter for Play Developer Reporting query endpoints. */
  private buildReportingFilter(filters: any): string | undefined {
    const escapeFilterString = (value: unknown): string =>
      String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

    const parts: string[] = [];
    if (filters.versionCode != null && filters.versionCode !== "") {
      parts.push(`versionCode = ${filters.versionCode}`);
    }
    if (filters.apiLevel != null && filters.apiLevel !== "") {
      parts.push(`apiLevel = ${filters.apiLevel}`);
    }
    if (filters.deviceModel) {
      parts.push(`deviceModel = "${escapeFilterString(filters.deviceModel)}"`);
    }
    if (filters.country) {
      parts.push(`countryCode = "${escapeFilterString(filters.country)}"`);
    }
    return parts.length ? parts.join(" AND ") : undefined;
  }

  private buildErrorIssuesFilter(filters: any): string | undefined {
    const escapeFilterString = (value: unknown): string =>
      String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

    const parts: string[] = [];
    if (filters.versionCode != null && filters.versionCode !== "") {
      parts.push(`versionCode = ${filters.versionCode}`);
    }
    if (filters.apiLevel != null && filters.apiLevel !== "") {
      parts.push(`apiLevel = ${filters.apiLevel}`);
    }
    if (filters.deviceModel) {
      parts.push(`deviceModel = "${escapeFilterString(filters.deviceModel)}"`);
    }
    return parts.length ? parts.join(" AND ") : undefined;
  }

  private buildErrorReportsFilter(filters: any): string | undefined {
    return this.buildErrorIssuesFilter(filters);
  }

  /**
   * Call any Android Publisher API v3 method using dot notation matching the googleapis client
   * (e.g. edits.tracks.list, inappproducts.get, monetization.subscriptions.list).
   */
  async invokeAndroidPublisher(
    operation: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    await this.authenticate();
    return invokeAndroidPublisherOperation(this.androidPublisher, operation, params);
  }
}
