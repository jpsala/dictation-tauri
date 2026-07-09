import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  ContextUsage,
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const OS_COMPACT_INSTRUCTIONS = `Preservar contexto operativo del sistema agentico con prioridad alta:
- objetivo actual y frente de trabajo;
- decisiones durables y su razonamiento;
- archivos modificados o consultados que importan;
- comandos/checks ejecutados y resultado relevante;
- riesgos, bloqueos y cosas que NO hay que hacer;
- proximo paso concreto;
- distinguir docs versionados como fuente de verdad frente a chat/transcript.
Descartar exploraciones descartadas, logs largos, razonamiento intermedio y ruido.`;

type SkillsDiscoveryStatus =
  | { state: "enabled"; detail: string }
  | { state: "disabled"; detail: string }
  | { state: "unsafe"; detail: string };

type ContinuationMode =
  | "auto"
  | "discuss"
  | "study"
  | "plan"
  | "spec"
  | "implement"
  | "review";
type ContinuationTool =
  | "auto"
  | "manual"
  | "task"
  | "planner"
  | "dgoal"
  | "long-task"
  | "taskflow";

type ContinuationOptions = {
  goal: string;
  preview: boolean;
  implement: boolean;
  mode: ContinuationMode;
  tool: ContinuationTool;
  brief?: string;
};

type PlanImplementationTool =
  | "auto"
  | "manual"
  | "planner"
  | "dgoal"
  | "until-done"
  | "long-task"
  | "taskflow";

type PlanImplementationOptions = {
  goal: string;
  preview: boolean;
  execute: boolean;
  autonomous: boolean;
  tool: PlanImplementationTool;
  from?: string;
};

type FleetUpdateOptions = {
  repos: string[];
  preview: boolean;
  dryRun: boolean;
  commit: boolean;
  goal: string;
};

type RoutingEngine = Exclude<PlanImplementationTool, "auto">;

type RoutingState = {
  activeEngine: RoutingEngine;
  goal?: string;
  startedAt: string;
  updatedAt: string;
  source: string;
};

const CONTINUATION_MODES = new Set<ContinuationMode>([
  "auto",
  "discuss",
  "study",
  "plan",
  "spec",
  "implement",
  "review",
]);
const CONTINUATION_TOOLS = new Set<ContinuationTool>([
  "auto",
  "manual",
  "task",
  "planner",
  "dgoal",
  "long-task",
  "taskflow",
]);
const PLAN_IMPLEMENTATION_TOOLS = new Set<PlanImplementationTool>([
  "auto",
  "manual",
  "planner",
  "dgoal",
  "until-done",
  "long-task",
  "taskflow",
]);
const ROUTING_ENGINES = new Set<RoutingEngine>([
  "manual",
  "planner",
  "dgoal",
  "until-done",
  "long-task",
  "taskflow",
]);

const ROUTING_FORBIDS: Record<RoutingEngine, RoutingEngine[]> = {
  manual: [],
  planner: ["dgoal", "until-done"],
  dgoal: ["planner", "until-done"],
  "until-done": ["planner", "dgoal"],
  "long-task": ["planner", "dgoal", "until-done"],
  taskflow: [],
};

function skillsPaths(cwd: string): {
  agentsDir: string;
  compat: string;
  canonical: string;
} {
  const agentsDir = join(cwd, ".agents");
  return {
    agentsDir,
    compat: join(agentsDir, "skills"),
    canonical: join(cwd, "docs", "skills"),
  };
}

function getSkillsDiscoveryStatus(cwd: string): SkillsDiscoveryStatus {
  const { compat, canonical } = skillsPaths(cwd);
  if (!existsSync(compat))
    return { state: "disabled", detail: ".agents/skills does not exist" };

  const item = lstatSync(compat);
  if (!item.isSymbolicLink()) {
    return {
      state: "unsafe",
      detail:
        ".agents/skills is a real directory; refusing to treat it as a toggle",
    };
  }

  if (!existsSync(canonical)) {
    return { state: "unsafe", detail: "docs/skills does not exist" };
  }

  return { state: "enabled", detail: ".agents/skills links to docs/skills" };
}

function setSkillsDiscovery(
  cwd: string,
  action: "on" | "off" | "toggle",
): SkillsDiscoveryStatus {
  const status = getSkillsDiscoveryStatus(cwd);
  const { agentsDir, compat, canonical } = skillsPaths(cwd);

  if (action === "off" || action === "toggle") {
    // Keep the compatibility path stable. Removing it leaves Pi/Codex with
    // cached skill paths that point at missing files.
    if (status.state === "enabled") {
      return {
        state: "enabled",
        detail: ".agents/skills kept stable; off/toggle are legacy no-ops",
      };
    }
  }

  if (status.state === "enabled") return status;
  if (status.state === "unsafe") return status;
  if (!existsSync(canonical))
    return { state: "unsafe", detail: "docs/skills does not exist" };

  mkdirSync(agentsDir, { recursive: true });
  symlinkSync(
    canonical,
    compat,
    process.platform === "win32" ? "junction" : "dir",
  );
  return { state: "enabled", detail: "created .agents/skills -> docs/skills" };
}

function readRepoFile(cwd: string, path: string): string | undefined {
  const full = join(cwd, path);
  if (!existsSync(full)) return undefined;
  return readFileSync(full, "utf8");
}

function normalizeHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function section(
  content: string | undefined,
  heading: string,
  maxChars = 1800,
): string {
  if (!content) return "";
  const expected = normalizeHeading(heading);
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = line.match(/^##\s+(.+?)\s*$/);
    return match ? normalizeHeading(match[1]) === expected : false;
  });
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const text = lines.slice(start, end).join("\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...` : text;
}

