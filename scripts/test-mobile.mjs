import fs from "node:fs";
import { spawnSync } from "node:child_process";
// Uses existing synthetic fixtures. Maestro logs must be kept outside the repo.
const args = process.argv.slice(2);
if (args.length !== 3)
  throw new Error(
    "Usage: node scripts/test-mobile.mjs <device-id> <private-demo-json> <candidate|recruiter>",
  );
const [device, path, role] = args;
if (!["candidate", "recruiter"].includes(role)) throw new Error("Unknown role");
const accounts = JSON.parse(fs.readFileSync(path, "utf8"));
const person = accounts[role === "candidate" ? "Candidate A" : "Recruiter A"];
const prefix = role.toUpperCase();
const result = spawnSync(
  "maestro",
  [
    "--device",
    device,
    "test",
    "-e",
    `${prefix}_EMAIL=${person.email}`,
    "-e",
    `${prefix}_PASSWORD=${person.password}`,
    `tests/mobile/${role}.yaml`,
  ],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
