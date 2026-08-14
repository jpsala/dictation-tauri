#!/usr/bin/env node

const [portArg, surface, rawExpression] = process.argv.slice(2);
const expression = rawExpression?.startsWith("base64:")
  ? Buffer.from(rawExpression.slice("base64:".length), "base64").toString("utf8")
  : rawExpression;

if (!portArg || !surface || !expression) {
  console.error(
    "Usage: node scripts/cdp-evaluate.mjs <remoteDebugPort> <data-app-surface> <expression>",
  );
  process.exit(64);
}

if (typeof WebSocket === "undefined") {
  console.error("This helper requires a Node.js runtime with global WebSocket support.");
  process.exit(69);
}

const port = Number.parseInt(portArg, 10);
if (!Number.isInteger(port) || port <= 0) {
  console.error("The remote debug port must be a positive integer.");
  process.exit(64);
}

const timeoutMs = Number.parseInt(process.env.CDP_EVALUATE_TIMEOUT_MS ?? "15000", 10);
const deadlineMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000;

function evaluateTarget(target) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;
    let timer;
    let settled = false;
    let phase = "frame";

    const close = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // best effort cleanup
      }
    };

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      close();
      if (error) reject(error);
      else resolve(value);
    };

    const send = (method, params = {}) => {
      const id = nextId++;
      pending.set(id, method);
      ws.send(JSON.stringify({ id, method, params }));
      return id;
    };

    const evaluate = (source) => send("Runtime.evaluate", {
      expression: source,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    const markerExpression = `(() => {
      const node = document.querySelector("[data-app-surface]");
      const marker = node?.getAttribute("data-app-surface") ?? node?.dataset?.appSurface ?? null;
      const route = new URL(window.location.href).searchParams.get("surface")
        ?? (window.location.hash === "#settings" ? "settings" : "dock");
      return { marker, route, matched: marker === ${JSON.stringify(surface)} || (!marker && route === ${JSON.stringify(surface)}) };
    })()`;

    ws.addEventListener("open", () => {
      send("Page.getFrameTree");
      timer = setTimeout(() => finish(new Error("CDP evaluation timed out")), deadlineMs);
    });

    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        finish(error);
        return;
      }
      if (!message.id) return;
      const method = pending.get(message.id);
      pending.delete(message.id);
      if (!method) return;
      if (message.error) {
        finish(new Error(JSON.stringify(message.error)));
        return;
      }
      if (method === "Page.getFrameTree") {
        if (!message.result?.frameTree?.frame?.id) {
          finish(new Error("CDP main frame unavailable"));
          return;
        }
        phase = "marker";
        evaluate(markerExpression);
        return;
      }
      const result = message.result?.result;
      if (result?.exceptionDetails) {
        finish(new Error(JSON.stringify(result.exceptionDetails)));
        return;
      }
      if (phase === "marker") {
        if (!result?.value?.matched) {
          finish(null, null);
          return;
        }
        phase = "expression";
        evaluate(expression);
        return;
      }
      finish(null, result?.value ?? null);
    });

    ws.addEventListener("error", (event) => {
      finish(new Error(`CDP WebSocket error: ${event.message ?? "unknown error"}`));
    });
  });
}

async function discoverTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP target discovery failed with HTTP ${response.status}`);
  const targets = await response.json();
  return targets
    .filter((target) => target?.type === "page" && target.webSocketDebuggerUrl)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function main() {
  let lastError = new Error(`No live CDP target owns data-app-surface=${surface}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const targets = await discoverTargets();
    for (const target of targets) {
      try {
        const result = await evaluateTarget(target);
        if (result === null) continue;
        if (typeof result === "string") console.log(result);
        else console.log(JSON.stringify(result ?? null));
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
