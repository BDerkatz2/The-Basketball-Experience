import test from "node:test";
import assert from "node:assert/strict";
import {
  accountToken,
  validateAttachmentSize,
} from "../mobile/communication-utils.mjs";
test("mobile account links accept web fragments and app links, rejecting malformed or ambiguous tokens", () => {
  const token = "a".repeat(64);
  assert.equal(
    accountToken("https://community.example/#account-link=" + token),
    token,
  );
  assert.equal(accountToken("tbe://account?account-link=" + token), token);
  for (const link of [
    "not a link",
    "javascript:alert(1)#account-link=" + token,
    "tbe://other?account-link=" + token,
    "https://example.test/#account-link=" + token + "extra",
    "https://example.test/#account-link=" + token + "&account-link=" + token,
  ])
    assert.equal(accountToken(link), null);
});
test("mobile attachment validation rejects empty, missing and oversized files before upload", () => {
  for (const n of [undefined, NaN, -1, 0, 10 * 1024 * 1024 + 1])
    assert.throws(() => validateAttachmentSize(n), /nonempty file/);
  validateAttachmentSize(1);
  validateAttachmentSize(10 * 1024 * 1024);
});
