import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  banner: { js: "/* Personal Launchpad 3.0.0 — derived from Home Pages (GPL-3.0-only). See LICENSE and THIRD_PARTY_NOTICES.md. */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js"
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}
