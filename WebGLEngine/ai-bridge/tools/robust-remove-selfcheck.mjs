// ai-bridge/tools/robust-remove-selfcheck.mjs -- v2222 -- proves the Windows-robust remover.
//
// The real proof is on Windows (read-only attribute + Defender lock), which this sandbox can't
// reproduce, but we CAN prove: a read-only file/dir tree is removed without error, deep nesting
// is fully cleared, an absent path is a no-op success, and the report shape is right.
//
//   node ai-bridge/tools/robust-remove-selfcheck.mjs

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { robustRemove, _sleep } = require(path.join(HERE, "..", "robustRemove.js"));

let pass = 0, fail = 0;
const ok = (n, c, x) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -- " + x : ""}`); };

function mkTree(root) {
    fs.mkdirSync(path.join(root, "a", "b", "c"), { recursive: true });
    fs.writeFileSync(path.join(root, "top.txt"), "x");
    fs.writeFileSync(path.join(root, "a", "mid.txt"), "y");
    fs.writeFileSync(path.join(root, "a", "b", "c", "deep.txt"), "z");
    // a READ-ONLY file (the classic EPERM cause on Windows) and a read-only dir
    const ro = path.join(root, "a", "b", "readonly.txt");
    fs.writeFileSync(ro, "ro"); fs.chmodSync(ro, 0o444);
    fs.chmodSync(path.join(root, "a", "b", "c"), 0o555);
}

// -------- 1. removes a mixed read-only tree --------
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rr-tree-"));
    mkTree(root);
    const r = robustRemove(root, { retries: 3, delayMs: 20 });
    ok("read-only tree is fully removed", r.ok === true && !fs.existsSync(root), `failed=${JSON.stringify(r.failed)}`);
    ok("report lists removed entries and no failures", Array.isArray(r.removed) && r.removed.length >= 5 && r.failed.length === 0);
}

// -------- 2. a single read-only file --------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-file-"));
    const f = path.join(dir, "locked.txt");
    fs.writeFileSync(f, "x"); fs.chmodSync(f, 0o444);
    const r = robustRemove(f, { retries: 2, delayMs: 10 });
    ok("read-only file is removed", r.ok === true && !fs.existsSync(f));
    fs.rmSync(dir, { recursive: true, force: true });
}

// -------- 3. absent path is a no-op success --------
{
    const r = robustRemove(path.join(os.tmpdir(), "rr-does-not-exist-" + Date.now()));
    ok("absent path -> ok, skipped 'absent'", r.ok === true && r.skipped === "absent" && r.removed.length === 0);
}

// -------- 4. deep nesting is fully cleared --------
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rr-deep-"));
    let p = root;
    for (let i = 0; i < 12; i++) { p = path.join(p, "lvl" + i); fs.mkdirSync(p); fs.writeFileSync(path.join(p, "f.txt"), String(i)); }
    const r = robustRemove(root, { retries: 2, delayMs: 5 });
    ok("12-level deep tree fully removed", r.ok === true && !fs.existsSync(root), `removed ${r.removed.length}`);
}

// -------- 5. report shape --------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-shape-"));
    const r = robustRemove(dir);
    ok("report has ok/removed/failed", typeof r.ok === "boolean" && Array.isArray(r.removed) && Array.isArray(r.failed));
}

// -------- 6. sync sleep returns promptly (doesn't hang) --------
{
    const t0 = Date.now(); _sleep(30); const dt = Date.now() - t0;
    ok("_sleep(30) blocks ~30ms and returns", dt >= 15 && dt < 2000, `${dt}ms`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
