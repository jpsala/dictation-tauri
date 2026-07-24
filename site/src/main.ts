/// <reference types="vite/client" />

import "./styles.css";

type DemoKey = "reply" | "note" | "comment";

type Demo = {
  input: string;
  output: string;
};

const demos: Record<DemoKey, Demo> = {
  reply: {
    input: '"thanks i can review this after lunch and send notes before end of day"',
    output: "Thanks, I can review this after lunch and send notes before end of day.",
  },
  note: {
    input: '"follow up with maria tomorrow about the windows rollout and ask if friday still works"',
    output: "Follow up with Maria tomorrow about the Windows rollout and ask if Friday still works.",
  },
  comment: {
    input: '"cache the active settings so the hotkey handler does not read from disk every time"',
    output: "Cache the active settings so the hotkey handler does not read from disk every time.",
  },
};

const input = document.querySelector<HTMLElement>("#demo-input");
const output = document.querySelector<HTMLElement>("#demo-output");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let demoRun = 0;

async function selectDemo(key: DemoKey) {
  const demo = demos[key];
  if (!input || !output) return;

  const run = ++demoRun;
  input.textContent = demo.input;
  if (reduceMotion) {
    output.textContent = demo.output;
    return;
  }

  output.textContent = "";
  for (const character of demo.output) {
    if (run !== demoRun) return;
    output.textContent += character;
    await new Promise((resolve) => window.setTimeout(resolve, 12));
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.demo as DemoKey;
    document.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((candidate) => {
      candidate.setAttribute("aria-selected", String(candidate === button));
    });
    void selectDemo(key);
  });
});

const dock = document.querySelector<HTMLButtonElement>(".voice-dock");
const dockLabel = document.querySelector<HTMLElement>(".dock-state");
let dockTimer: number | undefined;

dock?.addEventListener("click", () => {
  if (dock.dataset.state === "recording") {
    window.clearTimeout(dockTimer);
    dock.dataset.state = "processing";
    if (dockLabel) dockLabel.textContent = "Preparing text";
    dockTimer = window.setTimeout(() => {
      dock.dataset.state = "idle";
      if (dockLabel) dockLabel.textContent = "Click to try the dock";
    }, reduceMotion ? 0 : 900);
    return;
  }

  if (dock.dataset.state === "processing") return;
  dock.dataset.state = "recording";
  if (dockLabel) dockLabel.textContent = "Listening, click to stop";
});

const installerUrl = String(import.meta.env.VITE_FIXVOX_INSTALLER_URL ?? "").trim();
const installerReady = /^https:\/\/github\.com\/jpsala\/fixvox-releases\/releases\/download\/.+\/Fixvox-Tauri-Setup\.exe$/u.test(installerUrl);
const installerStatus = document.querySelector<HTMLElement>("#installer-status");

document.querySelectorAll<HTMLAnchorElement>(".installer-link").forEach((link) => {
  if (installerReady) {
    link.href = installerUrl;
    link.removeAttribute("aria-disabled");
    return;
  }

  link.href = "#installer-status";
  link.setAttribute("aria-disabled", "true");
});

if (installerReady && installerStatus) {
  installerStatus.textContent = "The current Tauri installer is published on the verified Fixvox release channel.";
}

const footerYear = document.querySelector<HTMLElement>("#footer-year");
if (footerYear) footerYear.textContent = String(new Date().getFullYear());
