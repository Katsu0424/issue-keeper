#!/usr/bin/env node
// dist は `pnpm compile`(tsc -p tsconfig.build.json)が生成し、コミットして配布する。
// node_modules 配下では Node の type stripping が無効なため、TS 直実行ではなくビルド済み JS を使う。
await import("../dist/cli/index.js");
