#!/usr/bin/env node
const [wsUrl, expression] = process.argv.slice(2);

if (!wsUrl || !expression) {
  console.error("Usage: node scripts/cdp-evaluate.mjs <webSocketDebuggerUrl> <expression>");
  process.exit(64);
}

if (typeof WebSocket === "undefined") {
  console.error("This helper requires a Node.js runtime with global WebSocket support.");
  process.exit(69);
}

let timer;
let settled = false;
const ws = new WebSocket(wsUrl);
let nextId = 1;

function finish(code) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try {
    ws.close();
  } catch {
    // best effort cleanup
  }
  process.exit(code);
}

function send(method, params = {}) {
  const requestId = nextId++;
  ws.send(JSON.stringify({ id: requestId, method, params }));
  return requestId;
}

ws.addEventListener("open", () => {
  const id = send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== id) return;

    if (msg.error) {
      console.error(JSON.stringify(msg.error));
      finish(1);
      return;
    }

    if (msg.result?.exceptionDetails) {
      console.error(JSON.stringify(msg.result.exceptionDetails));
      finish(1);
      return;
    }

    const remoteValue = msg.result?.result?.value;
    if (typeof remoteValue === "string") {
      console.log(remoteValue);
    } else {
      console.log(JSON.stringify(remoteValue ?? msg.result?.result ?? null));
    }
    finish(0);
  });
});

ws.addEventListener("error", (event) => {
  console.error("CDP WebSocket error", event.message ?? event);
  finish(1);
});

timer = setTimeout(() => {
  console.error("CDP evaluation timed out");
  finish(2);
}, 15_000);
