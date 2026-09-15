# TalentHunter mobile assessment

A React Native app built with Expo, TypeScript and Supabase. Candidates upload a PDF resume and apply to jobs; recruiters publish jobs and review their own applicants.

## Deliverables

- [Android APK v1.0.2](https://drive.google.com/file/d/1uK2NEgned1_CZipw3v9SGKEfij--UYYC/view?usp=sharing) - standalone assessment build; about 66.5 MB.
- Source: this repository.
- Run/build instructions, test commands and scope decisions: below.

## Run

Use Node 22.13+ compatible with Expo SDK 57 and npm. This project was developed with Node 26. The existing Mac setup already has dependencies and hosted configuration; open the project in VS Code and run `npm start` in its terminal.

For a fresh checkout:

```sh
npm ci
cp .env.example .env
# Fill in the Supabase project URL and publishable key.
npm start
```

Do not overwrite an existing configured `.env`. Use only the public project URL and publishable/anon key in the app. Administrator credentials belong in external private setup files.

`npm start` selects hosted Supabase and serves Metro on port 8081. Press `i` for the iOS simulator or `w` for web. Stop the terminal process with Ctrl+C. For a physical phone using Metro over the same network, use `npm run dev:phone`. Standalone Release builds bundle JavaScript and do not need Metro.

## Code map

| Folder/file                      | Responsibility                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `src/app/`                       | Expo Router screens, protected navigation and candidate/recruiter flows        |
| `src/providers/AuthProvider.tsx` | Shared login session and database-backed account profile                       |
| `src/lib/`                       | Supabase client, queries, uploads, session storage and email verification      |
| `src/components/`                | Shared form controls, layout, branding and account actions                     |
| `supabase/migrations/`           | Tables, constraints, triggers, row-level security and private Storage policies |
| `supabase/templates/`            | Signup and password-recovery email templates                                   |
| `tests/`                         | Unit tests, integration suites, device flows and portable Postman collection   |
| `scripts/`                       | Backend selection, local services, native builds and QA commands               |
| `.vscode/`                       | Development tasks, debugger configuration and editor settings                  |

Comments explain the main decisions alongside the implementation. The repository contains application source, backend configuration, build scripts and reproducible tests.

## Backend setup

Apply `supabase/migrations/202609140001_initial.sql` once to a **new, empty assessment project**. It creates `profiles`, `jobs`, `resumes`, `applications`, and the private `resumes` Storage bucket. The initial migration is not an upgrade script for an existing database. See [backend setup](supabase/README.md).

Signup supplies the initial name and candidate/recruiter role. A database trigger creates the profile. Version 1.0.2 includes email-code confirmation, resend and password recovery. Configure hosted SMTP and the supplied email templates for real delivery; prepared `example.com` demo accounts have no inboxes.

Optional local development requires OrbStack or another Docker-compatible runtime:

```sh
npm run local:start
npm run local:seed
npm run dev:local
```

Local accounts are separate from hosted accounts. The local app uses port 8082; API, Studio and captured email use 54321, 54323 and 54324. Seeding creates synthetic fixtures and is not part of everyday startup. `npm run local:stop` preserves local data.

## Tests

Run these in a second terminal while Metro stays in its own terminal:

```sh
npm run typecheck
npm run test:unit
npm run format:check
```

On the configured assessment Mac, run the prepared hosted/API checks with:

```sh
npm run check:hosted
npm run test:postman
```

The unit suite has 39 named tests covering backend configuration, secure session persistence, email flows, applicant loading and resume upload. It does not require Supabase or send emails.

With the prepared private demo account manifest available, `npm run check:hosted` checks 25 properties of the hosted dataset without changing its business records. `npm run test:postman` runs 17 API requests with 29 assertions using ordinary demo accounts. Both the Newman run and Postman desktop run passed on 15 September 2026. These checks overlap; their totals are not a coverage percentage.

`npm run test:local`, `npm run test:audit:local`, `npm run test:boundaries:local`, and `npm run test:email:local` exercise isolated local integration scenarios and manage synthetic fixtures. The configurable `test:security` and `test:email:hosted` suites need an external administrator setup file for fixture creation/cleanup; permission assertions use ordinary users. Device flows and their fixture prerequisites are documented in [tests/mobile/README.md](tests/mobile/README.md). Never run fixture-changing suites concurrently with prepared-demo checks.

The final Android APK was installed and exercised on an API 36 emulator: sign-in, recruiter signup/confirmation and job posting, candidate PDF upload/application, CV replacement and session restart. It also cold-started with Metro paused. A separate browser pass verified delivered confirmation/recovery codes, password save, rejection of the old password and sign-in with the new one. These are observed journeys, not a claim of complete device or accessibility coverage.

## Native builds

- `npm run build:android`: standalone assessment APK at `android/app/build/outputs/apk/release/app-release.apk`. Uses the generated development signing key, not a Play Store production key.
- `npm run build:ios:simulator`: Debug simulator app in Xcode DerivedData. Keep Metro running.
- `npm run build:iphone`, then `npm run install:iphone`: standalone hosted Release app for the configured physical device. Requires Apple signing and private `teamId`/`deviceId` settings in `.local/ios-device.json` or `TALENTHUNTER_IOS_CONFIG`.

Native builds require Android SDK 36/Java 17 or Xcode 26.4+ with an iOS runtime/CocoaPods. The scripts resolve the configured Mac toolchain. iOS build caches live outside synchronised Desktop/Documents folders to avoid Finder metadata code-signing failures.

## Data access and scope

The server supplies record owners and timestamps. Row-level security protects private records independently of navigation guards. A recruiter can read an application and its CV only when they own the receiving job. A unique job/candidate constraint prevents duplicate submissions, and a composite foreign key prevents submitting another candidate's CV.

Each upload creates a new immutable CV version. An application keeps that version even after a later upload. PDF files are limited to 5 MB. Opening a CV requests a fresh authorised signed link that expires after 60 seconds; anyone holding that link can use it until expiry.

The prepared assessment dataset has two recruiters, five fictional candidates, three source-attributed job summaries and ten applications. The company branding belongs to TalentHunter; this app is an assessment prototype.

Known limits include no trusted file-content/malware scanning, orphan-file cleanup or production recruiter verification. Uploading bytes and saving metadata are separate operations. Candidate feed pagination, complete accessibility/device coverage, production retention/deletion and store distribution remain future work. Client PDF-header/MIME checks do not replace server-side scanning.
