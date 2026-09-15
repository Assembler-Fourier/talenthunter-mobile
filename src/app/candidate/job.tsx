import { useCallback, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { job, latestResume, applications } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import {
  Screen,
  Title,
  Body,
  Card,
  Button,
  Message,
  Loading,
} from "@/components/ui";
export default function JobDetail() {
  // Route parameters identify the job; the signed-in profile identifies the applicant.
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { profile } = useAuth();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const { data, loading, error, refresh } = useResource(
    useCallback(async () => {
      // Load the prerequisites together: job, current CV and existing application.
      const [item, resume, mine] = await Promise.all([
        job(id),
        latestResume(profile!.id),
        applications(profile!.id, id),
      ]);
      return { item, resume, applied: mine.length > 0 };
    }, [id, profile]),
  );
  async function apply() {
    // The ref closes the gap before React renders the disabled button on a fast second tap.
    // The database also enforces one application per candidate/job across devices.
    if (!data?.resume || lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError("");
    try {
      // Submit the selected CV version. The database supplies candidate ID/name,
      // checks ownership and rejects a resume whose Storage file does not exist.
      const { error } = await supabase
        .from("applications")
        .insert({ job_id: id, resume_id: data.resume.id });
      if (error && error.code !== "23505") throw error; // A retry of a successful application is already complete.
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Message error>{error || actionError}</Message>
      {loading && <Loading />}
      {data && (
        <>
          <Title>{data.item.title}</Title>
          <Body>{data.item.location}</Body>
          <Card>
            <Body>{data.item.description}</Body>
          </Card>
          {data.applied ? (
            <Message>
              Application submitted. The recruiter can now review your resume.
            </Message>
          ) : (
            <Card>
              {/* Missing CVs lead to upload; they never produce an enabled Apply action. */}
              <Body>
                {data.resume
                  ? `Apply with ${data.resume.original_name}`
                  : "Upload your resume before applying."}
              </Body>
              {data.resume ? (
                <Button
                  label={busy ? "Submitting..." : "Apply for this job"}
                  disabled={busy}
                  onPress={() => {
                    void apply();
                  }}
                />
              ) : (
                <Button
                  label="Upload resume"
                  onPress={() => router.push("/candidate/profile")}
                />
              )}
            </Card>
          )}
        </>
      )}
      {!!error && (
        <Button
          secondary
          label="Retry"
          onPress={() => {
            void refresh();
          }}
        />
      )}
    </Screen>
  );
}
