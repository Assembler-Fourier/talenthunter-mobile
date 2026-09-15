import { useCallback, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { job, openResume } from "@/lib/api";
import { loadApplicantPage, APPLICANT_PAGE_SIZE } from "@/lib/applicantPage";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/useResource";
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
export default function Applicants() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const [actionError, setActionError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [position, setPosition] = useState({ jobId: id, page: 0 });
  // Switching jobs resets pagination instead of reusing the previous job's page number.
  const page = position.jobId === id ? position.page : 0;
  const { data, loading, error, refresh } = useResource(
    useCallback(async () => {
      const [item, result] = await Promise.all([
        job(id),
        loadApplicantPage(supabase, id, page),
      ]);
      return { item, ...result, page };
    }, [id, page]),
  );
  return (
    <Screen>
      <Message error>{error || actionError}</Message>
      {loading && <Loading />}
      {/* Avoid showing the previous job/page while a new request is still loading. */}
      {data && data.item.id === id && data.page === page && (
        <>
          <Title>{data.item.title}</Title>
          <Body>
            {data.total} application
            {data.total === 1 ? "" : "s"}
          </Body>
          {!data.total && (
            <Body>
              No applications yet. Candidates can find this job in their feed.
            </Body>
          )}
          {data.people.map((person) => {
            // Match the CV recorded on the application, not the candidate's newest upload.
            const resume = data.resumes.find((r) => r.id === person.resume_id);
            return (
              <Card key={person.id}>
                <Title>{person.candidate_name}</Title>
                <Body>
                  Applied {new Date(person.created_at).toLocaleDateString()}
                </Body>
                <Body>{resume?.original_name || "Resume unavailable"}</Body>
                <Button
                  label={opening === person.id ? "Opening..." : "Open resume"}
                  disabled={!resume || opening !== null}
                  onPress={() => {
                    if (!resume) return;
                    setOpening(person.id);
                    setActionError("");
                    void openResume(resume.storage_path)
                      .catch((e) => setActionError(errorMessage(e)))
                      .finally(() => setOpening(null));
                  }}
                />
              </Card>
            );
          })}
          {/* The exact RLS-filtered count controls pagination, not the visible page length. */}
          {(data.total > APPLICANT_PAGE_SIZE || page > 0) && (
            <>
              <Body>
                Page {page + 1} of{" "}
                {Math.max(1, Math.ceil(data.total / APPLICANT_PAGE_SIZE))}
              </Body>
              <Button
                secondary
                label="Previous applicants"
                disabled={loading || page === 0}
                onPress={() => setPosition({ jobId: id, page: page - 1 })}
              />
              <Button
                secondary
                label="Next applicants"
                disabled={
                  loading || (page + 1) * APPLICANT_PAGE_SIZE >= data.total
                }
                onPress={() => setPosition({ jobId: id, page: page + 1 })}
              />
            </>
          )}
        </>
      )}
      <Button
        secondary
        label="Refresh applicants"
        disabled={loading}
        onPress={() => {
          void refresh();
        }}
      />
    </Screen>
  );
}
