const url = process.env.MONITOR_URL || "http://127.0.0.1:4173/api/ready";
try {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) }),
    body = await r.json();
  if (!r.ok || body.ready !== true) throw Error("Service is not ready");
  console.log(
    JSON.stringify({ ok: true, checkedAt: new Date().toISOString() }),
  );
} catch (e) {
  console.error(JSON.stringify({ ok: false, message: e.message }));
  process.exitCode = 1;
}
