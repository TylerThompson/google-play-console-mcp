import test from "node:test";
import assert from "node:assert/strict";
import { GooglePlayConsoleAPI } from "../src/api/client.js";

function makeClientWithoutConstructor(): any {
  return Object.create(GooglePlayConsoleAPI.prototype) as GooglePlayConsoleAPI;
}

test("buildReportingFilter escapes backslashes and quotes in string fields", () => {
  const client = makeClientWithoutConstructor();
  const filter = client.buildReportingFilter({
    deviceModel: 'Pixel\\Model"Pro',
    country: 'U\\S"X',
  });

  assert.equal(filter, 'deviceModel = "Pixel\\\\Model\\"Pro" AND countryCode = "U\\\\S\\"X"');
});

test("buildErrorIssuesFilter escapes backslashes and quotes in device model", () => {
  const client = makeClientWithoutConstructor();
  const filter = client.buildErrorIssuesFilter({
    deviceModel: 'Pixel\\Model"Pro',
  });

  assert.equal(filter, 'deviceModel = "Pixel\\\\Model\\"Pro"');
});
