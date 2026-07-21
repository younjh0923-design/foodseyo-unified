import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

type Manifest = {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const WEB_PLATFORM = {
  next: "16.2.10",
  react: "19.2.7",
  "react-dom": "19.2.7",
} as const;

const webManifest = await readJson<Manifest>(resolve("apps/web/package.json"));
for (const [dependency, version] of Object.entries(WEB_PLATFORM)) {
  assert.equal(
    webManifest.dependencies?.[dependency],
    version,
    "apps/web must pin " + dependency + " exactly to " + version,
  );
}
const workspaceConfig = await readFile(resolve("pnpm-workspace.yaml"), "utf8");
assert.match(
  workspaceConfig,
  /^allowBuilds:\r?\n  esbuild: true\r?\n  sharp: false$/mu,
);

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const isolatedManifestPaths = [resolve("package.json")];
for (const workspaceRoot of ["apps", "packages"] as const) {
  for (const entry of await readdir(resolve(workspaceRoot), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolve(workspaceRoot, entry.name, "package.json");
    isolatedManifestPaths.push(manifestPath);
  }
}
for (const manifestPath of isolatedManifestPaths) {
  const manifest = await readJson<Manifest>(manifestPath);
  if (manifest.name === "@foodseyo/web") continue;
  for (const section of dependencySections) {
    for (const dependency of Object.keys(WEB_PLATFORM)) {
      assert.equal(
        manifest[section]?.[dependency],
        undefined,
        relative(process.cwd(), manifestPath) +
          " must remain framework-neutral",
      );
    }
  }
}

const lockfile = await readFile(resolve("pnpm-lock.yaml"), "utf8");
const webImporter = lockfile.match(
  /\n  apps\/web:\r?\n([\s\S]*?)(?=\r?\n  (?:apps|packages)\/[^:\r\n]+:\r?\n|\r?\npackages:\r?\n)/u,
)?.[1];
assert(webImporter, "apps/web lockfile importer is required");
for (const [dependency, version] of Object.entries(WEB_PLATFORM)) {
  assert.match(
    webImporter,
    new RegExp(
      "\\n      " +
        dependency +
        ":\\r?\\n        specifier: " +
        version.replaceAll(".", "\\."),
      "u",
    ),
    "apps/web lockfile importer must pin " + dependency + " to " + version,
  );
  assert.match(
    lockfile,
    new RegExp(
      "^  " + dependency + "@" + version.replaceAll(".", "\\.") + ":",
      "mu",
    ),
    "pnpm lockfile must resolve " + dependency + "@" + version,
  );
}

const techStack = await readFile(resolve("docs/TECH_STACK.md"), "utf8");
assert.match(
  techStack,
  /\| Web application framework \| Next\.js App Router `16\.2\.10` with React `19\.2\.7` and React DOM `19\.2\.7` \|/u,
);
const pendingChoices = techStack
  .split("## Pending choices")[1]
  ?.split("## Change protocol")[0];
assert(pendingChoices, "TECH_STACK pending choices section is required");
assert.doesNotMatch(pendingChoices, /Web framework and exact React/u);

const sharedContracts = await readFile(
  resolve("docs/SHARED_CONTRACTS.md"),
  "utf8",
);
assert.match(sharedContracts, /Issue #20 candidate/u);
assert.match(sharedContracts, /exact contract PR receives all-owner approval/u);

const decisionLog = await readFile(resolve("docs/DECISION_LOG.md"), "utf8");
assert.match(
  decisionLog,
  /## U-016 - Next\.js web application platform candidate/u,
);
assert.match(
  decisionLog,
  /9ef6b510c1ad8ab4465b59044913723ff11d8742[\s\S]*045b42b0da419e96366488380e5a953f28c11b06[\s\S]*\*\*Status:\*\* Accepted/u,
);

const sourceFiles: string[] = [];
const ignoredSourceDirectories = new Set([".next", "node_modules"]);
const collectSourceFiles = async (directory: string): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignoredSourceDirectories.has(entry.name)) {
      await collectSourceFiles(path);
    } else if (/\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) {
      sourceFiles.push(path);
    }
  }
};
const forbiddenServerImport =
  /\b(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:openai(?:\/|["'])|@google|@neondatabase|drizzle|@foodseyo\/(?:database|source-acquisition|restaurant-resolution)(?:\/|["']))/u;
const assertBrowserBoundary = (file: string, source: string): void => {
  assert.doesNotMatch(
    source,
    /NEXT_PUBLIC_/u,
    file + " must not expose a public secret",
  );
  assert.doesNotMatch(
    source,
    forbiddenServerImport,
    file + " must preserve the server-only provider and database boundary",
  );
};

for (const [file, source] of [
  ["apps/web/app/page.tsx", 'import "@foodseyo/source-acquisition";'],
  [
    "apps/web/app/source-internal/page.tsx",
    'import "@foodseyo/source-acquisition/internal";',
  ],
  ["apps/web/pages/index.tsx", 'import "@foodseyo/restaurant-resolution";'],
  [
    "apps/web/app/restaurant-server/page.tsx",
    'import "@foodseyo/restaurant-resolution/server";',
  ],
  ["apps/web/middleware.ts", 'const db = require("drizzle-orm");'],
  ["apps/web/proxy.ts", 'import OpenAI from "openai";'],
  ["apps/web/app/database-probe.ts", 'import "@foodseyo/database";'],
] as const) {
  assert.throws(
    () => assertBrowserBoundary(file, source),
    /must preserve the server-only provider and database boundary/u,
    file + " must be covered by the browser-boundary validator",
  );
}

// Scanning the complete app root covers both src/ and root-level Next.js
// conventions such as app/, pages/, middleware.*, proxy.*, and config files.
await collectSourceFiles(resolve("apps/web"));
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  assertBrowserBoundary(file, source);
}

console.log("Foodseyo Issue #20 web platform contract validation passed.");
