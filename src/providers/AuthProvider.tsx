import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, configurationMissing } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { errorMessage } from "@/lib/errors";

// Session proves authentication; profile supplies the database-backed role and display name.
type Auth = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string;
  retry: () => void;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  // Restore a saved session and subscribe once to later sign-in, refresh and sign-out events.
  useEffect(() => {
    if (configurationMissing) {
      setInitialising(false);
      return;
    }
    let alive = true;
    // A late getSession result must not overwrite a newer authentication event.
    let receivedEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      receivedEvent = true;
      if (alive) {
        setSession(next);
        setInitialising(false);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive || receivedEvent) return;
        setSession(data.session);
        setInitialising(false);
        if (error) setError(error.message);
      })
      .catch((e) => {
        if (alive) {
          setError(errorMessage(e));
          setInitialising(false);
        }
      });
    // Refresh native tokens while the app is active; pause background work when it sleeps.
    const onState = (state: string) =>
      state === "active"
        ? supabase.auth.startAutoRefresh()
        : supabase.auth.stopAutoRefresh();
    if (Platform.OS !== "web") onState(AppState.currentState);
    const appState = AppState.addEventListener("change", onState);
    return () => {
      alive = false;
      subscription.unsubscribe();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);
  // Fetch the role from profiles instead of trusting mutable Auth user metadata.
  // Clearing the previous profile prevents an account switch from reusing someone else's role.
  useEffect(() => {
    let alive = true;
    setProfile(null);
    setError("");
    if (!session?.user.id) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", session.user.id)
      .single()
      .then(
        ({ data, error }) => {
          if (!alive) return;
          if (error) setError(`Could not load your profile: ${error.message}`);
          else setProfile(data as Profile);
          setProfileLoading(false);
        },
        (e: unknown) => {
          if (alive) {
            setError(errorMessage(e));
            setProfileLoading(false);
          }
        },
      );
    return () => {
      // Requests may finish after logout/account switching; ignore those old results.
      alive = false;
    };
  }, [session?.user.id, revision]);
  return (
    <Context.Provider
      value={{
        session,
        profile,
        loading: initialising || profileLoading,
        error,
        retry,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  // Fail clearly during development if a screen is mounted outside the shared provider.
  const value = useContext(Context);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