function sectionAny(
  content: string | undefined,
  headings: string[],
  maxChars = 1800,
): string {
  for (const heading of headings) {
    const found = section(content, heading, maxChars);
    if (found) return found;
  }
  return "";
}

function formatUsage(usage: ContextUsage | undefined): string {
  if (!usage) return "desconocido";
  const pct = usage.percent == null ? "?" : `${Math.round(usage.percent)}%`;
  const tokens = usage.tokens == null ? "?" : `${usage.tokens}`;
  return `${pct} (${tokens}/${usage.contextWindow} tokens)`;
}

async function gitSummary(
  pi: ExtensionAPI,
): Promise<{ branch: string; dirty: string; changedCount: number }> {
  const branchResult = await pi.exec("git", ["branch", "--show-current"], {
    timeout: 5000,
  });
  const statusResult = await pi.exec("git", ["status", "--short"], {
    timeout: 5000,
  });
  const branch =
    branchResult.code === 0
      ? branchResult.stdout.trim() || "(detached)"
      : "n/a";
  const lines =
    statusResult.code === 0
      ? statusResult.stdout.trim().split(/\r?\n/).filter(Boolean)
      : [];
  return {
    branch,
    dirty: lines.length ? lines.slice(0, 16).join("\n") : "limpio",
    changedCount: lines.length,
  };
}

function buildDocsSnapshot(cwd: string): string {
  const wm = readRepoFile(cwd, "docs/WORKING_MEMORY.md");
  const topic =
    readRepoFile(cwd, "docs/topics/docs-knowledge-system.md") ||
    readRepoFile(cwd, "docs/topics/agentic-os-local.md") ||
    readRepoFile(cwd, "docs/OS_PLAYBOOK.md");
  const current = sectionAny(wm, ["Estado Actual", "Estado actual"], 1200);
  const next = sectionAny(
    wm,
    [
      "Proximo Paso Probable",
      "Próximo paso probable",
      "Proximo Paso",
      "Próximo paso",
    ],
    1200,
  );
  const decisions = sectionAny(
    wm,
    ["Decisiones Recientes", "Decisiones Vigentes"],
    1400,
  );
  const risks = sectionAny(
    wm,
    ["Riesgos", "Riesgos Que No Hay Que Olvidar"],
    1000,
  );
  const commands = sectionAny(
    wm,
    ["Comandos De Contexto", "Comandos de contexto"],
    1000,
  );
  const guardarSesion = sectionAny(
    topic,
    [
      "Guardar Sesion",
      "Guardar sesión",
      "Guardado, Gol Y Sesiones",
      "Comandos Pi Locales",
    ],
    1200,
  );

  return [current, next, decisions, risks, commands, guardarSesion]
    .filter(Boolean)
    .join("\n\n");
}

function hasPackageScript(cwd: string, scriptName: string): boolean {
  const raw = readRepoFile(cwd, "package.json");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    return typeof parsed.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}

async function runContextAudit(pi: ExtensionAPI, cwd: string): Promise<string> {
  const command = hasPackageScript(cwd, "context:audit")
    ? (["bun", ["run", "context:audit"]] as const)
    : (["bun", ["scripts/agent-context-audit.ts"]] as const);
  const result = await pi.exec(command[0], command[1], { timeout: 120000 });
  const output =
    `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
  return output.length > 2500
    ? `${output.slice(0, 2500)}\n...`
    : output || `(sin salida, exit ${result.code})`;
}

function formatCommandResult(
  label: string,
  result: { code: number; stdout: string; stderr: string },
): string {
  const output =
    `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim() ||
    "(sin salida)";
  const clipped =
    output.length > 2200 ? `${output.slice(0, 2200)}\n...` : output;
  return `### ${label}\n\nExit: ${result.code}\n\n\`\`\`text\n${clipped}\n\`\`\``;
}

async function runOsSync(
  pi: ExtensionAPI,
  cwd: string,
): Promise<{ markdown: string; ok: boolean }> {
  const blocks: string[] = [];
  let ok = true;

  if (existsSync(join(cwd, "scripts", "ensure-skills-link.ps1"))) {
    const ensure = await pi.exec(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", "scripts/ensure-skills-link.ps1"],
      { timeout: 120000 },
    );
    ok = ok && ensure.code === 0;
    blocks.push(formatCommandResult("ensure-skills-link", ensure));
  }

  const indexCommand = hasPackageScript(cwd, "context:index")
    ? (["bun", ["run", "context:index"]] as const)
    : (["bun", ["scripts/context-index.ts"]] as const);
  const index = await pi.exec(indexCommand[0], indexCommand[1], {
    timeout: 120000,
  });
  ok = ok && index.code === 0;
  blocks.push(formatCommandResult("context:index", index));

  const auditCommand = hasPackageScript(cwd, "context:audit")
    ? (["bun", ["run", "context:audit"]] as const)
    : (["bun", ["scripts/agent-context-audit.ts"]] as const);
  const audit = await pi.exec(auditCommand[0], auditCommand[1], {
    timeout: 120000,
  });
  ok = ok && audit.code === 0;
  blocks.push(formatCommandResult("context:audit", audit));

  return {
    ok,
    markdown: `## OS Sync\n\nSincronizacion de la capa agentica despues de cambios en docs, tracks, topics, skills, prompts o extensiones.\n\n${blocks.join("\n\n")}`,
  };
}

function splitCommandArgs(raw: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of raw.matchAll(pattern)) {
    args.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return args;
}

