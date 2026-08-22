#!/usr/bin/env node
// tools/check.mjs — SweK Engine validation guard.
//
//   node tools/check.mjs           # full check (all engine modules + bridge + assets)
//   node tools/check.mjs --core    # quick: main.js + ui/ + world/ + render/ only
//
// Catches the two classes of breakage we've actually hit:
//   1. ES-MODULE syntax errors (e.g. a duplicate `const` at module scope) that
//      `node --check file.js` can SILENTLY MISS because it may parse a .js in
//      script mode. We re-check every engine module in MODULE mode by copying it
//      to a .mjs first — that reliably surfaces module-scope errors (this is the
//      check that would have caught the dup-const blank-screen bug).
//   2. MISSING ASSETS (the intro.mp4 class): expected files plus a scan of
//      index.html for local src/href targets that don't exist on disk.
//
// Exit code 1 on any syntax failure. Asset misses are warnings (exit 0) since
// some refs are intentionally optional/probed.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);                 // WebGLEngine/
const CORE = process.argv.includes("--core");
const CONCURRENCY = 16;

const C = { red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", dim: "\x1b[2m", rst: "\x1b[0m" };
const norm = (p) => p.replace(/\\/g, "/");

// ── collect .js files ──────────────────────────────────────────────────────
function walk(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "__pycache__") continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (extname(p) === ".js") out.push(p);
  }
  return out;
}

// Shaders are GLSL-as-text wrapped in .js — they are NOT real modules; skip.
const isShader = (p) => /\/shaders\//.test(norm(p)) || /\.(vert|frag|glsl)\.js$/.test(p);
const isBridge = (p) => norm(p).includes("/ai-bridge/");
const inCore   = (p) => { const n = norm(p); return n.endsWith("/main.js") || /\/(ui|world|render)\//.test(n); };

let all = walk(ROOT);
if (CORE) all = all.filter((p) => inCore(p) || isBridge(p));
const shaders  = all.filter(isShader);
const modules  = all.filter((p) => !isShader(p) && !isBridge(p));
const commonjs = all.filter((p) => isBridge(p) && !isShader(p));

// ── syntax checks (parallel) ───────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "swek-check-"));
let _id = 0;

function nodeCheck(path) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--check", path], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve(code === 0 ? null : err.split("\n").filter(Boolean).slice(0, 4).join("\n")));
    child.on("error", (e) => resolve(e.message));
  });
}

async function checkModule(p) {
  const mjs = join(tmp, (_id++) + ".mjs");
  writeFileSync(mjs, readFileSync(p));
  return nodeCheck(mjs);
}
const checkScript = (p) => nodeCheck(p);

async function runPool(items, fn) {
  const failures = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const p = items[idx];
      const err = await fn(p);
      if (err) failures.push([relative(ROOT, p), err]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, worker));
  return failures;
}

console.log(`${C.dim}SweK Engine validation guard${CORE ? " (--core)" : ""} — ${modules.length} modules, ${commonjs.length} CommonJS, ${shaders.length} shaders skipped${C.rst}`);

const modFail = await runPool(modules, checkModule);
const cjsFail = await runPool(commonjs, checkScript);
rmSync(tmp, { recursive: true, force: true });
const failures = [...modFail.map((f) => [...f, "module"]), ...cjsFail.map((f) => [...f, "commonjs"])];

// ── asset audit ────────────────────────────────────────────────────────────
const warns = [];
for (const f of ["index.html", "main.js", "ai-bridge/server.js"]) {
  if (!existsSync(join(ROOT, f))) warns.push(`missing expected file: ${f}`);
}
try {
  const idx = readFileSync(join(ROOT, "index.html"), "utf8");
  const refs = [...idx.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const seen = new Set();
  for (const r of refs) {
    if (/^(https?:|data:|blob:|#|mailto:|\/\/)/.test(r)) continue;
    if (r.includes("${") || r.includes("{{")) continue;          // templated at runtime
    const clean = r.split("?")[0].split("#")[0].replace(/^\.?\//, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    if (!existsSync(join(ROOT, clean))) warns.push(`index.html references missing: ${r}`);
  }
} catch (e) { warns.push("could not scan index.html: " + e.message); }

// ── report ─────────────────────────────────────────────────────────────────
console.log("");
if (failures.length === 0) {
  console.log(`${C.grn}\u2713 syntax OK \u2014 ${modules.length + commonjs.length} files checked${C.rst}`);
} else {
  console.log(`${C.red}\u2717 ${failures.length} syntax failure(s):${C.rst}`);
  for (const [f, err, kind] of failures) {
    console.log(`${C.red}  ${f} [${kind}]${C.rst}\n${C.dim}${err.replace(/^/gm, "      ")}${C.rst}`);
  }
}
if (warns.length) {
  console.log(`${C.yel}\u26A0 ${warns.length} asset warning(s):${C.rst}`);
  for (const w of warns) console.log(`${C.yel}  ${w}${C.rst}`);
} else {
  console.log(`${C.grn}\u2713 assets OK${C.rst}`);
}

process.exit(failures.length ? 1 : 0);
