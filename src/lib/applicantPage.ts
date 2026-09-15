import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, Resume } from "./types";

export const APPLICANT_PAGE_SIZE = 25;
export async function loadApplicantPage(
  client: SupabaseClient,
  jobId: string,
  page = 0,
  size = APPLICANT_PAGE_SIZE,
) {
  // Bound pagination inputs before using them to calculate database range offsets.
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100 ||
    !Number.isSafeInteger((page + 1) * size)
  ) {
    throw new Error("Invalid applicant page.");
  }
  // Both rows and exact count obey the caller's RLS policies. The ID breaks timestamp ties.
  const { data, error, count } = await client
    .from("applications")
    .select("*", { count: "exact" })
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * size, (page + 1) * size - 1);
  if (error) throw error;
  if (count === null)
    throw new Error("Could not load the applicant count. Please retry.");
  const people = data as Application[];
  let resumes: Resume[] = [];
  // Fetch metadata only for this page's submitted CV IDs, avoiding one query per applicant.
  if (people.length) {
    const result = await client
      .from("resumes")
      .select("*")
      .in(
        "id",
        people.map((person) => person.resume_id),
      );
    if (result.error) throw result.error;
    resumes = result.data as Resume[];
  }
  return { people, resumes, total: count };
}
