import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { settingsSearchIndex, type SettingsSearchTarget } from "../settings-registry";

export type SettingsSearchProps = {
  onSelect: (target: SettingsSearchTarget) => void;
};

export type SettingsSearchGroup = {
  sectionId: SettingsSearchTarget["sectionId"];
  sectionLabel: string;
  results: readonly SettingsSearchTarget[];
};

function normalizeSearchFragment(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function normalizeSettingsSearch(value: string): string {
  return normalizeSearchFragment(value).trim();
}

type SearchField = "label" | "keyword" | "summary" | "section" | "value";

function fieldScore(field: SearchField, value: string, query: string): number {
  const normalized = normalizeSettingsSearch(value);
  if (!normalized.includes(query)) return 0;
  const exact = normalized === query;
  const starts = normalized.startsWith(query);
  if (field === "label") return exact ? 1000 : starts ? 900 : 800;
  if (field === "keyword") return exact ? 700 : starts ? 650 : 600;
  if (field === "summary") return starts ? 500 : 450;
  if (field === "section") return starts ? 400 : 350;
  return starts ? 300 : 250;
}

function scoreSearchTarget(target: SettingsSearchTarget, query: string): number {
  const labelScore = fieldScore("label", target.label, query);
  const keywordScore = Math.max(...target.keywords.map((keyword) => fieldScore("keyword", keyword, query)), 0);
  const summaryScore = fieldScore("summary", target.summary, query);
  const sectionScore = fieldScore("section", target.sectionLabel, query);
  const valueScore = fieldScore("value", target.valueSummary ?? "", query);
  return Math.max(labelScore, keywordScore, summaryScore, sectionScore, valueScore);
}

/** Deterministic, accent-insensitive ranking used by the settings search and tests. */
export function rankSettingsSearch(
  query: string,
  targets: readonly SettingsSearchTarget[] = settingsSearchIndex,
): SettingsSearchTarget[] {
  const normalizedQuery = normalizeSettingsSearch(query);
  if (!normalizedQuery) return [];
  return targets
    .map((target, index) => ({ target, index, score: scoreSearchTarget(target, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index || a.target.id.localeCompare(b.target.id))
    .map((item) => item.target);
}

export function groupSettingsSearchResults(
  results: readonly SettingsSearchTarget[],
): SettingsSearchGroup[] {
  const groups: Array<Omit<SettingsSearchGroup, "results"> & { results: SettingsSearchTarget[] }> = [];
  for (const result of results) {
    const existing = groups.find((group) => group.sectionId === result.sectionId);
    if (existing) {
      existing.results.push(result);
    } else {
      groups.push({ sectionId: result.sectionId, sectionLabel: result.sectionLabel, results: [result] });
    }
  }
  return groups;
}

function normalizedCharacterMap(value: string): { normalized: string; starts: number[]; ends: number[] } {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of Array.from(value)) {
    const part = normalizeSearchFragment(character);
    normalized += part;
    for (let index = 0; index < part.length; index += 1) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }

  return { normalized, starts, ends };
}
/** Highlights text with React nodes, never by interpolating HTML. */
export function highlightSettingsSearch(value: string, query: string): ReactNode {
  const normalizedQuery = normalizeSettingsSearch(query);
  if (!normalizedQuery) return value;
  const map = normalizedCharacterMap(value);
  const matchStart = map.normalized.indexOf(normalizedQuery);
  if (matchStart < 0) return value;
  const matchEnd = matchStart + normalizedQuery.length - 1;
  const start = map.starts[matchStart];
  const end = map.ends[matchEnd];
  return [
    value.slice(0, start),
    <mark key={`${start}-${end}`}>{value.slice(start, end)}</mark>,
    value.slice(end),
  ];
}

export type SettingsSearchKeyboardState = {
  query: string;
  activeIndex: number;
  dismissed: boolean;
};

export function moveSettingsSearchIndex(current: number, direction: 1 | -1, count: number): number {
  if (count < 1) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

export function reduceSettingsSearchEscape(
  state: SettingsSearchKeyboardState,
): SettingsSearchKeyboardState {
  if (state.query && !state.dismissed) return { ...state, activeIndex: -1, dismissed: true };
  return { query: "", activeIndex: -1, dismissed: false };
}

export function SettingsSearch({ onSelect }: SettingsSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const normalizedQuery = normalizeSettingsSearch(query);
  const results = useMemo(() => rankSettingsSearch(normalizedQuery).slice(0, 8), [normalizedQuery]);
  const groups = useMemo(() => groupSettingsSearchResults(results), [results]);
  const activeTarget = activeIndex >= 0 ? results[activeIndex] : undefined;
  const listboxId = "settings-search-results";

  useEffect(() => {
    setActiveIndex(-1);
    setDismissed(false);
  }, [normalizedQuery]);

  function selectResult(target: SettingsSearchTarget) {
    setQuery("");
    setActiveIndex(-1);
    setDismissed(false);
    onSelect(target);
  }

  function moveActive(direction: 1 | -1) {
    if (!results.length) return;
    setDismissed(false);
    setActiveIndex((current) => moveSettingsSearchIndex(current, direction, results.length));
  }

  const resultsOpen = Boolean(normalizedQuery && !dismissed);

  return (
    <div className="settings-search" role="search">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Buscar ajustes"
        aria-autocomplete="list"
        placeholder="Buscar ajustes…"
        value={query}
        aria-controls={resultsOpen ? listboxId : undefined}
        aria-expanded={resultsOpen}
        aria-activedescendant={resultsOpen && activeTarget ? `settings-search-option-${activeTarget.id}` : undefined}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActive(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(-1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            const next = reduceSettingsSearchEscape({ query, activeIndex, dismissed });
            setQuery(next.query);
            setActiveIndex(next.activeIndex);
            setDismissed(next.dismissed);
            inputRef.current?.focus();
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (!resultsOpen) return;
            const target = activeTarget ?? results[0];
            if (target) selectResult(target);
          }
        }}
      />
      {resultsOpen ? (
        <div id={listboxId} className="settings-search-results" role="listbox" aria-label="Resultados de ajustes">
          {groups.length ? groups.map((group) => (
            <div className="settings-search-group" key={group.sectionId} role="group" aria-label={group.sectionLabel}>
              <span className="settings-search-group-label">{group.sectionLabel}</span>
              {group.results.map((target) => {
                const resultIndex = results.indexOf(target);
                const active = resultIndex === activeIndex;
                return (
                  <button
                    id={`settings-search-option-${target.id}`}
                    key={target.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={active ? "is-active" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectResult(target)}
                  >
                    <strong>{highlightSettingsSearch(target.label, query)}</strong>
                    <span>{highlightSettingsSearch(target.summary, query)}</span>
                    {target.valueSummary ? <small>{target.valueSummary}</small> : null}
                  </button>
                );
              })}
            </div>
          )) : <p>No encontramos ajustes.</p>}
        </div>
      ) : null}
    </div>
  );
}
