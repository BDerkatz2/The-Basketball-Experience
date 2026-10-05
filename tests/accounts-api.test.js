import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("accounts mode: demo disabled, role escalation rejected, login/logout and secret redaction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-accounts-")),
    dataFile = join(dir, "accounts.json");
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    env: {
      ...process.env,
      APP_MODE: "accounts",
      PORT: "4179",
      DATA_FILE: dataFile,
      MONGODB_URI: "",
      BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
      BOOTSTRAP_ADMIN_PASSWORD: "Test bootstrap password 123",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Startup timed out")), 15000);
      child.once("error", reject);
      child.stdout.on("data", (b) => {
        if (String(b).includes("http://")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", () => reject(Error("Unexpected exit")));
    });
    const req = async (path, body, token) => {
      const r = await fetch("http://127.0.0.1:4179/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await req("demo-session", { userId: "admin" })).status, 404);
    const registered = await req("auth/register", {
      name: "A Parent",
      email: "parent@example.test",
      password: "Test parent password 123",
      role: "admin",
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.data.user.role, "parent");
    assert.equal(registered.data.user.passwordHash, undefined);
    const token = registered.data.token,
      state = (await req("state", null, token)).data;
    assert.equal(state.user.passwordHash, undefined);
    assert.equal(state.authSessions, undefined);
    assert.equal(state.users, undefined);
    assert.equal(state.pushDevices, undefined);
    assert.equal((await req("services", null, token)).status, 403);
    assert.equal((await req("services/send-pending", {}, token)).status, 403);
    assert.equal((await req("services/stripe-check", {}, token)).status, 403);
    assert.equal(
      (
        await req(
          "drive/import",
          { fileId: "abcdefghijk", teamId: "t1" },
          token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "devices/register",
          { token: "ExpoPushToken[abcdefghijklmno]" },
          token,
        )
      ).status,
      200,
    );
    assert.equal((await req("state", null, token)).data.pushDevices, undefined);
    assert.equal(
      JSON.parse(await readFile(dataFile, "utf8")).pushDevices.length,
      1,
    );
    assert.equal(state.families.length, 1);
    assert.equal(
      (
        await req(
          "actions/team-save",
          { name: "Escalate", coach: "A", division: "U14" },
          token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req("auth/login", {
          email: "parent@example.test",
          password: "incorrect password",
        })
      ).status,
      401,
    );
    const login = await req("auth/login", {
      email: "parent@example.test",
      password: "Test parent password 123",
    });
    assert.equal(login.status, 200);
    await req("logout", {}, login.data.token);
    assert.equal(
      JSON.parse(await readFile(dataFile, "utf8")).pushDevices.length,
      0,
    );
    assert.equal((await req("state", null, login.data.token)).status, 401);
    const admin = await req("auth/login", {
      email: "admin@example.test",
      password: "Test bootstrap password 123",
    });
    assert.equal(admin.data.user.role, "admin");
    assert.equal(admin.data.user.passwordHash, undefined);
    assert.equal(
      (
        await req(
          "account-links",
          { kind: "reset", email: "parent@example.test" },
          token,
        )
      ).status,
      403,
    );
    const reset = await req(
      "account-links",
      { kind: "reset", email: "parent@example.test" },
      admin.data.token,
    );
    assert.equal(reset.status, 200);
    const listed = await req("account-links", null, admin.data.token);
    assert.equal(listed.data.links[0].tokenHash, undefined);
    assert.equal(
      (
        await req("auth/redeem-link", {
          token: reset.data.token,
          password: "Replacement password 123",
        })
      ).status,
      200,
    );
    assert.equal((await req("state", null, token)).status, 401);
    assert.equal(
      (
        await req("auth/redeem-link", {
          token: reset.data.token,
          password: "Replacement password 456",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req("auth/login", {
          email: "parent@example.test",
          password: "Replacement password 123",
        })
      ).status,
      200,
    );
    const invite = await req(
      "account-links",
      {
        kind: "invite",
        email: "staff@example.test",
        name: "Test staff",
        role: "staff",
      },
      admin.data.token,
    );
    assert.equal(invite.status, 200);
    assert.equal(
      (
        await req("auth/redeem-link", {
          token: invite.data.token,
          password: "New staff password 123",
          role: "admin",
        })
      ).status,
      200,
    );
    const staffLogin = await req("auth/login", {
      email: "staff@example.test",
      password: "New staff password 123",
    });
    assert.equal(staffLogin.data.user.role, "staff");
    const disk = await readFile(dataFile, "utf8");
    assert.equal(disk.includes("Test parent password 123"), false);
    assert.equal(disk.includes(token), false);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("close", resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
