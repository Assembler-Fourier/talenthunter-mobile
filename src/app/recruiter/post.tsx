import { useRef, useState } from "react";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { Screen, Title, Body, Field, Button, Message } from "@/components/ui";
export default function PostJob() {
  // Controlled fields hold the draft locally; nothing is published while typing.
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    // Validate before the request and block repeated taps while the insert is pending.
    if (lock.current) return;
    setError("");
    if (![title, location, description].every((v) => v.trim())) {
      setError("Please fill in the title, location and description.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      // Send editable fields only. auth.uid() supplies the owner and RLS requires a recruiter.
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          title: title.trim(),
          location: location.trim(),
          description: description.trim(),
        })
        .select("id")
        .single();
      if (error) throw error;
      // Replace the form so Back does not return to a successfully submitted draft.
      router.replace({
        pathname: "/recruiter/applicants",
        params: { id: data.id },
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title>Find your next teammate.</Title>
      <Body>Give candidates the details they need to apply.</Body>
      <Field
        label="Job title"
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      <Field
        label="Location / remote arrangement"
        value={location}
        onChangeText={setLocation}
        maxLength={160}
      />
      <Field
        label="Job description"
        value={description}
        onChangeText={setDescription}
        maxLength={10000}
        multiline
      />
      <Message error>{error}</Message>
      <Button
        label={busy ? "Publishing..." : "Publish job"}
        disabled={busy}
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
