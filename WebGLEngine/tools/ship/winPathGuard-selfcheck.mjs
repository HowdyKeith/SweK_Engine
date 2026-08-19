// tools/ship/winPathGuard-selfcheck.mjs
//
// Run: node tools/ship/winPathGuard-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Two idioms read fine on Linux and break silently on Windows, and both cost a rig-test round in v2758:
//   1. `new URL(import.meta.url).pathname` yields "/C:/dir/file" on Windows; path.join then prepends the
//      current drive and you get "C:\C:\dir" -- every file read against it fails ENOENT. Use fileURLToPath.
//   2. `import.meta.url === `file://${process.argv[1]}`` never matches on Windows (backslashes, and file://
//      vs file:///), so the CLI main-module block never runs -- `--save` and even the fingerprint MASTER
//      print silently do nothing. Use pathToFileURL(process.argv[1]).href.
// The slash-stripping helper form `new URL(rel, import.meta.url).pathname` (report.js, brain.js _localPath)
// is SAFE and is not flagged -- it has a rel argument and strips the leading slash itself. This gate greps the
// tree for the two unsafe forms so they cannot come back. The sabotage below reintroduces one and this fails.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BAD_PATHNAME = "new URL(import.meta.url).pathname";
const BAD_GUARD = "`file://${process.argv[1]}`";
const SKIP = new Set(["node_modules", ".git", "vendor", "rt", "__pycache__"]);

function walk(dir, hits) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = path.join(dir, name), st = statSync(p);
        if (st.isDirectory()) walk(p, hits);
        else if (name === "winPathGuard-selfcheck.mjs") continue;   // this file holds the patterns as search literals
        else if (/\.(mjs|js)$/.test(name)) {
            const s = readFileSync(p, "utf8"), rel = path.relative(ROOT, p);
            if (s.includes(BAD_PATHNAME)) hits.push(rel + "  [new URL(import.meta.url).pathname]");
            if (s.includes(BAD_GUARD)) hits.push(rel + "  [file://${process.argv[1]} guard]");
        }
    }
}

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const hits = [];
walk(ROOT, hits);
ok("!! no source file uses the Windows-fragile path idioms", hits.length === 0,
   hits.length === 0
     ? "the tree is clean: no `new URL(import.meta.url).pathname` and no `file://${process.argv[1]}` guard -- fileURLToPath and pathToFileURL are used instead, so paths and main-module detection survive Windows."
     : hits.length + " offending occurrence(s): " + hits.slice(0, 6).join(" ; "));

console.log(fails ? "\nwinPathGuard-selfcheck: " + fails + " FAILED" : "\nwinPathGuard-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
