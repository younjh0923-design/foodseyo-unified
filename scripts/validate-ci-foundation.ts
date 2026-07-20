import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

type JsonObject = Record<string, unknown>;
type PackageManifest = {
  readonly name?: string;
  readonly packageManager?: string;
  readonly engines?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
};
type WorkspacePackage = {
  readonly directory: string;
  readonly manifest: PackageManifest;
};

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const sourceFiles = async (directory: string): Promise<readonly string[]> => {
  const files: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "coverage"
      ) {
        continue;
      }
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (
        sourceExtensions.has(
          entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase(),
        )
      ) {
        files.push(path);
      }
    }
  };
  if (await pathExists(directory)) {
    await walk(directory);
  }
  return files.sort();
};

const APPROVED_PNPM_VERSION = "11.9.0";
const PNPM_ACTION_SETUP =
  "pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320";
assert.match(PNPM_ACTION_SETUP, /^pnpm\/action-setup@[0-9a-f]{40}$/u);
const rootManifest = await readJson<PackageManifest>(resolve("package.json"));
assert.equal(
  rootManifest.packageManager,
  `pnpm@${APPROVED_PNPM_VERSION}`,
);
assert.equal(rootManifest.engines?.node, ">=20.19.0");
assert(rootManifest.scripts, "root scripts are required");

const requiredRootScripts = [
  "typecheck",
  "test:unit",
  "test:integration",
  "test:workspace",
  "test",
  "validate:security",
  "validate:ci",
  "validate:network-boundary",
  "verify",
] as const;
for (const scriptName of requiredRootScripts) {
  assert(
    rootManifest.scripts[scriptName],
    `root package is missing ${scriptName}`,
  );
}
for (const requiredInvocation of [
  "pnpm typecheck",
  "pnpm test",
  "pnpm validate:security",
  "pnpm validate:ci",
  "pnpm validate:network-boundary",
]) {
  assert(
    rootManifest.scripts.verify?.includes(requiredInvocation),
    `pnpm verify must execute ${requiredInvocation}`,
  );
}
assert.equal(
  rootManifest.scripts.verify?.includes("--if-present"),
  false,
  "pnpm verify must not silently skip a required U2.5 validation",
);

for (const optionalCommand of ["lint", "build"] as const) {
  const command = rootManifest.scripts[optionalCommand];
  if (command) {
    assert(
      rootManifest.scripts.verify?.includes(`pnpm ${optionalCommand}`),
      `pnpm verify must execute the supported ${optionalCommand} command`,
    );
  } else {
    console.log(
      `Deferred U2.5 check: ${optionalCommand} has no approved repository command.`,
    );
  }
}

const workspaceConfig = await readFile(resolve("pnpm-workspace.yaml"), "utf8");
const workspacePatterns = Array.from(
  workspaceConfig.matchAll(/^\s*-\s+([^\r\n]+)$/gm),
  (match) => match[1]?.trim(),
).filter((value): value is string => Boolean(value));
assert.deepEqual(workspacePatterns, ["apps/*", "packages/*"]);

for (const unapprovedLockfile of [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]) {
  assert.equal(
    await pathExists(resolve(unapprovedLockfile)),
    false,
    `${unapprovedLockfile} is not approved`,
  );
}

