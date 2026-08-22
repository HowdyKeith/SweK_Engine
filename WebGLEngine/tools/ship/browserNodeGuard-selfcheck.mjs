// tools/ship/browserNodeGuard-selfcheck.mjs
//
// Run: node tools/ship/browserNodeGuard-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A module a browser page imports MUST NOT import a Node builtin (node:url, node:fs, node:crypto, node:path...) at the top
// level -- the browser cannot load those, and the whole page dies with a CORS/ERR_FAILED on the builtin. v2759 did exactly
// this: the Windows-path fix added `import { pathToFileURL } from "node:url"` to fingerprint.mjs and bzfsClient.mjs, which
// case-study, verify, bzflag and catalog all import, and every one of those pages went black in render QA. The fix is to
// import Node builtins lazily inside a `typeof process` guard, never at module scope. This gate walks the import graph out
// from every .html page and fails if any reachable module has a top-level `import ... from "node:..."`. The sabotage adds
// one back to a browser-reachable module and this catches it.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// A Node builtin can be imported two ways and BOTH kill a browser page: `node:url` (prefixed) and `dgram`
// (bare). v2762 only caught the prefixed form, so a bare `import dgram from "dgram"` in bzUdp sailed through
// and bzflag died on it in render QA (v2766). Catch both: the specifier must be EXACTLY node:<x> or one of the
// builtin names (a relative "./dgram.js" does not match, because of the leading ./ and the .js).
const BUILTINS = "assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib";
const TOP_NODE = new RegExp('^\\s*import\\s[^\\n]*from\\s*["\'](node:[^"\']+|(?:' + BUILTINS + '))["\']', 'm');
const impRe = /(?:from|import)\s*\(?\s*["'](\.[^"']+\.(?:mjs|js))["']/g;   // relative .js/.mjs imports (static + dynamic)

function importsOf(file) {
    const dir = path.dirname(file), out = [], s = readFileSync(file, "utf8");
    let m; while ((m = impRe.exec(s))) { const r = path.resolve(dir, m[1]); if (existsSync(r)) out.push(r); }
    return out;
}
function htmlModules(html) {
    const s = readFileSync(html, "utf8"), out = [], dir = path.dirname(html);
    let m; while ((m = impRe.exec(s))) { const r = path.resolve(dir, m[1]); if (existsSync(r)) out.push(r); }
    return out;
}

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// walk import graph from all top-level .html pages
const htmls = readdirSync(ROOT).filter((f) => f.endsWith(".html")).map((f) => path.join(ROOT, f));
const seen = new Set(), offenders = [];
const queue = [];
for (const h of htmls) for (const m of htmlModules(h)) queue.push([m, path.basename(h)]);
while (queue.length) {
    const [mod, via] = queue.shift();
    if (seen.has(mod)) continue; seen.add(mod);
    let src; try { src = readFileSync(mod, "utf8"); } catch { continue; }
    if (TOP_NODE.test(src)) offenders.push(path.relative(ROOT, mod) + " (reached from " + via + ")");
    for (const nxt of importsOf(mod)) if (!seen.has(nxt)) queue.push([nxt, via]);
}

ok("!! no browser-reachable module imports a Node builtin at the top level", offenders.length === 0,
   offenders.length === 0
     ? seen.size + " modules reachable from " + htmls.length + " pages, none imports node:* at module scope -- Node builtins are lazy-loaded behind a process guard, so every page loads in a browser."
     : offenders.length + " offender(s): " + offenders.slice(0, 5).join(" ; "));

console.log(fails ? "\nbrowserNodeGuard-selfcheck: " + fails + " FAILED" : "\nbrowserNodeGuard-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
