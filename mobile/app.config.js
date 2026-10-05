module.exports = ({ config }) => {
  const env = process.env;
  const release = ["preview", "production"].includes(env.EAS_BUILD_PROFILE);
  if (release) {
    for (const key of [
      "EXPO_PUBLIC_API_URL",
      "EAS_PROJECT_ID",
      "IOS_BUNDLE_IDENTIFIER",
      "ANDROID_PACKAGE",
    ])
      if (!env[key])
        throw new Error(`Set ${key} before a signed preview or release build.`);
    if (!/^https:\/\//.test(env.EXPO_PUBLIC_API_URL))
      throw new Error("Signed builds require an HTTPS API URL.");
  }
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(env.IOS_BUNDLE_IDENTIFIER
        ? { bundleIdentifier: env.IOS_BUNDLE_IDENTIFIER }
        : {}),
    },
    android: {
      ...config.android,
      ...(env.ANDROID_PACKAGE ? { package: env.ANDROID_PACKAGE } : {}),
      ...(env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: env.GOOGLE_SERVICES_JSON }
        : {}),
    },
    extra: {
      ...config.extra,
      environment: release ? env.EAS_BUILD_PROFILE : "local-demo",
      ...(env.EAS_PROJECT_ID ? { eas: { projectId: env.EAS_PROJECT_ID } } : {}),
    },
  };
};
