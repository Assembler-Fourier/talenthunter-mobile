// Expo's nested SwiftPM build writes next to this dependency, ignoring the app's
// DerivedData directory. Keep it outside synced Desktop/Documents on this Mac.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./backend-env.mjs";

export function prepareIosCache() {
  if (process.platform !== "darwin") return;
  // Relocate the whole package: autolinking discovers a package-root symlink,
  // but does not discover a podspec through a symlinked apple subdirectory.
  const source = path.join(projectRoot, "node_modules/expo-modules-jsi");
  if (!fs.existsSync(source))
    throw new Error(
      "Install project dependencies before preparing the iOS build.",
    );
  const projectId = createHash("sha256")
    .update(projectRoot)
    .digest("hex")
    .slice(0, 12);
  const root = path.join(
    os.homedir(),
    "Library/Caches/TalentHunter/native-build",
    projectId,
  );
  let target;
  if (fs.lstatSync(source).isSymbolicLink()) {
    target = fs.realpathSync(source);
    if (!target.startsWith(root + path.sep))
      throw new Error(
        "An unfamiliar ExpoModulesJSI symlink exists; inspect it before building.",
      );
  } else {
    fs.mkdirSync(root, { recursive: true });
    const directory = fs.mkdtempSync(path.join(root, "expo-modules-jsi-"));
    target = path.join(directory, "package");
    fs.renameSync(source, target);
    try {
      fs.symlinkSync(target, source, "dir");
    } catch (error) {
      fs.renameSync(target, source);
      throw error;
    }
  }
  // Remove only Finder metadata that code signing rejects. Quarantine and other
  // security attributes are not removed. No signing protection is disabled.
  const result = spawnSync("xattr", ["-dr", "com.apple.FinderInfo", target], {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(
      "Could not clear Finder metadata from the dedicated iOS dependency cache.",
    );
  console.log(
    "ExpoModulesJSI build cache is outside the synced project folder.",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  prepareIosCache();
