import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailFlowMode = "signup" | "recovery";

export function validEmail(value: string) {
  // A lightweight form check catches obvious mistakes; Auth still validates the request.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function passwordProblem(password: string, confirmation: string) {
  // Share the same minimum-length and confirmation rules with recovery tests.
  if (password.length < 8) return "Use a password with at least 8 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return "";
}

// Verification sessions stay in memory, separate from the normal app session.
// A recovery session must not automatically open candidate/recruiter screens.
export function createEmailAuthFlow(
  auth: SupabaseClient["auth"],
  mode: EmailFlowMode,
) {
  let verified = false;
  return {
    async requestCode(email: string) {
      // Requesting another code invalidates this flow's previous verified state.
      verified = false;
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      const result =
        mode === "recovery"
          ? await auth.resetPasswordForEmail(email.trim())
          : await auth.resend({ type: "signup", email: email.trim() });
      if (result.error) throw result.error;
    },
    async verifyCode(email: string, token: string) {
      // Supabase verifies code validity/expiry; a correctly shaped string alone grants nothing.
      verified = false;
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      if (!/^\d{6,10}$/.test(token.trim()))
        throw new Error("Enter the numeric verification code from your email.");
      const { data, error } = await auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: mode === "recovery" ? "recovery" : "email",
      });
      if (error) throw error;
      if (!data.session || !data.user)
        throw new Error("Verification did not complete. Request a new code.");
      verified = mode === "recovery";
      if (mode === "signup") await this.close();
    },
    async savePassword(password: string, confirmation: string) {
      // Only a verified recovery flow may update a password; signup confirmation cannot.
      if (!verified || mode !== "recovery")
        throw new Error(
          "Verify your email code before changing your password.",
        );
      const problem = passwordProblem(password, confirmation);
      if (problem) throw new Error(problem);
      const { error } = await auth.updateUser({ password });
      if (error) throw error;
      verified = false;
      await this.close();
    },
    async close() {
      verified = false;
      try {
        await auth.signOut({ scope: "local" });
      } catch {
        // A saved password remains saved if logout fails. This client has no
        // persistent storage or background token refresh timer.
      }
    },
  };
}

export function authErrorMessage(error: unknown): string {
  // Translate stable Auth error codes into next steps without hiding unexpected SDK messages.
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  switch (code) {
    case "over_email_send_rate_limit":
      return "Too many emails have been requested. Please try again later. Existing accounts can still sign in.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit_per_user":
      return "Too many attempts. Please wait before trying again.";
    case "email_not_confirmed":
      return "Confirm your email first. Choose Confirm my email below to enter or request a code.";
    case "email_address_not_authorized":
      return "Email delivery is not available for this address yet. Please contact the demo owner.";
    case "otp_expired":
      return "This code is invalid or has expired. Check the latest email or request a new code.";
    case "invalid_credentials":
      return "The email or password is incorrect.";
    case "same_password":
      return "Choose a password different from your current password.";
    case "weak_password":
      return "Choose a stronger password with at least 8 characters.";
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Something went wrong. Please try again.";
}
