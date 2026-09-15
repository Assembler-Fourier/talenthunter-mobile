#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/native-env.sh

# Daily launch only: this does not reset simulator data or rebuild native code.
case "${1:-}" in
  android)
    adb get-state >/dev/null
    adb reverse tcp:54321 tcp:54321
    adb reverse tcp:8082 tcp:8082
    adb shell am start -n com.uzairwaseem.talenthunter/.MainActivity
    ;;
  ios)
    derived="${TALENTHUNTER_IOS_BUILD_DIR:-$HOME/Library/Developer/Xcode/DerivedData/TalentHunter}"
    app="$derived/Build/Products/Debug-iphonesimulator/TalentHunter.app"
    if [ ! -d "$app" ]; then
      echo "Build the iOS simulator app first using the VS Code build task."
      exit 1
    fi
    # 'booted' deliberately targets the user's running simulator.
    xcrun simctl install booted "$app"
    xcrun simctl launch booted com.uzairwaseem.talenthunter
    open -a Simulator
    ;;
  *)
    echo "Usage: bash scripts/open-local-app.sh <android|ios>"
    exit 1
    ;;
esac