function resolveBrief(
  cwd: string,
  rawPath: string,
): { brief?: string; error?: string } {
  if (!rawPath.trim()) return { error: "--brief requiere una ruta." };
  const full = resolve(cwd, rawPath);
  const rel = relative(cwd, full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return {
      error: "--brief debe apuntar a un archivo dentro del repo actual.",
    };
  }
  if (!existsSync(full)) return { error: `No existe el brief: ${rel}` };
  return { brief: rel.replace(/\\/g, "/") };
}

function routingStatePath(cwd: string) {
  return join(cwd, ".pi", "state", "aos-routing.json");
}

function normalizeRoutingEngine(value: string | undefined) {
  if (!value || value === "auto" || value === "task") return undefined;
  return ROUTING_ENGINES.has(value as RoutingEngine)
    ? (value as RoutingEngine)
    : undefined;
}

function readRoutingState(cwd: string): RoutingState | undefined {
  const path = routingStatePath(cwd);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RoutingState>;
    const activeEngine = normalizeRoutingEngine(parsed.activeEngine);
    if (!activeEngine) return undefined;
    return {
      activeEngine,
      goal: typeof parsed.goal === "string" ? parsed.goal : undefined,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
    };
  } catch {
    return undefined;
  }
}

function writeRoutingState(cwd: string, state: RoutingState) {
  mkdirSync(join(cwd, ".pi", "state"), { recursive: true });
  writeFileSync(routingStatePath(cwd), `${JSON.stringify(state, null, 2)}\n`);
}

function clearRoutingState(cwd: string) {
  rmSync(routingStatePath(cwd), { force: true });
}

function routingConflict(
  active: RoutingState | undefined,
  requested: RoutingEngine | undefined,
) {
  if (!active || !requested || active.activeEngine === requested) return undefined;
  if (!ROUTING_FORBIDS[active.activeEngine].includes(requested)) return undefined;
  return `${active.activeEngine} ya esta activo; ${requested} esta prohibido como motor principal simultaneo.`;
}

function formatRoutingState(
  active: RoutingState | undefined,
  requested?: RoutingEngine,
) {
  if (!active) {
    return "### Active Engine Register\n\nNo hay motor principal activo en .pi/state/aos-routing.json.";
  }
  const conflict = routingConflict(active, requested);
  return `### Active Engine Register\n\n- Motor activo: ${active.activeEngine}\n- Goal: ${active.goal || "(sin goal registrado)"}\n- Source: ${active.source}\n- Started: ${active.startedAt || "(sin fecha)"}\n- Updated: ${active.updatedAt || "(sin fecha)"}${conflict ? `\n- WARNING: ${conflict}` : ""}`;
}

function parseContinuationArgs(
  cwd: string,
  raw: string,
): { options?: ContinuationOptions; error?: string } {
  const tokens = splitCommandArgs(raw.trim());
  const goalTokens: string[] = [];
  const options: ContinuationOptions = {
    goal: "",
    preview: false,
    implement: false,
    mode: "auto",
    tool: "auto",
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--preview") {
      options.preview = true;
      continue;
    }
    if (token === "--implement") {
      options.implement = true;
      options.mode = "implement";
      continue;
    }

    const [flag, inlineValue] = token.includes("=")
      ? token.split(/=(.*)/s, 2)
      : [token, undefined];
    if (flag === "--brief") {
      const value = inlineValue ?? tokens[++i];
      const resolved = resolveBrief(cwd, value ?? "");
      if (resolved.error) return { error: resolved.error };
      options.brief = resolved.brief;
      continue;
    }
    if (flag === "--mode") {
      const value = inlineValue ?? tokens[++i];
      if (!CONTINUATION_MODES.has(value as ContinuationMode)) {
        return {
          error:
            "--mode debe ser auto|discuss|study|plan|spec|implement|review.",
        };
      }
      options.mode = value as ContinuationMode;
      options.implement = options.implement || options.mode === "implement";
      continue;
    }
    if (flag === "--tool") {
      const value = inlineValue ?? tokens[++i];
      if (!CONTINUATION_TOOLS.has(value as ContinuationTool)) {
        return {
          error:
            "--tool debe ser auto|manual|task|planner|dgoal|long-task|taskflow.",
        };
      }
      options.tool = value as ContinuationTool;
      continue;
    }
    if (token.startsWith("--")) {
      return { error: `Flag no reconocido: ${token}` };
    }
    goalTokens.push(token);
  }

  options.goal = goalTokens.join(" ").trim();
  return { options };
}

function parsePlanImplementationArgs(
  cwd: string,
  raw: string,
): { options?: PlanImplementationOptions; error?: string } {
  const tokens = splitCommandArgs(raw.trim());
  const goalTokens: string[] = [];
  const options: PlanImplementationOptions = {
    goal: "",
    preview: false,
    execute: false,
    autonomous: false,
    tool: "auto",
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--preview") {
      options.preview = true;
      continue;
    }
    if (token === "--execute") {
      options.execute = true;
      continue;
    }
    if (token === "--autonomous") {
      options.autonomous = true;
      options.execute = true;
      continue;
    }

    const [flag, inlineValue] = token.includes("=")
      ? token.split(/=(.*)/s, 2)
      : [token, undefined];
    if (flag === "--from") {
      const value = inlineValue ?? tokens[++i];
      const resolved = resolveBrief(cwd, value ?? "");
      if (resolved.error) return { error: resolved.error.replace("--brief", "--from") };
      options.from = resolved.brief;
      continue;
    }
    if (flag === "--tool") {
      const value = inlineValue ?? tokens[++i];
      if (!PLAN_IMPLEMENTATION_TOOLS.has(value as PlanImplementationTool)) {
        return {
          error:
            "--tool debe ser auto|manual|planner|dgoal|until-done|long-task|taskflow.",
        };
      }
      options.tool = value as PlanImplementationTool;
      continue;
    }
    if (token.startsWith("--")) {
      return { error: `Flag no reconocido: ${token}` };
    }
    goalTokens.push(token);
  }

  options.goal = goalTokens.join(" ").trim();
  return { options };
}

