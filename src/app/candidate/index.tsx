import { useCallback } from "react";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { jobs, applications } from "@/lib/api";
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
export default function CandidateHome() {
  const { profile } = useAuth();
  // Fetch jobs and this candidate's applications together so cards can show Applied.
  // useResource refreshes when the screen regains focus after an application.
  const { data, loading, error, refresh } = useResource(
    useCallback(async () => {
      const [available, mine] = await Promise.all([
        jobs(),
        applications(profile!.id),
      ]);
      return { available, mine };
    }, [profile]),
  );
  return (
    <Screen>
      <Title>Hello, {profile?.full_name}.</Title>
      <Body>Explore open roles and send your resume.</Body>
      <Button
        label="Manage my resume"
        onPress={() => router.push("/candidate/profile")}
      />
      <Message error>{error}</Message>
      <Button
        secondary
        label="Refresh jobs"
        onPress={() => {
          void refresh();
        }}
        disabled={loading}
      />
      {loading && <Loading />}
      {!loading && data?.available.length === 0 && (
        <Body>No jobs have been posted yet. Check back soon.</Body>
      )}
      {/* Each card carries its job ID into the detail route; no whole record is copied. */}
      {data?.available.map((item) => (
        <Card key={item.id}>
          <Title>{item.title}</Title>
          <Body>{item.location}</Body>
          <Body>
            {item.description.length > 180
              ? `${item.description.slice(0, 180)}...`
              : item.description}
          </Body>
          {data.mine.some((a) => a.job_id === item.id) && (
            <Message>Applied</Message>
          )}
          <Button
            label="View job"
            secondary
            onPress={() =>
              router.push({
                pathname: "/candidate/job",
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
