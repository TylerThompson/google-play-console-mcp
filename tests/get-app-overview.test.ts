import test from "node:test";
import assert from "node:assert/strict";
import { getAppOverview } from "../src/api/tools.js";

test("getAppOverview returns computed crash and ANR affected users", async () => {
  const api = {
    getApp: async () => ({ title: "Example App" }),
    getCrashRateMetrics: async () => ({
      rows: [
        {
          startTime: { year: 2025, month: 1, day: 10 },
          metrics: [
            { metric: "crashRate", decimalValue: { value: "0.005" } },
            { metric: "distinctUsers", decimalValue: { value: "100000" } },
          ],
        },
        {
          startTime: { year: 2025, month: 1, day: 15 },
          metrics: [
            { metric: "crashRate", decimalValue: { value: "0.01" } },
            { metric: "distinctUsers", decimalValue: { value: "250000" } },
          ],
        },
      ],
    }),
    getANRRateMetrics: async () => ({
      rows: [
        {
          startTime: { year: 2025, month: 1, day: 15 },
          metrics: [
            { metric: "anrRate", decimalValue: { value: "0.02" } },
            { metric: "distinctUsers", decimalValue: { value: "250000" } },
          ],
        },
      ],
    }),
    listReviewsPage: async () => ({
      reviews: [],
      pageInfo: { totalResults: 42 },
      tokenPagination: {},
    }),
  };

  const overview = await getAppOverview(
    api as any,
    "com.example.app",
    "30d"
  );

  assert.equal(overview.title, "Example App");
  assert.equal(overview.downloads.total, null);
  assert.equal(overview.ratings.total, 42);
  assert.equal(overview.activeUsers.total, 250000);
  assert.equal(overview.crashes.rate, 0.01);
  assert.equal(overview.crashes.affectedUsers, 2500);
  assert.equal(overview.anrs.rate, 0.02);
  assert.equal(overview.anrs.affectedUsers, 5000);
  assert.ok(Array.isArray(overview.notes) && overview.notes.length > 0);
});

test("getAppOverview wraps API failures with context", async () => {
  const api = {
    getApp: async () => {
      throw new TypeError("this.androidPublisher.applications.get is not a function");
    },
    getCrashRateMetrics: async () => ({ rows: [] }),
    getANRRateMetrics: async () => ({ rows: [] }),
    listReviewsPage: async () => ({ reviews: [] }),
  };

  await assert.rejects(
    getAppOverview(api as any, "com.example.app", "30d"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Failed to get app overview:/);
      assert.match(
        error.message,
        /this\.androidPublisher\.applications\.get is not a function/
      );
      return true;
    }
  );
});
