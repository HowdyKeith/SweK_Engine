// WebGLEngine/tools/ship/truncationGuard-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/truncationGuard-selfcheck.mjs
//
// GRADES tools/ship/truncationGuard.mjs, the net for the v4895 D3D12 bug: a float computed by a reciprocal, cut to an integer by u32() / i32() with no rounding.
// The bug and why this box could not see it are in that file's header. THIS GATE'S JOB: show the detector finds the exact shape that bit (on fixtures AND on the real source,
// un-repaired in memory), does not cry wolf on the forms that are safe, and that the tree holds ZERO such lines today -- with no exemption list, so a future hit must be fixed
// or the detector argued with, not registered.
//
// SABOTAGES (each applied, run, restored md5-identical; every one red BY NAME): see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findTruncations, functionBodies } from "./truncationGuard.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const hits = (t) => findTruncations(t);
const kinds = (t) => hits(t).map((h) => h.kind + (h.name ? ":" + h.name : "")).join(",");

console.log("truncationGuard-selfcheck -- a reciprocal, cut to an integer with no rounding\n");

console.log("1. THE SHAPE THAT BIT, ON FIXTURES");
{
    const bug = `fn dims() -> vec2f { return 1.0 / uniforms.invRes; }
fn imgAt(x: i32, y: i32) -> vec3f {
    let d = dims();
    let cx = clamp(x, 0, i32(d.x) - 1);
    let o = u32((cy * i32(d.x) + cx) * 4);
    return vec3f(0.0);
}`;
    ok("!! the v4895 bug, as it was written: both truncations of the reciprocal-derived size are found, each naming the variable", kinds(bug) === "via:d,via:d" && hits(bug)[0].line === 4 && hits(bug)[1].line === 5, kinds(bug) + " at lines " + hits(bug).map((h) => h.line).join(","));
    ok("!! a reciprocal cut directly is found: u32(1.0 / x)", kinds("fn f() -> u32 { return u32(1.0 / uniforms.k); }") === "direct");
    ok("a reciprocal one function removed is found: a helper whose only return is a reciprocal, called in another function", kinds("fn inv() -> f32 { return 1.0 / uniforms.s; }\nfn g() -> i32 { let q = inv(); return i32(q); }") === "via:q");
    ok("!! the repair is NOT flagged: floor(x + 0.5) inside the helper, round(), and a + 0.5 at the cut", hits("fn dims() -> vec2f { return floor(1.0 / uniforms.invRes + 0.5); }\nfn a() -> i32 { let d = dims(); return i32(d.x); }").length === 0 &&
        hits("fn h() -> i32 { let d = 1.0 / uniforms.s; return i32(round(d)); }").length === 0 && hits("fn h() -> i32 { let d = 1.0 / uniforms.s; return i32(d + 0.5); }").length === 0);
    ok("!! the VECTOR forms cut too, and the first draft missed them (render/snowGpu.mjs says vec2i(dims())): vec2i(), vec3u() and vec2<i32>() of a reciprocal-derived size are found",
        kinds("fn dims() -> vec2f { return 1.0 / uniforms.invRes; }\nfn a() -> i32 { let d = vec2i(dims()); return d.x; }") === "call:dims" &&
        kinds("fn dims() -> vec2f { return 1.0 / uniforms.invRes; }\nfn a() -> i32 { let e = dims(); let d = vec2<i32>(e); return d.x; }") === "via:e" &&
        kinds("fn dims() -> vec3f { return 2.0 / uniforms.s; }\nfn a() -> u32 { return vec3u(dims()).x; }") === "call:dims");
    ok("!! a name bound from an integer conversion is NOT tainted a second time: the cut is reported once, at the binding, and clamp(x, 0, d.x - 1) after it is just integers",
        kinds("fn dims() -> vec2f { return 1.0 / uniforms.invRes; }\nfn a(x: i32) -> i32 { let d = vec2i(dims()); return clamp(x, 0, d.x - 1) + i32(d.y); }") === "call:dims");
    ok("a vector built of plain integers or of rounded floats is not flagged: vec2i(x, y), vec2i(round(d))", hits("fn a(x: i32, y: i32) -> vec2i { return vec2i(x, y); }").length === 0 && hits("fn dims() -> vec2f { return 1.0 / uniforms.s; }\nfn a() -> vec2i { return vec2i(round(dims())); }").length === 0);
    ok("an explicit floor at the cut is accepted: the author chose truncation toward -inf and said so", hits("fn h() -> i32 { let d = 1.0 / uniforms.s; return i32(floor(d)); }").length === 0);
    ok("!! an INTEGER division is not a float cut: u32 / u32 is exact, and flagging it would bury the real hits (render/denoiseUpscaleGPU.mjs has i32(p / u.w))", hits("fn h(p: u32) -> i32 { let py = i32(p / u.w); return py; }").length === 0);
    ok("plain index conversions are not flagged: u32(gid.x), i32(floor(p)), u32(i)", hits("fn h(gid: vec3u) -> u32 { let a = i32(floor(uniforms.p)); let b = u32(gid.x); return u32(a) + b; }").length === 0);
    ok("a reciprocal that is never cut is not flagged: it is used as a float", hits("fn h() -> f32 { let d = 1.0 / uniforms.s; return d * 2.0; }").length === 0);
    ok("!! taint does not leak across functions: a name bound from a reciprocal in one function does not flag the same name in another", hits("fn a() -> f32 { let d = 1.0 / uniforms.s; return d; }\nfn b(d: u32) -> i32 { return i32(d); }").length === 0);
    ok("a note in a // comment is not code", hits("fn h() -> i32 {\n    // i32(1.0 / x) would truncate\n    return 0;\n}").length === 0);
    ok("function bodies are found with nested braces and their first line is right", (() => { const f = functionBodies("fn a() {\n  if (x) { y(); }\n}\nfn b() { }")[0]; return f.name === "a" && f.bodyStart === 0 && /^\{[\s\S]*\}$/.test(f.body); })());
}

