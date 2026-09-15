#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/native-env.sh
npx expo prebuild --platform ios --no-install
node scripts/prepare-ios-cache.mjs
pod install --project-directory=ios
# Keep build products outside Desktop/Documents file-provider folders. FinderInfo
# metadata on synchronised build bundles can break Apple's code-signing checks.
derived="${TALENTHUNTER_IOS_BUILD_DIR:-$HOME/Library/Developer/Xcode/DerivedData/TalentHunter}"
xcodebuild -workspace ios/TalentHunter.xcworkspace -scheme TalentHunter \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$derived" build
printf '\nSimulator app: %s\n' "$derived/Build/Products/Debug-iphonesimulator/TalentHunter.app"
