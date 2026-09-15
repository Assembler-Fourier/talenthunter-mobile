import { Stack } from "expo-router";
import { colors } from "@/components/ui";
import { Brand } from "@/components/Brand";
// Candidate screens share a navigation header; the root layout guards this group.
export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Find your next role", headerTitle: () => <Brand /> }}
      />
      <Stack.Screen name="profile" options={{ title: "My resume" }} />
      <Stack.Screen name="job" options={{ title: "Job details" }} />
    </Stack>
  );
}