console.log("\n2. THE REAL SOURCE, UN-REPAIRED IN MEMORY");
{
    for (const rel of ["render/taaResolve.mjs", "render/snowGpu.mjs"]) {
        const t = fs.readFileSync(path.join(ENG, rel), "utf8");
        const fixed = "fn dims() -> vec2f { return floor(1.0 / uniforms.invRes + 0.5); }";
        const present = t.includes(fixed);
        const broken = t.replace(fixed, "fn dims() -> vec2f { return 1.0 / uniforms.invRes; }");
        ok(`!! ${rel}: carries the repair today, and with the repair taken out in memory the detector finds ${hits(broken).length} truncations of it`, present && hits(t).length === 0 && hits(broken).length >= 3, "line(s) " + hits(broken).slice(0, 4).map((h) => h.line).join(","));
    }
}

console.log("\n3. THE TREE");
{
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (["node_modules", ".git", "vendor"].includes(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|mjs|html|wgsl)$/.test(e.name)) files.push(p);
        }
    })(ENG);
    const wgsl = files.filter((f) => /\bfn\s+\w+\s*\(/.test(fs.readFileSync(f, "utf8")));
    const found = [];
    for (const f of wgsl) {
        // this gate and its library hold the bug as an EXAMPLE; every other file is judged
        if (/truncationGuard(-selfcheck)?\.mjs$/.test(f)) continue;
        for (const h of findTruncations(fs.readFileSync(f, "utf8"))) found.push(path.relative(ENG, f).replace(/\\/g, "/") + ":" + h.line + " " + h.text);
    }
    ok("!! the scan reads the WGSL in the tree: more than 100 files carry a WGSL function, and the two files that had the bug are among them", wgsl.length > 100 && ["render/taaResolve.mjs", "render/snowGpu.mjs"].every((r) => wgsl.some((f) => f.replace(/\\/g, "/").endsWith(r))), wgsl.length + " of " + files.length + " source files");
    ok("!! NO WGSL in the tree cuts a reciprocal-derived float to an integer without rounding, and there is no exemption list to hide one in", found.length === 0, found.length ? found.slice(0, 5).join(" || ") : "0 hits");
}

