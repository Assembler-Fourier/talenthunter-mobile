import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createSessionStorage } from "./sessionStorage";

// EXPO_PUBLIC values are bundled into the app: use the public key, never an admin key.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configurationMissing = !url || !key;
// Static web rendering has no browser storage and must not start a persistent user session.
const serverRender = Platform.OS === "web" && typeof window === "undefined";

// Native sessions use a serial, byte-bounded adapter with corruption recovery.
const secureStorage = createSessionStorage(SecureStore);

export const supabase = createClient(
  url || "https://unconfigured.supabase.co",
  key || "unconfigured",
  {
    auth: {
      storage: serverRender
        ? undefined
        : Platform.OS === "web"
          ? AsyncStorage
          : secureStorage,
      autoRefreshToken: !serverRender,
      persistSession: !serverRender,
      detectSessionInUrl: false,
    },
  },
);

let verificationClientNumber = 0;
export function createEmailVerificationClient() {
  // Recovery/confirmation sessions live only in this client and cannot replace the app login.
  return createClient(
    url || "https://unconfigured.supabase.co",
    key || "unconfigured",
    {
      auth: {
        storageKey: `talenthunter-email-verification-${++verificationClientNumber}`,
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
