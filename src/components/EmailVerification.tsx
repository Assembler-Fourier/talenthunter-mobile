import { useEffect, useRef, useState } from "react";
import { Screen, Title, Body, Card, Field, Button, Message } from "./ui";
import { createEmailVerificationClient } from "@/lib/supabase";
import {
  authErrorMessage,
  createEmailAuthFlow,
  type EmailFlowMode,
} from "@/lib/emailAuth";

export function EmailVerification({
  mode,
  initialEmail,
  codeAlreadySent = false,
  onBack,
}: {
  mode: EmailFlowMode;
  initialEmail: string;
  codeAlreadySent?: boolean;
  onBack: () => void;
}) {
  // Create one isolated Auth flow for this screen's lifetime, not one per render.
  const [flow] = useState(() =>
    createEmailAuthFlow(createEmailVerificationClient().auth, mode),
  );
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // Signup follows email → code → done; recovery adds a password step after verification.
  const [stage, setStage] = useState<"email" | "code" | "password" | "done">(
    codeAlreadySent ? "code" : "email",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    codeAlreadySent
      ? "Check your inbox and spam folder for your confirmation code."
      : "",
  );
  const [waitUntil, setWaitUntil] = useState(
    codeAlreadySent ? Date.now() + 60000 : 0,
  );
  const [seconds, setSeconds] = useState(codeAlreadySent ? 60 : 0);
  const inFlight = useRef(false);
  useEffect(() => {
    // The countdown discourages repeated sends; Supabase independently enforces rate limits.
    if (!waitUntil) return;
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [waitUntil]);

  async function perform(action: "send" | "verify" | "save") {
    // One action at a time keeps the UI stage aligned with the last completed Auth request.
    if (inFlight.current || (action === "send" && seconds > 0)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "send") {
        await flow.requestCode(email);
        setStage("code");
        setToken("");
        setSeconds(60);
        setWaitUntil(Date.now() + 60000);
        setMessage(
          // Neutral wording avoids confirming whether a recovery email has an account.
          mode === "recovery"
            ? "If an account exists for this email, a reset code has been sent. Check your inbox and spam folder."
            : "If this account needs confirmation, a code has been sent. Check your inbox and spam folder.",
        );
      } else if (action === "verify") {
        await flow.verifyCode(email, token);
        setToken("");
        setStage(mode === "recovery" ? "password" : "done");
      } else {
        await flow.savePassword(password, confirmation);
        setPassword("");
        setConfirmation("");
        setStage("done");
      }
    } catch (e) {
      setError(authErrorMessage(e));
      if (
        action === "send" &&
        e &&
        typeof e === "object" &&
        "status" in e &&
        e.status === 429
      ) {
        setSeconds(60);
        setWaitUntil(Date.now() + 60000);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function back() {
    // Discard the temporary verification session when returning to ordinary sign-in.
    void flow.close();
    onBack();
  }
  return (
    <Screen>
      <Title>
        {mode === "recovery" ? "Reset your password." : "Confirm your email."}
      </Title>
      <Body>
        {mode === "recovery"
          ? "Use an email code to choose a new password."
          : "Enter the code sent to your email to finish creating your account."}
      </Body>
      <Card>
        {/* Render only the fields for the current step; clear codes/passwords after success. */}
        {stage === "done" ? (
          <Message>
            {mode === "recovery"
              ? "Password updated. Sign in with your new password."
              : "Email confirmed. You can now sign in."}
          </Message>
        ) : stage === "password" ? (
          <>
            <Body>
              Email verified. Choose a new password for {email.trim()}.
            </Body>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
            />
            <Field
              label="Confirm new password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
              onSubmitEditing={() => {
                void perform("save");
              }}
            />
            <Message error>{error}</Message>
            <Button
              label={busy ? "Saving..." : "Save new password"}
              disabled={busy}
              onPress={() => {
                void perform("save");
              }}
            />
          </>
        ) : (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!busy && stage === "email"}
            />
            {stage === "code" && (
              <Field
                label="Email code"
                value={token}
                onChangeText={setToken}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={10}
                editable={!busy}
                onSubmitEditing={() => {
                  void perform("verify");
                }}
              />
            )}
            <Message error>{error}</Message>
            <Message>{message}</Message>
            <Button
              label={
                busy
                  ? "Please wait..."
                  : stage === "code"
                    ? "Verify code"
                    : seconds > 0
                      ? `Request a code in ${seconds}s`
                      : "Send code"
              }
              disabled={busy || (stage === "email" && seconds > 0)}
              onPress={() => {
                void perform(stage === "code" ? "verify" : "send");
              }}
            />
            {stage === "email" && (
              <Button
                label="I already have a code"
                secondary
                disabled={busy}
                onPress={() => {
                  setStage("code");
                  setError("");
                }}
              />
            )}
            {stage === "code" && (
              <>
                <Button
                  label={
                    seconds > 0
                      ? `Request another code in ${seconds}s`
                      : "Resend code"
                  }
                  secondary
                  disabled={busy || seconds > 0}
                  onPress={() => {
                    void perform("send");
                  }}
                />
                <Button
                  label="Use a different email"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    setStage("email");
                    setToken("");
                    setError("");
                    setMessage("");
                  }}
                />
              </>
            )}
          </>
        )}
        <Button
          label="Back to sign in"
          secondary
          disabled={busy}
          onPress={back}
        />
      </Card>
    </Screen>
  );
}
