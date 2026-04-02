import test from "node:test";
import assert from "node:assert/strict";
import {
  invokeAndroidPublisherOperation,
  buildAndroidPublisherHelp,
} from "../src/api/android-publisher-invoke.js";

test("invokeAndroidPublisherOperation calls nested method and returns data", async () => {
  const publisher = {
    edits: {
      insert: async (p: { packageName: string }) => ({
        data: { id: "edit-1", ...p },
      }),
    },
  };
  const out = await invokeAndroidPublisherOperation(publisher as any, "edits.insert", {
    packageName: "com.example.app",
  });
  assert.deepEqual(out, { id: "edit-1", packageName: "com.example.app" });
});

test("invokeAndroidPublisherOperation rejects unknown root", async () => {
  await assert.rejects(
    invokeAndroidPublisherOperation({} as any, "fake.resource.get", {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Unknown API root/);
      return true;
    }
  );
});

test("invokeAndroidPublisherOperation rejects media.body", async () => {
  const publisher = {
    edits: {
      apks: { upload: async () => ({ data: {} }) },
    },
  };
  await assert.rejects(
    invokeAndroidPublisherOperation(publisher as any, "edits.apks.upload", {
      packageName: "a",
      editId: "1",
      media: { body: Buffer.from("x") },
    }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /media\.body/);
      return true;
    }
  );
});

test("buildAndroidPublisherHelp mentions REST reference and edits.insert", () => {
  const h = buildAndroidPublisherHelp();
  assert.match(h, /Android Developer API/);
  assert.match(h, /developers\.google\.com\/android-publisher/);
  assert.match(h, /edits\.insert/);
});
