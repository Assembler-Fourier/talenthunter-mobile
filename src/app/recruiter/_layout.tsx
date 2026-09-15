import { Stack } from "expo-router";
import { colors } from "@/components/ui";
import { Brand } from "@/components/Brand";
// Recruiter screens share a navigation header; the root layout guards this group.
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
        options={{ title: "Recruiter workspace", headerTitle: () => <Brand /> }}
      />
      <Stack.Screen name="post" options={{ title: "Post a job" }} />
      <Stack.Screen name="applicants" options={{ title: "Applicants" }} />
    </Stack>
  );
}
