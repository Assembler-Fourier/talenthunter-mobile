# Backend

The initial migration has been applied to the dedicated TalentHunter assessment project and passed 34 live API integration checks. Reproduce it on a new project using `migrations/202609140001_initial.sql`; it intentionally fails on conflicting existing objects.

There are four tables and a private 5 MB PDF-only bucket. Signup must include `options.data: { role: 'candidate' | 'recruiter', full_name: string }`. A profile is created from initial metadata; clients cannot modify roles.

Upload bytes without upsert to `resumes/<user-id>/<resume-id>.pdf`, then insert metadata with that UUID, storage path and original filename. Insert an application with only `job_id` and `resume_id`. Ownership and candidate name are database-supplied/enforced.

No client updates/deletes are granted. Existing applications keep their submitted CV version. Failed upload/metadata operations can leave orphan files; retention, account deletion and cleanup need production design. MIME restrictions and the app's PDF header check are not malware scanning.

Use `tests/live-security.mjs` with the external private setup config for repeatable allowed/denied access checks. Admin creates fixtures; ordinary client sessions make assertions. Read the root README before running a suite; historical validation reports are kept with the separate study materials.

## Local environment

`config.toml` defines a separate PostgreSQL 17 / Auth / private Storage / Studio / Mailpit development stack. Start a Docker-compatible runtime such as OrbStack, then run `npm run local:start`. The same initial migration is applied locally. Use `local:seed` for synthetic accounts or `test:local` for a temporary fixture run. Local private details stay in ignored `.local/`; hosted configuration remains in `.env`.

`npm start` selects hosted `.env` on app port 8081; `npm run dev:local` selects the local CLI endpoints on app port 8082. Local API/Studio/Mailpit ports are 54321/54323/54324. Normal start/stop commands do not reset data. The existing hosted schema was initially applied directly: reconcile its CLI migration history before using `supabase db push` so the initial migration is not reapplied.
