import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Brand } from "@/components/Brand";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { configurationMissing } from "@/lib/supabase";
import { AccountFooter } from "@/components/AccountFooter";
import {
  Screen,
  Body,
  Loading,
  Button,
  Message,
  colors,
} from "@/components/ui";
// Wait for both the Auth session and database profile before choosing a route.
// A valid login without a loaded profile must not be mistaken for a candidate.
function Navigation() {
  const { loading, session, profile, error, retry } = useAuth();
  if (configurationMissing)
    return (
      <Screen>
        <Message error>
          Add the Supabase URL and publishable key to .env, then restart Expo.
        </Message>
      </Screen>
    );
  if (loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (session && !profile)
    return (
      <Screen>
        <Message error>{error || "Loading your account profile..."}</Message>
        <Button label="Retry profile" onPress={retry} />
        <AccountFooter />
        <Body>Your account needs a candidate or recruiter profile.</Body>
      </Screen>
    );
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Route guards control navigation; database RLS separately protects data. */}
      <Stack.Protected guard={!session}>
        <Stack.Screen
          name="sign-in"
          options={{ title: "TalentHunter", headerTitle: () => <Brand /> }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!!session && profile?.role === "candidate"}>
        <Stack.Screen name="candidate" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && profile?.role === "recruiter"}>
        <Stack.Screen name="recruiter" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  // One provider shares the current account with every screen below this stack.
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Navigation />
    </AuthProvider>
  );
}
