#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Always select hosted .env explicitly; local development must not leak into an APK.
if [ "${TALENTHUNTER_HOSTED_BUILD:-}" != "1" ]; then
  exec node scripts/with-backend.mjs hosted-build bash scripts/build-android.sh
fi
source scripts/native-env.sh
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 \
  '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g' --console=plain
printf '\nStandalone assessment APK: %s\n' "$PWD/app/build/outputs/apk/release/app-release.apk"
