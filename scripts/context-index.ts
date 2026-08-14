/// <reference path="../types/node-shims.d.ts" />

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const outputPath = join(root, "docs", ".generated", "context-index.md");

function exists(path: string) {
  return existsSync(join(root, path));
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function configuredActiveSpecPath(): string | undefined {
  if (!exists(".specify/feature.json")) return undefined;
  try {
    const config = JSON.parse(read(".specify/feature.json")) as {
      feature_directory?: unknown;
    };
    return typeof config.feature_directory === "string" && config.feature_directory.trim()
      ? resolve(root, config.feature_directory)
      : undefined;
  } catch {
    return undefined;
  }
}


function frontmatter(content: string) {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function value(meta: string, key: string) {
  return meta.match(new RegExp(`^${key}:[ \\t]*([^\\r\\n]*)`, "m"))?.[1]?.trim() ?? "";
}

function listValues(meta: string, key: string) {
  const match = meta.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+- .+\\r?\\n?)+)`, "m"));
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter(Boolean);
}

function walkMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function rel(path: string) {
  return relative(root, path).replaceAll("\\", "/");
}

function title(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Untitled";
}

function focusedTrackPaths(): Set<string> {
  if (!exists("docs/WORKING_MEMORY.md")) return new Set();
  const memory = read("docs/WORKING_MEMORY.md");
  const heading = "## Foco Único De Ejecución";
  const start = memory.indexOf(heading);
  if (start < 0) return new Set();
  const remainder = memory.slice(start + heading.length);
  const nextHeading = remainder.search(/\r?\n##\s/);
  const focus = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  const state = focus.match(/^- \*\*Estado:\*\* `([^`]+)`/m)?.[1];
  const field = state === "ready" ? "Plan" : state === "blocked" || state === "waiting_gate" ? "Referencia" : undefined;
  if (!field) return new Set();
  const pattern = new RegExp("^- \\*\\*" + field + ":\\*\\* `(docs/tracks/[^`]+\\.md)`", "gm");
  return new Set([...focus.matchAll(pattern)].map((match) => match[1]));
}

const now = new Date().toISOString();
const lines: string[] = [
  "# Context Index",
  "",
  "Generated cache. Do not edit by hand.",
  "",
  `Generated: ${now}`,
  "",
];

lines.push("## Topics", "");

if (exists("docs/topics")) {
  for (const file of walkMarkdownFiles(join(root, "docs", "topics")).sort()) {
    const path = rel(file);
    const content = read(path);
    const meta = frontmatter(content);
    const status = value(meta, "status") || "unknown";
    const id = value(meta, "id") || path;
    const triggers = listValues(meta, "triggers").slice(0, 8).join(", ");
    lines.push(`- ${status}: [${id}](../${path.replace(/^docs\//, "")})${triggers ? ` - ${triggers}` : ""}`);
  }
} else {
  lines.push("- Missing docs/topics/");
}

lines.push("", "## Tracks", "");

if (exists("docs/tracks")) {
  const focusedTracks = focusedTrackPaths();
  let focusedTrackCount = 0;
  for (const file of walkMarkdownFiles(join(root, "docs", "tracks")).sort()) {
    const path = rel(file);
    if (path === "docs/tracks/README.md" || path === "docs/tracks/TEMPLATE.md" || !focusedTracks.has(path)) continue;
    const content = read(path);
    const meta = frontmatter(content);
    const status = value(meta, "status") || "unknown";
    lines.push(`- ${status}: [${title(content)}](../${path.replace(/^docs\//, "")})`);
    focusedTrackCount += 1;
  }
  if (!focusedTrackCount) lines.push("- No focused track. Search `docs/tracks/` on demand.");
  else lines.push("- Other tracks are omitted from the hot index; search `docs/tracks/` on demand.");
} else {
  lines.push("- Missing docs/tracks/");
}

lines.push("", "## Specs", "");

if (exists("specs")) {
  const specs = readdirSync(join(root, "specs"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: resolve(root, "specs", entry.name),
      closed: exists(`specs/${entry.name}/spec.md`)
        ? /^(complete|completed|stable|superseded|archived)\b/.test(
          read(`specs/${entry.name}/spec.md`)
            .match(/^\*\*Status\*\*:\s*(.+)$/mi)?.[1]?.trim().toLowerCase() ?? "",
        )
        : false,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const configuredPath = configuredActiveSpecPath();
  const activeSpec = specs.find((spec) => spec.path === configuredPath && !spec.closed);
  if (activeSpec) lines.push(`- active: [${activeSpec.name}](../../specs/${activeSpec.name}/)`);
  else lines.push("- No active spec directories found.");
  for (const spec of specs.filter((spec) => spec !== activeSpec)) {
    lines.push(`- historical: [${spec.name}](../../specs/${spec.name}/)`);
  }
} else {
  lines.push("- Missing specs/");
}

lines.push("", "## Skills", "");

if (exists("docs/skills")) {
  const skillDirs = readdirSync(join(root, "docs", "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const nonCommandSkills = new Set(["aos-impeccable", "impeccable"]);
  const legacyAliasSkills = new Set([
    "aos-checkpoint",
    "aos-cerrar-sesion",
    "cerrar-sesion",
    "continuar-sesion",
    "continuar-sesion-con-gol",
    "evaluar-skills",
    "plan-implementar",
    "realinear-os",
    "sigamos",
  ]);
  const operationalSkills = skillDirs
    .filter((skill) => skill.startsWith("aos-") && !skill.startsWith("aos-speckit-"))
    .filter((skill) => !nonCommandSkills.has(skill) && !legacyAliasSkills.has(skill))
    .filter((skill) => exists(`docs/skills/${skill}/SKILL.md`));
  lines.push("- Canon: [docs/skills/](../skills/)");
  if (operationalSkills.length) lines.push(`- Operational commands: ${operationalSkills.join(", ")}`);
  lines.push("- Guidance: [local-codex-skills](../topics/local-codex-skills.md)");
} else {
  lines.push("- Missing docs/skills/");
}

lines.push("", "## OMP Resources", "");

const ompPrompts = exists(".omp/prompts")
  ? readdirSync(join(root, ".omp", "prompts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .sort()
  : [];
const ompExtensions = exists(".omp/extensions")
  ? readdirSync(join(root, ".omp", "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort()
  : [];
if (ompPrompts.length) lines.push(`- Prompts: ${ompPrompts.join(", ")}`);
if (ompExtensions.length) lines.push(`- Extensions: ${ompExtensions.join(", ")}`);
if (!ompPrompts.length && !ompExtensions.length) lines.push("- No project OMP resources found.");

lines.push("", "## Aliases", "");

if (exists("docs/GLOSSARY.md")) {
  const glossary = read("docs/GLOSSARY.md");
  const aliases = glossary
    .split(/\r?\n/)
    .filter((line) => /^\| .+ \| .+ \|$/.test(line) && !line.includes("---"))
    .slice(1)
    .map((row) => row.split("|")[1]?.trim())
    .filter(Boolean);
  lines.push(`See [docs/GLOSSARY.md](../GLOSSARY.md) for definitions. Indexed aliases: ${aliases.join(", ")}.`);
} else {
  lines.push("- Missing docs/GLOSSARY.md");
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${rel(outputPath)}`);
