import { buildRecommendedAlphaRuntimePolicy } from "./runtime-policy-store";
import { buildDefaultRecipePolicy } from "./recipe-policy-store";

function escapeHtml(value: string): string {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

const SVG = {
  dashboard: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
  cpu: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="8" height="8" rx="1"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="6" y1="12" x2="6" y2="15"/><line x1="10" y1="12" x2="10" y2="15"/><line x1="1" y1="6" x2="4" y2="6"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="12" y1="6" x2="15" y2="6"/><line x1="12" y1="10" x2="15" y2="10"/></svg>`,
  chat: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2v2l3-2h7a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>`,
  mic: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="1" width="6" height="10" rx="3"/><path d="M2 8a7 7 0 0 0 12 0"/><line x1="8" y1="15" x2="8" y2="15"/></svg>`,
  layout: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="14" height="11" rx="1"/><line x1="1" y1="7" x2="15" y2="7"/><line x1="6" y1="3" x2="6" y2="14"/></svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2"/><path d="M8 12.5v2"/><path d="M1.5 8h2"/><path d="M12.5 8h2"/><path d="m3.4 3.4 1.4 1.4"/><path d="m11.2 11.2 1.4 1.4"/><path d="m3.4 12.6 1.4-1.4"/><path d="m11.2 4.8 1.4-1.4"/></svg>`,
  flag: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1v14"/><path d="M3 5h8a2 2 0 0 1 0 4H9l-3 3-3-3h1"/></svg>`,
  code: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,4 1,8 5,12"/><polyline points="11,4 15,8 11,12"/><line x1="9" y1="1" x2="7" y2="15"/></svg>`,
  save: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 13H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7l3 3v7a1 1 0 0 1-1 1z"/><path d="M11 13v-4H5v4"/><path d="M5 2v4"/></svg>`,
  upload: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v7"/><polyline points="8,5 8,12 3,7"/><polyline points="13,5 8,10 3,5"/></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6"/><polyline points="8,7 8,14 3,9"/><polyline points="13,7 8,12 3,7"/></svg>`,
  zap: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13,1 4,9 8,9 3,15 12,7 8,7"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 1,10"/><polyline points="15,6 15,12"/><path d="M1 10a6 6 0 0 1 10-5"/><path d="M15 6a6 6 0 0 1-10 5"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,8 6,12 14,4"/></svg>`,
  x: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="6" x2="8" y2="11"/><line x1="8" y1="4.5" x2="8" y2="4.5" stroke-linecap="round"/></svg>`,
  alert: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1L1 14h14L8 1z"/><line x1="8" y1="6" x2="8" y2="10"/><line x1="8" y1="12" x2="8" y2="12.5" stroke-linecap="round"/></svg>`,
  reset: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 1 0 1.5-4"/><polyline points="1,3 1,7 5,7"/></svg>`,
  lock: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>`,
  unlock: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h8"/></svg>`,
  terminal: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,5 6,8 2,11"/><line x1="8" y1="3" x2="14" y2="3"/><line x1="8" y1="13" x2="14" y2="13"/></svg>`,
};

const TARGET_ICONS: Record<string, string> = {
  default: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/></svg>`,
  assistant: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l1.5-3A5.5 5.5 0 1 1 13 10.5"/><circle cx="6" cy="7" r="0.75"/><circle cx="10" cy="7" r="0.75"/><path d="M6 10c.6.5 1.2.75 2 .75s1.4-.25 2-.75"/></svg>`,
  translate: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h12v12H2z" rx="1"/><path d="M6 6H4a2 2 0 0 0 0 4h2"/><path d="M12 6v4"/></svg>`,
  postProcess: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l3-3 3 3"/><path d="M6 9h7"/><path d="M3 4l3 3 3-3"/><path d="M6 7h7"/></svg>`,
  selectionTransform: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10"/><path d="M8 3l5 5-5 5"/></svg>`,
  presetFallback: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v4"/><path d="M12 5H4"/><path d="M8 11v4"/><path d="M12 11H4"/><path d="M1 8h4"/><path d="M11 8h4"/></svg>`,
};

const TARGET_LABELS: Record<string, string> = {
  default: "Default",
  assistant: "Assistant",
  translate: "Translate",
  postProcess: "Post-Process",
  selectionTransform: "Selection",
  presetFallback: "Preset Fallback",
};

const TARGET_DESCS: Record<string, string> = {
  default: "General runtime fallback outside preset execution",
  assistant: "Assistant quick chat turns and follow-up questions",
  translate: "High-quality translation requests",
  postProcess: "Dictation cleanup and formatting",
  selectionTransform: "Rewrite selected text",
  presetFallback: "Used by every preset today",
};

export function buildControlPlaneAdminPage(request: Request): Response {
  const origin = new URL(request.url).origin;
  const recommendedPolicy = buildRecommendedAlphaRuntimePolicy();
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Control Plane — Fixvox</title>
  <style>
    :root {
      --bg: #090d12;
      --bg-sidebar: #0d1117;
      --bg-surface: #13191f;
      --bg-elevated: #1c232b;
      --bg-hover: #242c36;
      --bg-input: #0a0e14;
      --accent: #00d4ff;
      --accent-dim: rgba(0, 212, 255, 0.1);
      --accent-glow: rgba(0, 212, 255, 0.2);
      --accent-hover: #33ddff;
      --text-primary: #cdd9e5;
      --text-secondary: #768390;
      --text-muted: #4a5568;
      --success: #3fb950;
      --success-dim: rgba(63, 185, 80, 0.1);
      --warning: #d29922;
      --warning-dim: rgba(210, 153, 34, 0.1);
      --danger: #f85149;
      --danger-dim: rgba(248, 81, 73, 0.1);
      --border: rgba(255, 255, 255, 0.06);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-muted: rgba(255, 255, 255, 0.12);
      --radius-sm: 6px;
      --radius: 8px;
      --radius-lg: 12px;
      --font-sans: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      --font-mono: "Cascadia Code", "JetBrains Mono", "SF Mono", Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: var(--bg); color: var(--text-primary); font-family: var(--font-sans); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--bg-elevated); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--border-muted); }

    .app-shell { display: flex; height: 100vh; overflow: hidden; }

    /* ── SIDEBAR ── */
    .sidebar {
      width: 220px;
      flex-shrink: 0;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .sidebar-header {
      padding: 20px 16px 16px;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .sidebar-logo-mark {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, var(--accent), #0099cc);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 12px var(--accent-glow);
    }
    .sidebar-logo-mark svg { width: 14px; height: 14px; stroke: #000; stroke-width: 2.5; }
    .sidebar-title { font-size: 13px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }
    .sidebar-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .sidebar-nav { padding: 12px 8px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--radius);
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      transition: all 0.12s ease;
      border: 1px solid transparent;
      user-select: none;
    }
    .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
    .nav-item.active {
      background: var(--accent-dim);
      border-color: rgba(0, 212, 255, 0.15);
      color: var(--accent);
    }
    .nav-item .nav-icon { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.7; }
    .nav-item.active .nav-icon { opacity: 1; }
    .nav-item .nav-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-muted);
      margin-left: auto;
      transition: background 0.12s;
    }
    .nav-item.active .nav-dot { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
    .nav-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: 8px 10px 4px; }

    /* ── MAIN ── */
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* ── TOP BAR ── */
    .topbar {
      background: var(--bg-sidebar);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      height: 52px;
      flex-shrink: 0;
    }
    .topbar-title { font-size: 14px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
    .topbar-title .accent { color: var(--accent); }
    .topbar-spacer { flex: 1; }
    .topbar-badge { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); }
    .topbar-badge.success { background: var(--success-dim); border-color: rgba(63, 185, 80, 0.2); color: var(--success); }
    .topbar-badge.warning { background: var(--warning-dim); border-color: rgba(210, 153, 34, 0.2); color: var(--warning); }

    /* ── CONTENT ── */
    .content { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }

    /* ── CONNECTION ── */
    .conn-bar {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .conn-bar .conn-field { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .conn-bar .conn-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
    .conn-bar .conn-url { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px; flex: 1; min-width: 0; outline: none; transition: border-color 0.12s; }
    .conn-bar .conn-url:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
    .conn-bar .conn-token { font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px; width: 240px; outline: none; transition: border-color 0.12s; }
    .conn-bar .conn-token:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
    .conn-bar .conn-actions { display: flex; gap: 6px; margin-left: 8px; }

    /* ── STATUS ── */
    .status-strip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 12px;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; transition: all 0.3s; }
    .status-dot.ok { background: var(--success); box-shadow: 0 0 8px rgba(63, 185, 80, 0.5); }
    .status-dot.err { background: var(--danger); box-shadow: 0 0 8px rgba(248, 81, 73, 0.5); }
    .status-dot.warn { background: var(--warning); box-shadow: 0 0 8px rgba(210, 153, 34, 0.5); }
    .status-msg { flex: 1; color: var(--text-secondary); }
    .status-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); background: var(--bg-elevated); padding: 2px 8px; border-radius: 4px; }

    /* ── SECTION CARD ── */
    .section-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .section-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
    }
    .section-card-title { display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-primary); }
    .section-card-title .icon-wrap { width: 28px; height: 28px; background: var(--accent-dim); border: 1px solid rgba(0, 212, 255, 0.15); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--accent); }
    .section-card-body { padding: 18px; }
    .section-card-footer { padding: 12px 18px; border-top: 1px solid var(--border); background: var(--bg-elevated); display: flex; align-items: center; gap: 8px; }

    /* ── GRID LAYOUTS ── */
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    @media (max-width: 1100px) { .grid-3 { grid-template-columns: repeat(2, 1fr); } .grid-4 { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 700px) { .grid-3, .grid-2, .grid-4 { grid-template-columns: 1fr; } }

    /* ── FORM FIELDS ── */
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .field-hint { font-size: 11px; color: var(--text-muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
    input, textarea, select {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
      padding: 9px 12px;
      outline: none;
      transition: border-color 0.12s, box-shadow 0.12s;
      appearance: none;
    }
    input:hover, textarea:hover, select:hover { border-color: rgba(255, 255, 255, 0.2); }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
    input::placeholder, textarea::placeholder { color: var(--text-muted); }
    textarea { resize: vertical; font-family: var(--font-mono); font-size: 12px; line-height: 1.7; min-height: 100px; }
    select { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23768390' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 32px; }

    /* ── TOM SELECT ── */
    .ts-wrapper.ts-dark { font-size: 13px; }
    .ts-wrapper.ts-dark .ts-control {
      min-height: 39px;
      padding: 7px 36px 7px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius);
      box-shadow: none;
      color: var(--text-primary);
    }
    .ts-wrapper.ts-dark .ts-control:hover { border-color: rgba(255, 255, 255, 0.2); }
    .ts-wrapper.ts-dark.focus .ts-control,
    .ts-wrapper.ts-dark.dropdown-active .ts-control {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-dim);
    }
    .ts-wrapper.ts-dark .ts-control > input { color: var(--text-primary); }
    .ts-wrapper.ts-dark .ts-control > input::placeholder { color: var(--text-muted); }
    .ts-wrapper.ts-dark .ts-control .item { color: var(--text-primary); }
    .ts-wrapper.ts-dark .ts-dropdown {
      margin-top: 6px;
      padding: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius);
      color: var(--text-primary);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.38);
    }
    .ts-wrapper.ts-dark .ts-dropdown .option,
    .ts-wrapper.ts-dark .ts-dropdown .create,
    .ts-wrapper.ts-dark .ts-dropdown .no-results {
      padding: 9px 10px;
      border-radius: 6px;
      font-size: 12px;
    }
    .ts-wrapper.ts-dark .ts-dropdown .option { color: var(--text-primary); }
    .ts-wrapper.ts-dark .ts-dropdown .active {
      background: var(--accent-dim);
      color: var(--text-primary);
    }
    .ts-wrapper.ts-dark .ts-dropdown .create,
    .ts-wrapper.ts-dark .ts-dropdown .no-results { color: var(--text-secondary); }
    .ts-wrapper.ts-dark .ts-dropdown strong { color: var(--accent); }
    .ts-wrapper.ts-dark .clear-button {
      color: var(--text-muted);
      font-size: 15px;
      line-height: 1;
      margin-right: 6px;
      transition: color 0.12s ease;
    }
    .ts-wrapper.ts-dark .clear-button:hover { color: var(--text-primary); }

    /* ── TARGET CARD ── */
    .target-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      transition: border-color 0.12s;
    }
    .target-card:hover { border-color: var(--border-muted); }
    .target-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
    .target-card-icon { width: 30px; height: 30px; background: var(--accent-dim); border: 1px solid rgba(0, 212, 255, 0.15); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
    .target-card-name { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary); }
    .target-card-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .target-card-fields { display: flex; flex-direction: column; gap: 10px; }

    /* ── DYNAMIC POLICY LISTS ── */
    .dynamic-list { display: grid; gap: 12px; }
    .policy-item {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .policy-item:hover { border-color: var(--border-muted); }
    .policy-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    .policy-item-title { display: grid; gap: 2px; }
    .policy-item-title strong { font-size: 12px; color: var(--text-primary); }
    .policy-item-title span { font-size: 11px; color: var(--text-muted); }
    .policy-item-actions { display: flex; gap: 6px; }
    .advanced-block {
      margin-top: 2px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.02);
      overflow: hidden;
    }
    .advanced-block summary {
      list-style: none;
      cursor: pointer;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }
    .advanced-block summary::-webkit-details-marker { display: none; }
    .advanced-block summary:hover { background: rgba(255, 255, 255, 0.02); color: var(--text-primary); }
    .advanced-block summary .summary-copy { display: grid; gap: 2px; }
    .advanced-block summary .summary-copy span { font-size: 11px; font-weight: 400; color: var(--text-muted); }
    .advanced-block summary .summary-icon {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1px solid var(--border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      transition: transform 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      flex-shrink: 0;
    }
    .advanced-block[open] summary .summary-icon {
      transform: rotate(90deg);
      color: var(--accent);
      border-color: rgba(0, 212, 255, 0.18);
    }
    .advanced-block-body {
      padding: 0 12px 12px;
      display: grid;
      gap: 12px;
    }
    .control-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
    .control-chip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 12px;
      color: var(--text-secondary);
    }
    .control-chip strong { color: var(--text-primary); font-size: 11px; font-weight: 600; }
    .control-chip input[type="checkbox"] { width: 14px; height: 14px; accent-color: var(--accent); }
    .list-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .preview-result {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-elevated);
    }
    .preview-result.ok {
      border-color: rgba(0, 212, 255, 0.22);
      box-shadow: inset 0 0 0 1px rgba(0, 212, 255, 0.06);
    }
    .preview-result .kv code {
      font-family: var(--font-mono);
      color: var(--accent);
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 5px;
    }

    /* ── TOGGLE ── */
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.12s;
      user-select: none;
    }
    .toggle-row:hover { border-color: var(--border-muted); background: var(--bg-hover); }
    .toggle-row-info { display: flex; flex-direction: column; gap: 3px; }
    .toggle-row-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
    .toggle-row-desc { font-size: 11px; color: var(--text-muted); }
    .toggle-switch { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
    .toggle-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1; }
    .toggle-track { position: absolute; inset: 0; background: var(--bg-input); border: 1px solid var(--border-muted); border-radius: 11px; transition: all 0.2s; }
    .toggle-switch input:checked + .toggle-track { background: var(--accent); border-color: var(--accent); }
    .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: var(--text-secondary); border-radius: 50%; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .toggle-switch input:checked + .toggle-track .toggle-thumb { transform: translateX(18px); background: #000; }

    /* ── BUTTONS ── */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 8px 14px;
      border-radius: var(--radius);
      font-size: 12px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: all 0.12s;
      border: 1px solid transparent;
      white-space: nowrap; letter-spacing: 0.02em;
    }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn svg { width: 14px; height: 14px; }
    .btn-primary { background: linear-gradient(180deg, var(--accent-hover), var(--accent)); color: #000; box-shadow: 0 2px 8px var(--accent-glow); }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px var(--accent-glow); }
    .btn-secondary { background: var(--bg-elevated); border-color: var(--border-muted); color: var(--text-primary); }
    .btn-secondary:hover:not(:disabled) { background: var(--bg-hover); border-color: rgba(255,255,255,0.2); }
    .btn-ghost { background: transparent; border-color: var(--border); color: var(--text-secondary); }
    .btn-ghost:hover:not(:disabled) { background: var(--bg-elevated); border-color: var(--border-muted); color: var(--text-primary); }
    .btn-danger { background: var(--danger-dim); border-color: rgba(248, 81, 73, 0.25); color: var(--danger); }
    .btn-danger:hover:not(:disabled) { background: rgba(248, 81, 73, 0.2); }
    .btn-sm { padding: 5px 10px; font-size: 11px; }

    /* ── PROMPT CARD ── */
    .prompt-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .prompt-card-header { display: flex; align-items: center; padding: 8px 12px; background: var(--bg-hover); border-bottom: 1px solid var(--border); }
    .prompt-card-name { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
    .prompt-card textarea { border: none; border-radius: 0; background: var(--bg-input); font-size: 12px; min-height: 90px; }
    .prompt-card textarea:focus { box-shadow: none; }

    /* ── JSON EDITOR ── */
    .json-editor-wrap { position: relative; }
    .json-editor {
      width: 100%; min-height: 450px;
      background: var(--bg-input);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius);
      padding: 14px;
      color: var(--text-primary);
      font-family: var(--font-mono); font-size: 12px; line-height: 1.7;
      resize: vertical; outline: none;
      transition: border-color 0.12s, box-shadow 0.12s;
      tab-size: 2;
    }
    .json-editor:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
    .json-info-box { display: flex; gap: 10px; padding: 10px 14px; background: var(--accent-dim); border: 1px solid rgba(0, 212, 255, 0.15); border-radius: var(--radius); font-size: 12px; color: var(--text-secondary); margin-bottom: 14px; }
    .json-info-box svg { color: var(--accent); flex-shrink: 0; margin-top: 1px; }

    /* ── PAGE SECTIONS ── */
    .page-section { display: none; }
    .page-section.active { display: block; }

    /* ── INLINE FLEX ROW ── */
    .flex-row { display: flex; align-items: flex-end; gap: 14px; }
    .flex-row .field { flex: 1; }

    /* ── DIVIDER ── */
    .divider { height: 1px; background: var(--border); margin: 6px 0; }

    /* ── FOOTER HINT ── */
    .footer-hint { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }

    /* ── TOGGLE GRID ── */
    .toggle-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }

    /* ── NOTICE CARDS ── */
    .notice-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .notice-card {
      display: grid;
      gap: 8px;
      padding: 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .notice-card strong { font-size: 12px; color: var(--text-primary); }
    .notice-card p { margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
    .notice-card code {
      font-family: var(--font-mono);
      color: var(--accent);
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 5px;
    }

    /* ── ADMIN TABLES ── */
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-input); }
    .admin-table { width: 100%; border-collapse: collapse; min-width: 1120px; }
    .admin-table th,
    .admin-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 12px; }
    .admin-table th { color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; background: var(--bg-elevated); white-space: nowrap; }
    .admin-table tr:last-child td { border-bottom: none; }
    .admin-table code { font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); }
    .table-empty { padding: 22px; color: var(--text-secondary); font-size: 12px; text-align: center; }
    .chip-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .mini-chip { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); font-size: 11px; white-space: nowrap; }
    .mini-chip.ok { color: var(--success); background: var(--success-dim); border-color: rgba(63, 185, 80, 0.2); }
    .mini-chip.warn { color: var(--warning); background: var(--warning-dim); border-color: rgba(210, 153, 34, 0.2); }
    .mini-chip.err { color: var(--danger); background: var(--danger-dim); border-color: rgba(248, 81, 73, 0.2); }
    .quota-stack { display: grid; gap: 4px; min-width: 180px; }
    .quota-line { display: flex; justify-content: space-between; gap: 10px; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
    .quota-line strong { color: var(--text-primary); font-weight: 600; }

    /* ── ANIMATIONS ── */
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .section-card { animation: fadeUp 0.2s ease; }
  </style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tom-select/dist/css/tom-select.css" />
  <script defer src="https://cdn.jsdelivr.net/npm/tom-select/dist/js/tom-select.complete.min.js"></script>
</head>
<body>
<div class="app-shell">

  <!-- ══ SIDEBAR ══ -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="sidebar-logo-mark">${SVG.terminal}</div>
        <div>
          <div class="sidebar-title">Fixvox</div>
          <div class="sidebar-subtitle">Control Plane</div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Configuration</div>
      <div class="nav-item active" data-page="runtime">
        <span class="nav-icon">${SVG.cpu}</span>
        Runtime
        <span class="nav-dot"></span>
      </div>
      <div class="nav-item" data-page="llm">
        <span class="nav-icon">${SVG.chat}</span>
        LLM Targets
        <span class="nav-dot"></span>
      </div>
      <div class="nav-item" data-page="speech">
        <span class="nav-icon">${SVG.mic}</span>
        Speech
        <span class="nav-dot"></span>
      </div>
      <div class="nav-item" data-page="recipes">
        <span class="nav-icon">${SVG.dashboard}</span>
        Recipes
        <span class="nav-dot"></span>
      </div>
      <div class="nav-item" data-page="ui">
        <span class="nav-icon">${SVG.layout}</span>
        UI
        <span class="nav-dot"></span>
      </div>
      <div class="nav-item" data-page="defaults">
        <span class="nav-icon">${SVG.settings}</span>
        User Defaults
        <span class="nav-dot"></span>
      </div>
      <div class="nav-section-label">Admin</div>
      <div class="nav-item" data-page="devices">
        <span class="nav-icon">${SVG.flag}</span>
        Devices
        <span class="nav-dot"></span>
      </div>
      <div class="nav-item" data-page="notes">
        <span class="nav-icon">${SVG.info}</span>
        Notes
        <span class="nav-dot"></span>
      </div>
      <div class="nav-section-label">Tools</div>
      <div class="nav-item" data-page="json">
        <span class="nav-icon">${SVG.terminal}</span>
        JSON Editor
        <span class="nav-dot"></span>
      </div>
    </nav>
  </aside>

  <!-- ══ MAIN ══ -->
  <main class="main">

    <!-- TOP BAR -->
    <header class="topbar">
      <div class="topbar-title">
        <span class="accent">Control Plane</span>
        <span>/</span>
        <span id="active-page-label">Runtime</span>
      </div>
      <div class="topbar-spacer"></div>
      <div id="topbar-status" class="topbar-badge warning">Locked</div>
      <div id="save-state-badge" class="topbar-badge">No changes</div>
    </header>

    <!-- CONTENT -->
    <div class="content">

      <!-- ── CONNECTION ── -->
      <div class="conn-bar">
        <div class="conn-field">
          <span class="conn-label">Admin Access</span>
          <input id="admin-token" class="conn-token" type="password" autocomplete="off" placeholder="Paste your admin access token once" />
        </div>
        <div class="conn-actions">
          <button id="btn-load" class="btn btn-primary btn-sm">${SVG.unlock} Unlock Admin</button>
          <button id="btn-reload" class="btn btn-secondary btn-sm">${SVG.download} Reload from Server</button>
          <button id="btn-alpha" class="btn btn-ghost btn-sm">${SVG.zap} Apply Alpha Preset</button>
        </div>
        <details class="advanced-block" style="margin: 0;">
          <summary>
            <div class="summary-copy">
              Advanced connection settings
              <span>Endpoint and browser-local access storage for local/dev workflows.</span>
            </div>
            <span class="summary-icon">›</span>
          </summary>
          <div class="advanced-block-body">
            <div class="grid-2">
              <div class="field">
                <label class="field-label">Endpoint</label>
                <input id="base-url" class="conn-url" type="url" placeholder="https://api.example.com" value="${escapeHtml(origin)}" />
              </div>
              <div class="field" style="display:flex; align-items:flex-end;">
                <button id="btn-save-conn" class="btn btn-secondary btn-sm">${SVG.save} Remember Access On This Browser</button>
              </div>
            </div>
          </div>
        </details>
      </div>

      <!-- ── STATUS ── -->
      <div class="status-strip">
        <div id="status-dot" class="status-dot"></div>
        <div id="status-msg" class="status-msg">Paste your admin access token once, then unlock the admin to load the current server policy.</div>
        <div id="status-meta" class="status-meta">—</div>
      </div>

      <div class="status-strip">
        <div id="runtime-health-dot" class="status-dot"></div>
        <div id="runtime-health-msg" class="status-msg">Default speech route preview will appear here after the policy is loaded.</div>
        <div id="runtime-health-meta" class="status-meta">Default speech route preview</div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: RUNTIME
      ══════════════════════════════════════ -->
      <div id="page-runtime" class="page-section active">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.cpu}</div> Runtime Configuration</div>
            <button id="btn-save-runtime" class="btn btn-primary btn-sm">${SVG.save} Save Changes</button>
          </div>
          <div class="section-card-body">
            <div class="flex-row">
              <div class="field">
                <label class="field-label">Runtime Mode</label>
                <select id="runtime-mode"><option value="managed">managed</option><option value="local">local</option></select>
              </div>
              <div class="field">
                <label class="field-label">Transport Mode</label>
                <select id="transport-mode"><option value="proxy-only">proxy-only</option><option value="default">default</option></select>
              </div>
            </div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.info} Live guided controls here: runtime mode plus managed Groq transport routing. Other policy switches remain documented under Notes and preserved in JSON.</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: LLM TARGETS
      ══════════════════════════════════════ -->
      <div id="page-llm" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.chat}</div> LLM Targets</div>
            <button id="btn-save-llm" class="btn btn-primary btn-sm">${SVG.save} Save Changes</button>
          </div>
          <div class="section-card-body">
            <div class="grid-3" id="llm-targets-grid">
            </div>
            <div class="field" style="margin-top: 14px;">
              <label class="field-label">Assistant Prompt</label>
              <textarea id="assistant-chat-prompt" placeholder="Optional global guidance for assistant wake-word turns"></textarea>
            </div>
            <div class="field" style="margin-top: 14px;">
              <label class="field-label">Assistant Quick Chat Prompt</label>
              <textarea id="assistant-quickchat-prompt" placeholder="Optional global guidance for assistant quick chat"></textarea>
            </div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.refresh} <a href="#" id="btn-refresh-models" style="color: var(--accent); text-decoration: none;">Refresh live models</a> from provider catalogs. Assistant wake-word turns and assistant quick chat both use the <code>assistant</code> target; presets still use <code>presetFallback</code>.</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: SPEECH
      ══════════════════════════════════════ -->
      <div id="page-speech" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.mic}</div> Speech Configuration</div>
            <button id="btn-save-speech" class="btn btn-primary btn-sm">${SVG.save} Save Changes</button>
          </div>
          <div class="section-card-body">
            <div class="flex-row">
              <div class="field">
                <label class="field-label">Provider</label>
                <select id="speech-provider"></select>
              </div>
              <div class="field" style="flex: 2">
                <label class="field-label">Model <span class="field-hint">Search suggestions or type a custom speech model ID</span></label>
                <select id="speech-model"><option value=""></option></select>
              </div>
            </div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.info} Live today: speech provider/model. Speech language and lock policy remain JSON-only until the app consumes them.</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: RECIPES
      ══════════════════════════════════════ -->
      <div id="page-recipes" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.dashboard}</div> Recipe Policy</div>
            <button id="btn-save-recipes" class="btn btn-primary btn-sm">${SVG.save} Save Changes</button>
          </div>
          <div class="section-card-body">
            <div class="notice-grid" style="margin-bottom: 14px;">
              <div class="notice-card">
                <strong>What this controls</strong>
                <p>Recipes define dictation behavior and context mappings decide when each recipe becomes active. This is the new behavior layer above raw provider/model runtime policy.</p>
              </div>
              <div class="notice-card">
                <strong>Current behavior</strong>
                <p>There is one active <code>recipePolicy</code> per environment today. The desktop app prefers it when present and falls back to local <code>voiceRouting</code> if it is missing.</p>
              </div>
            </div>
            <div class="grid-2" style="margin-bottom: 14px;">
              <div class="field">
                <label class="field-label">Policy Revision</label>
                <input id="recipe-policy-version" type="text" placeholder="alpha-default-2026-03-27" />
              </div>
              <div class="field">
                <label class="field-label">Default Recipe</label>
                <select id="recipe-default-id"></select>
              </div>
            </div>
            <div class="grid-2">
              <div class="field">
                <label class="field-label">Recipes <span class="field-hint">Behavior definitions used by dictation and future visible actions.</span></label>
                <div id="recipe-items" class="dynamic-list"></div>
                <div class="list-actions">
                  <button id="btn-add-recipe" class="btn btn-secondary btn-sm">${SVG.check} Add Recipe</button>
                </div>
              </div>
              <div class="field">
                <label class="field-label">Context Mappings <span class="field-hint">App/title/class rules that route the user into a recipe.</span></label>
                <div id="mapping-items" class="dynamic-list"></div>
                <div class="list-actions">
                  <button id="btn-add-mapping" class="btn btn-secondary btn-sm">${SVG.check} Add Mapping</button>
                </div>
              </div>
            </div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.info} This guided editor saves to <code>/admin/control-plane/recipe-policy</code>. Runtime policy and recipe policy are stored separately on purpose.</span>
          </div>
        </div>
        <div class="section-card" style="margin-top: 18px;">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.refresh}</div> Routing Preview</div>
          </div>
          <div class="section-card-body">
            <div class="grid-2">
              <div class="field">
                <label class="field-label">Process Name</label>
                <input id="preview-process-name" type="text" placeholder="slack.exe" />
              </div>
              <div class="field">
                <label class="field-label">Process Path <span class="field-hint">Optional advanced signal</span></label>
                <input id="preview-process-path" type="text" placeholder="C:\\Program Files\\Slack\\slack.exe" />
              </div>
              <div class="field">
                <label class="field-label">Window Title <span class="field-hint">Often enough for browser-based apps</span></label>
                <input id="preview-window-title" type="text" placeholder="Inbox - Gmail" />
              </div>
              <div class="field">
                <label class="field-label">Window Class</label>
                <input id="preview-window-class" type="text" placeholder="Chrome_WidgetWin_1" />
              </div>
            </div>
            <div class="list-actions">
              <button id="btn-preview-slack" class="btn btn-ghost btn-sm">Slack Sample</button>
              <button id="btn-preview-email" class="btn btn-ghost btn-sm">Email Sample</button>
              <button id="btn-preview-code" class="btn btn-ghost btn-sm">Code Sample</button>
              <button id="btn-preview-clear" class="btn btn-secondary btn-sm">Clear</button>
            </div>
            <div id="recipe-preview-result" class="preview-result" style="margin-top: 14px;"></div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.info} This preview uses the current in-browser recipe form, not the last saved backend payload, so you can test mappings before saving.</span>
          </div>
        </div>
        <div class="section-card" style="margin-top: 18px;">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.code}</div> Recipe Policy JSON</div>
            <div style="display: flex; gap: 6px;">
              <button id="btn-format-recipe-json" class="btn btn-ghost btn-sm">Format</button>
              <button id="btn-save-recipe-json" class="btn btn-primary btn-sm">${SVG.save} Save</button>
              <button id="btn-reset-recipe-json" class="btn btn-danger btn-sm">${SVG.reset} Reset</button>
            </div>
          </div>
          <div class="section-card-body">
            <div class="json-info-box">
              ${SVG.info}
              <span>Edit the raw recipe policy JSON directly. This is attached to <code style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px; color: var(--accent);">defaults.recipePolicy</code> on <code style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px; color: var(--accent);">POST /v2/device/register</code>.</span>
            </div>
            <div class="json-editor-wrap">
              <textarea id="recipe-policy-editor" class="json-editor" spellcheck="false"></textarea>
            </div>
          </div>
          <div class="section-card-footer">
            <button id="btn-sync-recipe-from-form" class="btn btn-ghost btn-sm">${SVG.upload} Import from Form</button>
            <button id="btn-sync-recipe-to-form" class="btn btn-ghost btn-sm">${SVG.download} Export to Form</button>
            <span class="footer-hint" style="margin-left: auto;">${SVG.lock} Stored independently from runtime policy</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: UI
      ══════════════════════════════════════ -->
      <div id="page-ui" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.layout}</div> UI Configuration</div>
            <button id="btn-save-ui" class="btn btn-primary btn-sm">${SVG.save} Save</button>
          </div>
          <div class="section-card-body">
            <div class="toggle-grid">
              <label class="toggle-row">
                <div class="toggle-row-info">
                  <span class="toggle-row-label">Hide provider selectors</span>
                  <span class="toggle-row-desc">Remove provider and model selection from the app UI</span>
                </div>
                <div class="toggle-switch"><input id="ui-hide-selectors" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
              </label>
            </div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.info} The guided form only controls the live provider-selector lock. Preset override exposure remains JSON-only so the current product surface stays aligned around <code>presetFallback</code>.</span>
          </div>
        </div>
      </div>

      <div id="page-defaults" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.settings}</div> User Settings Defaults</div>
          </div>
          <div class="section-card-body">
            <div class="json-info-box" style="margin-bottom: 16px;">
              ${SVG.info}
              <span>These defaults are returned in <code style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px; color: var(--accent);">defaults.userSettingsDefaults</code> on <code style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px; color: var(--accent);">POST /v2/device/register</code>. They shape the first-run experience for fresh devices before any local user settings exist.</span>
            </div>

            <div style="display: grid; gap: 18px;">
              <div>
                <div class="field-label" style="margin-bottom: 10px;">General Defaults</div>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;">
                  <div class="field">
                    <label class="field-label">Theme ID</label>
                    <input id="defaults-theme-id" type="text" placeholder="github-light" />
                  </div>
                  <div class="field">
                    <label class="field-label">Dock Skin</label>
                    <select id="defaults-dock-skin">
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                  <div class="field">
                    <label class="field-label">Preferred Surface</label>
                    <select id="defaults-preferred-surface">
                      <option value="alpha">alpha</option>
                      <option value="internal">internal</option>
                    </select>
                  </div>
                  <div class="field">
                    <label class="field-label">UI Language</label>
                    <select id="defaults-ui-language">
                      <option value="system">system</option>
                      <option value="es">es</option>
                      <option value="en">en</option>
                    </select>
                  </div>
                  <div class="field">
                    <label class="field-label">Transcript Language <span class="field-hint">Empty = auto</span></label>
                    <input id="defaults-transcript-language" type="text" placeholder="es" />
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px;">
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Show dock on startup</span>
                      <span class="toggle-row-desc">Fresh devices start with the dock visible.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-show-dock-on-startup" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Start with Windows</span>
                      <span class="toggle-row-desc">Initial startup preference for fresh devices.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-start-with-windows" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Onboarding done</span>
                      <span class="toggle-row-desc">Normally keep this off for first-run testing.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-onboarding-done" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                </div>
              </div>

              <div>
                <div class="field-label" style="margin-bottom: 10px;">Hotkey Defaults</div>
                <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;">
                  <div class="field"><label class="field-label">Push To Talk</label><input id="defaults-hotkey-push-to-talk" type="text" placeholder="Alt+Space" /></div>
                  <div class="field"><label class="field-label">Voice Record</label><input id="defaults-hotkey-voice-record" type="text" placeholder="Alt+Ctrl+Space" /></div>
                  <div class="field"><label class="field-label">Toggle Assistant Mode</label><input id="defaults-hotkey-toggle-assistant-mode" type="text" placeholder="Alt+Shift+A" /></div>
                  <div class="field"><label class="field-label">Quick Chat</label><input id="defaults-hotkey-quick-chat" type="text" placeholder="Alt+Shift+C" /></div>
                  <div class="field"><label class="field-label">Picker</label><input id="defaults-hotkey-picker" type="text" placeholder="Alt+Q" /></div>
                  <div class="field"><label class="field-label">Result History</label><input id="defaults-hotkey-result-history" type="text" placeholder="Alt+Shift+Z" /></div>
                  <div class="field"><label class="field-label">Paste Last</label><input id="defaults-hotkey-paste-last" type="text" placeholder="Alt+Shift+X" /></div>
                  <div class="field"><label class="field-label">Stop And Submit</label><input id="defaults-hotkey-stop-and-submit" type="text" placeholder="Alt+Shift+Space" /></div>
                  <div class="field"><label class="field-label">Toggle Press Enter</label><input id="defaults-hotkey-toggle-enter" type="text" placeholder="Alt+Shift+N" /></div>
                </div>
              </div>

              <div>
                <div class="field-label" style="margin-bottom: 10px;">Voice Defaults</div>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;">
                  <div class="field"><label class="field-label">Assistant Wake Words</label><input id="defaults-assistant-wake-words" type="text" placeholder="assistant,asistente" /></div>
                  <div class="field"><label class="field-label">Assistant Mode Toggle Words</label><input id="defaults-assistant-mode-toggle-words" type="text" placeholder="modo lulu,lulu" /></div>
                  <div class="field"><label class="field-label">Command Wake Words</label><input id="defaults-command-wake-words" type="text" placeholder="comando,command" /></div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px;">
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Mute output while recording</span>
                      <span class="toggle-row-desc">Reduces feedback on first run.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-mute-output-during-recording" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Press Enter after paste</span>
                      <span class="toggle-row-desc">Applies to insert delivery mode.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-press-enter-after-paste" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Show Quick Chat reasoning</span>
                      <span class="toggle-row-desc">Default visibility for quick chat reasoning.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-show-quickchat-reasoning" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                  <label class="toggle-row">
                    <div class="toggle-row-info">
                      <span class="toggle-row-label">Show preset reasoning</span>
                      <span class="toggle-row-desc">Default visibility for preset reasoning.</span>
                    </div>
                    <div class="toggle-switch"><input id="defaults-show-preset-reasoning" type="checkbox" /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div class="section-card-footer">
            <span class="footer-hint">${SVG.info} Guided fields write into <code>userSettingsDefaults</code> in the runtime policy JSON.</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: DEVICES
      ══════════════════════════════════════ -->
      <div id="page-devices" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.flag}</div> Devices</div>
            <button id="btn-refresh-devices" class="btn btn-secondary btn-sm">${SVG.refresh} Refresh Devices</button>
          </div>
          <div class="section-card-body">
            <div class="json-info-box">
              ${SVG.info}
              <span>Operator view. This lists known devices from the maintained control-plane index, shows effective policy/profile/quota state, and supports one safe mutation: manual policy assignment.</span>
            </div>
            <div id="devices-summary" class="status-strip" style="margin-bottom: 14px;">
              <div id="devices-dot" class="status-dot"></div>
              <div id="devices-msg" class="status-msg">Unlock admin to load devices.</div>
              <div id="devices-meta" class="status-meta">read-only</div>
            </div>
            <div class="table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Policy</th>
                    <th>Cohorts</th>
                    <th>Status</th>
                    <th>Profiles</th>
                    <th>Quota Summary</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody id="devices-table-body">
                  <tr><td colspan="7"><div class="table-empty">No devices loaded yet.</div></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="section-card-footer">
            <button id="btn-load-more-devices" class="btn btn-ghost btn-sm">Load More</button>
            <span class="footer-hint" style="margin-left: auto;">${SVG.lock} Policy assignment only. Quota/profile editing stays out of this slice.</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: NOTES
      ══════════════════════════════════════ -->
      <div id="page-notes" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.info}</div> Guided Form Scope</div>
          </div>
          <div class="section-card-body">
            <div class="notice-grid">
              <div class="notice-card">
                <strong>Live guided controls</strong>
                <p>Runtime mode, managed transport mode, active LLM target provider/model pairs, speech provider/model, and the main provider-selector visibility lock are the controls currently consumed by the app.</p>
              </div>
              <div class="notice-card">
                <strong>JSON-only for now</strong>
                <p>Feature flags, prompt overrides, the translate target, preset override policy, preset override visibility, per-value lock policies, speech language, and extra UI visibility flags stay in <code>policy-editor</code> but are not part of the guided form.</p>
              </div>
              <div class="notice-card">
                <strong>Transport caveat</strong>
                <p><code>proxy-only</code> currently affects managed Groq routing only. Other providers are still direct until managed proxy support expands.</p>
              </div>
              <div class="notice-card">
                <strong>Why this was trimmed</strong>
                <p>The earlier version exposed many fields that looked active but were only stored as metadata. This page now keeps the guided form closer to the real runtime contract.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════
           PAGE: JSON EDITOR
      ══════════════════════════════════════ -->
      <div id="page-json" class="page-section">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title"><div class="icon-wrap">${SVG.code}</div> Runtime Policy JSON</div>
            <div style="display: flex; gap: 6px;">
              <button id="btn-format-json" class="btn btn-ghost btn-sm">Format</button>
              <button id="btn-save-json" class="btn btn-primary btn-sm">${SVG.save} Save</button>
              <button id="btn-reset-json" class="btn btn-danger btn-sm">${SVG.reset} Reset</button>
            </div>
          </div>
          <div class="section-card-body">
            <div class="json-info-box">
              ${SVG.info}
              <span>Edit the raw policy JSON directly. This is delivered to all devices on <code style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px; color: var(--accent);">POST /v2/device/register</code>. Changes affect all connected devices immediately.</span>
            </div>
            <div class="json-editor-wrap">
              <textarea id="policy-editor" class="json-editor" spellcheck="false"></textarea>
            </div>
          </div>
          <div class="section-card-footer">
            <button id="btn-sync-from-form" class="btn btn-ghost btn-sm">${SVG.upload} Import from Form</button>
            <button id="btn-sync-to-form" class="btn btn-ghost btn-sm">${SVG.download} Export to Form</button>
            <span class="footer-hint" style="margin-left: auto;">${SVG.lock} Read-only until you save</span>
          </div>
        </div>
      </div>

    </div><!-- /content -->
  </main>
