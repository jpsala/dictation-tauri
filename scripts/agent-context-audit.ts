import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

type Finding = {
  level: "error" | "warn";
  message: string;
};

const root = process.cwd();
const findings: Finding[] = [];
const aosHome = process.env.AOS_HOME?.trim() ||
  (process.platform === "win32"
    ? "C:\\dev\\os"
    : join(process.env.HOME ?? "", "dev", "os"));
let globalAosExists = (_path: string) => false;
try {
  const aosHomeModule = await import(
    pathToFileURL(join(aosHome, "scripts", "aos-home.ts")).href
  );
  globalAosExists = (path: string) => aosHomeModule.aosPathExists(path, aosHome);
} catch {
  // AOS global is optional; local adapters remain the fallback.
}

const requiredAosPiPrompts = [
  "aos-cerrar.md",
  "aos-checkpoint.md",
  "aos-continuar-sesion.md",
  "aos-fanout.md",
  "aos-gol.md",
  "aos-guardar-sesion.md",
  "aos-help.md",
  "aos-nueva-sesion.md",
  "aos-nueva-sesion-con-gol.md",
  "aos-orquestar.md",
  "aos-sigamos.md",
  "aos-siguiente.md",
];

const requiredAosPiExtensions = [
  "aos-checkpoint-nudge.ts",
  "aos-tools.ts",
];

const requiredAosToolCommands = [
  "aos-compact",
  "aos-continuar",
  "aos-skills",
  "aos-status",
  "aos-sync",
];

const legacyAosPiPrompts = [
  "adopt-os.md",
  "align-os-project.md",
  "cerrar.md",
  "checkpoint.md",
  "continuar.md",
  "gol.md",
  "guardar-sesion.md",
  "init-os.md",
  "nueva-sesion.md",
  "nueva-sesion-con-gol.md",
  "os-help.md",
  "perfect-os.md",
  "realinear.md",
  "sigamos.md",
  "siguiente.md",
  "threads.md",
  "update-os.md",
];

const legacyAosPiExtensions = [
  "checkpoint-nudge.ts",
  "os-tools.ts",
];

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path: string) {
  return existsSync(join(root, path));
}

function add(level: Finding["level"], message: string) {
  findings.push({ level, message });
}

function approxTokensFromChars(chars: number) {
  return Math.ceil(chars / 4);
}

function warnIfTooLarge(path: string, maxChars: number, label: string) {
  if (!exists(path)) return;
  const content = read(path);
  if (content.length > maxChars) {
    add(
      "warn",
      `${label} is large (${content.length} chars, ~${approxTokensFromChars(content.length)} tokens); compact or move detail to deeper references`,
    );
  }
}

function frontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? "";
}

function hasFrontmatterKey(frontmatterText: string, key: string) {
  return new RegExp(`^${key}:`, "m").test(frontmatterText);
}

