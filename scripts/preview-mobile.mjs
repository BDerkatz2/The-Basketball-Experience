import express from "express";
const app = express();
app.use("/api", async (req, res) => {
  try {
    const response = await fetch("http://127.0.0.1:4196" + req.originalUrl, {
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
        authorization: req.headers.authorization || "",
      },
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: req, duplex: "half" }
        : {}),
    });
    res.status(response.status);
    res.set(
      "Content-Type",
      response.headers.get("content-type") || "application/json",
    );
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.status(502).json({ error: "Local demo is unavailable" });
  }
});
app.use(express.static("mobile/dist"));
app.listen(4197, "127.0.0.1", () =>
  console.log("Native screen preview: http://127.0.0.1:4197"),
);
