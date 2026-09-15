import { Image } from "expo-image";

// Official website wordmark, reused for this assessment prototype.
export function Brand() {
  return (
    <Image
      source={require("@/assets/images/talenthunter-logo.webp")}
      style={{ width: 138, height: 44 }}
      contentFit="contain"
      accessible
      accessibilityLabel="TalentHunter"
    />
  );
}