function frontmatterValue(frontmatterText: string, key: string) {
  const match = frontmatterText.match(new RegExp(`^${key}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match?.[1]?.trim();
}

function hasUnsafePlainYamlColon(value: string | undefined) {
  if (!value) return false;
  const trimmed = value.trim();
  if (/^["'].*["']$/.test(trimmed)) return false;
  return /:\s/.test(trimmed);
}

function warnIfFrontmatterYamlLooksUnsafe(path: string, fm: string) {
  for (const key of ["description"]) {
    const value = frontmatterValue(fm, key);
    if (hasUnsafePlainYamlColon(value)) {
      add("error", `${path} frontmatter ${key} contains an unquoted colon; quote the value so YAML parsers do not treat it as a nested mapping`);
    }
  }
}

function modifiedMs(path: string) {
  return statSync(join(root, path)).mtimeMs;
}

function sectionContent(content: string, heading: string) {
  const lines = content.split(/\r?\n/);
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match?.[2] === heading) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }

  if (start === -1) return "";

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

function listDirs(path: string) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return [];
  return readdirSync(fullPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${path}/${entry.name}`.replaceAll("\\", "/"))
    .sort();
}

function backtickedSkillRefs(content: string) {
  return [...content.matchAll(/`([^`*\/]+)\/`/g)].map((match) => match[1]).sort();
}

function walkMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function listFileNames(path: string, extension?: string) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return [];
  return readdirSync(fullPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!extension || entry.name.endsWith(extension)))
    .map((entry) => entry.name)
    .sort();
}

for (const path of ["AGENTS.md", "docs/WORKING_MEMORY.md", "docs/TOPICS.md"]) {
  if (!exists(path)) add("error", `Missing ${path}`);
}

if (!exists("docs/GLOSSARY.md")) {
  add("warn", "Missing docs/GLOSSARY.md; aliases will not be included in the generated context index");
}

if (!exists("docs/skills")) {
  add("error", "Missing docs/skills/");
}

warnIfTooLarge("AGENTS.md", 6000, "AGENTS.md");
warnIfTooLarge("docs/README.md", 5000, "docs/README.md");
warnIfTooLarge("docs/WORKING_MEMORY.md", 6000, "docs/WORKING_MEMORY.md");
warnIfTooLarge("docs/TOPICS.md", 11000, "docs/TOPICS.md");
warnIfTooLarge("docs/DEVELOPMENT.md", 12000, "docs/DEVELOPMENT.md");

const hotPathFiles = [
  "AGENTS.md",
  "docs/.generated/context-index.md",
  "docs/WORKING_MEMORY.md",
].filter(exists);
const hotPathChars = hotPathFiles.reduce((total, path) => total + read(path).length, 0);
if (hotPathChars > 18000) {
  add(
    "warn",
    `Hot context path is large (${hotPathChars} chars, ~${approxTokensFromChars(hotPathChars)} tokens across ${hotPathFiles.join(", ")}); reduce initial reading load`,
  );
}

const topicsIndex = exists("docs/TOPICS.md") ? read("docs/TOPICS.md") : "";
const agents = exists("AGENTS.md") ? read("AGENTS.md") : "";
const docsReadme = exists("docs/README.md") ? read("docs/README.md") : "";
const docsKnowledge = exists("docs/topics/docs-knowledge-system.md")
  ? read("docs/topics/docs-knowledge-system.md")
  : "";

if ((exists("docs/topics/agentic-os-operations.md") || exists("docs/skills/aos-realinear-os"))
  && (!agents.includes("aos-realinear-os") || !agents.includes("docs/topics/agentic-os-operations.md"))) {
  add("warn", "AGENTS.md should keep a short `aos-realinear-os` pointer to docs/topics/agentic-os-operations.md");
}

if ((exists("docs/skills/aos-cerrar-sesion") || exists("docs/skills/aos-continuar-sesion"))
  && (!agents.includes("aos-cerrar-sesion") || !agents.includes("aos-continuar-sesion"))) {
  add("warn", "AGENTS.md should keep short pointers for `aos-cerrar-sesion` and `aos-continuar-sesion`");
}

if (docsReadme) {
  const readingRoute = sectionContent(docsReadme, "Regla De Lectura Liviana");
  if (readingRoute && !readingRoute.includes("docs/.generated/context-index.md")) {
    add("warn", "docs/README.md reading route should explicitly start from docs/.generated/context-index.md");
  }
}

if (docsKnowledge && !docsKnowledge.includes("docs/.generated/context-index.md")) {
  add("warn", "docs/topics/docs-knowledge-system.md should document docs/.generated/context-index.md in the hot route");
}

if (exists("docs/USER_GUIDE.md") && !topicsIndex.includes("USER_GUIDE.md")) {
  add("warn", "docs/USER_GUIDE.md exists but is not listed in docs/TOPICS.md");
}

if (exists("docs/OS_PROJECTS.md") && !topicsIndex.includes("OS_PROJECTS.md")) {
  add("warn", "docs/OS_PROJECTS.md exists but is not listed in docs/TOPICS.md");
}

if (exists("docs/topics/agentic-os-operations.md") && !topicsIndex.includes("topics/agentic-os-operations.md")) {
  add("warn", "docs/topics/agentic-os-operations.md exists but is not linked from docs/TOPICS.md");
}

if (exists("docs/topics/docs-knowledge-system.md") && !topicsIndex.includes("topics/docs-knowledge-system.md")) {
  add("warn", "docs/topics/docs-knowledge-system.md exists but is not linked from docs/TOPICS.md");
}

if (exists("docs/topics/pi-agentic-os.md") && !topicsIndex.includes("topics/pi-agentic-os.md")) {
  add("warn", "docs/topics/pi-agentic-os.md exists but is not linked from docs/TOPICS.md");
}

const topicFiles = exists("docs/topics")
  ? readdirSync(join(root, "docs", "topics")).filter((name) => name.endsWith(".md")).sort()
  : [];

if (!topicFiles.length) add("error", "No docs/topics/*.md files found");

for (const file of topicFiles) {
  const topicPath = `docs/topics/${file}`;
  const content = read(topicPath);
  const fm = frontmatter(content);

  if (!fm) {
    add("warn", `${topicPath} has no frontmatter`);
  } else {
    for (const key of ["id", "status", "kind", "triggers", "primary_refs"]) {
      if (!hasFrontmatterKey(fm, key)) add("warn", `${topicPath} frontmatter missing ${key}`);
    }

    const status = frontmatterValue(fm, "status");
    const maxChars = status === "reference" || status === "historical" ? 30000 : 25000;
    if (content.length > maxChars) {
      add(
        "warn",
        `${topicPath} is large (${content.length} chars, ~${approxTokensFromChars(content.length)} tokens); keep active topics focused or move detail deeper`,
      );
    }
  }

  if (!topicsIndex.includes(`topics/${file}`)) {
    add("warn", `${topicPath} is not linked from docs/TOPICS.md`);
  }
}

for (const file of walkMarkdownFiles(join(root, "docs", "tracks"))) {
  const trackPath = relative(root, file).replaceAll("\\", "/");
  if (trackPath === "docs/tracks/README.md") continue;
  const content = read(trackPath);
  const fm = frontmatter(content);

  if (!fm) {
    add("warn", `${trackPath} has no frontmatter`);
    continue;
  }

  for (const key of ["status", "updated"]) {
    if (!hasFrontmatterKey(fm, key)) add("warn", `${trackPath} frontmatter missing ${key}`);
  }

  if (content.length > 50000) {
    add(
      "warn",
      `${trackPath} is large (${content.length} chars, ~${approxTokensFromChars(content.length)} tokens); tracks should be resumable state, not a transcript`,
    );
  }
}

if (exists("docs/skills")) {
  const skillDirs = listDirs("docs/skills");
  if (!skillDirs.length) {
    add("warn", "docs/skills/ exists but has no skill directories");
  }

  if (exists("docs/skills/README.md")) {
    const skillNames = new Set(skillDirs.map((dir) => dir.split("/").at(-1) ?? dir));
    for (const skillName of backtickedSkillRefs(read("docs/skills/README.md"))) {
      if (!skillNames.has(skillName)) {
        add("warn", `docs/skills/README.md references missing skill docs/skills/${skillName}/`);
      }
    }
  }

  for (const skillDir of skillDirs) {
    const skillFile = `${skillDir}/SKILL.md`;
    if (!exists(skillFile)) {
      add("warn", `${skillDir} is missing SKILL.md`);
      continue;
    }

    const content = read(skillFile);
    const fm = frontmatter(content);
    if (!fm) {
      add("warn", `${skillFile} has no frontmatter`);
      continue;
    }

    for (const key of ["name", "description"]) {
      if (!hasFrontmatterKey(fm, key)) add("warn", `${skillFile} frontmatter missing ${key}`);
    }
    warnIfFrontmatterYamlLooksUnsafe(skillFile, fm);
  }
}

if (exists(".pi/prompts")) {
  for (const file of walkMarkdownFiles(join(root, ".pi", "prompts"))) {
    const promptPath = relative(root, file).replaceAll("\\", "/");
    const fm = frontmatter(read(promptPath));
    if (fm) warnIfFrontmatterYamlLooksUnsafe(promptPath, fm);
  }
}

const hasPiAdapter = exists(".pi") || exists(".pi/prompts") || exists(".pi/extensions");
if (hasPiAdapter) {
  if (!exists(".pi/prompts")) {
    add("error", "Pi adapter exists but .pi/prompts/ is missing; slash prompt templates will not be visible");
  } else {
    const promptNames = new Set(listFileNames(".pi/prompts", ".md"));
    for (const prompt of requiredAosPiPrompts) {
      if (!promptNames.has(prompt) && !globalAosExists(join(".pi", "prompts", prompt))) {
        add("error", `.pi/prompts/${prompt} is missing locally and from AOS_HOME; required /${prompt.replace(/\.md$/, "")} slash prompt will not be visible`);
      }
    }

    for (const prompt of legacyAosPiPrompts) {
      if (promptNames.has(prompt)) {
        const command = prompt.replace(/\.md$/, "");
        const level: Finding["level"] = prompt === "threads.md" ? "error" : "warn";
        add(level, `.pi/prompts/${prompt} is legacy unprefixed AOS slash command /${command}; use /aos-* prompt names to avoid slash palette drift`);
      }
    }
  }

  const globalExtensionsAvailable = requiredAosPiExtensions.every((extension) =>
    globalAosExists(join(".pi", "extensions", extension)),
  );
  if (!exists(".pi/extensions") && !globalExtensionsAvailable) {
    add("error", "Pi adapter exists but extensions are missing locally and from AOS_HOME; commands like /aos-sync will not load");
  } else {
    const extensionNames = new Set(
      exists(".pi/extensions") ? listFileNames(".pi/extensions", ".ts") : [],
    );
    for (const extension of requiredAosPiExtensions) {
      if (!extensionNames.has(extension) && !globalAosExists(join(".pi", "extensions", extension))) {
        add("error", `.pi/extensions/${extension} is missing locally and from AOS_HOME; required AOS Pi extension commands/nudges will not load`);
      }
    }

    for (const extension of legacyAosPiExtensions) {
      if (extensionNames.has(extension)) {
        add("warn", `.pi/extensions/${extension} is legacy unprefixed AOS adapter; use .pi/extensions/aos-* to avoid duplicate or stale slash commands`);
      }
    }

    const aosToolsPath = exists(".pi/extensions/aos-tools.ts")
      ? join(root, ".pi", "extensions", "aos-tools.ts")
      : join(aosHome, ".pi", "extensions", "aos-tools.ts");
    if (existsSync(aosToolsPath)) {
      const aosTools = readFileSync(aosToolsPath, "utf8");
      for (const command of requiredAosToolCommands) {
        if (!aosTools.includes(`registerCommand("${command}"`)) {
          add("error", `${aosToolsPath} does not register /${command}`);
        }
      }
    }
  }
}

if (!exists(".agents/skills")) {
  // Allowed: .agents/skills is a discovery toggle. Pi sessions keep it disabled to avoid slash noise.
} else if (exists("docs/skills")) {
  const stats = lstatSync(join(root, ".agents/skills"));
  if (!(stats.isSymbolicLink() || stats.isDirectory())) {
    add("warn", ".agents/skills exists but is not a directory-like link");
  }

  const compatPath = realpathSync(join(root, ".agents/skills"));
  const canonicalPath = realpathSync(join(root, "docs/skills"));
  if (compatPath !== canonicalPath) {
    add("warn", ".agents/skills does not resolve to docs/skills");
  }
}

const specDirs = ["specs", ".specify/specs"].flatMap((specRoot) =>
  listDirs(specRoot).map((path) => ({
    path,
    name: path.split("/").at(-1) ?? path,
  })),
);
const specPrefixes = new Map<string, string[]>();

for (const spec of specDirs) {
  if (!exists(`${spec.path}/spec.md`)) {
    add("warn", `${spec.path} has no spec.md`);
  }

  const prefix = spec.name.match(/^\d+/)?.[0];
  if (!prefix) continue;
  specPrefixes.set(prefix, [...(specPrefixes.get(prefix) ?? []), spec.path]);
}

for (const [prefix, paths] of specPrefixes) {
  if (paths.length > 1) {
    add("warn", `Spec numeric prefix ${prefix} is duplicated across ${paths.join(", ")}`);
  }
}

if (!exists("docs/.generated/context-index.md")) {
  add("warn", "Missing generated context index docs/.generated/context-index.md");
} else {
  const indexTime = modifiedMs("docs/.generated/context-index.md");
  const trackMarkdown = walkMarkdownFiles(join(root, "docs", "tracks")).map((path) =>
    relative(root, path).replaceAll("\\", "/"),
  );
  const specMarkdown = specDirs.flatMap((spec) =>
    walkMarkdownFiles(join(root, spec.path)).map((path) => relative(root, path).replaceAll("\\", "/")),
  );
  const indexSources = [
    "docs/WORKING_MEMORY.md",
    "docs/GLOSSARY.md",
    "docs/TOPICS.md",
    "docs/OS_PROJECTS.md",
    "docs/skills/README.md",
    "docs/tracks/README.md",
    ...walkMarkdownFiles(join(root, ".pi", "prompts")).map((path) => relative(root, path).replaceAll("\\", "/")),
    ...(
      exists(".pi/extensions")
        ? readdirSync(join(root, ".pi", "extensions"), { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
          .map((entry) => `.pi/extensions/${entry.name}`)
        : []
    ),
    ...topicFiles.map((file) => `docs/topics/${file}`),
    ...walkMarkdownFiles(join(root, "docs", "skills")).map((path) => relative(root, path).replaceAll("\\", "/")),
    ...trackMarkdown,
    ...specMarkdown,
  ];

  for (const path of indexSources) {
    if (exists(path) && modifiedMs(path) > indexTime) {
      add("warn", `docs/.generated/context-index.md is older than ${path}`);
    }
  }
}

const errors = findings.filter((finding) => finding.level === "error");
const warnings = findings.filter((finding) => finding.level === "warn");

if (!findings.length) {
  console.log("Agent context audit passed.");
  process.exit(0);
}

for (const finding of findings) {
  console.log(`${finding.level.toUpperCase()}: ${finding.message}`);
}

console.log(`Agent context audit found ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
