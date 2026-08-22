#!/usr/bin/env node
// FILE: slim-build.mjs
// Delivery-mode slimmer. Reads slim.manifest.json and copies the allowlisted
// subset of the FULL WebGL engine into the add-on's www/, so the repo keeps the
// complete engine while HA gets a trimmed build. Pure Node, no deps.
//
//   node slim-build.mjs                 # uses ./slim.manifest.json
//   node slim-build.mjs my.manifest.json
//
// Honest scope: this does file selection (and an optional leading-slash → "./"
// rewrite for ingress). It does NOT minify or tree-shake — point the include
// list at the minimum your panel needs. Verify the slim build loads in HA.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, process.argv[2] || "slim.manifest.json");
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const root = path.resolve(here, m.engineRoot);
const out  = path.resolve(here, m.out);

// minimal glob -> RegExp (supports ** and *)
const toRe = (g) => new RegExp("^" + g
  .replace(/[.+^${}()|[\]\\]/g, "\\$&")
  .replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
const inc = (m.include || []).map(toRe);
const exc = (m.exclude || []).map(toRe);
const match = (rel, list) => list.some((re) => re.test(rel));

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (match(rel, exc)) continue;
    if (e.isDirectory()) walk(abs, acc);
    else if (match(rel, inc)) acc.push(rel);
  }
  return acc;
}

if (!fs.existsSync(root)) {
  console.error(`[slim] engine root not found: ${root}`);
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = walk(root);
let bytes = 0, rewritten = 0;
for (const rel of files) {
  const src = path.join(root, rel);
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (m.rewriteAbsolutePaths && /\.(html|js|mjs|css)$/i.test(rel)) {
    let t = fs.readFileSync(src, "utf8");
    // make src/href roots relative so they resolve under the ingress base path
    const before = t;
    t = t.replace(/((?:src|href)\s*=\s*["'])\/(?!\/)/g, '$1./');
    if (t !== before) rewritten++;
    fs.writeFileSync(dst, t);
    bytes += Buffer.byteLength(t);
  } else {
    fs.copyFileSync(src, dst);
    bytes += fs.statSync(src).size;
  }
}
console.log(`[slim] ${files.length} files -> ${out}`);
console.log(`[slim] ~${(bytes / 1048576).toFixed(2)} MB, ${rewritten} files had absolute paths rewritten for ingress`);
console.log(`[slim] review the result; tune include/exclude in ${path.basename(manifestPath)} if the panel is missing pieces or too heavy`);
