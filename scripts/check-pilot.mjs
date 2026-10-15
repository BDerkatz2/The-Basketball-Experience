// Read-only checks. No credentials, mutations or external deliveries.
const origin = process.env.PILOT_URL;
if (!origin || new URL(origin).protocol !== "https:")
  throw new Error("Set PILOT_URL to the hosted HTTPS origin.");
async function get(path) {
  const r = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  return { status: r.status, data: await r.json() };
}
const config = await get("/api/config"),
  ready = await get("/api/ready"),
  state = await get("/api/state"),
  demo = await get("/api/demo-users");
const ok =
  config.status === 200 &&
  config.data.pilot === true &&
  config.data.mode === "accounts" &&
  config.data.registrationEnabled === false &&
  config.data.payments === "not-connected" &&
  ready.data.ready === true &&
  state.status === 401 &&
  demo.status === 404;
console.log(
  JSON.stringify({
    ok,
    pilot: config.data.pilot,
    ready: ready.data.ready,
    privateState: state.status === 401,
    demoDisabled: demo.status === 404,
  }),
);
if (!ok) process.exitCode = 1;
