#!/usr/bin/env bash
# Prefer valid caller configuration; use the audited Mac toolchain as fallback.
if [ -z "${JAVA_HOME:-}" ] && [ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
if [ ! -d "${ANDROID_HOME:-}/platforms" ]; then
  if [ -d "${ANDROID_SDK_ROOT:-}/platforms" ]; then
    export ANDROID_HOME="$ANDROID_SDK_ROOT"
  elif [ -d /opt/homebrew/share/android-commandlinetools/platforms ]; then
    export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  elif [ "$(uname -s)" = Darwin ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  else
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
# Only execute arguments when invoked directly, not when another script sources us.
if [ "${BASH_SOURCE[0]}" = "$0" ] && [ "$#" -gt 0 ]; then exec "$@"; fi
