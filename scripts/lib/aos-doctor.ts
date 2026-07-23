import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadFocusedPlans } from "./aos-focus.ts";

export type DoctorFinding = { level: "error" | "warn"; code: string; message: string };
export type DoctorReport = { findings: DoctorFinding[]; errors: number; warnings: number };

const TRACK_STATUSES = new Set([
  "pending",
  "active",
  "paused",
  "blocked",
  "complete",
  "stable",
  "superseded",
  "archived",
]);

function read(path: string) {
  return readFileSync(path, "utf8");
}

function frontmatter(content: string) {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function listValues(meta: string, key: string) {
  const lines = meta.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s+-\s+(.+)$/);
    if (!match) break;
    values.push(match[1].trim());
  }
  return values;
}

function sorted(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameList(left: string[], right: string[]) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function listedResources(index: string, label: "Prompts" | "Extensions") {
  const prefix = `- ${label}: `;
  const value = index
    .split(/\r?\n/)
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length) ?? "";
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function actualResources(root: string, relativeDir: string, extension: string, stripExtension = false) {
  const dir = join(root, relativeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => stripExtension ? entry.name.slice(0, -extension.length) : entry.name);
}

export function runAosDoctor(projectRoot = process.cwd(), options: { includeContextSize?: boolean } = {}): DoctorReport {
  const root = resolve(projectRoot);
  const findings: DoctorFinding[] = [];
  const add = (level: DoctorFinding["level"], code: string, message: string) => findings.push({ level, code, message });

  const focus = loadFocusedPlans(root);
  if (focus.kind === "invalid") add("error", "focus.invalid", focus.error);

  const topicsDir = join(root, "docs", "topics");
  if (existsSync(topicsDir)) {
    for (const entry of readdirSync(topicsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const topicPath = join(topicsDir, entry.name);
      for (const ref of listValues(frontmatter(read(topicPath)), "primary_refs")) {
        if (/^(https?:\/\/)/.test(ref) || !/^(?:[A-Za-z]:[\\/]|\.?[A-Za-z0-9_-]+[\\/]|[A-Z][A-Z0-9_-]*\.md$)/.test(ref)) continue;
        const target = isAbsolute(ref) ? ref : resolve(root, ref);
        if (!existsSync(target)) add("error", "topic.ref_missing", `${entry.name}: ${ref}`);
      }
    }
  }

  const skillsTopic = join(root, "docs", "topics", "local-codex-skills.md");
  if (existsSync(skillsTopic)) {
    const content = read(skillsTopic);
    for (const match of content.matchAll(/`(docs\/skills\/([a-z0-9-]+)\/)`/g)) {
      if (!existsSync(resolve(root, match[1]))) add("error", "skill.ref_missing", match[1]);
    }
  }

  const contextIndexPath = join(root, "docs", ".generated", "context-index.md");
  if (existsSync(contextIndexPath)) {
    const index = read(contextIndexPath);
    const actualPrompts = actualResources(root, ".pi/prompts", ".md", true);
    const actualExtensions = actualResources(root, ".pi/extensions", ".ts");
    if (!sameList(listedResources(index, "Prompts"), actualPrompts)) {
      add("error", "index.pi_prompts_stale", "Context index no coincide con prompts Pi locales.");
    }
    if (!sameList(listedResources(index, "Extensions"), actualExtensions)) {
      add("error", "index.pi_extensions_stale", "Context index no coincide con extensiones Pi locales.");
    }
  } else {
    add("error", "index.missing", "Falta docs/.generated/context-index.md.");
  }

  const tracksDir = join(root, "docs", "tracks");
  if (existsSync(tracksDir)) {
    const trackEntries = readdirSync(tracksDir, { withFileTypes: true }).filter((entry) =>
      entry.isFile() && entry.name.endsWith(".md") && !["README.md", "TEMPLATE.md"].includes(entry.name)
    );
    const active = trackEntries.filter((entry) => {
      const meta = frontmatter(read(join(tracksDir, entry.name)));
      const status = meta.match(/^status:\s*([^\r\n]+)$/m)?.[1]?.trim() ?? "";
      if (!TRACK_STATUSES.has(status)) add("error", "track.status_invalid", `${entry.name}: ${status || "missing"}`);
      return status === "active";
    });
    if (active.length > 5) add("warn", "tracks.wip_high", `${active.length} tracks activas; revisar WIP y estados.`);
  }

  if (options.includeContextSize !== false) {
    const hotPaths = ["AGENTS.md", "docs/.generated/context-index.md", "docs/WORKING_MEMORY.md"];
    const chars = hotPaths.reduce((total, path) => {
      const target = join(root, path);
      return total + (existsSync(target) ? read(target).length : 0);
    }, 0);
    if (chars > 18000) add("warn", "context.hot_large", `Ruta caliente ~${Math.ceil(chars / 4)} tokens; objetivo <= 4500.`);
  }

  return {
    findings,
    errors: findings.filter((finding) => finding.level === "error").length,
    warnings: findings.filter((finding) => finding.level === "warn").length,
  };
}

export function formatDoctorReport(report: DoctorReport, maxFindings = Number.POSITIVE_INFINITY) {
  const status = report.errors ? "FAIL" : report.warnings ? "WARN" : "PASS";
  const lines = [`AOS Doctor ${status}: ${report.errors} error(s), ${report.warnings} warning(s).`];
  for (const finding of report.findings.slice(0, maxFindings)) {
    lines.push(`${finding.level.toUpperCase()} [${finding.code}] ${finding.message}`);
  }
  if (report.findings.length > maxFindings) lines.push(`… ${report.findings.length - maxFindings} hallazgo(s) más.`);
  return lines.join("\n");
}