function parseFleetUpdateArgs(
  raw: string,
): { options?: FleetUpdateOptions; error?: string } {
  const tokens = splitCommandArgs(raw.trim());
  const repos: string[] = [];
  const goalTokens: string[] = [];
  const options: FleetUpdateOptions = {
    repos,
    preview: false,
    dryRun: true,
    commit: false,
    goal: "",
  };
  let readingGoal = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (readingGoal) {
      goalTokens.push(token);
      continue;
    }
    if (token === "--preview") {
      options.preview = true;
      continue;
    }
    if (token === "--execute") {
      options.dryRun = false;
      continue;
    }
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--commit") {
      options.commit = true;
      options.dryRun = false;
      continue;
    }
    if (token === "--goal") {
      readingGoal = true;
      continue;
    }
    if (token.startsWith("--")) return { error: `Flag no reconocido: ${token}` };
    repos.push(token);
  }

  options.goal = goalTokens.join(" ").trim();
  return { options };
}

async function buildStatusMarkdown(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  includeAudit: boolean,
): Promise<string> {
  const usage = ctx.getContextUsage();
  const git = await gitSummary(pi);
  const sessionName =
    pi.getSessionName() ??
    ctx.sessionManager.getSessionName() ??
    "(sin nombre)";
  const sessionFile = ctx.sessionManager.getSessionFile() ?? "(ephemeral)";
  const model = ctx.model
    ? `${ctx.model.provider}/${ctx.model.id}`
    : "(sin modelo)";
  const thinking = pi.getThinkingLevel();

  const audit = includeAudit
    ? await runContextAudit(pi, ctx.cwd)
    : "No ejecutado. Usa `/aos-status audit` para correr el audit contextual.";
  const routing = formatRoutingState(readRoutingState(ctx.cwd));

  return `## OS Status

- Sesion: ${sessionName}
- Session file: ${sessionFile}
- Modelo: ${model}
- Thinking: ${thinking}
- Contexto: ${formatUsage(usage)}
- Git branch: ${git.branch}
- Worktree: ${git.changedCount ? `${git.changedCount} archivo(s) con cambios` : "limpio"}

### Cambios Git

\`\`\`text
${git.dirty}
\`\`\`

${routing}

### Audit

\`\`\`text
${audit}
\`\`\`

### Comandos utiles

- \`/aos-guardar-sesion\`: persistir valor durable sin abrir sesion nueva.
- \`/aos-continuar [objetivo]\`: abrir nueva sesion Pi con estrategia automatica desde docs vivos; sin objetivo detecta el proximo frente desde WORKING_MEMORY.
- \`/aos-continuar --brief docs/reference/foo.md [objetivo]\`: priorizar un brief/version durable.
- \`/aos-continuar --mode auto|discuss|study|plan|spec|implement|review --tool auto|manual|task|planner|dgoal|long-task|taskflow [objetivo]\`: orientar modo/herramienta sin auto-arrancar herramientas pesadas.
- \`/aos-continuar --preview [objetivo]\`: abrir nueva sesion con el prompt cargado en el editor, sin enviarlo automaticamente.
- \`/aos-plan-implementar [objetivo]\`: crear/tomar/revisar un plan y elegir motor para llevarlo a implementacion.
- \`/aos-plan-implementar --from docs/reference/foo.md --tool auto|manual|planner|dgoal|until-done|long-task|taskflow --execute [objetivo]\`: permitir implementacion local por cortes verificables; \`--autonomous\` permite arrancar un loop principal, sin prod/externo/commits.
- \`/aos-routing status|set <engine> [goal]|clear\`: registrar o limpiar el motor principal activo de forma advisory.
- \`/aos-evaluar-skills\`: auditar skills/prompts/extensiones y proponer mejoras.
- \`/aos-sync\`: sincronizar indice/audit despues de cambios del OS.
- \`/aos-skills status|on|off|toggle\`: ver/reparar .agents/skills; off/toggle son aliases legacy no destructivos.
- \`/aos-compact [foco]\`: compactacion manual con instrucciones OS-aware.
- \`/reload\`: recargar extensiones/prompts/skills.`;
}

