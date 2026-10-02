"use strict";
// The shipped plugin is the Home Pages fork. Legacy src/ is not bundled.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const fork = path.join(root, "home-pages-personal");
const esbuild = require(path.join(fork, "node_modules/esbuild"));
const run = (...args) => execFileSync(process.execPath, args, { cwd: fork, stdio: "inherit" });
async function build() {
  run("node_modules/typescript/bin/tsc", "--noEmit", "--skipLibCheck");
  run("esbuild.config.mjs", "production");
  run("scripts/verify-bundle.mjs");
  for (const file of ["main.js", "manifest.json"]) fs.copyFileSync(path.join(fork,file),path.join(root,file));
  const styles = ["styles.css", "src/personal/personal.css", "src/personal/journal-widgets.css", "src/personal/library.css", "src/personal/growth-widgets.css", "src/personal/finance.css", "src/personal/journal-note.css", "src/personal/appearance.css", "src/personal/liquid-glass.css", "src/personal/appearance-editor.css"];
  fs.writeFileSync(path.join(root,"styles.css"), "/* Personal Launchpad 3 — Home Pages fork, GPL-3.0-only. */\n" + styles.map(file => `\n/* ${file} */\n${fs.readFileSync(path.join(fork,file),"utf8")}`).join("\n"));
  await esbuild.build({ entryPoints:[path.join(fork,"tests/personal-preview.ts")], bundle:true, platform:"browser",format:"iife",target:"es2020",alias:{obsidian:path.join(fork,"tests/personal-obsidian-stub.ts")},outfile:path.join(root,"design/preview.js"),minify:true });
  const base = fs.readFileSync(path.join(fork,"tests/personal-preview.css"),"utf8");
  fs.writeFileSync(path.join(root,"design/index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>个人空间 · Home Pages 专属版</title><style>${base}</style><link rel="stylesheet" href="/styles.css"></head><body><header class="preview-bar"><div><strong>个人空间</strong><span>Home Pages 专属版 · 独立演示笔记库</span></div><button id="theme-toggle" type="button">切换明暗</button></header><main id="app"></main><script src="/design/preview.js"></script></body></html>`);
  console.log("Built actual Home Pages fork: main.js, styles.css, manifest.json and native-view preview.");
}
build().catch(error=>{console.error(error);process.exitCode=1;});
