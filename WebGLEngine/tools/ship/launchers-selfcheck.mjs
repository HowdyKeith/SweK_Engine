// WebGLEngine/tools/ship/launchers-selfcheck.mjs -- v2803
//
// Run: node tools/ship/launchers-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the double-clickable launchers (tools/roundhouse/run_agent.bat/.sh, wasm-terrain/build_wasm.bat/.sh).
// A launcher is exactly the kind of file that rots silently: it is not imported, not syntax-checked by the JS
// scan, and nobody runs it until the one moment they need it to work. The failure modes pinned here are the ones
// that actually bite:
//
//   FLAG DRIFT   -- a launcher passes a flag the script stopped handling. It runs, prints something, does the
//                   wrong thing. Every flag the launchers pass is checked against runLive.mjs's real parsing.
//   CRLF IN .sh  -- a shell script saved with Windows line endings fails on the Mac with a useless error
//                   ("bad interpreter"). This tree is authored on Windows, so the risk is real.
//   WRONG DEST   -- build_wasm.sh must install to the SAME place and out-name as build_wasm.bat, or the Mac
//                   build lands where terrainWasm.js will never look for it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ENG, p), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const BAT = "tools/roundhouse/run_agent.bat";
const SH = "tools/roundhouse/run_agent.sh";
const WBAT = "wasm-terrain/build_wasm.bat";
const WSH = "wasm-terrain/build_wasm.sh";

// 1. they exist
{
    for (const f of [BAT, SH, WBAT, WSH]) ok(`present: ${f}`, fs.existsSync(path.join(ENG, f)));
}

// 2. FLAG DRIFT: every flag the agent launchers pass must be parsed by runLive.mjs
{
    const live = read("tools/roundhouse/runLive.mjs");
    const handled = new Set([...live.matchAll(/"(--[a-z-]+)"/g)].map((m) => m[1]));
    const used = new Set();
    for (const f of [BAT, SH]) for (const m of read(f).matchAll(/runLive\.mjs\s+([^\r\n|&]*)/g)) {
        for (const tok of m[1].split(/\s+/)) if (/^--[a-z-]+$/.test(tok)) used.add(tok);
    }
    const unknown = [...used].filter((u) => !handled.has(u));
    ok("no flag drift: every launcher flag is parsed by runLive.mjs", unknown.length === 0, unknown.length ? "unknown: " + unknown.join(",") : "flags: " + [...used].join(" "));
    ok("launchers actually exercise the flags (not just --dry)", used.has("--dry") && used.has("--bench") && used.has("--save-trace"), [...used].join(" "));
    ok("runLive.mjs still parses every flag the launchers rely on", [...used].every((u) => handled.has(u)));
}

// 3. CRLF: shell scripts must be LF-only or they will not run on the Mac
{
    for (const f of [SH, WSH]) {
        const raw = fs.readFileSync(path.join(ENG, f));
        ok(`${f}: LF line endings only (no CRLF)`, !raw.includes(Buffer.from("\r\n")));
        ok(`${f}: starts with a shebang`, raw.slice(0, 2).toString() === "#!");
    }
}

// 4. build_wasm.sh must match the .bat's install destination and out-name
{
    const bat = read(WBAT), sh = read(WSH);
    for (const token of ["terrain_wasm", "--target web", "--release", "world"]) {
        ok(`build_wasm .bat/.sh agree on: ${token}`, bat.includes(token) && sh.includes(token));
    }
    ok("both install terrain_wasm.js AND terrain_wasm_bg.wasm", /terrain_wasm\.js/.test(bat) && /terrain_wasm_bg\.wasm/.test(bat) && /terrain_wasm\.js/.test(sh) && /terrain_wasm_bg\.wasm/.test(sh));
    ok("both run the native tests before building wasm", /cargo test/.test(bat) && /cargo test/.test(sh));
    ok("both offer the nosimd escape hatch", /nosimd/.test(bat) && /nosimd/.test(sh));
    ok("both state the engine runs fine WITHOUT the build", /runs fine WITHOUT/i.test(bat) && /runs fine WITHOUT/i.test(sh));
}

// 5. the launchers say the true thing about billing (this is the file a first-time user reads)
{
    for (const f of [BAT, SH]) {
        const s = read(f);
        ok(`${f}: says API billing is separate from a claude.ai subscription`, /separate/i.test(s) && /subscription/i.test(s));
        ok(`${f}: warns a global key makes Claude Code bill to the API`, /Claude Code/.test(s));
        ok(`${f}: points at the dry run as the no-key starting point`, /--dry|'dry'|\[1\]/.test(s));
    }
}

// 6. paths the launchers cd into / invoke are real
{
    ok("agent launchers target a real script", fs.existsSync(path.join(ENG, "tools", "roundhouse", "runLive.mjs")));
    ok("build scripts sit beside a real crate", fs.existsSync(path.join(ENG, "wasm-terrain", "Cargo.toml")));
    for (const f of [BAT, SH]) ok(`${f}: guards a missing node / missing script instead of failing blind`, /node not found/i.test(read(f)) && /not found/.test(read(f)));
}

// 7. ASCII only -- the ship ritual's changelog gate hard-aborts on smart punctuation, and these files get quoted
{
    for (const f of [BAT, SH, WSH]) {
        const s = read(f);
        const bad = [...s].filter((ch) => ch.charCodeAt(0) > 126);
        ok(`${f}: ASCII only`, bad.length === 0, bad.length ? "found: " + [...new Set(bad)].join("") : "");
    }
}

console.log("launchers-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
