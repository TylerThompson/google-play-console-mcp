import { GooglePlayConsoleAPI } from "./client.js";

/** Play Developer Reporting returns metrics as decimalValue.value, not values[]. */
function readReportingMetricValue(row: any, index = 0): number {
  const m = row?.metrics?.[index];
  return metricValueToNumber(m);
}

function metricValueToNumber(m: any): number {
  if (!m) {
    return 0;
  }
  const dec = m.decimalValue?.value;
  if (dec !== undefined && dec !== null) {
    const n = parseFloat(String(dec));
    return Number.isFinite(n) ? n : 0;
  }
  const legacy = m.values?.[0];
  if (typeof legacy === "number") {
    return legacy;
  }
  if (typeof legacy === "string") {
    return parseFloat(legacy) || 0;
  }
  return 0;
}

/** Prefer named metric from Reporting API rows; fall back to index-based reads. */
function readNamedMetric(row: any, metricName: string): number | undefined {
  const list = row?.metrics;
  if (!Array.isArray(list)) {
    return undefined;
  }
  const found = list.find((x: any) => x.metric === metricName);
  if (!found) {
    return undefined;
  }
  return metricValueToNumber(found);
}

function readVitalsRate(row: any, metricName: string): number {
  return readNamedMetric(row, metricName) ?? readReportingMetricValue(row, 0);
}

function readDistinctUsers(row: any): number {
  const n = readNamedMetric(row, "distinctUsers");
  return n !== undefined ? n : 0;
}

function rowStartDateKey(row: any): number {
  const t = row?.startTime;
  if (!t || t.year == null || t.month == null || t.day == null) {
    return 0;
  }
  return t.year * 10000 + t.month * 100 + t.day;
}

function sortMetricsRowsByStartDate(rows: any[]): any[] {
  return [...rows].sort((a, b) => rowStartDateKey(a) - rowStartDateKey(b));
}

/** Rate is a fraction of users (e.g. 0.012); if API returns percent (>1), scale down. */
function affectedUsersFromRate(rate: number, distinctUsers: number): number {
  if (distinctUsers <= 0 || rate <= 0) {
    return 0;
  }
  const r = rate > 1 ? rate / 100 : rate;
  return Math.round(r * distinctUsers);
}

const REVIEW_AGGREGATION_MAX_PAGES = 200;

async function aggregateReviewRatings(
  api: GooglePlayConsoleAPI,
  packageName: string
): Promise<{
  average: number;
  totalListedByPlay: number;
  distribution: Record<string, number>;
  scannedReviews: number;
  aggregationPartial: boolean;
}> {
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let totalListedByPlay: number | null = null;
  let token: string | undefined;
  let starSum = 0;
  let starCount = 0;
  let pages = 0;
  let aggregationPartial = false;

  do {
    const page = await api.listReviewsPage(packageName, {
      maxResults: 100,
      token,
    });
    pages++;
    if (page.pageInfo?.totalResults != null && totalListedByPlay === null) {
      totalListedByPlay = Number(page.pageInfo.totalResults);
    }
    for (const rev of page.reviews ?? []) {
      const star = rev.comments?.[0]?.userComment?.starRating;
      if (typeof star === "number" && star >= 1 && star <= 5) {
        const k = String(star);
        distribution[k] = (distribution[k] ?? 0) + 1;
        starSum += star;
        starCount++;
      }
    }
    token = page.tokenPagination?.nextPageToken ?? undefined;
    if (pages >= REVIEW_AGGREGATION_MAX_PAGES && token) {
      aggregationPartial = true;
      break;
    }
  } while (token);

  return {
    average: starCount > 0 ? Math.round((starSum / starCount) * 1000) / 1000 : 0,
    totalListedByPlay: totalListedByPlay ?? starCount,
    distribution,
    scannedReviews: starCount,
    aggregationPartial,
  };
}

function rollupDistinctUsers(rows: any[], latestRow: any | undefined): {
  daily: number;
  weekly: number;
  monthly: number;
  peak: number;
} {
  if (!rows.length) {
    return { daily: 0, weekly: 0, monthly: 0, peak: 0 };
  }
  const sorted = sortMetricsRowsByStartDate(rows);
  const values = sorted.map((r) => readDistinctUsers(r)).filter((n) => n > 0);
  const peak = values.length ? Math.max(...values) : 0;
  const daily = latestRow ? readDistinctUsers(latestRow) : readDistinctUsers(sorted[sorted.length - 1]);
  const last7 = sorted.slice(-7);
  const wVals = last7.map((r) => readDistinctUsers(r));
  const weekly =
    wVals.length > 0 ? Math.round(wVals.reduce((a, b) => a + b, 0) / wVals.length) : daily;
  const mVals = sorted.map((r) => readDistinctUsers(r));
  const monthly =
    mVals.length > 0 ? Math.round(mVals.reduce((a, b) => a + b, 0) / mVals.length) : daily;
  return { daily, weekly, monthly, peak };
}

