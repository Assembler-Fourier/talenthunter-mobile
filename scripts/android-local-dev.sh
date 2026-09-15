#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/native-env.sh
# ADB carries the emulator/device loopback request to the Mac, without LAN exposure.
# Set ANDROID_SERIAL if more than one device is connected.
adb reverse tcp:54321 tcp:54321
exec node scripts/with-backend.mjs local npx expo run:android --port 8082
