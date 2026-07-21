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
for (const workspaceRoot of ["apps", "packages"] as const) {
  for (const entry of await readdir(resolve(workspaceRoot), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolve(workspaceRoot, entry.name, "package.json");
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
assert.match(decisionLog, /Candidate - exact contract PR approval pending/u);

const sourceFiles: string[] = [];
const collectSourceFiles = async (directory: string): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(path);
    else if (/\.(?:js|jsx|ts|tsx)$/u.test(entry.name)) sourceFiles.push(path);
  }
};
await collectSourceFiles(resolve("apps/web/src"));
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  assert.doesNotMatch(
    source,
    /NEXT_PUBLIC_/u,
    file + " must not expose a public secret",
  );
  assert.doesNotMatch(
    source,
    /\b(?:from|import\()\s*["'](?:openai|@google|@neondatabase|drizzle|@foodseyo\/database)/u,
    file + " must preserve the server-only provider and database boundary",
  );
}

console.log("Foodseyo Issue #20 web platform contract validation passed.");