function buildContinuationPrompt(
  ctx: ExtensionCommandContext,
  options: ContinuationOptions,
  git: { branch: string; dirty: string; changedCount: number },
): string {
  const currentSession = ctx.sessionManager.getSessionFile() ?? "(ephemeral)";
  const requestedGoal =
    options.goal ||
    "No explicitado: descubrir el proximo frente desde docs/WORKING_MEMORY.md.";
  const briefLine = options.brief
    ? `\nBrief prioritario: ${options.brief}`
    : "";
  const readOrder = options.brief
    ? `1. ${options.brief}\n2. docs/.generated/context-index.md\n3. docs/WORKING_MEMORY.md\n4. docs/topics/agent-tool-routing.md y docs/reference/tool-routing.yaml\n5. docs/TOPICS.md si hace falta elegir topic\n6. topic/track/spec puntual mencionado por el brief, WORKING_MEMORY, el indice o el objetivo\n7. docs/DECISIONS.md solo si el objetivo depende de una decision durable`
    : `1. docs/.generated/context-index.md\n2. docs/WORKING_MEMORY.md\n3. docs/topics/agent-tool-routing.md y docs/reference/tool-routing.yaml\n4. docs/TOPICS.md si hace falta elegir topic\n5. topic/track/spec puntual mencionado por WORKING_MEMORY, el indice o el objetivo\n6. docs/DECISIONS.md solo si el objetivo depende de una decision durable`;
  const requestedEngine = normalizeRoutingEngine(options.tool);
  const routing = formatRoutingState(readRoutingState(ctx.cwd), requestedEngine);

  return `Continuar en ${ctx.cwd}.

Asumi que JP pidio abrir una sesion limpia para seguir este frente. No reconstruyas contexto desde el transcript padre; usa docs vivos como fuente de verdad.

Objetivo/frase humana: ${requestedGoal}${briefLine}
Modo pedido: ${options.mode}
Herramienta sugerida: ${options.tool}
Implementacion permitida por flag: ${options.implement ? "si" : "no; plan-first hasta confirmar"}
Sesion padre: ${currentSession}

Leer primero, en este orden y solo lo necesario:
${readOrder}

Estado Git al crear este handoff:
- Branch: ${git.branch}
- Worktree: ${git.changedCount ? `${git.changedCount} archivo(s) con cambios` : "limpio"}

Cambios visibles:
\`\`\`text
${git.dirty}
\`\`\`

${routing}

Contrato de continuidad / strategy gate:
- Si no hay objetivo explicito, detecta el proximo frente recomendado desde WORKING_MEMORY y anuncialo.
- Clasifica el siguiente modo real: discuss, study, plan, spec, implement o review.
- Emite un bloque Routing Decision: intent, primary engine, why, support tools, forbidden nesting, required gates y verification.
- Usa docs/topics/agent-tool-routing.md y docs/reference/tool-routing.yaml como policy canonica.
- Elegi la herramienta que mas ayude, pero no auto-arranques planner/dgoal/taskflow/long-task si eso crea estado, costo o fan-out sin explicarlo.
- No le preguntes a JP por elecciones obvias y reversibles; avanza con el menor paso verificable.
- Preguntale a JP antes de: tocar codigo productivo si implementacion no fue pedida claramente, crear estado de planner/dgoal, fan-out costoso, sync/deploy/prod, envios externos, acciones destructivas, cambios con datos privados o scope ambiguo.
- Si el objetivo dice implementemos o el modo es implement, primero audita repo/estructura, propone corte TDD minimo y solo implementa si el alcance queda claro y seguro.

Heuristica de herramientas (resumen; si hay duda manda docs/reference/tool-routing.yaml):
- study/research externo -> docs/topics/conversational-research.md + web_search/fetch_content/web_answer; librarian para internals open-source.
- arquitectura/producto ambiguo -> advisor() y/o /task/SpecKit antes de codigo.
- spec fuerte antes de implementar -> /task o SpecKit.
- feature grande aprobada con branches/TDD -> pi-code-planner.
- objetivo largo con auditor -> pi-dgoal.
- TODO secuencial claro -> pi-long-task.
- auditoria/review paralela -> taskflow.
- cambio chico -> manual + Ponytail + pi-lens + tests.

Reglas de continuidad:
- Los docs versionados mandan sobre este prompt.
- Inspecciona git antes de editar y preserva cambios no commiteados.
- Usa Ponytail solo si esta activo o JP lo pidio: V0 minimo, reusable y verificable; no recortes seguridad ni requisitos explicitos.
- Usa advisor() antes de decisiones DECISIONS.md-worthy, arquitectura/storage/prod o loops largos.
- pi-lens es feedback obligatorio cuando tocaste codigo, pero los checks del repo (por ejemplo bun run check/tests) mandan.
- Si algo importante no esta en docs, preguntale a JP; no lo inventes.
- No crear transcript ni copiar historia larga.
- Si aparece valor durable nuevo durante esta sesion, persistilo en docs vivos con el destino correcto.`;
}

