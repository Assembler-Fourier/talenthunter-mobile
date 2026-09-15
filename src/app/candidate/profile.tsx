import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { latestResume, uploadResume, openResume } from "@/lib/api";
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
export default function Profile() {
  const { profile } = useAuth();
  const locked = useRef(false);
  // The newest metadata row is the current CV; older rows remain for past applications.
  const { data, loading, error, refresh } = useResource(
    useCallback(() => latestResume(profile!.id), [profile]),
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  async function upload() {
    // Only one picker/upload runs at a time. Cancelling returns null without a success message.
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const resume = await uploadResume(profile!.id);
      if (resume) {
        setMessage(
          "Resume uploaded. It will be used for your next application.",
        );
        await refresh();
      }
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title>Your resume, ready to go.</Title>
      <Body>
        Upload a PDF up to 5 MB. Earlier applications keep the resume you
        submitted at the time.
      </Body>
      <Message error>{error || actionError}</Message>
      <Message>{message}</Message>
      {loading ? (
        <Loading />
      ) : !error ? (
        // A failed request is not proof of an empty profile; show Retry below instead.
        <Card>
          <Body>
            {data
              ? `Current resume: ${data.original_name}`
              : "You have not uploaded a resume yet."}
          </Body>
          {data && (
            // Generate a fresh authorised link on each tap, rather than storing an expiring URL.
            <Button
              secondary
              label="Open current resume"
              onPress={() => {
                void openResume(data.storage_path).catch((e) =>
                  setActionError(errorMessage(e)),
                );
              }}
            />
          )}
          <Button
            label={
              busy
                ? "Uploading..."
                : data
                  ? "Upload a new resume"
                  : "Choose and upload PDF"
            }
            disabled={busy}
            onPress={() => {
              void upload();
            }}
          />
        </Card>
      ) : null}
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
