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
  ".example",
  ".gitignore",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".yaml",
  ".yml",
]);

const prohibitedPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/gi,
] as const;

const allowedEnvironmentFiles = new Set([
  ".env.example",
  ".env.operator.example",
]);

const files: string[] = [];

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
  for (const pattern of prohibitedPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      violations.push(`${path}: prohibited secret or credential pattern`);
    }
  }
}

assert.deepEqual(violations, [], violations.join("\n"));
console.log("Foodseyo repository security validation passed.");
