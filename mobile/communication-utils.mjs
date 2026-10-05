// Links supply only an opaque token. They never select the API server.
export function accountToken(input) {
  try {
    const url = new URL(input.trim());
    if (!["https:", "http:", "tbe:"].includes(url.protocol)) return null;
    if (url.protocol === "tbe:" && url.hostname !== "account") return null;
    const params = url.hash
      ? new URLSearchParams(url.hash.slice(1))
      : url.searchParams;
    if (params.getAll("account-link").length !== 1) return null;
    const token = params.get("account-link");
    return /^[a-f0-9]{64}$/.test(token || "") ? token : null;
  } catch {
    return null;
  }
}
export function validateAttachmentSize(size) {
  if (!Number.isInteger(size) || size < 1 || size > 10 * 1024 * 1024)
    throw Error("Choose a nonempty file up to 10 MB.");
}