export interface MetricsFilter {
  versionCode?: string;
  apiLevel?: string;
  deviceModel?: string;
  country?: string;
  timeRange?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface AppOverview {
  packageName: string;
  title: string;
  downloads: {
    /** Lifetime installs — not available via Play APIs; always null. */
    total: number | null;
    /** Installs in period — not available via Play APIs; always null. */
    recent: number | null;
    /** Period-over-period growth % — not available via Play APIs; always null. */
    growth: number | null;
  };
  activeUsers: {
    /** Peak daily `distinctUsers` from vitals in the selected range (foreground users per Play). */
    total: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  ratings: {
    average: number;
    /** Total reviews reported by Play (reviews.list pageInfo); not all may be scanned for distribution. */
    total: number;
    distribution: Record<string, number>;
    /** True if pagination stopped before all reviews were scanned (cap for performance). */
    aggregationPartial: boolean;
    /** Reviews with a star rating actually scanned for average/distribution. */
    scannedReviews: number;
  };
  crashes: {
    rate: number;
    affectedUsers: number;
  };
  anrs: {
    rate: number;
    affectedUsers: number;
  };
  /** Caveats about metrics sources and API limits. */
  notes: string[];
}

export interface CrashMetrics {
  crashRate: number;
  affectedUsers: number;
  totalCrashes: number;
  breakdown: {
    byVersion: Array<{
      versionCode: string;
      crashRate: number;
      crashes: number;
    }>;
    byDevice: Array<{
      deviceModel: string;
      crashRate: number;
      crashes: number;
    }>;
    byApiLevel: Array<{
      apiLevel: string;
      crashRate: number;
      crashes: number;
    }>;
    byCountry: Array<{
      country: string;
      crashRate: number;
      crashes: number;
    }>;
  };
  timeline: Array<{
    date: string;
    crashRate: number;
    crashes: number;
  }>;
}

export interface ANRMetrics {
  anrRate: number;
  affectedUsers: number;
  totalANRs: number;
  breakdown: {
    byVersion: Array<{
      versionCode: string;
      anrRate: number;
      anrs: number;
    }>;
    byDevice: Array<{
      deviceModel: string;
      anrRate: number;
      anrs: number;
    }>;
    byApiLevel: Array<{
      apiLevel: string;
      anrRate: number;
      anrs: number;
    }>;
    byCountry: Array<{
      country: string;
      anrRate: number;
      anrs: number;
    }>;
  };
  timeline: Array<{
    date: string;
    anrRate: number;
    anrs: number;
  }>;
}

export interface ErrorCounts {
  totalErrors: number;
  affectedUsers: number;
  breakdown: {
    byVersion: Array<{
      versionCode: string;
      errorCount: number;
    }>;
    byDevice: Array<{
      deviceModel: string;
      errorCount: number;
    }>;
    byApiLevel: Array<{
      apiLevel: string;
      errorCount: number;
    }>;
    byCountry: Array<{
      country: string;
      errorCount: number;
    }>;
  };
  timeline: Array<{
    date: string;
    errorCount: number;
  }>;
}

export interface ErrorIssue {
  issueId: string;
  type: string;
  title: string;
  firstSeenTime: string;
  lastSeenTime: string;
  affectedUsers: number;
  occurrences: number;
  versions: string[];
  devices: string[];
  countries: string[];
}

export interface ErrorReport {
  reportId: string;
  issueId: string;
  deviceModel: string;
  versionCode: string;
  apiLevel: string;
  country: string;
  occurredTime: string;
  stackTrace: string;
  deviceInfo: {
    manufacturer: string;
    model: string;
    androidVersion: string;
    totalMemory: string;
    availableMemory: string;
  };
}

export interface PerformanceMetrics {
  metricType: string;
  rate: number;
  affectedUsers: number;
  breakdown: {
    byVersion: Array<{
      versionCode: string;
      rate: number;
      affectedUsers: number;
    }>;
    byDevice: Array<{
      deviceModel: string;
      rate: number;
      affectedUsers: number;
    }>;
    byApiLevel: Array<{
      apiLevel: string;
      rate: number;
      affectedUsers: number;
    }>;
    byCountry: Array<{
      country: string;
      rate: number;
      affectedUsers: number;
    }>;
  };
  timeline: Array<{
    date: string;
    rate: number;
    affectedUsers: number;
  }>;
}

export interface SearchResult {
  apps: Array<{
    packageName: string;
    title: string;
    developer: string;
    category: string;
    iconUrl: string;
  }>;
  totalResults: number;
}

// Tool implementations
export async function getAppOverview(
  api: GooglePlayConsoleAPI,
  packageName: string,
  timeRange: string = "30d"
): Promise<AppOverview> {
  try {
    const app = await api.getApp(packageName);

    const [crashMetrics, anrMetrics] = await Promise.all([
      api.getCrashRateMetrics(packageName, { timeRange }),
      api.getANRRateMetrics(packageName, { timeRange }),
    ]);

    let ratingsAgg: Awaited<ReturnType<typeof aggregateReviewRatings>>;
    let ratingsError: string | undefined;
    try {
      ratingsAgg = await aggregateReviewRatings(api, packageName);
    } catch (err: unknown) {
      ratingsError = err instanceof Error ? err.message : String(err);
      ratingsAgg = {
        average: 0,
        totalListedByPlay: 0,
        distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        scannedReviews: 0,
        aggregationPartial: false,
      };
    }

    const crashRows = crashMetrics.rows ?? [];
    const crashSorted = sortMetricsRowsByStartDate(crashRows);
    const latestCrashRow = crashSorted.length ? crashSorted[crashSorted.length - 1] : undefined;
    const activeFromCrash = rollupDistinctUsers(crashRows, latestCrashRow);

    const anrRows = anrMetrics.rows ?? [];
    const anrSorted = sortMetricsRowsByStartDate(anrRows);
    const latestAnrRow = anrSorted.length ? anrSorted[anrSorted.length - 1] : undefined;

    const crashRate = latestCrashRow ? readVitalsRate(latestCrashRow, "crashRate") : 0;
    const crashDistinct = latestCrashRow ? readDistinctUsers(latestCrashRow) : 0;
    const anrRate = latestAnrRow ? readVitalsRate(latestAnrRow, "anrRate") : 0;
    const anrDistinct = latestAnrRow ? readDistinctUsers(latestAnrRow) : 0;

    const notes: string[] = [
      "Install and acquisition counts are not exposed by Google Play Developer or Reporting APIs; use Play Console → Statistics.",
      "activeUsers are derived from vitals distinctUsers (users who used the app in the foreground that day, per Google). They are not identical to Play Console analytics DAU/WAU/MAU.",
      "activeUsers.total is the peak daily distinctUsers in the selected period.",
    ];

    if (ratingsError) {
      notes.push(`Could not load reviews for ratings: ${ratingsError}`);
    }
    if (ratingsAgg.aggregationPartial) {
      notes.push(
        `Review aggregation stopped after ${REVIEW_AGGREGATION_MAX_PAGES} pages; average and distribution reflect scanned reviews only.`
      );
    }

    return {
      packageName,
      title: app.title || packageName,
      downloads: {
        total: null,
        recent: null,
        growth: null,
      },
      activeUsers: {
        total: activeFromCrash.peak,
        daily: activeFromCrash.daily,
        weekly: activeFromCrash.weekly,
        monthly: activeFromCrash.monthly,
      },
      ratings: {
        average: ratingsAgg.average,
        total: ratingsAgg.totalListedByPlay,
        distribution: ratingsAgg.distribution,
        aggregationPartial: ratingsAgg.aggregationPartial,
        scannedReviews: ratingsAgg.scannedReviews,
      },
      crashes: {
        rate: crashRate,
        affectedUsers: affectedUsersFromRate(crashRate, crashDistinct),
      },
      anrs: {
        rate: anrRate,
        affectedUsers: affectedUsersFromRate(anrRate, anrDistinct),
      },
      notes,
    };
  } catch (error) {
    throw new Error(`Failed to get app overview: ${error}`);
  }
}

export async function getCrashMetrics(
  api: GooglePlayConsoleAPI,
  packageName: string,
  filters: MetricsFilter
): Promise<CrashMetrics> {
  try {
    const response = await api.getCrashRateMetrics(packageName, filters);

    const crashRate = readReportingMetricValue(response.rows?.[0], 0);
    const totalCrashes = Math.floor(crashRate * 100000); // Estimate based on user base
    const affectedUsers = Math.floor(crashRate * 50000); // Estimate

    // Process breakdown data
    const breakdown = {
      byVersion: [],
      byDevice: [],
      byApiLevel: [],
      byCountry: [],
    };

    // Process timeline data
    const timeline: Array<{
      date: string;
      crashRate: number;
      crashes: number;
    }> = [];
    if (response.rows) {
      response.rows.forEach((row: any) => {
        timeline.push({
          date: row.dimensions?.[0]?.value || new Date().toISOString().split('T')[0],
          crashRate: readReportingMetricValue(row, 0),
          crashes: Math.floor(readReportingMetricValue(row, 0) * 100000),
        });
      });
    }

    return {
      crashRate,
      affectedUsers,
      totalCrashes,
      breakdown,
      timeline,
    };
  } catch (error) {
    throw new Error(`Failed to get crash metrics: ${error}`);
  }
}

export async function getANRMetrics(
  api: GooglePlayConsoleAPI,
  packageName: string,
  filters: MetricsFilter
): Promise<ANRMetrics> {
  try {
    const response = await api.getANRRateMetrics(packageName, filters);

    const anrRate = readReportingMetricValue(response.rows?.[0], 0);
    const totalANRs = Math.floor(anrRate * 100000); // Estimate based on user base
    const affectedUsers = Math.floor(anrRate * 50000); // Estimate

    // Process breakdown data
    const breakdown = {
      byVersion: [],
      byDevice: [],
      byApiLevel: [],
      byCountry: [],
    };

    // Process timeline data
    const timeline: Array<{
      date: string;
      anrRate: number;
      anrs: number;
    }> = [];
    if (response.rows) {
      response.rows.forEach((row: any) => {
        timeline.push({
          date: row.dimensions?.[0]?.value || new Date().toISOString().split('T')[0],
          anrRate: readReportingMetricValue(row, 0),
          anrs: Math.floor(readReportingMetricValue(row, 0) * 100000),
        });
      });
    }

    return {
      anrRate,
      affectedUsers,
      totalANRs,
      breakdown,
      timeline,
    };
  } catch (error) {
    throw new Error(`Failed to get ANR metrics: ${error}`);
  }
}

export async function getErrorCounts(
  api: GooglePlayConsoleAPI,
  packageName: string,
  filters: MetricsFilter
): Promise<ErrorCounts> {
  try {
    const response = await api.getErrorCountMetrics(packageName, filters);

    const totalErrors = readReportingMetricValue(response.rows?.[0], 0);
    const affectedUsers = Math.floor(totalErrors * 0.8); // Estimate

    // Process breakdown data
    const breakdown = {
      byVersion: [],
      byDevice: [],
      byApiLevel: [],
      byCountry: [],
    };

    // Process timeline data
    const timeline: Array<{
      date: string;
      errorCount: number;
    }> = [];
    if (response.rows) {
      response.rows.forEach((row: any) => {
        timeline.push({
          date: row.dimensions?.[0]?.value || new Date().toISOString().split('T')[0],
          errorCount: readReportingMetricValue(row, 0),
        });
      });
    }

    return {
      totalErrors,
      affectedUsers,
      breakdown,
      timeline,
    };
  } catch (error) {
    throw new Error(`Failed to get error counts: ${error}`);
  }
}

export async function getErrorIssues(
  api: GooglePlayConsoleAPI,
  packageName: string,
  filters: MetricsFilter
): Promise<{ issues: ErrorIssue[]; nextPageToken?: string }> {
  try {
    const response = await api.searchErrorIssues(packageName, filters);

    const issues: ErrorIssue[] = [];
    if (response.errorIssues) {
      response.errorIssues.forEach((issue: any) => {
        issues.push({
          issueId: issue.issueId || issue.name?.split('/').pop(),
          type: issue.type || 'UNKNOWN',
          title: issue.title || issue.issueId,
          firstSeenTime: issue.firstSeenTime,
          lastSeenTime: issue.lastSeenTime,
          affectedUsers: issue.affectedUsers || 0,
          occurrences: issue.occurrences || 0,
          versions: issue.versions || [],
          devices: issue.devices || [],
          countries: issue.countries || [],
        });
      });
    }

    return {
      issues,
      nextPageToken: response.nextPageToken,
    };
  } catch (error) {
    throw new Error(`Failed to get error issues: ${error}`);
  }
}

export async function getErrorReports(
  api: GooglePlayConsoleAPI,
  packageName: string,
  issueId: string,
  filters: MetricsFilter
): Promise<{ reports: ErrorReport[]; nextPageToken?: string }> {
  try {
    const response = await api.searchErrorReports(packageName, issueId, filters);

    const reports: ErrorReport[] = [];
    if (response.errorReports) {
      response.errorReports.forEach((report: any) => {
        reports.push({
          reportId: report.reportId || report.name?.split('/').pop(),
          issueId,
          deviceModel: report.deviceModel || 'Unknown',
          versionCode: report.versionCode || 'Unknown',
          apiLevel: report.apiLevel || 'Unknown',
          country: report.country || 'Unknown',
          occurredTime: report.occurredTime,
          stackTrace: report.stackTrace || '',
          deviceInfo: {
            manufacturer: report.deviceInfo?.manufacturer || 'Unknown',
            model: report.deviceInfo?.model || 'Unknown',
            androidVersion: report.deviceInfo?.androidVersion || 'Unknown',
            totalMemory: report.deviceInfo?.totalMemory || 'Unknown',
            availableMemory: report.deviceInfo?.availableMemory || 'Unknown',
          },
        });
      });
    }

    return {
      reports,
      nextPageToken: response.nextPageToken,
    };
  } catch (error) {
    throw new Error(`Failed to get error reports: ${error}`);
  }
}

export async function getPerformanceMetrics(
  api: GooglePlayConsoleAPI,
  packageName: string,
  metricType: string,
  filters: MetricsFilter
): Promise<PerformanceMetrics> {
  try {
    let response;

    switch (metricType) {
      case "excessivewakeuprate":
        response = await api.getExcessiveWakeupRateMetrics(packageName, filters);
        break;
      case "slowrenderingrate":
        response = await api.getSlowRenderingRateMetrics(packageName, filters);
        break;
      case "slowstartrate":
        response = await api.getSlowStartRateMetrics(packageName, filters);
        break;
      case "stuckbackgroundwakelockrate":
        response = await api.getStuckBackgroundWakelockRateMetrics(packageName, filters);
        break;
      case "lmkrate":
        response = await api.getLMKRateMetrics(packageName, filters);
        break;
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }

    const rate = readReportingMetricValue(response.rows?.[0], 0);
    const affectedUsers = Math.floor(rate * 50000); // Estimate

    // Process breakdown data
    const breakdown = {
      byVersion: [],
      byDevice: [],
      byApiLevel: [],
      byCountry: [],
    };

    // Process timeline data
    const timeline: Array<{
      date: string;
      rate: number;
      affectedUsers: number;
    }> = [];
    if (response.rows) {
      response.rows.forEach((row: any) => {
        timeline.push({
          date: row.dimensions?.[0]?.value || new Date().toISOString().split('T')[0],
          rate: readReportingMetricValue(row, 0),
          affectedUsers: Math.floor(readReportingMetricValue(row, 0) * 50000),
        });
      });
    }

    return {
      metricType,
      rate,
      affectedUsers,
      breakdown,
      timeline,
    };
  } catch (error) {
    throw new Error(`Failed to get performance metrics: ${error}`);
  }
}

export async function searchApps(
  api: GooglePlayConsoleAPI,
  query: string,
  pageSize: number = 10
): Promise<SearchResult> {
  try {
    const response = await api.searchApps(query, Math.max(pageSize, 100));

    const raw: Array<{
      packageName: string;
      title: string;
      developer: string;
      category: string;
      iconUrl: string;
    }> = [];
    if (response.apps) {
      response.apps.forEach((app: any) => {
        const packageName =
          app.packageName || (typeof app.name === "string" ? app.name.replace(/^apps\//, "") : "");
        raw.push({
          packageName,
          title: app.displayName || app.title || packageName,
          developer: app.developer || "Unknown",
          category: app.category || "Unknown",
          iconUrl: app.iconUrl || "",
        });
      });
    }

    const q = query.trim().toLowerCase();
    const apps = q
      ? raw.filter(
          (a) =>
            a.packageName.toLowerCase().includes(q) ||
            a.title.toLowerCase().includes(q)
        )
      : raw;

    return {
      apps: apps.slice(0, pageSize),
      totalResults: apps.length,
    };
  } catch (error) {
    throw new Error(`Failed to search apps: ${error}`);
  }
}
