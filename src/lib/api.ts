import { Platform, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import type { Job, Resume, Application } from "./types";
import { MAX_RESUME_BYTES, storeResume } from "./resumeUpload";
// Shared service functions keep queries and device APIs out of screen rendering.
// Filters narrow requested data; Supabase RLS remains the permission boundary.
export async function jobs(recruiterId?: string) {
  let query = supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });
  if (recruiterId) query = query.eq("recruiter_id", recruiterId);
  const { data, error } = await query;
  if (error) throw error;
  return data as Job[];
}
export async function job(id: string) {
  // single() treats a missing job as an error, rather than an empty successful detail page.
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Job;
}
export async function applications(candidateId?: string, jobId?: string) {
  // Optional filters support the feed's Applied badges and a particular job's submission state.
  let query = supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (candidateId) query = query.eq("candidate_id", candidateId);
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) throw error;
  return data as Application[];
}
export async function latestResume(candidateId: string) {
  // No row is a valid first-use state, so maybeSingle() returns null instead of throwing.
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Resume | null;
}
export async function uploadResume(candidateId: string) {
  // The picker accepts one PDF. Copying to cache gives native file reading a usable local URI.
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_RESUME_BYTES)
    throw new Error("Choose a PDF up to 5 MB.");
  const bytes =
    // Web supplies a browser File; native supplies a URI read through Expo FileSystem.
    Platform.OS === "web" && asset.file
      ? await asset.file.arrayBuffer()
      : await new File(asset.uri).arrayBuffer();
  return storeResume(
    supabase,
    candidateId,
    Crypto.randomUUID(),
    asset.name,
    bytes,
  );
}
export async function openResume(path: string) {
  // Ask Storage for a fresh, short-lived URL on every tap. RLS checks access here.
  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(path, 60);
  if (error) throw error;
  // Hand the temporary URL to the platform viewer/browser; the bucket stays private.
  await Linking.openURL(data.signedUrl);
}
