// Validate deployment boundaries before opening storage or starting the server.
export function deploymentSettings(env = process.env) {
  const pilot = env.APP_STAGE === "pilot";
  const accounts = env.APP_MODE === "accounts";
  if (pilot && !accounts)
    throw new Error("Pilot deployments require APP_MODE=accounts.");
  const appUrl = env.APP_URL || env.RENDER_EXTERNAL_URL || "";
  if (pilot) {
    let url;
    try {
      url = new URL(appUrl);
    } catch {
      throw new Error(
        "Pilot requires an HTTPS APP_URL or RENDER_EXTERNAL_URL.",
      );
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Pilot URL must be a clean HTTPS origin.");
    if (!env.DATA_FILE)
      throw new Error("Pilot requires DATA_FILE on persistent storage.");
    if (
      env.STRIPE_SECRET_KEY ||
      env.ENABLE_EXTERNAL_DELIVERY === "true" ||
      env.ENABLE_CLOUD_UPLOADS === "true"
    )
      throw new Error(
        "This evaluation pilot disables payments, external delivery and cloud uploads.",
      );
  }
  return {
    pilot,
    appUrl,
    registrationEnabled:
      accounts && !pilot && env.ALLOW_PUBLIC_REGISTRATION !== "false",
  };
}
