// Frontend shapes mirror the four public database tables. TypeScript checks code,
// while SQL constraints and RLS validate actual data and permissions at runtime.
export type Role = "candidate" | "recruiter";
export type Profile = { id: string; role: Role; full_name: string };
export type Job = {
  id: string;
  recruiter_id: string;
  title: string;
  description: string;
  location: string;
  created_at: string;
};
// storage_path identifies private file bytes; original_name is only the display filename.
export type Resume = {
  id: string;
  candidate_id: string;
  storage_path: string;
  original_name: string;
  created_at: string;
};
// resume_id and candidate_name preserve the CV version and name at submission time.
export type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  candidate_name: string;
  resume_id: string;
  created_at: string;
};
