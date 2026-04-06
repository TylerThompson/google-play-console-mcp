import test from "node:test";
import assert from "node:assert/strict";
import {
  getANRMetrics,
  getCrashMetrics,
  getErrorCounts,
  getErrorIssues,
  getErrorReports,
  getPerformanceMetrics,
  searchApps,
} from "../src/api/tools.js";

test("getCrashMetrics maps rows into summary and timeline", async () => {
  const api = {
    getCrashRateMetrics: async () => ({
      rows: [
        {
          dimensions: [{ value: "2026-04-01" }],
          metrics: [{ decimalValue: { value: "0.02" } }],
        },
        {
          dimensions: [{ value: "2026-04-02" }],
          metrics: [{ decimalValue: { value: "0.01" } }],
        },
      ],
    }),
  };

  const out = await getCrashMetrics(api as any, "com.example.app", {});
  assert.equal(out.crashRate, 0.02);
  assert.equal(out.totalCrashes, 2000);
  assert.equal(out.affectedUsers, 1000);
  assert.equal(out.timeline.length, 2);
  assert.equal(out.timeline[0].date, "2026-04-01");
  assert.equal(out.timeline[1].crashes, 1000);
});

test("getANRMetrics maps rows into summary and timeline", async () => {
  const api = {
    getANRRateMetrics: async () => ({
      rows: [
        {
          dimensions: [{ value: "2026-04-01" }],
          metrics: [{ decimalValue: { value: "0.004" } }],
        },
      ],
    }),
  };

  const out = await getANRMetrics(api as any, "com.example.app", {});
  assert.equal(out.anrRate, 0.004);
  assert.equal(out.totalANRs, 400);
  assert.equal(out.affectedUsers, 200);
  assert.equal(out.timeline.length, 1);
  assert.equal(out.timeline[0].anrs, 400);
});

test("getErrorCounts maps metrics and timeline", async () => {
  const api = {
    getErrorCountMetrics: async () => ({
      rows: [
        {
          dimensions: [{ value: "2026-04-01" }],
          metrics: [{ decimalValue: { value: "120" } }],
        },
      ],
    }),
  };

  const out = await getErrorCounts(api as any, "com.example.app", {});
  assert.equal(out.totalErrors, 120);
  assert.equal(out.affectedUsers, 96);
  assert.equal(out.timeline.length, 1);
  assert.equal(out.timeline[0].errorCount, 120);
});

test("getErrorIssues maps issue fields and defaults", async () => {
  const api = {
    searchErrorIssues: async () => ({
      errorIssues: [
        {
          issueId: "iss-1",
          type: "CRASH",
          title: "NullPointerException",
          firstSeenTime: "2026-04-01T00:00:00Z",
          lastSeenTime: "2026-04-02T00:00:00Z",
          affectedUsers: 5,
          occurrences: 12,
          versions: ["100"],
          devices: ["Pixel 8"],
          countries: ["US"],
        },
        {
          name: "apps/com.example.app/errorIssues/iss-2",
          firstSeenTime: "2026-04-03T00:00:00Z",
          lastSeenTime: "2026-04-04T00:00:00Z",
        },
      ],
      nextPageToken: "next-1",
    }),
  };

  const out = await getErrorIssues(api as any, "com.example.app", {});
  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[0].issueId, "iss-1");
  assert.equal(out.issues[1].issueId, "iss-2");
  assert.equal(out.issues[1].type, "UNKNOWN");
  assert.equal(out.issues[1].affectedUsers, 0);
  assert.deepEqual(out.issues[1].versions, []);
  assert.equal(out.nextPageToken, "next-1");
});

test("getErrorReports maps reports and fallback values", async () => {
  const api = {
    searchErrorReports: async () => ({
      errorReports: [
        {
          reportId: "rep-1",
          deviceModel: "Pixel 7",
          versionCode: "101",
          apiLevel: "34",
          country: "US",
          occurredTime: "2026-04-01T00:00:00Z",
          stackTrace: "stack",
          deviceInfo: {
            manufacturer: "Google",
            model: "Pixel 7",
            androidVersion: "14",
            totalMemory: "8GB",
            availableMemory: "2GB",
          },
        },
        {
          name: "apps/com.example.app/errorReports/rep-2",
          occurredTime: "2026-04-02T00:00:00Z",
        },
      ],
      nextPageToken: "next-2",
    }),
  };

  const out = await getErrorReports(api as any, "com.example.app", "iss-1", {});
  assert.equal(out.reports.length, 2);
  assert.equal(out.reports[0].reportId, "rep-1");
  assert.equal(out.reports[0].issueId, "iss-1");
  assert.equal(out.reports[1].reportId, "rep-2");
  assert.equal(out.reports[1].deviceModel, "Unknown");
  assert.equal(out.reports[1].deviceInfo.model, "Unknown");
  assert.equal(out.nextPageToken, "next-2");
});

test("getPerformanceMetrics selects api method by metric type", async () => {
  const called: string[] = [];
  const mk = (name: string) => async () => {
    called.push(name);
    return {
      rows: [{ dimensions: [{ value: "2026-04-01" }], metrics: [{ decimalValue: { value: "0.01" } }] }],
    };
  };
  const api = {
    getExcessiveWakeupRateMetrics: mk("excessivewakeuprate"),
    getSlowRenderingRateMetrics: mk("slowrenderingrate"),
    getSlowStartRateMetrics: mk("slowstartrate"),
    getStuckBackgroundWakelockRateMetrics: mk("stuckbackgroundwakelockrate"),
    getLMKRateMetrics: mk("lmkrate"),
  };

  const metricTypes = [
    "excessivewakeuprate",
    "slowrenderingrate",
    "slowstartrate",
    "stuckbackgroundwakelockrate",
    "lmkrate",
  ];
  for (const metricType of metricTypes) {
    const out = await getPerformanceMetrics(api as any, "com.example.app", metricType, {});
    assert.equal(out.metricType, metricType);
    assert.equal(out.rate, 0.01);
    assert.equal(out.affectedUsers, 500);
    assert.equal(out.timeline.length, 1);
  }

  assert.deepEqual(called, metricTypes);
});

test("getPerformanceMetrics wraps unknown metric type errors", async () => {
  await assert.rejects(
    getPerformanceMetrics({} as any, "com.example.app", "not-a-metric", {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Failed to get performance metrics/);
      assert.match(err.message, /Unknown metric type/);
      return true;
    }
  );
});

test("searchApps normalizes, filters, and paginates results", async () => {
  const api = {
    searchApps: async (_query: string, pageSize: number) => {
      assert.equal(pageSize, 100);
      return {
        apps: [
          {
            packageName: "com.example.alpha",
            displayName: "Alpha",
            developer: "Dev A",
            category: "TOOLS",
            iconUrl: "https://example.com/a.png",
          },
          {
            name: "apps/com.example.beta",
            title: "Beta App",
          },
          {
            packageName: "com.example.gamma",
            displayName: "Other",
          },
        ],
      };
    },
  };

  const out = await searchApps(api as any, "beta", 2);
  assert.equal(out.totalResults, 1);
  assert.equal(out.apps.length, 1);
  assert.equal(out.apps[0].packageName, "com.example.beta");
  assert.equal(out.apps[0].title, "Beta App");
  assert.equal(out.apps[0].developer, "Unknown");
});
