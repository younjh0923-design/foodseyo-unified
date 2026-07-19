import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const excludedDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "outputs",
  "tmp",
]);

const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".cts",
  ".example",
  ".gitignore",
  ".html",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const prohibitedPatterns = [
  {
    name: "OpenAI-style API key",
    pattern: /sk-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "GitHub token",
    pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g,
  },
  {
    name: "Google API key",
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
  },
  {
    name: "AWS access key",
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: "private key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "credential-bearing PostgreSQL URL",
    pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/gi,
  },
] as const;

const allowedEnvironmentFiles = new Set([
  ".env.example",
  ".env.operator.example",
]);

const files: string[] = [];

const matchingPatternNames = (content: string): readonly string[] => {
  const matches: string[] = [];
  for (const { name, pattern } of prohibitedPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      matches.push(name);
    }
  }
  return matches;
};

const syntheticSecretSamples = [
  ["sk", "A".repeat(24)].join("-"),
  `ghp_${"B".repeat(24)}`,
  `AIza${"C".repeat(35)}`,
  `AKIA${"D".repeat(16)}`,
  ["-----BEGIN", "SYNTHETIC PRIVATE KEY-----"].join(" "),
  ["postgresql://fixture-user:", "fixture-password", "@localhost/fixture"].join(
    "",
  ),
] as const;

for (const sample of syntheticSecretSamples) {
  assert(
    matchingPatternNames(sample).length > 0,
    "representative synthetic secret pattern was not rejected",
  );
}
assert.deepEqual(
  matchingPatternNames("fixture text without a credential"),
  [],
  "benign fixture text must not be treated as a credential",
);

const walk = async (directory: string): Promise<void> => {
  for (const entry of await readdir(directory)) {
    if (excludedDirectories.has(entry)) {
      continue;
    }

    const path = join(directory, entry);
    const metadata = await stat(path);
    if (metadata.isDirectory()) {
      await walk(path);
      continue;
    }

    files.push(path);
  }
};

await walk(process.cwd());

const violations: string[] = [];

for (const file of files) {
  const path = relative(process.cwd(), file).replaceAll("\\", "/");
  if (path.startsWith(".env") && !allowedEnvironmentFiles.has(path)) {
    violations.push(`${path}: unapproved environment file`);
  }

  if (!textExtensions.has(extname(file)) && !allowedEnvironmentFiles.has(path)) {
    continue;
  }

  const content = await readFile(file, "utf8");
  for (const patternName of matchingPatternNames(content)) {
    violations.push(
      `${path}: prohibited secret or credential pattern (${patternName})`,
    );
  }
}

assert.deepEqual(violations, [], violations.join("\n"));
console.log(
  "Foodseyo repository security validation and synthetic rejection checks passed.",
);