</div><!-- /app-shell -->

<script>
  const STORAGE_KEY = "fixvox.control-plane-admin.v3";
  const defaultState = { baseUrl: ${JSON.stringify(origin)}, token: "" };
  const RECOMMENDED_POLICY = ${JSON.stringify(recommendedPolicy)};
  const RECOMMENDED_RECIPE_POLICY = ${JSON.stringify(buildDefaultRecipePolicy())};
  const LLM_PROVIDERS = ["groq", "openai", "anthropic", "openrouter", "xai", "cerebras"];
  const SPEECH_PROVIDERS = ["groq", "openai"];
  const LLM_MODEL_SUGGESTIONS = {
    groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gpt-oss-20b", "gpt-oss-120b", "moonshotai/kimi-k2-instruct"],
    openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "gpt-4o"],
    anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805"],
    openrouter: ["anthropic/claude-haiku-4-5", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct"],
    xai: ["grok-3-mini", "grok-3"],
    cerebras: ["llama3.1-8b", "llama-3.3-70b"],
  };
  const SPEECH_MODEL_SUGGESTIONS = { groq: ["whisper-large-v3-turbo", "whisper-large-v3"], openai: ["whisper-1"] };
  const TARGETS = ["default", "assistant", "postProcess", "selectionTransform", "presetFallback"];
  const TARGET_ICONS = ${JSON.stringify(TARGET_ICONS)};
  const TARGET_LABELS = ${JSON.stringify(TARGET_LABELS)};
  const TARGET_DESCS = ${JSON.stringify(TARGET_DESCS)};
  const RECIPE_CONTROL_FIELDS = [
    ["usePostProcess", "Use Post-Process"],
    ["removeFillers", "Remove Fillers"],
    ["fixPunctuation", "Fix Punctuation"],
    ["preserveExactWording", "Preserve Exact Wording"],
    ["allowMeaningRecovery", "Allow Meaning Recovery"],
    ["keepConversationalTone", "Keep Conversational Tone"],
    ["preferShortMessages", "Prefer Short Messages"],
    ["preferCompleteSentences", "Prefer Complete Sentences"],
    ["preferParagraphs", "Prefer Paragraphs"],
    ["preserveTechnicalTerms", "Preserve Technical Terms"],
  ];

  const SVG = ${JSON.stringify(SVG)};

  // ── Elements ──
  const $ = (id) => document.getElementById(id);
  const baseUrlInput = $("base-url");
  const tokenInput = $("admin-token");
  const statusDot = $("status-dot");
  const statusMsg = $("status-msg");
  const statusMeta = $("status-meta");
  const topbarStatus = $("topbar-status");
  const saveStateBadge = $("save-state-badge");
  const runtimeHealthDot = $("runtime-health-dot");
  const runtimeHealthMsg = $("runtime-health-msg");
  const runtimeHealthMeta = $("runtime-health-meta");
  const editor = $("policy-editor");
  const activePageLabel = $("active-page-label");
  let isDirty = false;

  const PAGE_LABELS = {
    runtime: "Runtime",
    llm: "LLM Targets",
      speech: "Speech",
      recipes: "Recipes",
      ui: "UI Config",
      defaults: "User Defaults",
      devices: "Devices",
      notes: "Notes",
      json: "JSON Editor",
    };

  const providerModelCache = new Map();
  const tsMap = new Map();
  let devicesCursor = null;
  let loadedDevices = [];
  let loadedPolicyOptions = [];

  // ── Build LLM target grid ──
  function buildLlmTargetsGrid() {
    const grid = $("llm-targets-grid");
    grid.innerHTML = "";
    for (const target of TARGETS) {
      const card = document.createElement("div");
      card.className = "target-card";
      card.innerHTML = \`
        <div class="target-card-header">
          <div class="target-card-icon">\${TARGET_ICONS[target] || TARGET_ICONS.default}</div>
          <div>
            <div class="target-card-name">\${TARGET_LABELS[target]}</div>
            <div class="target-card-desc">\${TARGET_DESCS[target]}</div>
          </div>
        </div>
        <div class="target-card-fields">
          <div class="field">
            <label class="field-label">Provider</label>
            <select id="target-\${target}-provider"></select>
          </div>
          <div class="field">
            <label class="field-label">Model <span class="field-hint">Search suggestions or type a custom model ID</span></label>
            <select id="target-\${target}-model"><option value=""></option></select>
          </div>
        </div>
      \`;
      grid.appendChild(card);
    }
  }

  // ── Navigation ──
  function initNav() {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => {
        const page = item.dataset.page;
        if (!page) return;
        document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
        item.classList.add("active");
        document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
        const pageEl = document.getElementById("page-" + page);
        if (pageEl) pageEl.classList.add("active");
        activePageLabel.textContent = PAGE_LABELS[page] || page;
      });
    });
  }

  // ── State ──
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultState, ...JSON.parse(raw) } : { ...defaultState };
    } catch { return { ...defaultState }; }
  }
  const state = loadState();
  baseUrlInput.value = state.baseUrl || defaultState.baseUrl;
  tokenInput.value = state.token || "";

  function saveState() {
    state.baseUrl = (baseUrlInput.value || "").trim() || defaultState.baseUrl;
    state.token = (tokenInput.value || "").trim();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setStatus(message, tone) {
    statusMsg.textContent = message;
    statusDot.className = "status-dot " + (tone || "");
    topbarStatus.className = "topbar-badge " + (tone === "ok" ? "success" : tone === "warn" ? "warning" : tone === "err" ? "warning" : "");
    topbarStatus.textContent = tone === "ok" ? "Ready to edit" : tone === "warn" ? "Needs attention" : tone === "err" ? "Access issue" : "Locked";
  }

  function setDirtyState(next) {
    isDirty = Boolean(next);
    saveStateBadge.className = "topbar-badge " + (isDirty ? "warning" : "success");
    saveStateBadge.textContent = isDirty ? "Unsaved changes" : "Saved";
  }

  function setRuntimeHealth(message, tone, meta) {
    runtimeHealthMsg.textContent = message;
    runtimeHealthMeta.textContent = meta || "Default speech route preview";
    runtimeHealthDot.className = "status-dot " + (tone || "");
  }

  function setDevicesStatus(message, tone, meta) {
    $("devices-msg").textContent = message;
    $("devices-meta").textContent = meta || "read-only";
    $("devices-dot").className = "status-dot " + (tone || "");
  }

  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
  function ensureObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function text(v) { return typeof v === "string" ? v.trim() : ""; }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#39;");
  }

  // ── API ──
  async function adminFetch(path, options) {
    saveState();
    if (!state.token) throw new Error("Missing admin bearer token.");
    let baseUrl = text(state.baseUrl);
    while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    const resp = await fetch(baseUrl + path, {
      method: "GET",
      ...options,
      headers: {
        Authorization: "Bearer " + state.token,
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers || {}),
      },
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(body || (resp.status + " " + resp.statusText));
    return body ? JSON.parse(body) : null;
  }

  function messageFromAdminError(error, baseUrl) {
    const message = error && typeof error.message === "string" ? error.message : "Unexpected admin error.";
    if (message.includes("missing_admin_api_key") || message.includes("ADMIN_API_KEY is not configured")) {
      return "Worker admin auth is not configured. Set ADMIN_API_KEY in proxy/.dev.vars and restart wrangler dev.";
    }
    if (message.includes("invalid_admin_token") || message.includes("Unauthorized admin request") || message.includes("Missing admin bearer token")) {
      return "Admin token is missing or invalid.";
    }
    if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
      return "Cannot reach the saved admin endpoint: " + (text(baseUrl) || defaultState.baseUrl);
    }
    return message;
  }

  function unlockAdmin() {
    setStatus("Unlocking admin and loading current server policy…", "warn");
    return loadAllPolicies().catch((e) => {
      setStatus(messageFromAdminError(e, baseUrlInput.value), "err");
      throw e;
    });
  }

  function updateRuntimeHealthNotice(policy) {
    const transport = text(ensureObject(policy && policy.transport).mode) || "proxy-only";
    const voiceRouting = ensureObject(policy && policy.voiceRouting);
    const defaultLabel = text(voiceRouting.defaultLabel) || "quality";
    const routePolicies = ensureObject(voiceRouting.policies);
    const selectedRoute = ensureObject(routePolicies[defaultLabel]);
    const routeSpeech = ensureObject(selectedRoute.speech);
    const provider = text(routeSpeech.provider) || text(ensureObject(ensureObject(policy && policy.speech).transcription).provider) || "groq";
    const model = text(routeSpeech.model) || text(ensureObject(ensureObject(policy && policy.speech).transcription).model) || "whisper-large-v3";
    const routeSummary = defaultLabel + " -> " + provider + "/" + model;

    if (transport === "proxy-only" && provider !== "groq") {
      setRuntimeHealth(
        "Default speech route is incompatible with the current managed proxy runtime. Use Groq speech for the active default route.",
        "err",
        routeSummary,
      );
      return;
    }

    setRuntimeHealth("Default speech route is compatible with the current runtime.", "ok", routeSummary);
  }

  function fillSelect(sel, values) {
    sel.innerHTML = "";
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    }
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const normalized = text(value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }

  function llmSuggestions(provider) {
    const cached = providerModelCache.get(provider);
    return cached?.llmModels?.length ? cached.llmModels : (LLM_MODEL_SUGGESTIONS[provider] || []);
  }

  function speechSuggestions(provider) {
    const cached = providerModelCache.get(provider);
    return cached?.speechModels?.length ? cached.speechModels : (SPEECH_MODEL_SUGGESTIONS[provider] || []);
  }

  function rebuildModelOptions(ts, values, placeholder, preserveValue) {
    if (!ts) return;
    const currentValue = text(ts.getValue());
    const nextValues = uniqueStrings(values);
    if (preserveValue && currentValue && !nextValues.includes(currentValue)) nextValues.unshift(currentValue);
    ts.clear(true);
    ts.clearOptions((option, value) => value === "");
    if (placeholder) {
      if (ts.options[""]) ts.updateOption("", { value: "", text: placeholder });
      else ts.addOption({ value: "", text: placeholder });
    }
    if (nextValues.length) ts.addOptions(nextValues.map((value) => ({ value, text: value })));
    const nextValue = currentValue && nextValues.includes(currentValue) ? currentValue : "";
    ts.setValue(nextValue, true);
    ts.setTextboxValue("");
    ts.clearCache();
    ts.refreshOptions(false);
    ts.refreshItems();
  }

  function syncTargetSuggestions(target, options) {
    const provider = $("target-" + target + "-provider").value;
    const ts = tsMap.get("target-" + target);
    rebuildModelOptions(ts, llmSuggestions(provider), "Search models or type a custom ID", options?.preserveValue !== false);
  }

  function syncSpeechSuggestions(options) {
    const ts = tsMap.get("speech");
    rebuildModelOptions(ts, speechSuggestions($("speech-provider").value), "Search speech models or type a custom ID", options?.preserveValue !== false);
  }

  function providersInForm() {
    const set = new Set();
    for (const t of TARGETS) set.add($("target-" + t + "-provider").value);
    set.add($("speech-provider").value);
    return Array.from(set).filter(Boolean);
  }

  async function fetchProviderModels(provider) {
    if (!provider) return null;
    if (!state.token) return { provider, source: "fallback", configured: false, llmModels: llmSuggestions(provider), speechModels: speechSuggestions(provider), error: null };
    const payload = await adminFetch("/admin/control-plane/models?provider=" + encodeURIComponent(provider));
    providerModelCache.set(provider, payload);
    return payload;
  }

  async function refreshProviderModels(provider) {
    const payload = await fetchProviderModels(provider);
    if (!payload) return;
    for (const t of TARGETS) { if ($("target-" + t + "-provider").value === provider) syncTargetSuggestions(t, { preserveValue: true }); }
    if ($("speech-provider").value === provider) syncSpeechSuggestions({ preserveValue: true });
    const suffix = payload.source === "live" ? "live catalog" : "fallback catalog";
    const configured = payload.configured ? "" : " (no server key configured)";
    setStatus("Loaded " + provider + " models from " + suffix + configured + ".", payload.source === "live" ? "ok" : "warn");
  }

  async function refreshAllProviderModels() {
    for (const provider of providersInForm()) await refreshProviderModels(provider);
  }

  // ── Policy helpers ──
  function ensurePolicyShape(input) {
    const p = ensureObject(deepClone(input || {}));
    p.assistant = ensureObject(p.assistant);
    p.assistant.chat = ensureObject(p.assistant.chat);
    p.assistant.quickChat = ensureObject(p.assistant.quickChat);
    p.ui = ensureObject(p.ui);
    p.llm = ensureObject(p.llm);
    p.llm.targets = ensureObject(p.llm.targets);
    p.speech = ensureObject(p.speech);
    p.prompts = ensureObject(p.prompts);
    p.features = ensureObject(p.features);
    p.transport = ensureObject(p.transport);
    p.userSettingsDefaults = ensureObject(p.userSettingsDefaults);
    p.userSettingsDefaults.appearance = ensureObject(p.userSettingsDefaults.appearance);
    p.userSettingsDefaults.general = ensureObject(p.userSettingsDefaults.general);
    p.userSettingsDefaults.hotkeys = ensureObject(p.userSettingsDefaults.hotkeys);
    p.userSettingsDefaults.transcript = ensureObject(p.userSettingsDefaults.transcript);
    p.userSettingsDefaults.voice = ensureObject(p.userSettingsDefaults.voice);
    return p;
  }

  function defaultRecipeControls() {
    return deepClone(ensureObject((RECOMMENDED_RECIPE_POLICY.recipes && RECOMMENDED_RECIPE_POLICY.recipes[0] && RECOMMENDED_RECIPE_POLICY.recipes[0].controls) || {}));
  }

  function makeRecipeId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8);
  }

  function parseStringList(value) {
    return uniqueStrings(String(value || "").replaceAll("\\r", "\\n").replaceAll(",", "\\n").split("\\n"));
  }

  function listToMultiline(value) {
    return Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean).join("\\n") : "";
  }

  function normalizeMatchField(value) {
    return ["processName", "processPath", "windowTitle", "windowClassName"].includes(value) ? value : null;
  }

  function normalizeMatchOp(value) {
    return ["equals", "includes", "regex"].includes(value) ? value : null;
  }

  function dedupeMatchClauses(clauses) {
    const seen = new Set();
    const result = [];
    for (const clause of Array.isArray(clauses) ? clauses : []) {
      const key = [clause.field, clause.op, clause.value, clause.flags || ""].join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(clause);
    }
    return result;
  }

  function normalizeMatchClause(input) {
    const clause = ensureObject(input);
    const field = normalizeMatchField(text(clause.field));
    const op = normalizeMatchOp(text(clause.op));
    const value = text(clause.value);
    if (!field || !op || !value) return null;
    return {
      field,
      op,
      value,
      flags: typeof clause.flags === "string" ? clause.flags : "",
    };
  }

  function normalizeClauseArray(value) {
    return dedupeMatchClauses((Array.isArray(value) ? value : []).map(normalizeMatchClause).filter(Boolean));
  }

  function normalizeLegacyMatchClauses(values, field, op) {
    return parseStringList(values).map((value) => ({ field, op, value, flags: "" }));
  }

  function normalizeMatchGroup(input) {
    const match = ensureObject(input);
    const normalized = {
      all: normalizeClauseArray(match.all),
      any: normalizeClauseArray(match.any),
    };
    if (normalized.all.length || normalized.any.length) return normalized;
    return {
      all: [],
      any: dedupeMatchClauses([
        ...normalizeLegacyMatchClauses(match.processNames || "", "processName", "equals"),
        ...normalizeLegacyMatchClauses(match.processPathIncludes || "", "processPath", "includes"),
        ...normalizeLegacyMatchClauses(match.titleIncludes || "", "windowTitle", "includes"),
        ...normalizeLegacyMatchClauses(match.classNames || "", "windowClassName", "equals"),
      ]),
    };
  }

  function mergeMatchGroups() {
    const groups = Array.from(arguments).map((entry) => normalizeMatchGroup(entry));
    return {
      all: dedupeMatchClauses(groups.flatMap((group) => group.all)),
      any: dedupeMatchClauses(groups.flatMap((group) => group.any)),
    };
  }

  function quickMatchFieldsFromGroup(match) {
    const quick = {
      processNames: [],
      processPathIncludes: [],
      titleIncludes: [],
      classNames: [],
    };
    for (const clause of [...normalizeMatchGroup(match).all, ...normalizeMatchGroup(match).any]) {
      if (clause.flags) continue;
      if (clause.field === "processName" && clause.op === "equals") quick.processNames.push(clause.value);
      if (clause.field === "processPath" && clause.op === "includes") quick.processPathIncludes.push(clause.value);
      if (clause.field === "windowTitle" && clause.op === "includes") quick.titleIncludes.push(clause.value);
      if (clause.field === "windowClassName" && clause.op === "equals") quick.classNames.push(clause.value);
    }
    return {
      processNames: uniqueStrings(quick.processNames),
      processPathIncludes: uniqueStrings(quick.processPathIncludes),
      titleIncludes: uniqueStrings(quick.titleIncludes),
      classNames: uniqueStrings(quick.classNames),
    };
  }

  function parseMatchJsonInput(raw) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return { all: [], any: [] };
    return normalizeMatchGroup(JSON.parse(value));
  }

  function ensureRecipePolicyShape(input) {
    const p = ensureObject(deepClone(input || {}));
    p.version = text(p.revision) || text(p.version) || text(RECOMMENDED_RECIPE_POLICY.revision) || text(RECOMMENDED_RECIPE_POLICY.version) || "alpha-default";
    p.recipes = Array.isArray(p.recipes) ? p.recipes.map(ensureRecipeShape).filter(Boolean) : deepClone(RECOMMENDED_RECIPE_POLICY.recipes || []);
    p.contextMappings = Array.isArray(p.contextMappings) ? p.contextMappings.map(ensureMappingShape).filter(Boolean) : deepClone(RECOMMENDED_RECIPE_POLICY.contextMappings || []);
    const recipeIds = new Set((p.recipes || []).map((recipe) => text(recipe.id)).filter(Boolean));
    p.defaultRecipeId = text(p.defaultRecipeId);
    if (!p.defaultRecipeId || !recipeIds.has(p.defaultRecipeId)) {
      p.defaultRecipeId = text(p.recipes[0] && p.recipes[0].id);
    }
    p.contextMappings = p.contextMappings.map((mapping) => {
      if (!recipeIds.has(text(mapping.recipeId))) {
        mapping.recipeId = p.defaultRecipeId || text(p.recipes[0] && p.recipes[0].id);
      }
      return mapping;
    });
    return p;
  }

  function ensureRecipeShape(input) {
    const recipe = ensureObject(input);
    const id = text(recipe.id) || makeRecipeId("recipe");
    const controlsInput = ensureObject(recipe.controls);
    const controls = defaultRecipeControls();
    for (const [key] of RECIPE_CONTROL_FIELDS) {
      controls[key] = typeof controlsInput[key] === "boolean" ? controlsInput[key] : Boolean(controls[key]);
    }
    return {
      id,
      label: text(recipe.label) || id,
      sttPrompt: typeof recipe.sttPrompt === "string" ? recipe.sttPrompt : "",
      postProcessPrompt: typeof recipe.postProcessPrompt === "string" ? recipe.postProcessPrompt : "",
      controls,
    };
  }

  function ensureMappingShape(input) {
    const mapping = ensureObject(input);
    return {
      id: text(mapping.id) || makeRecipeId("mapping"),
      label: text(mapping.label) || "Context Mapping",
      enabled: typeof mapping.enabled === "boolean" ? mapping.enabled : true,
      priority: Number.isFinite(Number(mapping.priority)) ? Math.trunc(Number(mapping.priority)) : 0,
      recipeId: text(mapping.recipeId),
      match: normalizeMatchGroup(mapping.match),
    };
  }

  function currentRecipePolicyFromEditor() {
    const raw = text($("recipe-policy-editor").value);
    return ensureRecipePolicyShape(raw ? JSON.parse(raw) : RECOMMENDED_RECIPE_POLICY);
  }

  function writeRecipeEditor(policy) {
    $("recipe-policy-editor").value = JSON.stringify(ensureRecipePolicyShape(policy), null, 2);
  }

  function syncDefaultRecipeOptions(selectedValue, recipes) {
    const select = $("recipe-default-id");
    const previous = text(selectedValue) || text(select.value);
    select.innerHTML = "";
    for (const recipe of recipes) {
      const opt = document.createElement("option");
      opt.value = recipe.id;
      opt.textContent = recipe.label + " (" + recipe.id + ")";
      select.appendChild(opt);
    }
    select.value = recipes.some((recipe) => recipe.id === previous) ? previous : text(recipes[0] && recipes[0].id);
  }

  function renderRecipeItems(recipes) {
    const host = $("recipe-items");
    host.innerHTML = "";
    for (const recipe of recipes) {
      const controlsHtml = RECIPE_CONTROL_FIELDS.map(([key, label]) => \`
        <label class="control-chip">
          <strong>\${label}</strong>
          <input type="checkbox" data-field="\${key}" \${recipe.controls[key] ? "checked" : ""} />
        </label>
      \`).join("");
      const item = document.createElement("div");
      item.className = "policy-item recipe-item";
      item.dataset.id = recipe.id;
      item.innerHTML = \`
        <div class="policy-item-header">
          <div class="policy-item-title">
            <strong>\${escapeHtml(recipe.label || recipe.id)}</strong>
            <span>\${escapeHtml(recipe.id)}</span>
          </div>
          <div class="policy-item-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="remove-recipe" data-id="\${escapeHtml(recipe.id)}">\${SVG.x} Remove</button>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field-label">Recipe ID</label>
            <input type="text" data-field="id" value="\${escapeHtml(recipe.id)}" />
          </div>
          <div class="field">
            <label class="field-label">Label</label>
            <input type="text" data-field="label" value="\${escapeHtml(recipe.label)}" />
          </div>
        </div>
        <div class="field">
          <label class="field-label">STT Prompt</label>
          <textarea data-field="sttPrompt" placeholder="Optional per-recipe STT guidance">\${escapeHtml(recipe.sttPrompt || "")}</textarea>
        </div>
        <div class="field">
          <label class="field-label">Post-Process Prompt</label>
          <textarea data-field="postProcessPrompt" placeholder="Optional per-recipe cleanup guidance">\${escapeHtml(recipe.postProcessPrompt || "")}</textarea>
        </div>
        <div class="field">
          <label class="field-label">Behavior Controls</label>
          <div class="control-grid">\${controlsHtml}</div>
        </div>
      \`;
      host.appendChild(item);
    }
  }

  function renderMappingItems(mappings, recipes) {
    const host = $("mapping-items");
    const recipeOptions = recipes.map((recipe) => \`<option value="\${escapeHtml(recipe.id)}">\${escapeHtml(recipe.label)} (\${escapeHtml(recipe.id)})</option>\`).join("");
    host.innerHTML = "";
    for (const mapping of mappings) {
      const quick = quickMatchFieldsFromGroup(mapping.match);
      const matchJson = JSON.stringify(normalizeMatchGroup(mapping.match), null, 2);
      const item = document.createElement("div");
      item.className = "policy-item mapping-item";
      item.dataset.id = mapping.id;
      item.innerHTML = \`
        <div class="policy-item-header">
          <div class="policy-item-title">
            <strong>\${escapeHtml(mapping.label || mapping.id)}</strong>
            <span>\${escapeHtml(mapping.id)}</span>
          </div>
          <div class="policy-item-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="remove-mapping" data-id="\${escapeHtml(mapping.id)}">\${SVG.x} Remove</button>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field-label">Mapping ID</label>
            <input type="text" data-field="id" value="\${escapeHtml(mapping.id)}" />
          </div>
          <div class="field">
            <label class="field-label">Label</label>
            <input type="text" data-field="label" value="\${escapeHtml(mapping.label)}" />
          </div>
        </div>
        <div class="grid-3">
          <div class="field">
            <label class="field-label">Recipe</label>
            <select data-field="recipeId">\${recipeOptions}</select>
          </div>
          <div class="field">
            <label class="field-label">Priority</label>
            <input type="number" step="1" data-field="priority" value="\${String(mapping.priority || 0)}" />
          </div>
          <label class="toggle-row" style="align-self: stretch;">
            <div class="toggle-row-info">
              <span class="toggle-row-label">Enabled</span>
              <span class="toggle-row-desc">Whether this mapping participates in routing</span>
            </div>
            <div class="toggle-switch"><input data-field="enabled" type="checkbox" \${mapping.enabled ? "checked" : ""} /><div class="toggle-track"><div class="toggle-thumb"></div></div></div>
          </label>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field-label">Quick Process Names <span class="field-hint">Fast exact matches. One per line or comma-separated.</span></label>
            <textarea data-field="processNames" placeholder="slack.exe&#10;discord.exe">\${escapeHtml(listToMultiline(quick.processNames))}</textarea>
          </div>
          <div class="field">
            <label class="field-label">Quick Title Includes <span class="field-hint">Useful for Gmail, browser tabs, and broad app families.</span></label>
            <textarea data-field="titleIncludes" placeholder="gmail&#10;outlook">\${escapeHtml(listToMultiline(quick.titleIncludes))}</textarea>
          </div>
        </div>
        <details class="advanced-block">
          <summary>
            <div class="summary-copy">
              Advanced Matching
              <span>Use path, class, and raw rule JSON when the quick fields are not enough.</span>
            </div>
            <span class="summary-icon">›</span>
          </summary>
          <div class="advanced-block-body">
            <div class="grid-2">
              <div class="field">
                <label class="field-label">Quick Class Names</label>
                <textarea data-field="classNames" placeholder="Chrome_WidgetWin_1">\${escapeHtml(listToMultiline(quick.classNames))}</textarea>
              </div>
              <div class="field">
                <label class="field-label">Quick Path Includes <span class="field-hint">Advanced fallback signal; avoid depending on this globally.</span></label>
                <textarea data-field="processPathIncludes" placeholder="\\\\Slack\\\\">\${escapeHtml(listToMultiline(quick.processPathIncludes))}</textarea>
              </div>
            </div>
            <div class="field">
              <label class="field-label">Advanced Match JSON <span class="field-hint">Internal rule language. Supports <code>all</code>/<code>any</code>, <code>equals</code>, <code>includes</code>, and <code>regex</code>.</span></label>
              <textarea data-field="matchJson" placeholder='{"any":[{"field":"processName","op":"regex","value":"^(code|cursor)\\\\.exe$","flags":"i"}]}' style="min-height: 180px;">\${escapeHtml(matchJson)}</textarea>
            </div>
          </div>
        </details>
      \`;
      host.appendChild(item);
      const recipeSelect = item.querySelector('select[data-field="recipeId"]');
      if (recipeSelect) recipeSelect.value = recipes.some((recipe) => recipe.id === mapping.recipeId) ? mapping.recipeId : text(recipes[0] && recipes[0].id);
    }
  }

  function applyRecipePolicyToForm(input) {
    const policy = ensureRecipePolicyShape(input);
    $("recipe-policy-version").value = policy.version;
    renderRecipeItems(policy.recipes);
    syncDefaultRecipeOptions(policy.defaultRecipeId, policy.recipes);
    renderMappingItems(policy.contextMappings, policy.recipes);
    renderRecipePreview();
  }

  function collectRecipePolicyFromForm() {
    const recipes = Array.from(document.querySelectorAll("#recipe-items .recipe-item")).map((item) => {
      const getField = (name) => item.querySelector('[data-field="' + name + '"]');
      const id = text(getField("id") && getField("id").value) || makeRecipeId("recipe");
      const label = text(getField("label") && getField("label").value) || id;
      const controls = {};
      for (const [key] of RECIPE_CONTROL_FIELDS) {
        const checkbox = getField(key);
        controls[key] = Boolean(checkbox && checkbox.checked);
      }
      return {
        id,
        label,
        sttPrompt: getField("sttPrompt") ? getField("sttPrompt").value : "",
        postProcessPrompt: getField("postProcessPrompt") ? getField("postProcessPrompt").value : "",
        controls,
      };
    });

    const recipeIds = new Set(recipes.map((recipe) => recipe.id));
    const mappings = Array.from(document.querySelectorAll("#mapping-items .mapping-item")).map((item) => {
      const getField = (name) => item.querySelector('[data-field="' + name + '"]');
      const id = text(getField("id") && getField("id").value) || makeRecipeId("mapping");
      const recipeIdValue = text(getField("recipeId") && getField("recipeId").value);
      const quickMatch = normalizeMatchGroup({
        processNames: getField("processNames") ? getField("processNames").value : "",
        processPathIncludes: getField("processPathIncludes") ? getField("processPathIncludes").value : "",
        titleIncludes: getField("titleIncludes") ? getField("titleIncludes").value : "",
        classNames: getField("classNames") ? getField("classNames").value : "",
      });
      const advancedMatch = parseMatchJsonInput(getField("matchJson") ? getField("matchJson").value : "");
      return {
        id,
        label: text(getField("label") && getField("label").value) || id,
        enabled: Boolean(getField("enabled") && getField("enabled").checked),
        priority: Number.isFinite(Number(getField("priority") && getField("priority").value)) ? Math.trunc(Number(getField("priority").value)) : 0,
        recipeId: recipeIds.has(recipeIdValue) ? recipeIdValue : text(recipes[0] && recipes[0].id),
        match: mergeMatchGroups(quickMatch, advancedMatch),
      };
    });

    return ensureRecipePolicyShape({
      version: $("recipe-policy-version").value,
      defaultRecipeId: $("recipe-default-id").value,
      recipes,
      contextMappings: mappings,
    });
  }

  function syncRecipeJsonFromForm() {
    const policy = collectRecipePolicyFromForm();
    writeRecipeEditor(policy);
    syncDefaultRecipeOptions(policy.defaultRecipeId, policy.recipes);
    renderRecipePreview();
    setDirtyState(true);
    return policy;
  }

  function syncRecipeFormFromJson() {
    const policy = currentRecipePolicyFromEditor();
    applyRecipePolicyToForm(policy);
    renderRecipePreview();
    setDirtyState(true);
    return policy;
  }

  function formatRecipeJson() {
    writeRecipeEditor(currentRecipePolicyFromEditor());
  }

  function getPreviewTarget() {
    return {
      processName: text($("preview-process-name").value).toLowerCase(),
      processPath: text($("preview-process-path").value),
      windowTitle: text($("preview-window-title").value),
      windowClassName: text($("preview-window-class").value),
    };
  }

  function matchesExact(candidates, value) {
    if (!Array.isArray(candidates) || !candidates.length || !value) return false;
    const normalized = String(value).toLowerCase();
    return candidates.some((candidate) => String(candidate || "").toLowerCase() === normalized);
  }

  function matchesContains(candidates, value) {
    if (!Array.isArray(candidates) || !candidates.length || !value) return false;
    const normalized = String(value).toLowerCase();
    return candidates.some((candidate) => normalized.includes(String(candidate || "").toLowerCase()));
  }

  function previewFieldValue(target, field) {
    if (field === "processName") return String(target.processName || "");
    if (field === "processPath") return String(target.processPath || "");
    if (field === "windowTitle") return String(target.windowTitle || "");
    if (field === "windowClassName") return String(target.windowClassName || "");
    return "";
  }

  function matchesPreviewClause(clause, target) {
    const value = previewFieldValue(target, clause.field);
    if (!value) return false;
    if (clause.op === "equals") return value.toLowerCase() === String(clause.value || "").toLowerCase();
    if (clause.op === "includes") return value.toLowerCase().includes(String(clause.value || "").toLowerCase());
    if (clause.op === "regex") {
      try {
        return new RegExp(String(clause.value || ""), String(clause.flags || "")).test(value);
      } catch {
        return false;
      }
    }
    return false;
  }

  function matchesPreviewGroup(match, target) {
    const normalized = normalizeMatchGroup(match);
    if (!normalized.all.length && !normalized.any.length) return false;
    if (normalized.all.length && !normalized.all.every((clause) => matchesPreviewClause(clause, target))) return false;
    if (normalized.any.length && !normalized.any.some((clause) => matchesPreviewClause(clause, target))) return false;
    return true;
  }

  function scorePreviewClause(clause) {
    const base = clause.field === "processName"
      ? 500
      : clause.field === "processPath"
        ? 350
        : clause.field === "windowClassName"
          ? 250
          : 150;
    const opWeight = clause.op === "equals" ? 80 : clause.op === "regex" ? 50 : 20;
    return base + opWeight;
  }

  function scorePreviewMapping(mapping, target) {
    return [...normalizeMatchGroup(mapping.match).all, ...normalizeMatchGroup(mapping.match).any]
      .filter((clause) => matchesPreviewClause(clause, target))
      .reduce((sum, clause) => sum + scorePreviewClause(clause), 0);
  }

  function describePreviewClause(clause, target) {
    const value = previewFieldValue(target, clause.field);
    const fieldLabel = clause.field === "windowClassName"
      ? "class"
      : clause.field === "windowTitle"
        ? "title"
        : clause.field === "processPath"
          ? "path"
          : "process";
    const opLabel = clause.op === "equals" ? "=" : clause.op === "includes" ? "~" : "~=";
    return fieldLabel + opLabel + value;
  }

  function describePreviewReason(mapping, target) {
    const matchedClauses = [...normalizeMatchGroup(mapping.match).all, ...normalizeMatchGroup(mapping.match).any]
      .filter((clause) => matchesPreviewClause(clause, target));
    return matchedClauses.length ? matchedClauses.map((clause) => describePreviewClause(clause, target)).join(" + ") : "default fallback";
  }

  function resolveRecipePreview(policy, target) {
    const candidates = (policy.contextMappings || [])
      .filter((mapping) => mapping.enabled && matchesPreviewGroup(mapping.match, target))
      .map((mapping) => ({
        mapping,
        score: scorePreviewMapping(mapping, target),
        reason: describePreviewReason(mapping, target),
      }))
      .sort((left, right) => {
        if (right.mapping.priority !== left.mapping.priority) return right.mapping.priority - left.mapping.priority;
        return right.score - left.score;
      });

    const matched = candidates[0] || null;
    const recipe = matched
      ? (policy.recipes || []).find((entry) => entry.id === matched.mapping.recipeId) || null
      : (policy.recipes || []).find((entry) => entry.id === policy.defaultRecipeId) || policy.recipes[0] || null;
    return { matched, recipe };
  }

  function renderRecipePreview() {
    const host = $("recipe-preview-result");
    const policy = collectRecipePolicyFromForm();
    const target = getPreviewTarget();
    const hasAnyInput = Boolean(target.processName || target.processPath || target.windowTitle || target.windowClassName);
    const resolved = resolveRecipePreview(policy, target);

    if (!resolved.recipe) {
      host.className = "preview-result";
      host.innerHTML = '<div class="kv"><strong>Status</strong><span>No recipe is available in the current form.</span></div>';
      return;
    }

    host.className = "preview-result ok";
    host.innerHTML = \`
      <div class="kv"><strong>Resolved Recipe</strong><span>\${escapeHtml(resolved.recipe.label)} <code>\${escapeHtml(resolved.recipe.id)}</code></span></div>
      <div class="kv"><strong>Policy Revision</strong><span>\${escapeHtml(policy.version || "unknown")}</span></div>
      <div class="kv"><strong>Resolution Path</strong><span>\${resolved.matched ? "context-mapping" : "default-recipe"}</span></div>
      <div class="kv"><strong>Matched Mapping</strong><span>\${resolved.matched ? escapeHtml(resolved.matched.mapping.label) + ' <code>' + escapeHtml(resolved.matched.mapping.id) + '</code>' : "None · using default fallback"}</span></div>
      <div class="kv"><strong>Reason</strong><span>\${escapeHtml(resolved.matched ? resolved.matched.reason : (hasAnyInput ? "no mapping matched" : "enter a target or use a sample"))}</span></div>
      <div class="kv"><strong>Priority</strong><span>\${resolved.matched ? String(resolved.matched.mapping.priority) : "0"}</span></div>
    \`;
  }

  function quotaTone(state) {
    if (state === "blocked" || state === "paused") return "err";
    if (state === "almost_used") return "warn";
    return "ok";
  }

  function formatDateTime(value) {
    const ms = Date.parse(value || "");
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toLocaleString();
  }

  function renderQuotaLine(label, quota) {
    const windows = ensureObject(quota && quota.windows);
    const rolling = ensureObject(windows.rolling5h);
    const weekly = ensureObject(windows.weekly);
    const state = text(quota && quota.state) || "ok";
    return [
      '<div class="quota-line"><strong>' + escapeHtml(label) + '</strong><span><span class="mini-chip ' + quotaTone(state) + '">' + escapeHtml(state) + '</span></span></div>',
      '<div class="quota-line"><span>5h</span><span>' + Number(rolling.used || 0) + ' / ' + Number(rolling.limit || 0) + '</span></div>',
      '<div class="quota-line"><span>week</span><span>' + Number(weekly.used || 0) + ' / ' + Number(weekly.limit || 0) + '</span></div>',
    ].join("");
  }

  function renderDevicesTable(devices) {
    const body = $("devices-table-body");
    if (!devices.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="table-empty">No indexed devices yet. Devices appear after register or activate writes the device index.</div></td></tr>';
      return;
    }

    body.innerHTML = devices.map((device) => {
      const profiles = ensureObject(device.profiles);
      const limits = ensureObject(device.limits);
      const cohorts = Array.isArray(device.cohorts) ? device.cohorts : [];
      const status = text(device.status) || "unknown";
      const policySelect = loadedPolicyOptions.length
        ? '<select class="device-policy-select">' + loadedPolicyOptions.map((option) => {
            const id = text(option.policyId);
            const label = text(option.policyLabel) || id;
            return '<option value="' + escapeHtml(id) + '"' + (id === device.policyId ? ' selected' : '') + '>' + escapeHtml(label + ' (' + id + ')') + '</option>';
          }).join("") + '</select><button class="btn btn-secondary btn-xs btn-assign-policy" type="button">Apply</button>'
        : '<span class="field-hint">No policy options</span>';
      return [
        '<tr data-device-id="' + escapeHtml(device.deviceId) + '">',
        '<td><code>' + escapeHtml(device.deviceId) + '</code><br /><span class="field-hint">' + escapeHtml(device.installId || "") + '</span></td>',
        '<td><strong>' + escapeHtml(device.policyLabel || "—") + '</strong><br /><code>' + escapeHtml(device.policyId || "none") + '</code><div class="inline-controls" style="margin-top:8px;">' + policySelect + '</div></td>',
        '<td><div class="chip-row">' + (cohorts.length ? cohorts.map((cohort) => '<span class="mini-chip">' + escapeHtml(cohort) + '</span>').join("") : '<span class="mini-chip">none</span>') + '</div></td>',
        '<td><span class="mini-chip ' + (status === "active" ? "ok" : "err") + '">' + escapeHtml(status) + '</span></td>',
        '<td><div class="chip-row">' +
          '<span class="mini-chip">ui: ' + escapeHtml(profiles.uiProfile || "—") + '</span>' +
          '<span class="mini-chip">cap: ' + escapeHtml(profiles.capabilityProfile || "—") + '</span>' +
          '<span class="mini-chip">quota: ' + escapeHtml(profiles.quotaProfile || "fallback") + '</span>' +
          '<span class="mini-chip">llm: ' + escapeHtml(profiles.llmProfile || "—") + '</span>' +
          '<span class="mini-chip">defaults: ' + escapeHtml(profiles.settingsDefaultsProfile || "—") + '</span>' +
        '</div></td>',
        '<td><div class="quota-stack">' + renderQuotaLine("usage", limits.managedUsage) + renderQuotaLine("stt", limits.transcription) + renderQuotaLine("ai", limits.aiActions) + '</div></td>',
        '<td><span class="field-hint">' + escapeHtml(formatDateTime(device.lastSeenAt)) + '</span><br /><code>' + escapeHtml(device.lastSeenAt || "") + '</code></td>',
        '</tr>',
      ].join("");
    }).join("");
  }

  async function loadDevices(options) {
    const append = Boolean(options && options.append);
    setDevicesStatus("Loading devices…", "warn", "read-only");
    const cursorParam = append && devicesCursor ? "&cursor=" + encodeURIComponent(devicesCursor) : "";
    const payload = await adminFetch("/admin/control-plane/devices?limit=50" + cursorParam);
    const rows = Array.isArray(payload.devices) ? payload.devices : [];
    loadedPolicyOptions = Array.isArray(payload.policyOptions) ? payload.policyOptions : loadedPolicyOptions;
    loadedDevices = append ? loadedDevices.concat(rows) : rows;
    devicesCursor = payload.nextCursor || null;
    renderDevicesTable(loadedDevices);
    $("btn-load-more-devices").disabled = !devicesCursor;
    setDevicesStatus(
      loadedDevices.length + " device" + (loadedDevices.length === 1 ? "" : "s") + " loaded.",
      "ok",
      (payload.source || "default") + " · " + (payload.updatedAt || "unknown"),
    );
  }

  async function updateDevicePolicy(row, policyId) {
    const deviceId = text(row && row.dataset && row.dataset.deviceId);
    if (!deviceId || !policyId) return;
    setDevicesStatus("Updating device policy…", "warn", deviceId);
    const payload = await adminFetch("/admin/control-plane/devices/policy", {
      method: "POST",
      body: JSON.stringify({ deviceId, policyId }),
    });
    loadedPolicyOptions = Array.isArray(payload.policyOptions) ? payload.policyOptions : loadedPolicyOptions;
    if (payload.device) {
      const index = loadedDevices.findIndex((device) => device.deviceId === payload.device.deviceId);
      if (index >= 0) loadedDevices[index] = payload.device;
      else loadedDevices.unshift(payload.device);
    }
    renderDevicesTable(loadedDevices);
    setDevicesStatus("Device policy updated.", "ok", deviceId);
  }

  function currentPolicyFromEditor() {
    const raw = text(editor.value);
    return ensurePolicyShape(raw ? JSON.parse(raw) : RECOMMENDED_POLICY);
  }

  function writeEditor(policy) { editor.value = JSON.stringify(policy, null, 2); }

  // ── Apply policy → form ──
  function applyPolicyToForm(input) {
    const p = ensurePolicyShape(input);
    const defaults = ensureObject(p.userSettingsDefaults);
    const appearance = ensureObject(defaults.appearance);
    const general = ensureObject(defaults.general);
    const hotkeys = ensureObject(defaults.hotkeys);
    const transcript = ensureObject(defaults.transcript);
    const voice = ensureObject(defaults.voice);
    $("runtime-mode").value = text(p.runtimeMode) || "managed";
    $("transport-mode").value = text(p.transport.mode) || "proxy-only";
    for (const t of TARGETS) {
      const v = ensureObject(p.llm.targets[t]);
      $("target-" + t + "-provider").value = text(v.provider) || "groq";
      syncTargetSuggestions(t, { preserveValue: false });
      const ts = tsMap.get("target-" + t);
      if (ts) {
        const modelValue = text(v.model);
        if (modelValue && !ts.options[modelValue]) ts.addOption({ value: modelValue, text: modelValue });
        ts.setValue(modelValue || "", true);
      }
    }
    $("assistant-chat-prompt").value = text(p.assistant.chat.promptBase);
    $("assistant-quickchat-prompt").value = text(p.assistant.quickChat.promptBase);
    updateRuntimeHealthNotice(p);
    const trans = ensureObject(p.speech.transcription);
    $("speech-provider").value = text(trans.provider) || "groq";
    syncSpeechSuggestions({ preserveValue: false });
    const speechTs = tsMap.get("speech");
    if (speechTs) {
      const speechModel = text(trans.model);
      if (speechModel && !speechTs.options[speechModel]) speechTs.addOption({ value: speechModel, text: speechModel });
      speechTs.setValue(speechModel || "", true);
    }
    $("ui-hide-selectors").checked = Boolean(p.ui.hideProviderModelSelectors);
    $("defaults-theme-id").value = text(appearance.themeId) || "github-light";
    $("defaults-dock-skin").value = String(appearance.dockSkin === 1 || appearance.dockSkin === 2 ? appearance.dockSkin : 4);
    $("defaults-preferred-surface").value = text(general.preferredSurface) === "internal" ? "internal" : "alpha";
    $("defaults-ui-language").value = text(general.uiLanguage) === "es" || text(general.uiLanguage) === "en" ? text(general.uiLanguage) : "system";
    $("defaults-transcript-language").value = text(transcript.language);
    $("defaults-show-dock-on-startup").checked = general.showDockOnStartup === undefined ? true : Boolean(general.showDockOnStartup);
    $("defaults-start-with-windows").checked = Boolean(general.startWithWindows);
    $("defaults-onboarding-done").checked = Boolean(general.onboardingDone);
    $("defaults-hotkey-paste-last").value = text(hotkeys.pasteLast);
    $("defaults-hotkey-quick-chat").value = text(hotkeys.quickChat);
    $("defaults-hotkey-result-history").value = text(hotkeys.resultHistory);
    $("defaults-hotkey-picker").value = text(hotkeys.picker);
    $("defaults-hotkey-push-to-talk").value = text(hotkeys.pushToTalk);
    $("defaults-hotkey-stop-and-submit").value = text(hotkeys.stopAndSubmit);
    $("defaults-hotkey-toggle-assistant-mode").value = text(hotkeys.toggleAssistantMode);
    $("defaults-hotkey-toggle-enter").value = text(hotkeys.togglePressEnterAfterPaste);
    $("defaults-hotkey-voice-record").value = text(hotkeys.voiceRecord);
    $("defaults-assistant-wake-words").value = text(voice.assistantWakeWords);
    $("defaults-assistant-mode-toggle-words").value = text(voice.assistantModeToggleWords);
    $("defaults-command-wake-words").value = text(voice.commandWakeWords);
    $("defaults-mute-output-during-recording").checked = voice.muteOutputDuringRecording === undefined ? true : Boolean(voice.muteOutputDuringRecording);
    $("defaults-press-enter-after-paste").checked = Boolean(voice.pressEnterAfterPaste);
    $("defaults-show-quickchat-reasoning").checked = voice.showQuickChatReasoning === undefined ? true : Boolean(voice.showQuickChatReasoning);
    $("defaults-show-preset-reasoning").checked = Boolean(voice.showPresetReasoning);
  }

  // ── Collect form → policy ──
  function collectPolicyFromForm() {
    const policy = currentPolicyFromEditor();
    policy.userSettingsDefaults = ensureObject(policy.userSettingsDefaults);
    policy.runtimeMode = $("runtime-mode").value;
    policy.transport.mode = $("transport-mode").value;
    policy.assistant.chat.promptBase = text($("assistant-chat-prompt").value);
    policy.assistant.quickChat.promptBase = text($("assistant-quickchat-prompt").value);
    for (const t of TARGETS) {
      policy.llm.targets[t] = {
        ...ensureObject(policy.llm.targets[t]),
        provider: text($("target-" + t + "-provider").value) || "groq",
        model: text($("target-" + t + "-model").value),
      };
    }
    policy.speech.transcription = {
      ...ensureObject(policy.speech.transcription),
      provider: text($("speech-provider").value) || "groq",
      model: text($("speech-model").value),
    };
    policy.ui.hideProviderModelSelectors = Boolean($("ui-hide-selectors").checked);
    policy.userSettingsDefaults.appearance = {
      ...ensureObject(policy.userSettingsDefaults.appearance),
      themeId: text($("defaults-theme-id").value) || "github-light",
      dockSkin: Number($("defaults-dock-skin").value) === 1 || Number($("defaults-dock-skin").value) === 2 ? Number($("defaults-dock-skin").value) : 4,
    };
    policy.userSettingsDefaults.general = {
      ...ensureObject(policy.userSettingsDefaults.general),
      onboardingDone: Boolean($("defaults-onboarding-done").checked),
      showDockOnStartup: Boolean($("defaults-show-dock-on-startup").checked),
      startWithWindows: Boolean($("defaults-start-with-windows").checked),
      preferredSurface: $("defaults-preferred-surface").value === "internal" ? "internal" : "alpha",
      uiLanguage: ["system", "es", "en"].includes($("defaults-ui-language").value) ? $("defaults-ui-language").value : "system",
    };
    policy.userSettingsDefaults.hotkeys = {
      ...ensureObject(policy.userSettingsDefaults.hotkeys),
      pasteLast: text($("defaults-hotkey-paste-last").value),
      quickChat: text($("defaults-hotkey-quick-chat").value),
      resultHistory: text($("defaults-hotkey-result-history").value),
      picker: text($("defaults-hotkey-picker").value),
      pushToTalk: text($("defaults-hotkey-push-to-talk").value),
      stopAndSubmit: text($("defaults-hotkey-stop-and-submit").value),
      toggleAssistantMode: text($("defaults-hotkey-toggle-assistant-mode").value),
      togglePressEnterAfterPaste: text($("defaults-hotkey-toggle-enter").value),
      voiceRecord: text($("defaults-hotkey-voice-record").value),
    };
    policy.userSettingsDefaults.transcript = {
      ...ensureObject(policy.userSettingsDefaults.transcript),
      language: text($("defaults-transcript-language").value),
    };
    policy.userSettingsDefaults.voice = {
      ...ensureObject(policy.userSettingsDefaults.voice),
      muteOutputDuringRecording: Boolean($("defaults-mute-output-during-recording").checked),
      pressEnterAfterPaste: Boolean($("defaults-press-enter-after-paste").checked),
      showQuickChatReasoning: Boolean($("defaults-show-quickchat-reasoning").checked),
      showPresetReasoning: Boolean($("defaults-show-preset-reasoning").checked),
      assistantWakeWords: text($("defaults-assistant-wake-words").value),
      assistantModeToggleWords: text($("defaults-assistant-mode-toggle-words").value),
      commandWakeWords: text($("defaults-command-wake-words").value),
    };
    return policy;
  }

  function syncJsonFromForm() { const p = collectPolicyFromForm(); writeEditor(p); setDirtyState(true); updateRuntimeHealthNotice(p); return p; }
  function syncFormFromJson() { const p = currentPolicyFromEditor(); applyPolicyToForm(p); setDirtyState(true); updateRuntimeHealthNotice(p); return p; }
  function formatJson() { writeEditor(currentPolicyFromEditor()); }

  // ── API operations ──
  async function loadPolicy() {
    setStatus("Loading policy…", "warn");
    const payload = await adminFetch("/admin/control-plane/policy");
    const policy = ensurePolicyShape(payload.policy);
    applyPolicyToForm(policy);
    writeEditor(policy);
    await refreshAllProviderModels();
    statusMeta.textContent = payload.source + " · " + payload.updatedAt;
    setDirtyState(false);
    setStatus("Policy loaded successfully", "ok");
  }

  async function loadRecipePolicy() {
    const payload = await adminFetch("/admin/control-plane/recipe-policy");
    const policy = ensureRecipePolicyShape(payload.policy);
    applyRecipePolicyToForm(policy);
    writeRecipeEditor(policy);
    return payload;
  }

  async function loadAllPolicies() {
    setStatus("Loading runtime, recipe policy, and devices…", "warn");
    const [runtimePayload, recipePayload, devicesPayload] = await Promise.all([
      adminFetch("/admin/control-plane/policy"),
      adminFetch("/admin/control-plane/recipe-policy"),
      adminFetch("/admin/control-plane/devices?limit=50"),
    ]);
    const runtimePolicy = ensurePolicyShape(runtimePayload.policy);
    const recipePolicy = ensureRecipePolicyShape(recipePayload.policy);
    applyPolicyToForm(runtimePolicy);
    writeEditor(runtimePolicy);
    applyRecipePolicyToForm(recipePolicy);
    writeRecipeEditor(recipePolicy);
    loadedDevices = Array.isArray(devicesPayload.devices) ? devicesPayload.devices : [];
    loadedPolicyOptions = Array.isArray(devicesPayload.policyOptions) ? devicesPayload.policyOptions : [];
    devicesCursor = devicesPayload.nextCursor || null;
    renderDevicesTable(loadedDevices);
    $("btn-load-more-devices").disabled = !devicesCursor;
    setDevicesStatus(
      loadedDevices.length + " device" + (loadedDevices.length === 1 ? "" : "s") + " loaded.",
      "ok",
      (devicesPayload.source || "default") + " · " + (devicesPayload.updatedAt || "unknown"),
    );
    await refreshAllProviderModels();
    statusMeta.textContent = "Runtime " + runtimePayload.source + " · " + runtimePayload.updatedAt + " / Recipes " + recipePayload.source + " · " + recipePayload.updatedAt;
    setDirtyState(false);
    setStatus("Runtime, recipe policy, and devices loaded successfully", "ok");
  }

  async function savePolicy(policy) {
    const payload = await adminFetch("/admin/control-plane/policy", { method: "POST", body: JSON.stringify(policy) });
    const stored = ensurePolicyShape(payload.policy);
    applyPolicyToForm(stored);
    writeEditor(stored);
    statusMeta.textContent = "Saved " + payload.updatedAt;
    setDirtyState(false);
    setStatus("Changes saved to the control plane", "ok");
  }

  async function saveRecipePolicy(policy) {
    const payload = await adminFetch("/admin/control-plane/recipe-policy", { method: "POST", body: JSON.stringify(policy) });
    const stored = ensureRecipePolicyShape(payload.policy);
    applyRecipePolicyToForm(stored);
    writeRecipeEditor(stored);
    statusMeta.textContent = "Recipes saved " + payload.updatedAt;
    setDirtyState(false);
    setStatus("Recipe changes saved to the control plane", "ok");
  }

  async function saveForm() { await savePolicy(syncJsonFromForm()); }
  async function saveJson() { await savePolicy(syncFormFromJson()); }
  async function saveRecipeForm() { await saveRecipePolicy(syncRecipeJsonFromForm()); }
  async function saveRecipeJson() { await saveRecipePolicy(syncRecipeFormFromJson()); }

  async function resetPolicy() {
    if (!window.confirm("Reset global runtime policy to Worker default? This cannot be undone.")) return;
    setStatus("Resetting policy…", "warn");
    const payload = await adminFetch("/admin/control-plane/policy/reset", { method: "POST", body: "{}" });
    const policy = ensurePolicyShape(payload.policy);
    applyPolicyToForm(policy);
    writeEditor(policy);
    statusMeta.textContent = "Reset " + payload.updatedAt;
    setDirtyState(false);
    setStatus("Policy reset to Worker default", "ok");
  }

  async function resetRecipePolicy() {
    if (!window.confirm("Reset global recipe policy to Worker default? This cannot be undone.")) return;
    setStatus("Resetting recipe policy…", "warn");
    const payload = await adminFetch("/admin/control-plane/recipe-policy/reset", { method: "POST", body: "{}" });
    const policy = ensureRecipePolicyShape(payload.policy);
    applyRecipePolicyToForm(policy);
    writeRecipeEditor(policy);
    statusMeta.textContent = "Recipes reset " + payload.updatedAt;
    setDirtyState(false);
    setStatus("Recipe policy reset to Worker default", "ok");
  }

  function applyAlphaTemplate() {
    const policy = ensurePolicyShape(RECOMMENDED_POLICY);
    const recipePolicy = ensureRecipePolicyShape(RECOMMENDED_RECIPE_POLICY);
    applyPolicyToForm(policy);
    writeEditor(policy);
    applyRecipePolicyToForm(recipePolicy);
    writeRecipeEditor(recipePolicy);
    setDirtyState(true);
    setStatus("Alpha preset loaded locally. Review it and save changes when ready.", "warn");
    refreshAllProviderModels().catch(() => {});
  }

  function initializeRecipePolicyForm() {
    $("recipe-policy-version").addEventListener("input", () => { try { syncRecipeJsonFromForm(); } catch {} });
    $("recipe-default-id").addEventListener("change", () => { try { syncRecipeJsonFromForm(); } catch {} });
    $("recipe-items").addEventListener("input", () => { try { syncRecipeJsonFromForm(); } catch {} });
    $("recipe-items").addEventListener("change", () => { try { syncRecipeJsonFromForm(); } catch {} });
    $("mapping-items").addEventListener("input", () => { try { syncRecipeJsonFromForm(); } catch {} });
    $("mapping-items").addEventListener("change", () => { try { syncRecipeJsonFromForm(); } catch {} });
    ["preview-process-name", "preview-process-path", "preview-window-title", "preview-window-class"].forEach((id) => {
      $(id).addEventListener("input", () => { try { renderRecipePreview(); } catch {} });
    });

    $("recipe-items").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='remove-recipe']");
      if (!button) return;
      const recipeId = button.dataset.id;
      const policy = collectRecipePolicyFromForm();
      policy.recipes = policy.recipes.filter((recipe) => recipe.id !== recipeId);
      policy.contextMappings = policy.contextMappings.filter((mapping) => mapping.recipeId !== recipeId);
      if (policy.defaultRecipeId === recipeId) {
        policy.defaultRecipeId = text(policy.recipes[0] && policy.recipes[0].id);
      }
      applyRecipePolicyToForm(policy);
      writeRecipeEditor(policy);
      setDirtyState(true);
    });

    $("mapping-items").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='remove-mapping']");
      if (!button) return;
      const mappingId = button.dataset.id;
      const policy = collectRecipePolicyFromForm();
      policy.contextMappings = policy.contextMappings.filter((mapping) => mapping.id !== mappingId);
      applyRecipePolicyToForm(policy);
      writeRecipeEditor(policy);
      setDirtyState(true);
    });

    $("btn-add-recipe").addEventListener("click", () => {
      const policy = collectRecipePolicyFromForm();
      const nextRecipe = ensureRecipeShape({
        id: makeRecipeId("recipe"),
        label: "New Recipe",
        sttPrompt: "",
        postProcessPrompt: "",
        controls: defaultRecipeControls(),
      });
      policy.recipes.push(nextRecipe);
      if (!text(policy.defaultRecipeId)) policy.defaultRecipeId = nextRecipe.id;
      applyRecipePolicyToForm(policy);
      writeRecipeEditor(policy);
      setDirtyState(true);
    });

    $("btn-add-mapping").addEventListener("click", () => {
      const policy = collectRecipePolicyFromForm();
      const fallbackRecipeId = text(policy.defaultRecipeId) || text(policy.recipes[0] && policy.recipes[0].id);
      policy.contextMappings.push(ensureMappingShape({
        id: makeRecipeId("mapping"),
        label: "New Mapping",
        enabled: true,
        priority: 0,
        recipeId: fallbackRecipeId,
        match: {
          all: [],
          any: [],
        },
      }));
      applyRecipePolicyToForm(policy);
      writeRecipeEditor(policy);
      setDirtyState(true);
    });

    $("btn-preview-slack").addEventListener("click", () => {
      $("preview-process-name").value = "slack.exe";
      $("preview-process-path").value = "C:\\\\Program Files\\\\Slack\\\\slack.exe";
      $("preview-window-title").value = "juan-pablo | Slack";
      $("preview-window-class").value = "Chrome_WidgetWin_1";
      renderRecipePreview();
    });

    $("btn-preview-email").addEventListener("click", () => {
      $("preview-process-name").value = "outlook.exe";
      $("preview-process-path").value = "C:\\\\Program Files\\\\Microsoft Office\\\\root\\\\Office16\\\\OUTLOOK.EXE";
      $("preview-window-title").value = "Inbox - Outlook";
      $("preview-window-class").value = "rctrl_renwnd32";
      renderRecipePreview();
    });

    $("btn-preview-code").addEventListener("click", () => {
      $("preview-process-name").value = "code.exe";
      $("preview-process-path").value = "C:\\\\Users\\\\jp\\\\AppData\\\\Local\\\\Programs\\\\Microsoft VS Code\\\\Code.exe";
      $("preview-window-title").value = "control-plane-admin-page.ts - Visual Studio Code";
      $("preview-window-class").value = "Chrome_WidgetWin_1";
      renderRecipePreview();
    });

    $("btn-preview-clear").addEventListener("click", () => {
      $("preview-process-name").value = "";
      $("preview-process-path").value = "";
      $("preview-window-title").value = "";
      $("preview-window-class").value = "";
      renderRecipePreview();
    });
  }

  // ── Initialize form ──
  function initializeForm() {
    for (const t of TARGETS) {
      fillSelect($("target-" + t + "-provider"), LLM_PROVIDERS);
      const ts = new TomSelect("#target-" + t + "-model", {
        allowEmptyOption: true,
        closeAfterSelect: true,
        create: function (input) {
          const value = text(input);
          return value ? { value, text: value } : false;
        },
        createOnBlur: true,
        maxItems: 1,
        persist: true,
        plugins: {
          clear_button: { title: "Clear model selection" },
        },
        render: {
          no_results: function (data, escape) {
            return '<div class="no-results">No matching models. Press Enter to use <strong>' + escape(data.input) + "</strong>.</div>";
          },
          option_create: function (data, escape) {
            return '<div class="create">Use custom model ID <strong>' + escape(data.input) + "</strong></div>";
          },
        },
        onChange: () => { syncJsonFromForm(); },
      });
      ts.wrapper.classList.add("ts-dark");
      tsMap.set("target-" + t, ts);
      syncTargetSuggestions(t, { preserveValue: false });
      $("target-" + t + "-provider").addEventListener("change", async function () {
        syncTargetSuggestions(t, { preserveValue: false });
        syncJsonFromForm();
        await refreshProviderModels($("target-" + t + "-provider").value).catch(() => {});
      });
    }
    fillSelect($("speech-provider"), SPEECH_PROVIDERS);
    const speechTs = new TomSelect("#speech-model", {
      allowEmptyOption: true,
      closeAfterSelect: true,
      create: function (input) {
        const value = text(input);
        return value ? { value, text: value } : false;
      },
      createOnBlur: true,
      maxItems: 1,
      persist: true,
      plugins: {
        clear_button: { title: "Clear speech model selection" },
      },
      render: {
        no_results: function (data, escape) {
          return '<div class="no-results">No matching speech models. Press Enter to use <strong>' + escape(data.input) + "</strong>.</div>";
        },
        option_create: function (data, escape) {
          return '<div class="create">Use custom speech model ID <strong>' + escape(data.input) + "</strong></div>";
        },
      },
      onChange: () => { syncJsonFromForm(); },
    });
    speechTs.wrapper.classList.add("ts-dark");
    tsMap.set("speech", speechTs);
    syncSpeechSuggestions({ preserveValue: false });
    $("speech-provider").addEventListener("change", async function () {
      syncSpeechSuggestions({ preserveValue: false });
      syncJsonFromForm();
      await refreshProviderModels($("speech-provider").value).catch(() => {});
    });

    // Live sync on non-TomSelect inputs
    document.querySelectorAll("select, textarea, input").forEach((el) => {
      if (["base-url", "admin-token", "policy-editor"].includes(el.id)) return;
      if (el.tomSelect) return;
      el.addEventListener("change", () => { try { syncJsonFromForm(); } catch {} });
      if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type !== "checkbox")) {
        el.addEventListener("input", () => { try { syncJsonFromForm(); } catch {} });
      }
    });
  }

  // ── Wire buttons ──
  $("btn-save-conn").addEventListener("click", () => {
    saveState();
    setStatus(state.token ? "Admin access remembered on this browser." : "Enter a token before remembering access.", state.token ? "ok" : "warn");
  });
  $("btn-load").addEventListener("click", () => { unlockAdmin().catch(() => {}); });
  $("btn-reload").addEventListener("click", () => {
    setStatus("Reloading current server policy…", "warn");
    loadAllPolicies().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err"));
  });
  $("btn-alpha").addEventListener("click", () => { applyAlphaTemplate(); });
  $("btn-refresh-models").addEventListener("click", (e) => { e.preventDefault(); refreshAllProviderModels().catch(() => {}); });

  $("btn-save-runtime").addEventListener("click", () => { saveForm().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err")); });
  $("btn-save-llm").addEventListener("click", () => { saveForm().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err")); });
  $("btn-save-speech").addEventListener("click", () => { saveForm().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err")); });
  $("btn-save-recipes").addEventListener("click", () => { saveRecipeForm().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err")); });
  $("btn-save-ui").addEventListener("click", () => { saveForm().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err")); });
  $("btn-save-json").addEventListener("click", () => { try { formatJson(); } catch {} saveJson().catch((e) => setStatus(messageFromAdminError(e, baseUrlInput.value), "err")); });
  $("btn-reset-json").addEventListener("click", () => { resetPolicy().catch((e) => setStatus(e.message, "err")); });
  $("btn-format-json").addEventListener("click", () => { try { formatJson(); setStatus("JSON formatted", "ok"); } catch {} });
  $("btn-sync-from-form").addEventListener("click", () => { try { syncJsonFromForm(); setStatus("JSON updated from form", "ok"); } catch {} });
  $("btn-sync-to-form").addEventListener("click", () => { try { syncFormFromJson(); setStatus("Form updated from JSON", "ok"); } catch {} });
  $("btn-save-recipe-json").addEventListener("click", () => { try { formatRecipeJson(); } catch {} saveRecipeJson().catch((e) => setStatus(e.message, "err")); });
  $("btn-reset-recipe-json").addEventListener("click", () => { resetRecipePolicy().catch((e) => setStatus(e.message, "err")); });
  $("btn-format-recipe-json").addEventListener("click", () => { try { formatRecipeJson(); setStatus("Recipe JSON formatted", "ok"); } catch {} });
  $("btn-sync-recipe-from-form").addEventListener("click", () => { try { syncRecipeJsonFromForm(); setStatus("Recipe JSON updated from form", "ok"); } catch {} });
  $("btn-sync-recipe-to-form").addEventListener("click", () => { try { syncRecipeFormFromJson(); setStatus("Recipe form updated from JSON", "ok"); } catch {} });
  $("btn-refresh-devices").addEventListener("click", () => { loadDevices().catch((e) => setDevicesStatus(messageFromAdminError(e, baseUrlInput.value), "err", "read-only")); });
  $("btn-load-more-devices").addEventListener("click", () => { loadDevices({ append: true }).catch((e) => setDevicesStatus(messageFromAdminError(e, baseUrlInput.value), "err", "read-only")); });
  $("devices-table-body").addEventListener("click", (event) => {
    const button = event.target && event.target.closest ? event.target.closest(".btn-assign-policy") : null;
    if (!button) return;
    const row = button.closest("tr");
    const select = row ? row.querySelector(".device-policy-select") : null;
    updateDevicePolicy(row, select ? select.value : "").catch((e) => setDevicesStatus(messageFromAdminError(e, baseUrlInput.value), "err", "policy assignment"));
  });

  // ── Init ──
  window.addEventListener("DOMContentLoaded", () => {
    buildLlmTargetsGrid();
    initNav();
    initializeForm();
    initializeRecipePolicyForm();
    setDirtyState(false);
    if (state.token) {
      unlockAdmin().catch(() => {});
    } else {
      setStatus("Paste your admin access token once, then unlock the admin to load the current server policy.", "warn");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  </script>
</body>
</html>`;

  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
