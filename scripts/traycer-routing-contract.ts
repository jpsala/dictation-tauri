declare const Bun: { YAML: { parse(source: string): unknown } };

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : undefined;
}

function preflight(policySource: string) {
  const errors: string[] = [];
  const stack: Array<{ indent: number; key: string }> = [];
  const entries: Array<{ key: string; path: string[]; line: number }> = [];
  const criticalPaths = new Map<string, string[]>([
    ["version", ["version"]],
    ["policy", ["policy"]],
    ["control_plane", ["runtime", "control_plane"]],
    ["harness", ["runtime", "harness"]],
    ["fallback_harness", ["runtime", "fallback_harness"]],
    ["fallback_mode", ["runtime", "fallback_mode"]],
    ["daily_entry", ["runtime", "daily_entry"]],
    ["automatic_fallback", ["execution", "automatic_fallback"]],
    ["automatic_new_session", ["execution", "automatic_new_session"]],
    ["automatic_send", ["execution", "automatic_send"]],
    ["agents", ["coordination", "agents"]],
    ["handoff", ["coordination", "handoff"]],
    ["worktrees", ["coordination", "worktrees"]],
    ["tools", ["workflow", "implementation", "tools"]],
    ["mode", ["approval", "mode"]],
    ["local_reversible", ["approval", "local_reversible"]],
  ]);
  const authorityKeyPattern = /^(?:omp|omp_.+|.+_omp|axi|axi_.+|.+_axi|lavish)$/i;
  const authorityValuePattern = /^(?:omp|omp_native|omp_native_intent_first|axi|lavish)$/i;
  const mappingPattern = /^( *)([A-Za-z_][A-Za-z0-9_-]*)[ ]*:[ ]*(.*)$/;
  for (const [index, line] of policySource.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    if (/\t/.test(line)) {
      errors.push("unsupported tab syntax at line " + lineNumber);
      continue;
    }
    if (/^[ ]*$/.test(line) || /^[ ]*#/.test(line)) continue;
    if (/[{}\[\]|>!&*]/.test(line) || /(^|\s)#/.test(line)) {
      errors.push("unsupported YAML syntax at line " + lineNumber);
      continue;
    }
    const mapping = line.match(mappingPattern);
    const list = line.match(/^( *)-[ ]+\S.*$/);
    if (!mapping && !list) {
      errors.push("unrecognized YAML line at line " + lineNumber);
      continue;
    }
    const indent = (mapping ?? list)![1].length;
    if (indent % 2 !== 0) {
      errors.push("invalid YAML indentation at line " + lineNumber);
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length && indent !== stack[stack.length - 1].indent + 2) {
      errors.push("non-contiguous YAML indentation at line " + lineNumber);
    }
    if (!mapping) continue;
    const key = mapping[2];
    const path = stack.map((entry) => entry.key).concat(key);
    if (criticalPaths.has(key)) entries.push({ key, path, line: lineNumber });
    if (key === "mode" && path.join(".") !== "approval.mode") {
      errors.push("critical mode outside approval.mode at line " + lineNumber);
    }
    if (authorityKeyPattern.test(key) && path.join(".") !== "runtime.fallback_harness") {
      errors.push("additional OMP/AXI authority key at " + path.join("."));
    }
    const productRuntimePath = path[0] === "vault_mind" || path[0] === "product_runtime";
    if (authorityValuePattern.test(mapping[3].trim()) && path.join(".") !== "runtime.fallback_harness" && !productRuntimePath) {
      errors.push("additional OMP/AXI authority value at " + path.join("."));
    }
    if (mapping[3] === "") stack.push({ indent, key });
  }
  for (const [key, expectedPath] of criticalPaths) {
    const matches = entries.filter((entry) => entry.key === key);
    if (matches.length > 1) {
      errors.push(
        "duplicate/conflicting " + key + " entries at lines " + matches.map((entry) => entry.line).join(", "),
      );
    }
    for (const entry of matches) {
      if (entry.path.join(".") !== expectedPath.join(".")) {
        errors.push(key + " outside " + expectedPath.join(".") + " at " + entry.path.join("."));
      }
    }
  }
  return [...new Set(errors)];
}

export function validateTraycerRoutingPolicy(
  policySource: string,
  portableSource: string,
) {
  const errors = preflight(policySource);
  let policy: RecordLike | undefined;
  try {
    policy = record(Bun.YAML.parse(policySource));
  } catch (error) {
    errors.push(
      "policy YAML is not parseable: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!policy) errors.push("policy YAML must resolve to a mapping");
  const runtime = record(policy?.runtime);
  const execution = record(policy?.execution);
  const coordination = record(policy?.coordination);
  const implementation = record(record(policy?.workflow)?.implementation);
  const approval = record(policy?.approval);
  const piUsage = runtime?.pi_usage;
  const required: Array<[string, unknown, unknown]> = [
    ["version", policy?.version, 14],
    ["policy", policy?.policy, "traycer_native_intent_first"],
    ["runtime.control_plane", runtime?.control_plane, "traycer"],
    ["runtime.harness", runtime?.harness, "codex"],
    ["runtime.fallback_harness", runtime?.fallback_harness, "omp"],
    ["runtime.fallback_mode", runtime?.fallback_mode, "manual_only"],
    ["runtime.daily_entry", runtime?.daily_entry, "conversation"],
    ["execution.automatic_fallback", execution?.automatic_fallback, false],
    ["execution.automatic_new_session", execution?.automatic_new_session, false],
    ["execution.automatic_send", execution?.automatic_send, false],
    ["coordination.agents", coordination?.agents, "explicit_user_request_only"],
    ["coordination.handoff", coordination?.handoff, "demand_only"],
    ["coordination.worktrees", coordination?.worktrees, "isolated_for_concurrency_only"],
    ["workflow.implementation.tools", implementation?.tools, "native_harness"],
    ["approval.mode", approval?.mode, "single_batch_envelope"],
    ["approval.local_reversible", approval?.local_reversible, "proceed"],
  ];
  for (const [path, actual, expected] of required) {
    if (actual !== expected) errors.push(path + " must be " + String(expected));
  }
  if (piUsage !== undefined) {
    const allowed = new Set(["product_runtime", "harness_lab"]);
    if (!Array.isArray(piUsage) || piUsage.length === 0) {
      errors.push("runtime.pi_usage must be a non-empty block list when present");
    } else {
      const values = piUsage.map((entry) => String(entry));
      if (new Set(values).size !== values.length || values.some((value) => !allowed.has(value))) {
        errors.push("runtime.pi_usage contains duplicate or disallowed values");
      }
      for (const value of allowed) {
        if (!values.includes(value)) errors.push("runtime.pi_usage missing " + value);
      }
    }
  }
  const portable = portableSource.toLowerCase();
  for (const phrase of [
    "traycer",
    "harness nativo",
    "omp",
    "standalone/manual",
    "handoff",
    "objetivo",
    "rama/worktree",
    "decisiones",
    "archivos/cambios",
    "checks",
    "siguiente gate",
  ]) {
    if (!portable.includes(phrase)) errors.push("portable contract missing " + phrase);
  }
  if (!portable.includes("no requiere") || !portable.includes(".traycer")) {
    errors.push("portable contract missing no requiere .traycer");
  }
  return [...new Set(errors)];
}
