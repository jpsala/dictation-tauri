import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const outputPath = join(root, "docs", ".generated", "context-index.md");

function exists(path: string) {
  return existsSync(join(root, path));
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
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
    const triggers = listValues(meta, "triggers").join(", ");
    lines.push(`- ${status}: [${id}](../${path.replace(/^docs\//, "")})${triggers ? ` - ${triggers}` : ""}`);
  }
} else {
  lines.push("- Missing docs/topics/");
}

lines.push("", "## Tracks", "");

if (exists("docs/tracks")) {
  for (const file of walkMarkdownFiles(join(root, "docs", "tracks")).sort()) {
    const path = rel(file);
    if (path === "docs/tracks/README.md" || path === "docs/tracks/TEMPLATE.md") continue;
    const content = read(path);
    const meta = frontmatter(content);
    const status = value(meta, "status") || "unknown";
    const priority = value(meta, "priority") || "unknown";
    const updated = value(meta, "updated") || "unknown";
    lines.push(`- ${status}/${priority}: [${title(content)}](../${path.replace(/^docs\//, "")}) - updated ${updated}`);
  }
} else {
  lines.push("- Missing docs/tracks/");
}

lines.push("", "## Specs", "");

if (exists("specs")) {
  const specs = readdirSync(join(root, "specs"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (specs.length) {
    for (const spec of specs) lines.push(`- [${spec}](../../specs/${spec}/)`);
  } else {
    lines.push("- No active spec directories found.");
  }
} else {
  lines.push("- Missing specs/");
}

lines.push("", "## Skills", "");

if (exists("docs/skills")) {
  lines.push("- Canon: [docs/skills/](../skills/)");
  lines.push("- Operational commands: sigamos, cerrar-sesion, continuar-sesion, continuar-sesion-con-gol, realinear-os, evaluar-skills");
  lines.push("- Guidance: [local-codex-skills](../topics/local-codex-skills.md)");
} else {
  lines.push("- Missing docs/skills/");
}

lines.push("", "## Aliases", "");

if (exists("docs/GLOSSARY.md")) {
  const glossary = read("docs/GLOSSARY.md");
  const rows = glossary
    .split(/\r?\n/)
    .filter((line) => /^\| .+ \| .+ \|$/.test(line) && !line.includes("---"));
  for (const row of rows.slice(1)) lines.push(row);
} else {
  lines.push("- Missing docs/GLOSSARY.md");
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${rel(outputPath)}`);
