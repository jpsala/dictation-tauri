export function App() {
  return (
    <main className="app-shell" data-testid="mvp0-foundation">
      <section className="foundation-panel" aria-labelledby="foundation-title">
        <p className="eyebrow">MVP 0 foundation</p>
        <h1 id="foundation-title">Dictation Tauri</h1>
        <p className="summary">
          Technical app base is running. Dictation, microphone capture, model
          routing, and durable product UI are intentionally not enabled yet.
        </p>
        <dl className="status-grid" aria-label="Foundation status">
          <div>
            <dt>Frontend</dt>
            <dd>React + Vite</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>Tauri v2 next</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>No audio yet</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
