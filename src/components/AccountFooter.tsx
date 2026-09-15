import { useRef, useState } from "react";
import { Button, Message } from "./ui";
import { supabase } from "@/lib/supabase";
import { signOutMessage } from "@/lib/signOut";
export function AccountFooter() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function signOut() {
    // Close this session only. AuthProvider observes sign-out and removes protected routes.
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setError(
        await signOutMessage(() => supabase.auth.signOut({ scope: "local" })),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Message error>{error}</Message>
      <Button
        label={busy ? "Signing out..." : "Sign out"}
        secondary
        disabled={busy}
        onPress={() => {
          void signOut();
        }}
      />
    </>
  );
}
