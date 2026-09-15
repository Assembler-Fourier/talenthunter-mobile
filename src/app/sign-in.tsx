import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Screen,
  Title,
  Body,
  Card,
  Field,
  Button,
  Message,
  colors,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  authErrorMessage,
  validEmail,
  type EmailFlowMode,
} from "@/lib/emailAuth";
import { EmailVerification } from "@/components/EmailVerification";
import type { Role } from "@/lib/types";
export default function SignIn() {
  // One form supports sign-in and signup; account type is chosen only during signup.
  const [signup, setSignup] = useState(false);
  const [role, setRole] = useState<Role>("candidate");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailFlow, setEmailFlow] = useState<EmailFlowMode | null>(null);
  const [codeAlreadySent, setCodeAlreadySent] = useState(false);
  const inFlight = useRef(false);
  async function submit() {
    // A synchronous lock prevents double requests before busy updates the button.
    if (inFlight.current) return;
    setError("");
    setMessage("");
    if (!email.trim() || !password || (signup && !name.trim())) {
      setError("Please complete all the fields.");
      return;
    }
    if (signup && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (!validEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      if (signup) {
        // Supabase Auth creates the user; the database trigger creates their fixed-role profile.
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { role, full_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is required: move to the code screen and discard the password.
          setCodeAlreadySent(true);
          setEmailFlow("signup");
          setSignup(false);
          setPassword("");
        }
      } else {
        // AuthProvider observes the resulting session and the root layout chooses the workspace.
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (emailFlow)
    // Confirmation/recovery use an isolated client, so verifying a code cannot open a workspace.
    return (
      <EmailVerification
        key={emailFlow}
        mode={emailFlow}
        initialEmail={email}
        codeAlreadySent={codeAlreadySent}
        onBack={() => {
          setEmailFlow(null);
          setCodeAlreadySent(false);
          setSignup(false);
          setPassword("");
          setError("");
          setMessage("");
        }}
      />
    );
  return (
    <Screen>
      <Title>
        {signup ? "Make your next move." : "Welcome to TalentHunter."}
      </Title>
      <Body>
        {signup
          ? "Create an account to find work or meet your next hire."
          : "Find opportunities. Connect with candidates."}
      </Body>
      <Card>
        {/* Role and name belong to account creation, not to normal login credentials. */}
        {signup && (
          <>
            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              maxLength={120}
              autoComplete="name"
            />
            <Body>I am a...</Body>
            <View
              role={Platform.OS === "web" ? "group" : "radiogroup"}
              accessibilityLabel="Account type"
              style={{ flexDirection: "row", gap: 10 }}
            >
              <View style={{ flex: 1 }}>
                <Button
                  label="Candidate"
                  selected={role === "candidate"}
                  secondary={role !== "candidate"}
                  onPress={() => setRole("candidate")}
                  disabled={busy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Recruiter"
                  selected={role === "recruiter"}
                  secondary={role !== "recruiter"}
                  onPress={() => setRole("recruiter")}
                  disabled={busy}
                />
              </View>
            </View>
          </>
        )}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <View>
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secureTextEntry
            autoComplete={signup ? "new-password" : "current-password"}
            onSubmitEditing={() => {
              void submit();
            }}
          />
          {!signup && (
            <View style={authStyles.passwordHelp}>
              <AuthAction
                label="Forgot password?"
                disabled={busy}
                onPress={() => {
                  setCodeAlreadySent(false);
                  setEmailFlow("recovery");
                }}
              />
            </View>
          )}
        </View>
        {/* Errors keep the form usable; only the primary submit action uses the filled button. */}
        <Message error>{error}</Message>
        <Message>{message}</Message>
        <Button
          label={
            busy ? "Please wait..." : signup ? "Create account" : "Sign in"
          }
          disabled={busy}
          onPress={() => {
            void submit();
          }}
        />
        <View style={authStyles.accountPrompt}>
          <Text style={authStyles.hint}>
            {signup ? "Already have an account?" : "New here?"}
          </Text>
          <AuthAction
            disabled={busy}
            label={signup ? "Sign in" : "Create an account"}
            onPress={() => {
              setSignup(!signup);
              setError("");
              setMessage("");
            }}
          />
        </View>
      </Card>
      {!signup && (
        <View style={authStyles.emailHelp}>
          <Text style={authStyles.hint}>Still need to verify your email?</Text>
          <AuthAction
            label="Confirm my email"
            disabled={busy}
            onPress={() => {
              setCodeAlreadySent(false);
              setEmailFlow("signup");
            }}
          />
        </View>
      )}
    </Screen>
  );
}

// Secondary auth actions stay easy to tap without competing with Sign in.
function AuthAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        authStyles.textAction,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text style={authStyles.textActionLabel}>{label}</Text>
    </Pressable>
  );
}

// Wrapping secondary actions keeps them usable on narrow screens and larger text settings.
const authStyles = StyleSheet.create({
  passwordHelp: { alignItems: "flex-end" },
  accountPrompt: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 6,
  },
  emailHelp: { alignItems: "center" },
  hint: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  textAction: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
  },
  textActionLabel: {
    color: colors.primary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
