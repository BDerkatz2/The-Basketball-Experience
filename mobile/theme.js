import { Platform } from "react-native";
export const headingFont = Platform.select({
  ios: "AvenirNextCondensed-DemiBold",
  android: "sans-serif-condensed",
  default: "sans-serif",
});