function buildPlanImplementationPrompt(
  ctx: ExtensionCommandContext,
  options: PlanImplementationOptions,
  git: { branch: string; dirty: string; changedCount: number },
): string {
  const requestedGoal =
    options.goal || "Tomar el proximo plan/frente recomendado desde docs vivos.";
  const fromLine = options.from ? `\nPlan/brief de entrada: ${options.from}` : "";
  const readOrder = options.from
    ? `1. ${options.from}\n2. docs/.generated/context-index.md\n3. docs/WORKING_MEMORY.md\n4. docs/topics/agent-tool-routing.md y docs/reference/tool-routing.yaml\n5. topic/track/spec puntual mencionado por el plan/brief\n6. docs/DECISIONS.md si hay decisiones durables`
    : `1. docs/.generated/context-index.md\n2. docs/WORKING_MEMORY.md\n3. docs/topics/agent-tool-routing.md y docs/reference/tool-routing.yaml\n4. docs/TOPICS.md si hace falta elegir topic\n5. topic/track/spec puntual del frente\n6. docs/DECISIONS.md si hay decisiones durables`;
  const requestedEngine = normalizeRoutingEngine(options.tool);
  const routing = formatRoutingState(readRoutingState(ctx.cwd), requestedEngine);

  return `Plan e implementar en ${ctx.cwd}.

Objetivo/frase humana: ${requestedGoal}${fromLine}
Herramienta preferida: ${options.tool}
Ejecucion local permitida: ${options.execute ? "si" : "no; plan-first hasta confirmar"}
Loop autonomo permitido: ${options.autonomous ? "si, pero sin prod/externo/destructivo/commits" : "no; proponer motor antes de crear estado"}

Leer primero, en este orden y solo lo necesario:
${readOrder}

Estado Git al iniciar:
- Branch: ${git.branch}
- Worktree: ${git.changedCount ? `${git.changedCount} archivo(s) con cambios` : "limpio"}

Cambios visibles:
\`\`\`text
${git.dirty}
\`\`\`

${routing}

Workflow obligatorio:
1. Intake: inspecciona git, docs vivos y plan/brief; preserva cambios no commiteados.
2. Strategy gate: clasifica discuss/study/spec/plan/implement/review y elegi un motor principal.
3. Routing Decision: intent, primary engine, why, support tools, forbidden nesting, required gates y verification usando docs/topics/agent-tool-routing.md + docs/reference/tool-routing.yaml.
4. Plan artifact: objetivo, no-objetivos, riesgos, archivos, slice TDD, validacion y rollback.
5. Review gate: usa advisor() antes de decisiones DECISIONS.md-worthy, arquitectura/storage/prod o loop largo; usa taskflow/council solo si el fan-out vale el costo.
6. Ejecucion: si esta permitida y el alcance esta claro, implementa por cortes TDD chicos; si no, deja plan listo.
7. Validacion: test enfocado -> check/typecheck -> lens_diagnostics -> git diff --check -> checks especificos del frente.
8. Closeout: actualiza docs vivos si hubo valor durable, corre context:index/audit si tocaste docs y resume evidencia.

Heuristica de motor principal (resumen; si hay duda manda docs/reference/tool-routing.yaml):
- cambio chico/reversible -> manual + Ponytail + pi-lens + tests.
- feature grande con stages/TDD/branches -> pi-code-planner.
- objetivo largo con auditor por fases -> pi-dgoal.
- loop hasta done con contrato/juez -> /until-done.
- TODO secuencial claro -> pi_long_task.
- auditoria/review/fan-out/DAG -> taskflow.
- research externo/versionado -> web_search + fetch_content/web_answer; librarian para internals open-source.
- spec fuerte antes de codigo -> /task o SpecKit.

Guardrails:
- Elegi un motor principal; no anides planner+dgoal+until-done salvo decision explicita.
- Pregunta antes de prod/sync/deploy, envios externos, installs, commits/push, acciones destructivas, datos privados o fan-out costoso no autorizado.
- Usa Ponytail solo si esta activo o JP lo pidio: V0 minimo, reusable y verificable; no recortes seguridad ni requisitos explicitos.
- No reconstruyas contexto desde transcript; docs versionados mandan.
- Distingui cambios preexistentes de cambios hechos en este lote.`;
}

function buildFleetUpdatePrompt(
  ctx: ExtensionCommandContext,
  options: FleetUpdateOptions,
  git: { branch: string; dirty: string; changedCount: number },
): string {
  const repos = options.repos.length
    ? options.repos
    : ["copicu", "constelaciones", "dictation-tauri", "pi", "infra", "telegram", "whatsapp", "discord"];
  const repoList = repos.map((repo, index) => `${index + 1}. ${repo}`).join("\n");
  const progress = repos.map((repo, index) => `- [ ] TODO ${index + 1} — Actualizar ${repo}`).join("\n");
  const todoItems = repos
    .map((repo, index) => {
      const title = `TODO ${index + 1} — Actualizar ${repo}`;
      const commitStep = options.commit
        ? "Crear commit local del repo; no push."
        : "Dejar diff listo sin commit.";
      return `## ${title}

**Goal:** Propagar solo mejoras AOS permitidas a ${repo}.

**Status:**

- [ ] Inspeccionar git y detectar dirty state preexistente.
- [ ] Aplicar solo docs/scripts AOS allowlisted.
- [ ] Ejecutar ensure-skills-link si existe, context:index y context:audit.
- [ ] Stagear solo paths AOS permitidos; excluir producto/runtime/datos.
- [ ] ${commitStep}

**Verify:** Checks AOS del repo sin errores; warnings preexistentes documentados.

**Done when:** ${repo} queda actualizado, validado y aislado de dirty state ajeno.`;
    })
    .join("\n\n---\n\n");
  const mode = options.dryRun ? "dry-run: no escribir ni commitear" : "execute: escribir cambios locales";
  const goal = options.goal || "Actualizar repos AOS en orden con pi-long-task.";

  return `Routing Decision
- Intent: implement
- Primary engine: long-task
- Why: fleet update serial con TODOs claros; dgoal queda evitado por UX/gate/i18n.
- Support tools: checks locales, git, lens solo si se toca codigo TS.
- Forbidden nesting: dgoal, until-done, planner, pi-dynamic-workflows, writers paralelos.
- Required gates: ask_user solo para installs, push, destructivo o scope ambiguo.
- Verification: checks AOS por repo + registry upstream + bun run check final.

Usa pi_long_task con commit=false. El commit por repo, si esta permitido, debe hacerse manualmente dentro de cada TODO con git -C <repo>, staging allowlisted y sin push.

Objetivo: ${goal}
Modo: ${mode}
Repos en orden:
${repoList}

Estado Git upstream al generar este prompt:
- CWD: ${ctx.cwd}
- Branch: ${git.branch}
- Worktree: ${git.changedCount ? `${git.changedCount} archivo(s) con cambios` : "limpio"}

Cambios visibles upstream:
\`\`\`text
${git.dirty}
\`\`\`

Contrato global:
- No tocar tabby ni finances.
- No hacer push.
- Preservar dirty state preexistente en cada repo.
- No tocar producto/runtime/deploy/datos privados.
- Para WhatsApp respetar casing tracked DOCS/docs.
- Al final actualizar docs/OS_PROJECTS.md en C:/dev/os con resultados y correr bun run context:index && bun run check.

# Pi Long Task TODO

Global instructions:

- Trabajar serialmente en el orden listado.
- Usar el repo upstream C:/dev/os como fuente canonica.
- Cambios permitidos: docs/skills/aos-dynamic-workflows-pilot/SKILL.md, docs/topics/pi-extension-stack.md, docs/topics/agent-tool-routing.md, docs/reference/tool-routing.yaml, docs/.generated/context-index.md y equivalentes por casing local; mas docs/OS_PROJECTS.md solo en upstream al cierre.
- Si aparece un error real de audit/check o no se puede aislar dirty state, marcar el TODO blocked y seguir solo si no compromete el orden ni mezcla cambios.
- No usar dgoal. No usar pi-dynamic-workflows.

## Progress

${progress}
- [ ] TODO ${repos.length + 1} — Actualizar registry upstream y validar cierre

---

${todoItems}

---

## TODO ${repos.length + 1} — Actualizar registry upstream y validar cierre

**Goal:** Registrar commits/resultados del lote en C:/dev/os.

**Status:**

- [ ] Actualizar docs/OS_PROJECTS.md con commit/status/warnings por repo.
- [ ] Regenerar docs/.generated/context-index.md.
- [ ] Ejecutar bun run check en C:/dev/os.
- [ ] ${options.commit ? "Crear commit upstream de registry/cierre." : "Dejar diff upstream listo sin commit."}

**Verify:** bun run check pasa en C:/dev/os.

**Done when:** Registry upstream refleja el lote y no hubo push ni commits de producto/runtime.
`;
}

