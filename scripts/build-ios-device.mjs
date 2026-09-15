// Build a standalone hosted iPhone app after the user configures Apple signing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hostedConfig, projectRoot } from "./backend-env.mjs";
import { prepareIosCache } from "./prepare-ios-cache.mjs";

hostedConfig(); // Fail before building if the app has unsafe/missing hosted config.
const settingsFile =
  process.env.TALENTHUNTER_IOS_CONFIG ||
  path.join(projectRoot, ".local/ios-device.json");
if (!fs.existsSync(settingsFile)) {
  throw new Error(
    "Configure the iPhone and your Apple signing team first. Set TALENTHUNTER_IOS_CONFIG to a private JSON file with teamId and deviceId, or use .local/ios-device.json.",
  );
}
const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
if (
  !/^[A-Z0-9]{10}$/.test(settings.teamId) ||
  !/^[A-Fa-f0-9-]{16,50}$/.test(settings.deviceId)
) {
  throw new Error(
    "Invalid Apple team or device ID in the private iPhone settings.",
  );
}
prepareIosCache();
const derived =
  process.env.TALENTHUNTER_IOS_DEVICE_BUILD_DIR ||
  path.join(
    os.homedir(),
    "Library/Developer/Xcode/DerivedData/TalentHunterDevice",
  );
const result = spawnSync(
  process.execPath,
  [
    "scripts/with-backend.mjs",
    "hosted-build",
    "bash",
    "scripts/native-env.sh",
    "xcodebuild",
    "-workspace",
    "ios/TalentHunter.xcworkspace",
    "-scheme",
    "TalentHunter",
    "-configuration",
    "Release",
    "-sdk",
    "iphoneos",
    "-destination",
    `id=${settings.deviceId}`,
    "-derivedDataPath",
    derived,
    `DEVELOPMENT_TEAM=${settings.teamId}`,
    "CODE_SIGN_STYLE=Automatic",
    "-allowProvisioningUpdates",
    "build",
  ],
  { cwd: projectRoot, env: process.env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  console.log(
    "Standalone hosted iPhone build:",
    path.join(derived, "Build/Products/Release-iphoneos/TalentHunter.app"),
  );
}
