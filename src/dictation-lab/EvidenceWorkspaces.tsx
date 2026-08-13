import { useEffect, useMemo, useState } from "react";

import type { DictationLabClient, DictationLabRunDetail } from "./client";
import type {
  LabArtifactIndex,
  LabCandidateSummary,
  LabHumanVerdictMutation,
  LabMetricValue,
  LabRunSummary,
  LabSampleSummary,
} from "./types";

export type EvidenceArtifactState = {
  index: LabArtifactIndex | null;
  loading: boolean;
  error: string;
};

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
type TextKind = "raw" | "final" | "gold";
type MetricKey = "coverage" | "wer" | "cer" | "entityAccuracy" | "structureAccuracy" | "semanticSafety" | "latency" | "cost" | "fallbackCount";
type SortKey = "rank" | MetricKey | "label";
type VerdictReceipt = { ok: true; revision: number; summary: { runId: string; sampleId: string; candidateId: string; verdict: string; contentHash: string } };
type EvidenceClient = Pick<DictationLabClient, "loadRun" | "loadSample" | "readPrivateText" | "resolveAudio" | "recordVerdict">;

const FAMILY_DEFINITIONS = [
  { id: "provider-free", label: "Provider-free replay", terms: ["provider-free", "provider_free", "replay"] },
  { id: "product-baseline", label: "Product baseline", terms: ["product-baseline", "product_baseline", "baseline"] },
  { id: "gate-a", label: "Gate A", terms: ["gate-a", "gate_a", "gatea"] },
  { id: "gate-b", label: "Gate B", terms: ["gate-b", "gate_b", "gateb"] },
  { id: "tauri-parity", label: "Tauri parity", terms: ["tauri-parity", "tauri_parity", "parity"] },
  { id: "everyday-prototype", label: "Everyday prototype", terms: ["everyday", "prototype"] },
  { id: "vocabulary-replay", label: "Vocabulary replay", terms: ["vocabulary", "vocab"] },
] as const;

function toneForAvailability(status: "available" | "partial" | "unavailable"): Tone {
  return status === "available" ? "success" : status === "partial" ? "warning" : "neutral";
}

function Status({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className="lab-status-chip" data-tone={tone}>{label}</span>;
}

function message(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "The evidence operation is unavailable.";
}

function metricText(metric: LabMetricValue): string {
  if (metric.value === null) return "Not observed";
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.unit === "milliseconds") return `${metric.value.toFixed(0)} ms`;
  if (metric.unit === "usd") return `$${metric.value.toFixed(4)}`;
  return metric.value.toFixed(0);
}

function rawMetric(metric: LabMetricValue): number | null {
  return metric.availability.status === "available" ? metric.value : null;
}

