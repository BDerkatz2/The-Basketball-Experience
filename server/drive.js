import { fail } from "./domain.js";
import { serviceStatus } from "./live-services.js";
const MAX = 100 * 1024 * 1024;
export async function importDriveVideo(
  fileId,
  env = process.env,
  request = fetch,
) {
  if (!serviceStatus(env).drive)
    fail(
      "Google Drive is not configured. Ask an administrator to connect the club video folder.",
      503,
    );
  if (typeof fileId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId))
    fail("Enter a Google Drive file ID.");
  const auth = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!auth.ok)
    fail("Google authorization failed. Reconnect the club Drive account.", 502);
  const token = (await auth.json()).access_token;
  if (typeof token !== "string" || !token)
    fail("Google did not return an access token.", 502);
  const options = {
    headers: { Authorization: "Bearer " + token },
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  };
  const endpoint =
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId);
  const meta = await request(
    endpoint +
      "?fields=id,name,mimeType,size,parents,trashed,capabilities(canDownload)&supportsAllDrives=true",
    options,
  );
  if (!meta.ok) fail("This Drive file is not accessible.", 404);
  const file = await meta.json();
  if (
    file.trashed ||
    !file.parents?.includes(env.GOOGLE_DRIVE_FOLDER_ID) ||
    !file.capabilities?.canDownload
  )
    fail(
      "Choose a downloadable video directly inside the connected club folder.",
      403,
    );
  if (
    !["video/mp4", "video/webm", "video/quicktime"].includes(file.mimeType) ||
    !Number.isFinite(Number(file.size)) ||
    Number(file.size) <= 0 ||
    Number(file.size) > MAX
  )
    fail("Choose an MP4, MOV or WebM video no larger than 100 MB.");
  const media = await request(
    endpoint + "?alt=media&supportsAllDrives=true",
    options,
  );
  if (!media.ok || !media.body)
    fail("Drive could not download this video.", 502);
  const chunks = [];
  let size = 0;
  for await (const chunk of media.body) {
    size += chunk.length;
    if (size > MAX) fail("Video exceeds the 100 MB limit.", 413);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const type =
    bytes.subarray(4, 8).toString() === "ftyp"
      ? file.mimeType === "video/quicktime"
        ? "video/quicktime"
        : "video/mp4"
      : bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
        ? "video/webm"
        : null;
  if (!type) fail("The Drive file is not a supported video.");
  return {
    bytes,
    type,
    name: String(file.name || "Drive video").slice(0, 100),
  };
}