const workspacePackages: WorkspacePackage[] = [];
for (const root of ["apps", "packages"]) {
  for (const entry of await readdir(resolve(root), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = resolve(root, entry.name);
    const manifestPath = join(directory, "package.json");
    if (await pathExists(manifestPath)) {
      workspacePackages.push({
        directory,
        manifest: await readJson<PackageManifest>(manifestPath),
      });
    }
  }
}
workspacePackages.sort((left, right) =>
  left.directory.localeCompare(right.directory),
);

const packageByName = new Map<string, WorkspacePackage>();
for (const workspacePackage of workspacePackages) {
  const { name } = workspacePackage.manifest;
  assert(name, `${workspacePackage.directory} is missing a package name`);
  assert.equal(
    packageByName.has(name),
    false,
    `duplicate workspace package name ${name}`,
  );
  assert(
    workspacePackage.manifest.scripts?.typecheck,
    `${name} must expose typecheck before the recursive command can be trusted`,
  );
  packageByName.set(name, workspacePackage);
}
assert(packageByName.has("@foodseyo/contracts"));
assert.match(
  rootManifest.scripts["test:workspace"] as string,
  /pnpm --recursive --if-present test/u,
);

for (const optionalCommand of ["lint", "build"] as const) {
  if (rootManifest.scripts[optionalCommand]) {
    continue;
  }
  const packagesWithUnwiredCommand = workspacePackages
    .filter((workspacePackage) =>
      Boolean(workspacePackage.manifest.scripts?.[optionalCommand]),
    )
    .map((workspacePackage) => workspacePackage.manifest.name);
  assert.deepEqual(
    packagesWithUnwiredCommand,
    [],
    `root ${optionalCommand} is missing while workspace packages support it`,
  );
}

for (const workspacePackage of workspacePackages) {
  const packageName = workspacePackage.manifest.name as string;
  for (const scriptName of Object.keys(
    workspacePackage.manifest.scripts ?? {},
  ).filter((name) => name.startsWith("validate:"))) {
    const rootWiring = Object.entries(rootManifest.scripts).find(
      ([rootScriptName, command]) =>
        rootScriptName !== "verify" &&
        command.includes(`--filter ${packageName}`) &&
        command.includes(scriptName),
    );
    assert(
      rootWiring,
      `${packageName} ${scriptName} is not wired through a root script`,
    );
    assert(
      rootManifest.scripts.verify?.includes(`pnpm ${rootWiring[0]}`),
      `${rootWiring[0]} must run from pnpm verify`,
    );
  }
}

const lockfile = await readFile(resolve("pnpm-lock.yaml"), "utf8");
assert.match(lockfile, /^lockfileVersion: '9\.0'$/m);
const importerSection = lockfile
  .slice(lockfile.indexOf("importers:") + "importers:".length)
  .split(/\r?\npackages:\r?\n/u)[0];
assert(importerSection, "pnpm lockfile importers section is missing");
const lockfileImporters = Array.from(
  importerSection.matchAll(/^  ([^\s][^:\r\n]*):\s*$/gm),
  (match) => match[1] as string,
).sort();
const expectedImporters = [
  ".",
  ...workspacePackages.map((workspacePackage) =>
    relative(process.cwd(), workspacePackage.directory).replaceAll("\\", "/"),
  ),
].sort();
assert.deepEqual(
  lockfileImporters,
  expectedImporters,
  "workspace manifests and frozen lockfile importers drifted",
);

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const dependencyGraph = new Map<string, Set<string>>();

for (const [name, workspacePackage] of packageByName) {
  const internalDependencies = new Set<string>();
  for (const section of dependencySections) {
    for (const dependencyName of Object.keys(
      workspacePackage.manifest[section] ?? {},
    )) {
      if (!dependencyName.startsWith("@foodseyo/")) {
        continue;
      }
      assert(
        packageByName.has(dependencyName),
        `${name} depends on missing workspace package ${dependencyName}`,
      );
      assert.notEqual(name, dependencyName, `${name} depends on itself`);
      assert.equal(
        workspacePackage.manifest[section]?.[dependencyName],
        "workspace:*",
        `${name} must consume ${dependencyName} through workspace:*`,
      );
      internalDependencies.add(dependencyName);
    }
  }
  dependencyGraph.set(name, internalDependencies);
}

const visiting = new Set<string>();
const visited = new Set<string>();
const visit = (name: string, path: readonly string[]): void => {
  if (visiting.has(name)) {
    assert.fail(`circular workspace dependency: ${[...path, name].join(" -> ")}`);
  }
  if (visited.has(name)) {
    return;
  }
  visiting.add(name);
  for (const dependency of dependencyGraph.get(name) ?? []) {
    visit(dependency, [...path, name]);
  }
  visiting.delete(name);
  visited.add(name);
};
for (const name of dependencyGraph.keys()) {
  visit(name, []);
}

const contractPackage = packageByName.get("@foodseyo/contracts");
assert(contractPackage);
const contractDeclarations = new Set<string>();
for (const file of await sourceFiles(join(contractPackage.directory, "src"))) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(
    /\bexport\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gu,
  )) {
    contractDeclarations.add(match[1] as string);
  }
}
assert(contractDeclarations.size > 0, "shared contract declarations were not found");

