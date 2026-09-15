// Install the previously built app on the privately configured physical iPhone.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./backend-env.mjs";

const settingsFile =
  process.env.TALENTHUNTER_IOS_CONFIG ||
  path.join(projectRoot, ".local/ios-device.json");
const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
if (!/^[A-Fa-f0-9-]{16,50}$/.test(settings.deviceId)) {
  throw new Error("Invalid deviceId in the private iPhone settings file.");
}
const derived =
  process.env.TALENTHUNTER_IOS_DEVICE_BUILD_DIR ||
  path.join(
    os.homedir(),
    "Library/Developer/Xcode/DerivedData/TalentHunterDevice",
  );
const app = path.join(
  derived,
  "Build/Products/Release-iphoneos/TalentHunter.app",
);
if (!fs.existsSync(app)) throw new Error("Run npm run build:iphone first.");
const result = spawnSync(
  "xcrun",
  ["devicectl", "device", "install", "app", "--device", settings.deviceId, app],
  { cwd: projectRoot, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (result.status === 0)
  console.log(
    "Installed. Open TalentHunter on the iPhone; complete Apple's development-profile trust step yourself if prompted.",
  );