async function createFleetUpdatePrompt(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: FleetUpdateOptions,
): Promise<void> {
  const git = await gitSummary(pi);
  const prompt = buildFleetUpdatePrompt(ctx, options, git);
  if (options.preview) {
    ctx.ui.setEditorText(prompt);
    ctx.ui.notify("Prompt de fleet update cargado en el editor.", "info");
    return;
  }
  await pi.sendUserMessage(prompt);
}

async function createPlanImplementationPrompt(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: PlanImplementationOptions,
): Promise<void> {
  const git = await gitSummary(pi);
  const requestedEngine = normalizeRoutingEngine(options.tool);
  const conflict = routingConflict(readRoutingState(ctx.cwd), requestedEngine);
  if (conflict) ctx.ui.notify(`Routing advisory: ${conflict}`, "warning");
  const prompt = buildPlanImplementationPrompt(ctx, options, git);

  if (options.preview) {
    ctx.ui.setEditorText(prompt);
    ctx.ui.notify("Prompt de plan/implementacion cargado en el editor.", "info");
    return;
  }

  await pi.sendUserMessage(prompt);
}

async function createContinuationSession(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: ContinuationOptions,
): Promise<void> {
  const git = await gitSummary(pi);
  const requestedEngine = normalizeRoutingEngine(options.tool);
  const conflict = routingConflict(readRoutingState(ctx.cwd), requestedEngine);
  if (conflict) ctx.ui.notify(`Routing advisory: ${conflict}`, "warning");
  const prompt = buildContinuationPrompt(ctx, options, git);
  const parentSession = ctx.sessionManager.getSessionFile();
  const label = options.goal || options.brief || "continuidad";
  const name = `OS · ${label.slice(0, 56)}`;

  const result = await ctx.newSession({
    parentSession,
    setup: async (sessionManager) => {
      sessionManager.appendSessionInfo(name);
      sessionManager.appendCustomMessageEntry(
        "os-continuation-prompt",
        prompt,
        true,
        { parentSession, options },
      );
    },
    withSession: async (replacementCtx) => {
      if (options.preview) {
        replacementCtx.ui.setEditorText(prompt);
        replacementCtx.ui.notify(
          "Nueva sesion OS lista con prompt de continuidad en el editor.",
          "info",
        );
        return;
      }

      await replacementCtx.sendUserMessage(prompt);
    },
  });

  if (result.cancelled) ctx.ui.notify("Nueva sesion cancelada.", "info");
}

