// Inject the action so error handling can be tested without creating a real Auth session.
type SignOutAction = () => Promise<{ error: { message: string } | null }>;

// Normalise both resolved SDK errors and rejected storage/network promises.
export async function signOutMessage(action: SignOutAction): Promise<string> {
  try {
    const result = await action();
    return result.error?.message || "";
  } catch (error) {
    return typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
      ? error.message
      : "Could not sign out. Please try again.";
  }
}
