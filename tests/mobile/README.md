# Native screen scenarios

These Maestro YAML files are stateful fixture scenarios, not a one-command suite for the seven prepared hosted accounts. Their names such as Candidate A, Recruiter A, Native demo job and Synthetic-CV-v2.pdf refer to isolated synthetic test fixtures. Read each flow's starting-state comments before running it. Do not rename or reseed the prepared Aisha/TalentHunter/IBAT data just to satisfy an assertion.

Install the assessment APK and start an Android emulator first. Use ordinary fixture credentials, passed explicitly to Maestro:

```sh
bash scripts/native-env.sh maestro --udid <device-id> test \
  -e CANDIDATE_EMAIL='<fixture-email>' \
  -e CANDIDATE_PASSWORD='<fixture-password>' \
  tests/mobile/candidate.yaml
```

For a recruiter flow, supply `RECRUITER_EMAIL` and `RECRUITER_PASSWORD` instead. Never use a Supabase administrator key in a device flow. Reports can contain entered fields and screenshots, so keep their output in ignored `.local/` and review before sharing.

The upload scenario requires the named synthetic PDF in the emulator's Downloads provider. Files pushed with ADB may need MediaStore indexing before the system picker lists them. The picker and PDF viewer belong to Android; their labels can vary by OS image. Observe the screen before changing an assertion. In particular, a PDF can render correctly without a persistent “Page 1 of 1” label. Assert its actual test content and inspect the rendered screenshot.

A complete assessment pass should cover no-CV blocking, picker cancellation, upload, apply, restart, CV replacement, the recruiter receiving the originally submitted version and another recruiter having no access. Backend tests separately verify exact record IDs, file hashes and denial of direct requests. A screen assertion and an API permission test establish different things.

Real email confirmation and password reset require an inbox you control. Keep verification codes and reset passwords out of source and shared reports.