export default function osTools(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const status = setSkillsDiscovery(ctx.cwd, "on");
    if (status.state === "unsafe") {
      ctx.ui.notify(
        `No pude reparar skills discovery: ${status.detail}`,
        "warning",
      );
    }
  });

  pi.registerCommand("aos-skills", {
    description:
      "Ver/reparar compatibility path de skills locales (.agents/skills): status | on | off | toggle",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (!["status", "on", "off", "toggle"].includes(action)) {
        ctx.ui.notify("Uso: /aos-skills status | on | off | toggle", "error");
        return;
      }

      const status =
        action === "status"
          ? getSkillsDiscoveryStatus(ctx.cwd)
          : setSkillsDiscovery(ctx.cwd, action as "on" | "off" | "toggle");

      pi.sendMessage({
        customType: "aos-skills",
        content: `## OS Skills Discovery\n\n- Estado: ${status.state}\n- Detalle: ${status.detail}\n\n\`.agents/skills\` se mantiene estable para evitar paths cacheados rotos. \`off\` y \`toggle\` quedan como aliases legacy no destructivos.`,
        display: true,
        details: { action, status },
      });
      ctx.ui.notify(
        `Skills discovery: ${status.state}.`,
        status.state === "unsafe" ? "warning" : "info",
      );
    },
  });

  pi.registerCommand("aos-routing", {
    description:
      "Mostrar o registrar motor principal activo: status | set <engine> [goal] | clear",
    handler: async (args, ctx) => {
      const tokens = splitCommandArgs(args.trim());
      const action = (tokens[0] ?? "status").toLowerCase();

      if (action === "status" || action === "") {
        const state = readRoutingState(ctx.cwd);
        pi.sendMessage({
          customType: "aos-routing",
          content: formatRoutingState(state),
          display: true,
          details: { state },
        });
        return;
      }

      if (["clear", "done", "off"].includes(action)) {
        clearRoutingState(ctx.cwd);
        ctx.ui.notify("Active engine register limpiado.", "info");
        pi.sendMessage({
          customType: "aos-routing",
          content: "## Active Engine Register\n\nNo hay motor principal activo.",
          display: true,
          details: { state: null },
        });
        return;
      }

      if (!["set", "start"].includes(action)) {
        ctx.ui.notify("Uso: /aos-routing status | set <engine> [goal] | clear", "error");
        return;
      }

      const engine = normalizeRoutingEngine(tokens[1]);
      if (!engine) {
        ctx.ui.notify(
          "Engine invalido. Usa manual|planner|dgoal|until-done|long-task|taskflow.",
          "error",
        );
        return;
      }

      const existing = readRoutingState(ctx.cwd);
      const conflict = routingConflict(existing, engine);
      const now = new Date().toISOString();
      const state: RoutingState = {
        activeEngine: engine,
        goal: tokens.slice(2).join(" ").trim() || undefined,
        startedAt: existing?.activeEngine === engine ? existing.startedAt : now,
        updatedAt: now,
        source: "/aos-routing",
      };
      writeRoutingState(ctx.cwd, state);
      pi.sendMessage({
        customType: "aos-routing",
        content: formatRoutingState(state),
        display: true,
        details: { state, conflict },
      });
      ctx.ui.notify(
        conflict ? `Routing advisory: ${conflict}` : `Motor activo: ${engine}`,
        conflict ? "warning" : "info",
      );
    },
  });

  pi.registerCommand("aos-sync", {
    description: "Sincronizar la capa agentica despues de cambios del OS",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "Sincronizando OS: skills link, context:index y context:audit...",
        "info",
      );
      const result = await runOsSync(pi, ctx.cwd);
      pi.sendMessage({
        customType: "aos-sync",
        content: result.markdown,
        display: true,
        details: { ok: result.ok },
      });
      ctx.ui.notify(
        result.ok
          ? "OS sincronizado."
          : "OS sync termino con fallos; revisar salida.",
        result.ok ? "info" : "error",
      );
    },
  });

  pi.registerCommand("aos-status", {
    description:
      "Mostrar estado operativo del sistema agentico (usa 'audit' para correr audit contextual)",
    handler: async (args, ctx) => {
      const includeAudit = /\baudit\b/i.test(args);
      const markdown = await buildStatusMarkdown(pi, ctx, includeAudit);
      pi.sendMessage({
        customType: "aos-status",
        content: markdown,
        display: true,
        details: { includeAudit },
      });
      ctx.ui.notify("OS status agregado a la sesion.", "info");
    },
  });

  pi.registerCommand("aos-compact", {
    description: "Ejecutar compactacion manual con instrucciones OS-aware",
    handler: async (args, ctx) => {
      const focus = args.trim();
      const customInstructions = focus
        ? `${OS_COMPACT_INSTRUCTIONS}\n\nFoco adicional pedido por JP:\n${focus}`
        : OS_COMPACT_INSTRUCTIONS;
      ctx.compact({
        customInstructions,
        onComplete: () =>
          ctx.ui.notify("OS-aware compaction completada.", "info"),
        onError: (error) =>
          ctx.ui.notify(`OS-aware compaction fallo: ${error.message}`, "error"),
      });
      ctx.ui.notify("OS-aware compaction iniciada.", "info");
    },
  });

  pi.registerCommand("aos-continuar", {
    description:
      "Abrir nueva sesion Pi con estrategia automatica desde docs vivos: --brief, --mode, --tool, --implement, --preview",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify(
          "aos-continuar requiere UI para abrir una nueva sesion.",
          "error",
        );
        return;
      }

      const parsed = parseContinuationArgs(ctx.cwd, args);
      if (parsed.error || !parsed.options) {
        ctx.ui.notify(
          parsed.error ?? "No pude parsear /aos-continuar.",
          "error",
        );
        return;
      }

      await createContinuationSession(pi, ctx, parsed.options);
    },
  });

  pi.registerCommand("aos-fleet-update", {
    description:
      "Generar un pi_long_task serial para actualizar repos AOS: --dry-run, --execute, --commit, --preview",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parsed = parseFleetUpdateArgs(args);
      if (parsed.error || !parsed.options) {
        ctx.ui.notify(
          parsed.error ?? "No pude parsear /aos-fleet-update.",
          "error",
        );
        return;
      }

      await createFleetUpdatePrompt(pi, ctx, parsed.options);
    },
  });

  pi.registerCommand("aos-plan-implementar", {
    description:
      "Crear/tomar/revisar un plan y llevarlo a implementacion con el motor Pi adecuado: --from, --tool, --execute, --autonomous, --preview",
    handler: async (args, ctx) => {
      const parsed = parsePlanImplementationArgs(ctx.cwd, args);
      if (parsed.error || !parsed.options) {
        ctx.ui.notify(
          parsed.error ?? "No pude parsear /aos-plan-implementar.",
          "error",
        );
        return;
      }

      await createPlanImplementationPrompt(pi, ctx, parsed.options);
    },
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    ctx.ui.notify(
      "Compaction detectada. Para control manual futuro: /aos-checkpoint y luego /aos-compact.",
      "warning",
    );
  });
}
