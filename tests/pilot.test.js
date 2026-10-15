import test from "node:test";
import assert from "node:assert/strict";
import { deploymentSettings } from "../server/deployment.js";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const base = {
  APP_STAGE: "pilot",
  APP_MODE: "accounts",
  APP_URL: "https://pilot.example.test",
  DATA_FILE: "/data/accounts.json",
};
test("pilot deployment rejects unsafe modes and enabled external services", () => {
  assert.equal(deploymentSettings(base).registrationEnabled, false);
  for (const override of [
    { APP_MODE: "demo" },
    { APP_URL: "http://example.test" },
    { APP_URL: "https://example.test/path" },
    { DATA_FILE: "" },
    { STRIPE_SECRET_KEY: "sk_test_fake" },
    { ENABLE_EXTERNAL_DELIVERY: "true" },
    { ENABLE_CLOUD_UPLOADS: "true" },
  ])
    assert.throws(() => deploymentSettings({ ...base, ...override }));
  assert.equal(
    deploymentSettings({
      ...base,
      APP_URL: "",
      RENDER_EXTERNAL_URL: "https://pilot.onrender.com",
    }).appUrl,
    "https://pilot.onrender.com",
  );
  assert.equal(
    deploymentSettings({ APP_MODE: "accounts" }).registrationEnabled,
    true,
  );
});
test("private pilot: login, invitation-only registration, disabled demos and persistence after restart", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-pilot-"));
  let child;
  const start = () =>
    new Promise((resolve, reject) => {
      child = spawn(process.execPath, ["server/index.js", "--production"], {
        env: {
          ...process.env,
          ...base,
          PORT: "4194",
          HOST: "127.0.0.1",
          DATA_FILE: join(dir, "accounts.json"),
          MONGODB_URI: "",
          STRIPE_SECRET_KEY: "",
          ENABLE_EXTERNAL_DELIVERY: "false",
          ENABLE_CLOUD_UPLOADS: "false",
          BOOTSTRAP_ADMIN_EMAIL: "pilot@example.test",
          BOOTSTRAP_ADMIN_PASSWORD: "Pilot test password 123",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(
        () => reject(Error("Pilot startup timeout")),
        15000,
      );
      child.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Pilot exited"));
      });
      child.stdout.on("data", (b) => {
        if (String(b).includes("http://")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  const stop = () =>
    new Promise((resolve) => {
      if (!child || child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      child.kill();
    });
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  const req = async (path, body, token) => {
    const res = await fetch("http://127.0.0.1:4194/api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  await start();
  const cfg = (await req("config")).body;
  assert.equal(cfg.pilot, true);
  assert.equal(cfg.registrationEnabled, false);
  assert.equal(cfg.payments, "not-connected");
  assert.equal((await req("state")).status, 401);
  assert.equal((await req("demo-session", { userId: "admin" })).status, 404);
  assert.equal(
    (
      await req("auth/register", {
        name: "Uninvited",
        email: "other@example.test",
        password: "Pilot test password 456",
      })
    ).status,
    403,
  );
  const login = () =>
    req("auth/login", {
      email: "pilot@example.test",
      password: "Pilot test password 123",
    });
  const token = (await login()).body.token;
  assert.ok(token);
  assert.equal(
    (
      await req(
        "actions/team-save",
        { name: "Pilot test team", coach: "Test coach", division: "U14" },
        token,
      )
    ).status,
    200,
  );
  await stop();
  await start();
  const second = (await login()).body.token;
  const state = (await req("state", null, second)).body;
  assert.equal(state.pilot, true);
  assert.ok(state.teams.some((x) => x.name === "Pilot test team"));
  assert.equal((await req("services/send-pending", {}, second)).status, 503);
});
