#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const THRESHOLD = 80;
const summaryPath = resolve(process.cwd(), "coverage", "coverage-summary.json");

if (!existsSync(summaryPath)) {
  console.error("coverage-summary.json not found. Run test:coverage first.");
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));

let changedFiles = [];
try {
  const raw = execSync("git diff --name-only --diff-filter=ACMRT origin/main...HEAD", {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();

  changedFiles = raw
    .split("\n")
    .map((line) => line.trim().replace(/\\/g, "/"))
    .filter((line) => line.startsWith("src/") && line.endsWith(".ts"));
} catch {
  console.warn("Skipping changed-file coverage gate because git diff could not be resolved.");
  process.exit(0);
}

if (changedFiles.length === 0) {
  console.log("No changed TypeScript files under src/. Skipping changed-file coverage gate.");
  process.exit(0);
}

const failures = [];

for (const file of changedFiles) {
  const record = summary[file] ?? summary[file.replace(/\//g, "\\")];
  if (!record) {
    failures.push(`${file}: missing coverage entry`);
    continue;
  }

  const pct = Number(record.lines?.pct ?? 0);
  if (pct < THRESHOLD) {
    failures.push(`${file}: ${pct}% lines (< ${THRESHOLD}%)`);
  }
}

if (failures.length > 0) {
  console.error("Touched-file coverage gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Touched-file coverage gate passed (>= ${THRESHOLD}% lines).`);