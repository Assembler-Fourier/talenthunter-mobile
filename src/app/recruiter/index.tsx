import { useCallback } from "react";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { jobs } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import {
  Screen,
  Title,
  Body,
  Card,
  Button,
  Message,
  Loading,
} from "@/components/ui";
import { AccountFooter } from "@/components/AccountFooter";
export default function RecruiterHome() {
  const { profile } = useAuth();
  // All signed-in users may browse jobs, so this filter selects the recruiter's workspace.
  // Private application/CV reads have their own database ownership policies.
  const { data, loading, error, refresh } = useResource(
    useCallback(() => jobs(profile!.id), [profile]),
  );
  return (
    <Screen>
      <Title>Welcome, {profile?.full_name}.</Title>
      <Body>Post opportunities and review your applicants.</Body>
      <Button
        label="Post a job"
        onPress={() => router.push("/recruiter/post")}
      />
      <Message error>{error}</Message>
      <Button
        secondary
        label="Refresh my jobs"
        disabled={loading}
        onPress={() => {
          void refresh();
        }}
      />
      {loading && <Loading />}
      {!loading && data?.length === 0 && (
        <Body>
          Your workspace is ready. Post your first job to get started.
        </Body>
      )}
      {/* Pass the owning job's ID to the applicants screen. */}
      {data?.map((item) => (
        <Card key={item.id}>
          <Title>{item.title}</Title>
          <Body>{item.location}</Body>
          <Button
            secondary
            label="View applicants"
            onPress={() =>
              router.push({
                pathname: "/recruiter/applicants",
                params: { id: item.id },
              })
            }
          />
        </Card>
      ))}
      <AccountFooter />
    </Screen>
  );
}