function metricDelta(candidate: LabMetricValue, baseline: LabMetricValue): string {
  const value = rawMetric(candidate);
  const base = rawMetric(baseline);
  if (value === null || base === null) return "—";
  const delta = value - base;
  if (candidate.unit === "ratio") return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pp`;
  if (candidate.unit === "milliseconds") return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)} ms`;
  if (candidate.unit === "usd") return `${delta >= 0 ? "+" : ""}$${delta.toFixed(4)}`;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`;
}

function runTimestamp(run: LabRunSummary): number {
  return Date.parse(run.completedAt ?? run.startedAt ?? "") || 0;
}

function valueAt(candidate: LabCandidateSummary, key: MetricKey): number | null {
  return rawMetric(candidate[key]);
}

function rankCandidates(candidates: readonly LabCandidateSummary[]): Map<string, number> {
  const keys: Array<Exclude<SortKey, "rank" | "label">> = ["coverage", "wer", "cer", "entityAccuracy", "structureAccuracy", "semanticSafety", "latency", "cost", "fallbackCount"];
  const scores = new Map<string, number>();
  const ranges = new Map<string, { min: number; max: number }>();
  for (const key of keys) {
    const values = candidates.map((candidate) => valueAt(candidate, key)).filter((value): value is number => value !== null);
    if (!values.length) continue;
    ranges.set(key, { min: Math.min(...values), max: Math.max(...values) });
  }
  for (const candidate of candidates) {
    const normalized: number[] = [];
    for (const key of keys) {
      const value = valueAt(candidate, key);
      const range = ranges.get(key);
      if (value === null || !range) continue;
      const span = range.max - range.min;
      const higherIsBetter = key === "coverage" || key === "entityAccuracy" || key === "structureAccuracy" || key === "semanticSafety";
      const percentile = span === 0 ? 1 : (value - range.min) / span;
      normalized.push(higherIsBetter ? percentile : 1 - percentile);
    }
    scores.set(candidate.candidateId, normalized.length ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length : Number.NEGATIVE_INFINITY);
  }
  return scores;
}

function readSampleIds(detail: DictationLabRunDetail): string[] {
  const run = detail.run;
  const values = run.sampleIds;
  if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string").slice(0, 128);
  const samples = run.samples;
  if (Array.isArray(samples)) return samples.flatMap((value) => typeof value === "object" && value && !Array.isArray(value) && typeof value.sampleId === "string" ? [value.sampleId] : []).slice(0, 128);
  return [];
}

function metricFilterValues(samples: readonly LabSampleSummary[], key: "categories" | "difficulty"): string[] {
  return Array.from(new Set(samples.flatMap((sample) => key === "categories" ? sample.categories : [sample.difficulty]).filter(Boolean))).sort();
}

export function EvidenceOverviewWorkspace({ artifacts, localRunCount = 0 }: { artifacts: EvidenceArtifactState; localRunCount?: number }) {
  const runs = artifacts.index?.runs ?? [];
  const familyRows = FAMILY_DEFINITIONS.map((family) => {
    const matches = runs.filter((run) => {
      const haystack = `${run.runId} ${run.corpusId}`.toLowerCase();
      return family.terms.some((term) => haystack.includes(term));
    });
    const missing = matches.flatMap((run) => run.availability.missing).filter((value, index, values) => values.indexOf(value) === index).slice(0, 4);
    return { ...family, matches, status: matches.length && matches.every((run) => run.availability.status === "available") ? "available" as const : "partial" as const, missing: matches.length ? missing : ["No matching indexed run"] };
  });
  return <div className="lab-workspace-content">
    <header className="lab-page-heading"><div><h2>Evidence overview</h2><p>Canonical run families and readiness are shown without inventing missing measurements.</p></div><Status label={artifacts.index?.availability.status ?? "unavailable"} tone={artifacts.index ? toneForAvailability(artifacts.index.availability.status) : "neutral"} /></header>
    <dl className="lab-summary-strip" aria-label="Evidence summary"><div><dt>Indexed runs</dt><dd>{artifacts.index ? runs.length : "—"}</dd></div><div><dt>Completed runs</dt><dd>{artifacts.index ? runs.filter((run) => run.status === "completed").length : "—"}</dd></div><div><dt>Corpora</dt><dd>{artifacts.index ? artifacts.index.corpora.length : "—"}</dd></div><div><dt>Partial artifacts</dt><dd>{artifacts.index ? runs.filter((run) => run.availability.status !== "available").length : "—"}</dd></div><div><dt>Local replay inputs</dt><dd>{localRunCount}</dd></div></dl>
    {artifacts.loading ? <section className="lab-state-panel" data-tone="info"><h3>Reading canonical artifacts</h3><p>Counts remain unknown until the local artifact index responds.</p></section> : artifacts.error ? <section className="lab-state-panel" data-tone="danger"><h3>Artifact index unavailable</h3><p>{artifacts.error} No example evidence was substituted.</p></section> : null}
    <section className="lab-panel" aria-labelledby="evidence-family-title"><div className="lab-section-heading"><div><h3 id="evidence-family-title">Structured run families</h3><p>Specialized families remain visible when only partial artifacts are present.</p></div><span>{familyRows.length} tracked</span></div><div className="lab-evidence-family-list">{familyRows.map((family) => <div key={family.id}><div><strong>{family.label}</strong><small>{family.matches.length ? `${family.matches.length} indexed run${family.matches.length === 1 ? "" : "s"}` : "No indexed run matched"}</small></div><div><Status label={family.status} tone={toneForAvailability(family.status)} />{family.missing.length ? <small>{family.missing.join(", ")}</small> : null}</div></div>)}</div></section>
    <section className="lab-panel"><div className="lab-section-heading"><div><h3>Recent canonical runs</h3><p>Newest completion timestamp first, then stable run ID.</p></div><span>{runs.length}</span></div>{runs.length ? <div className="lab-compact-list">{runs.slice().sort((a, b) => runTimestamp(b) - runTimestamp(a) || a.runId.localeCompare(b.runId)).slice(0, 8).map((run) => <div key={run.runId}><div><strong>{run.runId}</strong><span>{run.corpusId} · {run.candidateCount} candidates</span></div><div><Status label={run.availability.status} tone={toneForAvailability(run.availability.status)} /><time>{run.completedAt ?? run.startedAt ?? "No timestamp"}</time></div></div>)}</div> : <p className="lab-empty">No canonical runs are indexed.</p>}</section>
  </div>;
}

export function EvidenceResultsWorkspace({ artifacts, client, selectedRun: controlledRun = null, onSelectRun }: { artifacts: EvidenceArtifactState; client: EvidenceClient; selectedRun?: LabRunSummary | null; onSelectRun?: (run: LabRunSummary) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [localRun, setLocalRun] = useState<LabRunSummary | null>(controlledRun);
  const [runDetail, setRunDetail] = useState<DictationLabRunDetail | null>(null);
  const [baselineId, setBaselineId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [descending, setDescending] = useState(false);
  const [samples, setSamples] = useState<LabSampleSummary[]>([]);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [privateText, setPrivateText] = useState<Record<string, string>>({});
  const [textLoading, setTextLoading] = useState<string | null>(null);
  const [audio, setAudio] = useState<Record<string, { available: boolean; kind: "audio"; mimeType: string; bytes: number; audioId: string; readable: boolean }>>({});
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Record<string, LabHumanVerdictMutation["verdict"] | "">>({});
  const [revision, setRevision] = useState<Record<string, number | null>>({});
  const [verdictNotice, setVerdictNotice] = useState<Record<string, string>>({});

  useEffect(() => { setLocalRun(controlledRun); }, [controlledRun]);
  const runs = useMemo(() => (artifacts.index?.runs ?? []).filter((run) => (!query || `${run.runId} ${run.corpusId}`.toLowerCase().includes(query.toLowerCase())) && (status === "all" || run.status === status)).sort((a, b) => runTimestamp(b) - runTimestamp(a) || a.runId.localeCompare(b.runId)), [artifacts.index, query, status]);
  const run = localRun;
  const candidates = run?.candidates ?? [];
  const scores = useMemo(() => rankCandidates(candidates), [candidates]);
  const sortedCandidates = useMemo(() => candidates.slice().sort((a, b) => {
    let result = 0;
    if (sortKey === "rank") result = (scores.get(a.candidateId) ?? Number.NEGATIVE_INFINITY) - (scores.get(b.candidateId) ?? Number.NEGATIVE_INFINITY);
    else if (sortKey === "label") result = a.label.localeCompare(b.label) || a.candidateId.localeCompare(b.candidateId);
    else result = (valueAt(a, sortKey) ?? Number.POSITIVE_INFINITY) - (valueAt(b, sortKey) ?? Number.POSITIVE_INFINITY);
    return (descending ? -result : result) || a.candidateId.localeCompare(b.candidateId);
  }), [candidates, descending, scores, sortKey]);
  const baseline = candidates.find((candidate) => candidate.candidateId === baselineId) ?? candidates[0] ?? null;
  const sampleCategories = metricFilterValues(samples, "categories");
  const sampleDifficulties = metricFilterValues(samples, "difficulty");
  const visibleSamples = samples.filter((sample) => (category === "all" || sample.categories.includes(category)) && (difficulty === "all" || sample.difficulty === difficulty));

  function chooseRun(next: LabRunSummary) {
    setLocalRun(next);
    setRunDetail(null);
    setBaselineId(next.candidates[0]?.candidateId ?? "");
    setSamples([]);
    setSampleError("");
    setPrivateText({});
    setAudio({});
    onSelectRun?.(next);
  }

  async function loadSamples(candidateId: string) {
    if (!run) return;
    const key = `${run.runId}:${candidateId}`;
    setSampleLoading(key);
    setSampleError("");
    try {
      const detail = runDetail ?? await client.loadRun(run.runId);
      setRunDetail(detail);
      const sampleIds = readSampleIds(detail);
      if (!sampleIds.length) { setSamples([]); setSampleError("Sample IDs are not available in this run's public detail."); return; }
      const loaded = await Promise.all(sampleIds.map((sampleId) => client.loadSample(run.runId, sampleId, candidateId).catch(() => null)));
      setSamples((current) => [...current.filter((sample) => sample.candidateId !== candidateId), ...loaded.filter((sample): sample is LabSampleSummary => sample !== null)]);
    } catch (error) { setSampleError(message(error)); }
    finally { setSampleLoading(null); }
  }

  async function readText(sample: LabSampleSummary, kind: TextKind) {
    const key = `${sample.runId}:${sample.sampleId}:${sample.candidateId}:${kind}`;
    setTextLoading(key);
    try {
      const text = await client.readPrivateText(sample.runId, sample.sampleId, sample.candidateId, kind);
      setPrivateText((current) => ({ ...current, [key]: text }));
    } catch (error) {
      setPrivateText((current) => ({ ...current, [key]: message(error) }));
    } finally {
      setTextLoading(null);
    }
  }

  async function checkAudio(sample: LabSampleSummary) {
    const key = `${sample.runId}:${sample.sampleId}:${sample.candidateId}`;
    setAudioLoading(key);
    try {
      const capability = await client.resolveAudio(sample.runId, sample.sampleId, sample.candidateId);
      setAudio((current) => ({ ...current, [key]: capability }));
    } catch {
      setAudio((current) => ({ ...current, [key]: { available: false, kind: "audio", mimeType: "", bytes: 0, audioId: "", readable: false } }));
    } finally {
      setAudioLoading(null);
    }
  }

  async function saveVerdict(sample: LabSampleSummary) {
    const value = verdict[`${sample.runId}:${sample.sampleId}:${sample.candidateId}`];
    if (!value) return;
    const key = `${sample.runId}:${sample.sampleId}:${sample.candidateId}`;
    try {
      const receipt: VerdictReceipt = await client.recordVerdict({ runId: sample.runId, sampleId: sample.sampleId, candidateId: sample.candidateId, verdict: value, expectedRevision: revision[key] ?? null });
      setRevision((current) => ({ ...current, [key]: receipt.revision }));
      setVerdictNotice((current) => ({ ...current, [key]: `Saved revision ${receipt.revision}. Hash ${receipt.summary.contentHash}` }));
    } catch (error) { setVerdictNotice((current) => ({ ...current, [key]: message(error) })); }
  }

  return <div className="lab-workspace-content">
    <header className="lab-page-heading"><div><h2>Results</h2><p>Compare every indexed candidate. Missing metrics remain unavailable and never become zero.</p></div><span className="lab-result-count">{runs.length} shown</span></header>
    <div className="lab-filter-bar" role="search" aria-label="Filter evidence runs"><label><span>Find run</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Run or corpus ID" /></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="all">All statuses</option>{["planned", "running", "completed", "failed", "cancelled"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {artifacts.loading ? <section className="lab-state-panel" data-tone="info"><h3>Reading results</h3><p>Run summaries will appear after the canonical index responds.</p></section> : artifacts.error ? <section className="lab-state-panel" data-tone="danger"><h3>Results unavailable</h3><p>{artifacts.error} No production result was fabricated.</p></section> : <div className="lab-split-layout"><section className="lab-panel"><div className="lab-section-heading"><div><h3>Indexed runs</h3><p>Select a run to compare candidates.</p></div><span>{runs.length}</span></div>{runs.length ? <div className="lab-compact-list">{runs.map((item) => <div key={item.runId}><div><button type="button" className="lab-link-button" onClick={() => chooseRun(item)}><strong>{item.runId}</strong></button><span>{item.corpusId} · {item.resultCount} results</span></div><div><Status label={item.status} tone={item.status === "completed" ? "success" : item.status === "failed" ? "danger" : "neutral"} /><Status label={item.availability.status} tone={toneForAvailability(item.availability.status)} /></div></div>)}</div> : <p className="lab-empty">No runs match the current filters.</p>}</section><section className="lab-panel"><div className="lab-section-heading"><div><h3>Candidate comparison</h3><p>{run ? `${run.runId} · deterministic rank uses available dimensions only` : "Choose a run first."}</p></div>{run ? <Status label={run.availability.status} tone={toneForAvailability(run.availability.status)} /> : null}</div>{run?.availability.missing.length ? <p className="lab-partial-note">Missing evidence: {run.availability.missing.join(", ")}. Candidate nulls are preserved.</p> : null}{run ? <><div className="lab-filter-bar"><label><span>Baseline</span><select value={baseline?.candidateId ?? ""} onChange={(event) => setBaselineId(event.currentTarget.value)}>{candidates.map((candidate) => <option key={candidate.candidateId} value={candidate.candidateId}>{candidate.label}</option>)}</select></label><label><span>Sort</span><select value={sortKey} onChange={(event) => setSortKey(event.currentTarget.value as SortKey)}><option value="rank">Deterministic rank</option><option value="coverage">Coverage</option><option value="wer">WER</option><option value="cer">CER</option><option value="latency">Latency</option><option value="cost">Cost</option><option value="label">Candidate</option></select></label><label><span>Order</span><select value={descending ? "desc" : "asc"} onChange={(event) => setDescending(event.currentTarget.value === "desc")}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div><div className="lab-table-region" tabIndex={0} role="region" aria-label={`Candidates for ${run.runId}`}><table className="lab-data-table lab-candidate-table"><thead><tr><th>Rank</th><th>Candidate</th><th>Coverage</th><th>WER</th><th>CER</th><th>Entities</th><th>Structure</th><th>Safety</th><th>Latency</th><th>Cost</th><th>Samples</th></tr></thead><tbody>{sortedCandidates.map((candidate, index) => <tr key={candidate.candidateId}><td>{index + 1}</td><th scope="row"><strong>{candidate.label}</strong><small>{candidate.candidateId}</small>{candidate.regressionReasons.length ? <small className="lab-regression-flag">Regression: {candidate.regressionReasons.join(", ")}</small> : null}</th><td>{metricText(candidate.coverage)}<small>{baseline ? metricDelta(candidate.coverage, baseline.coverage) : "—"}</small></td><td>{metricText(candidate.wer)}<small>{baseline ? metricDelta(candidate.wer, baseline.wer) : "—"}</small></td><td>{metricText(candidate.cer)}<small>{baseline ? metricDelta(candidate.cer, baseline.cer) : "—"}</small></td><td>{metricText(candidate.entityAccuracy)}</td><td>{metricText(candidate.structureAccuracy)}</td><td>{metricText(candidate.semanticSafety)}</td><td>{metricText(candidate.latency)}</td><td>{metricText(candidate.cost)}</td><td><button type="button" className="lab-secondary-button" onClick={() => void loadSamples(candidate.candidateId)}>{sampleLoading === `${run.runId}:${candidate.candidateId}` ? "Loading" : "Inspect samples"}</button></td></tr>)}</tbody></table></div></> : <p className="lab-empty">No candidate summaries are available for this run.</p>}</section></div>}
    {run && (samples.length || sampleLoading || sampleError) ? <section className="lab-drilldown"><div className="lab-section-heading"><div><h3>Sample drilldown</h3><p>Summaries load from stable IDs. Private text and audio require separate explicit actions.</p></div><span>{visibleSamples.length} shown</span></div><div className="lab-filter-bar"><label><span>Category</span><select value={category} onChange={(event) => setCategory(event.currentTarget.value)}><option value="all">All categories</option>{sampleCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>Difficulty</span><select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value)}><option value="all">All difficulty</option>{sampleDifficulties.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>{sampleLoading ? <p>Loading sample summaries.</p> : sampleError ? <p className="lab-error-text">{sampleError}</p> : <div className="lab-sample-list">{visibleSamples.map((sample) => <EvidenceSampleRow key={`${sample.sampleId}:${sample.candidateId}`} sample={sample} privateText={privateText} textLoading={textLoading} audio={audio} audioLoading={audioLoading} verdict={verdict} revision={revision} verdictNotice={verdictNotice} onReadText={readText} onCheckAudio={checkAudio} onVerdictChange={(value) => setVerdict((current) => ({ ...current, [`${sample.runId}:${sample.sampleId}:${sample.candidateId}`]: value }))} onSaveVerdict={() => void saveVerdict(sample)} />)}</div>}</section> : null}
  </div>;
}

function EvidenceSampleRow({ sample, privateText, textLoading, audio, audioLoading, verdict, revision, verdictNotice, onReadText, onCheckAudio, onVerdictChange, onSaveVerdict }: { sample: LabSampleSummary; privateText: Record<string, string>; textLoading: string | null; audio: Record<string, { available: boolean; kind: "audio"; mimeType: string; bytes: number; audioId: string; readable: boolean }>; audioLoading: string | null; verdict: Record<string, LabHumanVerdictMutation["verdict"] | "">; revision: Record<string, number | null>; verdictNotice: Record<string, string>; onReadText: (sample: LabSampleSummary, kind: TextKind) => void; onCheckAudio: (sample: LabSampleSummary) => void; onVerdictChange: (value: LabHumanVerdictMutation["verdict"] | "") => void; onSaveVerdict: () => void }) {
  const key = `${sample.runId}:${sample.sampleId}:${sample.candidateId}`;
  return <article className="lab-sample-row"><div className="lab-section-heading"><div><h4>{sample.sampleId}</h4><p>{sample.candidateId} · {sample.language} · {sample.difficulty} · {sample.goldStatus}</p></div><Status label={sample.availability.status} tone={toneForAvailability(sample.availability.status)} /></div><div className="lab-sample-metrics"><span>WER {sample.scores.wer === null ? "Not observed" : `${(sample.scores.wer * 100).toFixed(1)}%`}</span><span>CER {sample.scores.cer === null ? "Not observed" : `${(sample.scores.cer * 100).toFixed(1)}%`}</span><span>Entities {sample.scores.entities === null ? "Not observed" : `${(sample.scores.entities * 100).toFixed(1)}%`}</span><span>Latency {sample.latencyMs === null ? "Not observed" : `${sample.latencyMs.toFixed(0)} ms`}</span></div><div className="lab-sample-actions">{(["raw", "final", "gold"] as TextKind[]).map((kind) => { const textKey = `${key}:${kind}`; return <div key={kind}><button type="button" className="lab-secondary-button" onClick={() => onReadText(sample, kind)} disabled={textLoading === textKey}>{textLoading === textKey ? "Reading" : `Read ${kind}`}</button>{privateText[textKey] !== undefined ? <pre>{privateText[textKey]}</pre> : null}</div>; })}<div><button type="button" className="lab-secondary-button" onClick={() => onCheckAudio(sample)} disabled={audioLoading === key}>{audioLoading === key ? "Checking audio" : "Check audio capability"}</button>{audio[key]?.available ? <span className="lab-private-note">Audio available ({audio[key].mimeType}, {audio[key].bytes} bytes). Playback remains behind the audio capability boundary.</span> : audio[key] ? <span className="lab-private-note">Audio unavailable.</span> : null}</div></div><div className="lab-verdict-row"><label><span>Human verdict</span><select value={verdict[key] ?? ""} onChange={(event) => onVerdictChange(event.currentTarget.value as LabHumanVerdictMutation["verdict"] | "")}><option value="">Unreviewed</option>{["better", "same", "lost-content", "added-content", "changed-intent", "improved-structure", "improved-terms"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><button type="button" className="lab-primary-button" disabled={!verdict[key]} onClick={onSaveVerdict}>Save verdict</button>{revision[key] !== undefined ? <span className="lab-private-note">Revision {revision[key]}</span> : null}{verdictNotice[key] ? <span className="lab-private-note">{verdictNotice[key]}</span> : null}</div></article>;
}

export function EvidenceCorpusWorkspace({ artifacts, samples = [] }: { artifacts: EvidenceArtifactState; samples?: readonly LabSampleSummary[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [gold, setGold] = useState("all");
  const [audio, setAudio] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const corpora = artifacts.index?.corpora ?? [];
  const categories = Array.from(new Set(corpora.flatMap((corpus) => corpus.categories))).sort();
  const difficulties = Array.from(new Set(corpora.flatMap((corpus) => corpus.difficulties))).sort();
  const filtered = corpora.filter((corpus) => (!query || `${corpus.corpusId} ${corpus.version}`.toLowerCase().includes(query.toLowerCase())) && (category === "all" || corpus.categories.includes(category)) && (difficulty === "all" || corpus.difficulties.includes(difficulty)) && (gold === "all" || (gold === "approved" ? corpus.approvedGoldCount > 0 : corpus.approvedGoldCount < corpus.sampleCount)) && (audio === "all" || (audio === "available" ? corpus.audioAvailableCount > 0 : corpus.audioAvailableCount < corpus.sampleCount)) && (coverage === "all" || corpus.artifact.availability.status === coverage));
  const queuedSamples = samples.filter((sample) => sample.goldStatus !== "approved" || sample.availability.status !== "available");
  const queuedCorpora = corpora.filter((corpus) => corpus.approvedGoldCount < corpus.sampleCount || corpus.artifact.availability.status !== "available");
  return <div className="lab-workspace-content"><header className="lab-page-heading"><div><h2>Corpus</h2><p>Filter corpus metadata and review the adjudication queue. Private text and audio stay behind explicit ID commands.</p></div><span className="lab-result-count">{filtered.length} shown</span></header><div className="lab-filter-bar" role="search" aria-label="Filter corpus"><label><span>Find corpus</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Corpus ID or version" /></label><label><span>Category</span><select value={category} onChange={(event) => setCategory(event.currentTarget.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>Difficulty</span><select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value)}><option value="all">All difficulty</option>{difficulties.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>Gold</span><select value={gold} onChange={(event) => setGold(event.currentTarget.value)}><option value="all">Any gold state</option><option value="approved">Has approved gold</option><option value="missing">Needs gold review</option></select></label><label><span>Audio</span><select value={audio} onChange={(event) => setAudio(event.currentTarget.value)}><option value="all">Any audio state</option><option value="available">Has audio</option><option value="missing">Needs audio</option></select></label><label><span>Coverage</span><select value={coverage} onChange={(event) => setCoverage(event.currentTarget.value)}><option value="all">Any coverage</option><option value="available">Available</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option></select></label></div>{artifacts.loading ? <section className="lab-state-panel" data-tone="info"><h3>Reading corpus metadata</h3><p>Counts remain unknown until the canonical index responds.</p></section> : artifacts.error ? <section className="lab-state-panel" data-tone="danger"><h3>Corpus unavailable</h3><p>{artifacts.error} No sample metadata was substituted.</p></section> : <><div className="lab-table-region" tabIndex={0} role="region" aria-label="Corpus metadata"><table className="lab-data-table"><thead><tr><th>Corpus</th><th>Version</th><th>Samples</th><th>Approved gold</th><th>Audio available</th><th>Categories</th><th>Difficulty</th><th>Coverage</th></tr></thead><tbody>{filtered.map((corpus) => <tr key={`${corpus.corpusId}:${corpus.version}`}><th scope="row">{corpus.corpusId}</th><td>{corpus.version}</td><td>{corpus.sampleCount}</td><td>{corpus.approvedGoldCount} / {corpus.sampleCount}</td><td>{corpus.audioAvailableCount} / {corpus.sampleCount}</td><td>{corpus.categories.join(", ") || "Not observed"}</td><td>{corpus.difficulties.join(", ") || "Not observed"}</td><td><Status label={corpus.artifact.availability.status} tone={toneForAvailability(corpus.artifact.availability.status)} /></td></tr>)}</tbody></table></div><section className="lab-panel"><div className="lab-section-heading"><div><h3>Adjudication queue</h3><p>Queue entries are projections only. Saving a verdict appends a bounded private mutation and redacted public summary.</p></div><span>{samples.length ? queuedSamples.length : queuedCorpora.length} queued</span></div>{samples.length ? queuedSamples.length ? <div className="lab-compact-list">{queuedSamples.map((sample) => <div key={`${sample.sampleId}:${sample.candidateId}`}><div><strong>{sample.sampleId}</strong><span>{sample.candidateId} · {sample.goldStatus}</span></div><Status label={sample.availability.status} tone={toneForAvailability(sample.availability.status)} /></div>)}</div> : <p className="lab-empty">No loaded samples need adjudication.</p> : queuedCorpora.length ? <div className="lab-compact-list">{queuedCorpora.map((corpus) => <div key={`${corpus.corpusId}:${corpus.version}`}><div><strong>{corpus.corpusId}</strong><span>{corpus.approvedGoldCount} of {corpus.sampleCount} approved gold</span></div><Status label={corpus.artifact.availability.status} tone={toneForAvailability(corpus.artifact.availability.status)} /></div>)}</div> : <p className="lab-empty">No corpus-level gaps are indexed.</p>}</section></>}</div>;
}

export const EvidenceOverview = EvidenceOverviewWorkspace;
export const EvidenceResults = EvidenceResultsWorkspace;
export const EvidenceCorpus = EvidenceCorpusWorkspace;
