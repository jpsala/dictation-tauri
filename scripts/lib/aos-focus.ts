import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const FOCUS_HEADING = "## Foco Único De Ejecución";

export type FocusState = "needs_planning" | "ready" | "blocked" | "complete" | "waiting_gate";

export type FocusedPlansResult =
  | { kind: "ready"; plans: string[] }
  | { kind: "needs_planning" }
  | { kind: "non_executable"; state: "blocked" | "complete" | "waiting_gate" }
  | { kind: "invalid"; error: string };

const STATE_LINE = /^- \*\*Estado:\*\* `([^`\r\n]+)`\.\s*$/;
const PLAN_LINE = /^- \*\*Plan:\*\* `([^`\r\n]+)`\.\s*$/;
const PLAN_LINE_GLOBAL = /^- \*\*Plan:\*\* `([^`\r\n]+)`\.\s*$/gm;
const BATCH_LINE = /^- \*\*Próximo batch:\*\* \*\*(Batch [^*\r\n]+)\*\*\.\s*$/;
const REFERENCE_LINE = /^- \*\*Referencia:\*\* `([^`\r\n]+)`\.\s*$/;
const BLOCK_LINE = /^- \*\*Bloqueo:\*\* \S.*$/;
const GATE_LINE = /^- \*\*Gate:\*\* \S.*$/;
const NEXT_ACTION_LINE = /^- \*\*Siguiente acción:\*\* \S.*$/;

function invalidFocus(detail: string): FocusedPlansResult {
  return { kind: "invalid", error: `El foco de ejecución es inválido: ${detail}` };
}

export function focusedSection(workingMemory: string): string | undefined {
  const start = workingMemory.indexOf(FOCUS_HEADING);
  if (start < 0) return undefined;
  const rest = workingMemory.slice(start + FOCUS_HEADING.length);
  const nextHeading = rest.search(/^##\s+/m);
  return nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
}

export function extractFocusedPlanRefs(workingMemory: string): string[] {
  const section = focusedSection(workingMemory);
  if (section === undefined) return [];
  return [...section.matchAll(PLAN_LINE_GLOBAL)].map((match) => match[1].trim());
}

function isWithin(parent: string, target: string): boolean {
  const pathFromParent = relative(parent, target);
  return pathFromParent.length > 0 && !pathFromParent.startsWith("..") && !isAbsolute(pathFromParent);
}

function validPlanRef(projectRoot: string, planRef: string): boolean {
  if (!planRef || planRef !== planRef.trim() || isAbsolute(planRef) || planRef.includes("\0")) return false;

  const normalizedRoot = resolve(projectRoot);
  const absolutePlan = resolve(normalizedRoot, planRef);
  const allowedRoots = [resolve(normalizedRoot, "docs", "tracks"), resolve(normalizedRoot, "specs")];
  if (!allowedRoots.some((root) => isWithin(root, absolutePlan))) return false;
  if (!existsSync(absolutePlan) || !statSync(absolutePlan).isFile()) return false;

  try {
    const realProject = realpathSync(normalizedRoot);
    const realPlan = realpathSync(absolutePlan);
    return isWithin(realProject, realPlan)
      && allowedRoots.some((root) => existsSync(root) && isWithin(realpathSync(root), realPlan));
  } catch {
    return false;
  }
}

function exactMatches(lines: string[], pattern: RegExp): string[] {
  return lines.flatMap((line) => line.match(pattern)?.[1] ?? []);
}

function parseReadyFocus(projectRoot: string, lines: string[], plans: string[], references: string[]): FocusedPlansResult {
  if (plans.length === 0 || references.length > 0) return invalidFocus("ready requiere uno o más Plan y no admite Referencia.");
  if (new Set(plans).size !== plans.length) return invalidFocus("ready contiene planes duplicados.");
  if (lines.length !== 1 + (plans.length * 2)) return invalidFocus("ready admite sólo Estado y pares Plan/Próximo batch.");
  if (!lines.slice(1).every((line, index) => index % 2 === 0 ? PLAN_LINE.test(line) : BATCH_LINE.test(line))) {
    return invalidFocus("cada Plan debe estar seguido por su Próximo batch.");
  }
  const invalid = plans.find((planRef) => !validPlanRef(projectRoot, planRef));
  return invalid
    ? invalidFocus(`el Plan no existe, no es válido o sale del proyecto: ${invalid}`)
    : { kind: "ready", plans };
}

function parseNonReadyFocus(
  projectRoot: string,
  state: Exclude<FocusState, "ready">,
  lines: string[],
  references: string[],
): FocusedPlansResult {
  const nextActions = lines.filter((line) => NEXT_ACTION_LINE.test(line));
  if (state === "needs_planning") {
    return lines.length === 2 && nextActions.length === 1 && references.length === 0
      ? { kind: "needs_planning" }
      : invalidFocus("needs_planning requiere sólo Estado y Siguiente acción.");
  }

  const expectedField = state === "blocked" ? BLOCK_LINE : state === "waiting_gate" ? GATE_LINE : undefined;
  const hasExactFields = lines.length === (expectedField ? 4 : 3)
    && references.length === 1
    && nextActions.length === 1
    && (!expectedField || lines.filter((line) => expectedField.test(line)).length === 1);
  if (!hasExactFields) return invalidFocus(`${state} no tiene sus campos mínimos exactos.`);
  return validPlanRef(projectRoot, references[0])
    ? { kind: "non_executable", state }
    : invalidFocus(`la Referencia no existe, no es válida o sale del proyecto: ${references[0]}`);
}

export function parseFocusedSection(projectRoot: string, section: string): FocusedPlansResult {
  const lines = section.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const stateDeclarations = lines.filter((line) => line.startsWith("- **Estado:**"));
  if (stateDeclarations.length !== 1 || lines[0] !== stateDeclarations[0]) {
    return invalidFocus("debe declarar exactamente un Estado al inicio.");
  }

  const stateMatch = stateDeclarations[0].match(STATE_LINE);
  const allowedStates: FocusState[] = ["needs_planning", "ready", "blocked", "complete", "waiting_gate"];
  if (!stateMatch || !allowedStates.includes(stateMatch[1] as FocusState)) {
    return invalidFocus("Estado ausente, desconocido o malformado.");
  }

  const state = stateMatch[1] as FocusState;
  const plans = exactMatches(lines, PLAN_LINE);
  const references = exactMatches(lines, REFERENCE_LINE);
  const malformedPlan = lines.filter((line) => line.startsWith("- **Plan:**")).length !== plans.length;
  const malformedReference = lines.filter((line) => line.startsWith("- **Referencia:**")).length !== references.length;
  if (malformedPlan || malformedReference) return invalidFocus("hay una referencia malformada.");
  if (state !== "ready" && lines.some((line) => line.startsWith("- **Plan:**"))) {
    return invalidFocus(`${state} no puede declarar Plan.`);
  }
  return state === "ready"
    ? parseReadyFocus(projectRoot, lines, plans, references)
    : parseNonReadyFocus(projectRoot, state, lines, references);
}

export function loadFocusedPlans(projectRoot: string): FocusedPlansResult {
  const workingMemory = resolve(projectRoot, "docs", "WORKING_MEMORY.md");
  if (!existsSync(workingMemory)) return invalidFocus("docs/WORKING_MEMORY.md no existe.");

  let content: string;
  try {
    content = readFileSync(workingMemory, "utf8");
  } catch {
    return invalidFocus("docs/WORKING_MEMORY.md no se pudo leer.");
  }
  const section = focusedSection(content);
  return section === undefined
    ? invalidFocus(`falta ${FOCUS_HEADING}.`)
    : parseFocusedSection(projectRoot, section);
}
