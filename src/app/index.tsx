import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
export default function Index() {
  // The root URL lands in the workspace for the role stored in the profile.
  const { profile } = useAuth();
  if (!profile) return <Redirect href="/sign-in" />;
  return (
    <Redirect
      href={profile.role === "candidate" ? "/candidate" : "/recruiter"}
    />
  );
}
