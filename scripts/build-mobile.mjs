import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../mobile", import.meta.url));
const env = { ...process.env, CI: "1", MOBILE_WEB_BASE_PATH: "/mobile" };
// Browser builds always connect to their own host, never a developer's machine.
delete env.EXPO_PUBLIC_API_URL;
env.EXPO_NO_DOTENV = "1";
function run(command, args) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run("pnpm", ["install", "--frozen-lockfile", "--prod=false"]);
run("node", ["node_modules/expo/bin/cli", "export", "--platform", "web", "--output-dir", "../dist/mobile"]);