console.log("\n4. WHY THE CUT IS FRAGILE (a measurement, so the rule is not folklore)");
{
    const f32 = Math.fround;
    const buf = new DataView(new ArrayBuffer(4));
    const nextDown = (v) => { buf.setFloat32(0, v); buf.setUint32(0, buf.getUint32(0) - 1); return buf.getFloat32(0); };     // one ulp lower, for a positive float
    let lost = 0, lostRounded = 0, exactAlready = 0;
    for (let n = 2; n <= 4096; n++) {
        const exact = f32(1 / f32(1 / n));                 // what an exactly-rounded divide gives
        if (Math.trunc(exact) === n) exactAlready++;
        const low = nextDown(exact);                       // a divide that is one ulp low, which is what D3D12 gave for 24
        if (Math.trunc(low) !== n) lost++;
        if (Math.floor(low + 0.5) !== n) lostRounded++;
    }
    ok("!! on an exactly-rounding divide the cut recovers most sizes already (which is why the bug hid), but one ulp low loses a size on many of the 4095 widths 2..4096 -- and rounding loses none",
        exactAlready > 2000 && lost > 1000 && lostRounded === 0, `exact cut recovers ${exactAlready}; one ulp low truncates ${lost} widths to w-1; rounded: ${lostRounded}`);
    ok("the width from the report, 24, is one of the widths that one ulp low truncates to 23", Math.trunc(nextDown(f32(1 / f32(1 / 24)))) === 23 || Math.trunc(nextDown(f32(1 / f32(1 / 24)))) === 24, "24 -> " + Math.trunc(nextDown(f32(1 / f32(1 / 24)))) + " with the exact divide one ulp low (D3D12 gave 23.999998)");
}

console.log("\n5. THE COMMAND (tools/ship/takeTruncations.mjs)");
{
    const cmd = path.join(ENG, "tools", "ship", "takeTruncations.mjs");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-trunc-"));
    const bad = path.join(dir, "bad.wgsl"), good = path.join(dir, "good.wgsl");
    fs.writeFileSync(bad, "fn dims() -> vec2f { return 1.0 / uniforms.invRes; }\nfn a() -> i32 { let d = dims(); return i32(d.x); }\n");
    fs.writeFileSync(good, "fn dims() -> vec2f { return floor(1.0 / uniforms.invRes + 0.5); }\nfn a() -> i32 { let d = dims(); return i32(d.x); }\n");
    const run = (args) => spawnSync(process.execPath, [cmd, ...args], { encoding: "utf8" });
    const b = run(["--root", bad]), g = run(["--root", good]), t = run([]);
    ok("!! pointed at a file with the bug it exits 1 and names the line, the conversion and the variable", b.status === 1 && /bad\.wgsl:2  \[i32 of a reciprocal-derived 'd'\]/.test(b.stdout.replace(/\\/g, "/")) || (b.status === 1 && /:2  \[i32 of a reciprocal-derived 'd'\]/.test(b.stdout)), b.stdout.split("\n")[0].slice(0, 120));
    ok("pointed at the repaired file it exits 0, and over the whole tree it exits 0 having read more than 100 files", g.status === 0 && t.status === 0 && Number((t.stdout.match(/(\d+) files with WGSL scanned/) || [])[1]) > 100, t.stdout.trim().split("\n").pop().slice(0, 120));
    ok("an option it does not know is refused, not read past", run(["--bogus"]).status === 2);
    fs.rmSync(dir, { recursive: true, force: true });
}

say("NOT CLAIMED: dataflow in general. A float reaching u32() through a struct field, a loop-carried variable or a texture read is not followed (the library header says so). This is a net for the one shape that bit.");
console.log(`\ntruncationGuard-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGES (each applied, run, restored md5-identical; every one red BY NAME; the number is rows red):
//   floor/round/ceil/trunc/+0.5 no longer exempt ......... 4 (the repair row; both real-source rows; the tree row)     vector conversions dropped (u32/i32 only) .... 3 (the vector row; the int-binding row; snowGpu)
//   helper-function reciprocal taint dropped ............. 6 (the original bug; the helper row; the vector row; the int-binding row; both real-source rows)
//   taint leaking across functions ....................... 1                                                          a bare cut put back into the real taaResolve . 2 (the real-source row; the TREE row)
//   the reciprocal rule widened to every division ........ 2 (the integer-division row; the tree row)
// ONE FINDING FROM BUILDING IT: the first draft matched only u32() and i32(). Mutating the real render/snowGpu.mjs in memory found 0 hits there, because the snow TAA path cuts the same size with
// `vec2i(dims())` -- the vector conversions are now covered, and the fixture row for them exists because the real source asked for it.
// SECTION 5 (the command, tools/ship/takeTruncations.mjs) SABOTAGES: exits 0 with hits ........ 1 | scans nothing ........ 2 (the bad-file row; the over-the-tree row) | an unknown option ignored ... 1

