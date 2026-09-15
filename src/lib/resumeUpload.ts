import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resume } from "./types";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// This improves client feedback. Storage policies still enforce ownership/size;
// a trusted content scanner would be needed to validate files from direct clients.
export function validateResumeBytes(bytes: ArrayBuffer) {
  if (!bytes.byteLength || bytes.byteLength > MAX_RESUME_BYTES)
    throw new Error("Choose a PDF between 1 byte and 5 MB.");
  const signature = String.fromCharCode(...new Uint8Array(bytes).slice(0, 5));
  if (signature !== "%PDF-")
    throw new Error(
      "This file does not appear to be a PDF. Please choose a PDF resume.",
    );
}

export async function storeResume(
  client: SupabaseClient,
  candidateId: string,
  id: string,
  name: string,
  bytes: ArrayBuffer,
) {
  validateResumeBytes(bytes);
  // Each upload gets a new ID/path. Overwriting is disabled to preserve submitted CV versions.
  const storage_path = `${candidateId}/${id}.pdf`;
  const { error: uploadError } = await client.storage
    .from("resumes")
    .upload(storage_path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) throw uploadError;
  // Storage holds bytes; the resumes table holds metadata used by profiles/applications.
  // These are separate requests: a failed metadata insert can leave an orphan file.
  const { data, error } = await client
    .from("resumes")
    .insert({ id, storage_path, original_name: name.slice(0, 255) })
    .select()
    .single();
  if (error)
    throw new Error(
      `The file uploaded but could not be saved to your profile. Please retry. ${error.message}`,
    );
  return data as Resume;
}
