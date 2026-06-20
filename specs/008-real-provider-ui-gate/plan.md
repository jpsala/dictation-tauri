# Plan: Real Provider UI Gate

Use the existing `HostRuntimeClient` boundary and Rust provider implementation from 007. Do not add secrets or provider SDKs to React. Keep default browser/CI behavior provider-free. The only production code changes should be `src/host-runtime/pipeline-adapter.ts`, `src/App.tsx`, and visual/style tests if copy/layout changes.