const importSpecifiers = (content: string): readonly string[] => {
  const specifiers = new Set<string>();
  for (const pattern of [
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bimport\s+["']([^"']+)["']/gu,
  ]) {
    for (const match of content.matchAll(pattern)) {
      specifiers.add(match[1] as string);
    }
  }
  return [...specifiers];
};

for (const [packageName, workspacePackage] of packageByName) {
  if (packageName === "@foodseyo/contracts") {
    continue;
  }
  const declaredDependencies = new Set(
    dependencySections.flatMap((section) =>
      Object.keys(workspacePackage.manifest[section] ?? {}),
    ),
  );
  for (const file of await sourceFiles(join(workspacePackage.directory, "src"))) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(
      /\bexport\s+(?:declare\s+)?(?:interface|type|enum|class|function|const)\s+([A-Za-z_$][\w$]*)/gu,
    )) {
      const declaration = match[1] as string;
      assert.equal(
        contractDeclarations.has(declaration),
        false,
        `${relative(process.cwd(), file)} duplicates shared contract declaration ${declaration}`,
      );
    }

    for (const specifier of importSpecifiers(content)) {
      if (specifier.includes("/src/")) {
        assert.fail(
          `${relative(process.cwd(), file)} imports a package internal source path`,
        );
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        const packagePrefix = `${workspacePackage.directory}${sep}`;
        assert(
          target === workspacePackage.directory ||
            target.startsWith(packagePrefix),
          `${relative(process.cwd(), file)} crosses a package boundary through ${specifier}`,
        );
        continue;
      }
      if (!specifier.startsWith("@foodseyo/")) {
        continue;
      }
      const segments = specifier.split("/");
      const importedPackageName = segments.slice(0, 2).join("/");
      const importedPackage = packageByName.get(importedPackageName);
      assert(
        importedPackage,
        `${relative(process.cwd(), file)} imports unknown package ${importedPackageName}`,
      );
      assert(
        declaredDependencies.has(importedPackageName),
        `${packageName} imports undeclared dependency ${importedPackageName}`,
      );
      const exportKey =
        segments.length === 2 ? "." : `./${segments.slice(2).join("/")}`;
      assert(
        isRecord(importedPackage.manifest.exports) &&
          exportKey in importedPackage.manifest.exports,
        `${relative(process.cwd(), file)} imports unexported entry point ${specifier}`,
      );
    }
  }
}

