-- Initial assessment schema. Apply to a NEW, dedicated Supabase project.
-- No UPDATE/DELETE grants: submitted records and CV files are immutable in this MVP.
begin;

-- ACCOUNT PROFILES: one row per Auth user; the role is fixed for this assessment.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('candidate', 'recruiter')),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  created_at timestamptz not null default now()
);

-- SIGNUP: copy only the initial role/name from Auth metadata into the protected table.
-- The definer trigger can create the profile before a normal user session exists.
create function public.create_assessment_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, new.raw_user_meta_data->>'role', trim(new.raw_user_meta_data->>'full_name'));
  return new;
end;
$$;
revoke all on function public.create_assessment_profile() from public, anon, authenticated;
create trigger create_assessment_profile after insert on auth.users
for each row execute function public.create_assessment_profile();

-- JOBS: ownership comes from the authenticated caller, not a form-supplied recruiter ID.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null default auth.uid() references public.profiles(id),
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null check (length(trim(description)) between 1 and 10000),
  location text not null check (length(trim(location)) between 1 and 160),
  created_at timestamptz not null default now()
);
create index jobs_recruiter_idx on public.jobs(recruiter_id);

-- CV METADATA: bytes live in Storage; this row names a unique, owner-scoped file path.
-- Keeping every upload as a new row preserves earlier submissions when a CV changes.
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null default auth.uid() references public.profiles(id),
  storage_path text not null unique,
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  created_at timestamptz not null default now(),
  unique (id, candidate_id),
  check (storage_path = candidate_id::text || '/' || id::text || '.pdf')
);
create index resumes_candidate_idx on public.resumes(candidate_id);

-- APPLICATIONS: the unique pair prevents duplicates, including concurrent requests.
-- The composite foreign key requires the submitted resume to belong to the applicant.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  candidate_id uuid not null default auth.uid() references public.profiles(id),
  resume_id uuid not null,
  -- Snapshot supplied by the database, not by the client.
  candidate_name text not null,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id),
  foreign key (resume_id, candidate_id) references public.resumes(id, candidate_id)
);
create index applications_candidate_idx on public.applications(candidate_id);
create index applications_resume_idx on public.applications(resume_id);

-- PERMISSIONS: grants define allowed operations/columns; RLS limits which rows qualify.
-- Both are enforced on the server even when someone bypasses the mobile interface.
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.resumes enable row level security;
alter table public.applications enable row level security;

revoke all on public.profiles, public.jobs, public.resumes, public.applications
from public, anon, authenticated;
grant select on public.profiles, public.jobs, public.resumes, public.applications to authenticated;
-- Column grants also stop clients forging owners, timestamps and candidate names.
grant insert (title, description, location) on public.jobs to authenticated;
grant insert (id, storage_path, original_name) on public.resumes to authenticated;
grant insert (job_id, resume_id) on public.applications to authenticated;

-- PROFILE PRIVACY: a signed-in user can retrieve only their own profile.
create policy profiles_read_self on public.profiles for select to authenticated
using (id = (select auth.uid()));

-- JOB FEED: signed-in users can browse all jobs; only recruiters can create owned jobs.
create policy jobs_read_signed_in on public.jobs for select to authenticated using (true);
create policy jobs_insert_recruiter on public.jobs for insert to authenticated
with check (
  recruiter_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'recruiter'
  )
);

-- APPLICATION PRIVACY: reads are limited to the candidate or that job's recruiter.
create policy applications_read_participant on public.applications for select to authenticated
using (
  candidate_id = (select auth.uid()) or exists (
    select 1 from public.jobs j where j.id = applications.job_id and j.recruiter_id = (select auth.uid())
  )
);
create policy applications_insert_candidate on public.applications for insert to authenticated
with check (
  candidate_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'candidate'
  )
);

-- CV METADATA PRIVACY: a recruiter needs an application referencing this exact CV version.
create policy resumes_read_owner_or_recipient on public.resumes for select to authenticated
using (
  candidate_id = (select auth.uid()) or exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.resume_id = resumes.id and j.recruiter_id = (select auth.uid())
  )
);
create policy resumes_insert_candidate on public.resumes for insert to authenticated
with check (
  candidate_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'candidate'
  )
);

-- FILE STORAGE: a private bucket limits size and declared MIME type to 5 MB/PDF.
-- Declared MIME is not content inspection or malware scanning; clients can spoof it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf']);

-- UPLOADS: candidates may create PDFs directly beneath their own user-ID folder only.
create policy resume_files_insert_owner on storage.objects for insert to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.extension(name) = 'pdf'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'candidate')
);
-- FILE READS: independently enforce owner/recipient access, including signed-link creation.
create policy resume_files_read_owner_or_recipient on storage.objects for select to authenticated
using (
  bucket_id = 'resumes' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.resumes r
      join public.applications a on a.resume_id = r.id
      join public.jobs j on j.id = a.job_id
      where r.storage_path = storage.objects.name and j.recruiter_id = (select auth.uid())
    )
  )
);

-- Invoker privileges deliberately retained: the candidate can only resolve their
-- own profile/CV. RLS and the composite foreign key remain the final authority.
-- SUBMISSION CHECK: derive the candidate name and require both metadata and uploaded bytes.
create function public.prepare_assessment_application()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.candidate_id is distinct from auth.uid() then
    raise exception 'Cannot apply as another candidate' using errcode = '42501';
  end if;
  select p.full_name into new.candidate_name from public.profiles p
  where p.id = auth.uid() and p.role = 'candidate';
  if new.candidate_name is null then
    raise exception 'A candidate profile is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.resumes r join storage.objects o
      on o.bucket_id = 'resumes' and o.name = r.storage_path
    where r.id = new.resume_id and r.candidate_id = auth.uid()
  ) then
    raise exception 'Upload your resume before applying' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_assessment_application() from public, anon, authenticated;
create trigger prepare_assessment_application before insert on public.applications
for each row execute function public.prepare_assessment_application();

commit;
