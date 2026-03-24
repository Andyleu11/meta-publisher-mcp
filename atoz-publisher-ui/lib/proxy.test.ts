import assert from "node:assert/strict";
import test from "node:test";
import { buildProxyUrl } from "./proxy.ts";

test("buildProxyUrl joins base path and segments", () => {
  const url = buildProxyUrl("http://localhost:4000", ["draft-posts", "1", "status"], "");
  assert.equal(url, "http://localhost:4000/api/draft-posts/1/status");
});

test("buildProxyUrl keeps query string", () => {
  const url = buildProxyUrl("http://localhost:4000/", ["scheduled-posts"], "?limit=10");
  assert.equal(url, "http://localhost:4000/api/scheduled-posts?limit=10");
});