const workflowPath = resolve(".github/workflows/ci.yml");
const workflowSource = await readFile(workflowPath, "utf8");
const workflow = JSON.parse(workflowSource) as unknown;
assert(isRecord(workflow), "CI workflow must be an object");
assert.deepEqual(Object.keys(workflow.on as JsonObject), ["pull_request"]);
const pullRequestTrigger = (workflow.on as JsonObject).pull_request;
assert(isRecord(pullRequestTrigger));
assert.deepEqual(pullRequestTrigger.branches, ["main"]);
assert.deepEqual(workflow.permissions, { contents: "read" });
assert.equal(
  /\$\{\{\s*secrets\./u.test(workflowSource),
  false,
  "CI must not reference repository secrets",
);
assert.equal(
  /\b(?:deploy|vercel|openai\.com|googleapis\.com|neon\.tech)\b/iu.test(
    workflowSource,
  ),
  false,
  "CI must not deploy or name an external provider endpoint",
);

assert(isRecord(workflow.jobs));
assert.deepEqual(Object.keys(workflow.jobs), ["validation"]);
const validationJob = workflow.jobs.validation;
assert(isRecord(validationJob));
assert.equal(validationJob["runs-on"], "ubuntu-latest");
assert.equal(validationJob["timeout-minutes"], 20);
assert(Array.isArray(validationJob.steps));
const steps = validationJob.steps.filter(isRecord);
assert.equal(steps.length, validationJob.steps.length);
for (const step of steps) {
  assert.equal("continue-on-error" in step, false);
  assert.equal("if" in step, false, "required CI steps must not be conditional");
  if (typeof step.uses === "string") {
    assert(
      [
        "actions/checkout@v4",
        "actions/setup-node@v4",
        PNPM_ACTION_SETUP,
      ].includes(step.uses),
      `unapproved GitHub Action ${step.uses}`,
    );
  }
}
const checkoutStep = steps.find(
  (step) => step.uses === "actions/checkout@v4",
);
assert(checkoutStep && isRecord(checkoutStep.with));
assert.equal(checkoutStep.with["fetch-depth"], 0);
assert.equal(checkoutStep.with["persist-credentials"], false);

const setupNodeStep = steps.find(
  (step) => step.uses === "actions/setup-node@v4",
);
assert(setupNodeStep && isRecord(setupNodeStep.with));
assert.equal(setupNodeStep.with["node-version"], "20.19.0");

const pnpmSetupStep = steps.find((step) => step.uses === PNPM_ACTION_SETUP);
assert(pnpmSetupStep, "approved pnpm setup action is required");
assert.equal(
  "with" in pnpmSetupStep,
  false,
  "pnpm setup must read the frozen packageManager field without an override",
);

const runCommands = steps
  .map((step) => step.run)
  .filter((run): run is string => typeof run === "string");
const pnpmVersionCheck = [
  'pnpm_version="$(pnpm --version)"',
  "printf '%s\\n' \"$pnpm_version\"",
  `test "$pnpm_version" = "${APPROVED_PNPM_VERSION}"`,
].join("\n");
const pnpmVersionStep = steps.find((step) => step.run === pnpmVersionCheck);
assert(pnpmVersionStep, "exact pnpm version check is required");
const installStep = steps.find(
  (step) => step.run === "pnpm install --frozen-lockfile",
);
assert(installStep, "frozen dependency install is required");
assert(
  steps.indexOf(pnpmSetupStep) < steps.indexOf(pnpmVersionStep) &&
    steps.indexOf(pnpmVersionStep) < steps.indexOf(installStep),
  "pnpm setup and exact version verification must precede installation",
);
for (const forbiddenBootstrap of [
  "corepack",
  "COREPACK_INTEGRITY_KEYS",
  "npm install -g",
]) {
  assert.equal(
    workflowSource.includes(forbiddenBootstrap),
    false,
    `CI must not use forbidden pnpm bootstrap ${forbiddenBootstrap}`,
  );
}
const verifyStep = steps.find((step) => step.run === "pnpm verify");
assert(verifyStep && isRecord(verifyStep.env));
assert.match(String(verifyStep.env.NODE_OPTIONS), /deny-network\.cjs/);
for (const name of [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "OPENAI_API_KEY",
  "OPENAI_MENU_EXTRACTION_MODEL",
  "OPENAI_WEB_SEARCH_MODEL",
  "OPENAI_EXPLANATION_MODEL",
  "GOOGLE_PLACES_API_KEY",
]) {
  assert.equal(
    verifyStep.env[name],
    "",
    `${name} must be absent from network-free CI validation`,
  );
}
assert(
  runCommands.some(
    (run) =>
      run.includes("git diff --check") && run.includes("git diff --exit-code"),
  ),
  "CI must fail on whitespace errors or generated worktree changes",
);

console.log("Foodseyo workspace, boundary, dependency, and CI validation passed.");
