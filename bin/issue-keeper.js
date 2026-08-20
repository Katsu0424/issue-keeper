#!/usr/bin/env node
// Node 22.18+ のネイティブ type stripping で TS を直接実行する(ビルド不要)
await import("../src/cli/index.ts");
