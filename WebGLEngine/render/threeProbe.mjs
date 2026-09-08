// WebGLEngine/render/threeProbe.mjs -- v4494
//
// *** IS THE three 0.178 PIN THE FLEET'S OR THE BUILD BOX'S? *** (docs/TSL-ROADMAP.md step 7 item 17, task 17.) At
// v4319 three 0.185 was tried and refused on THIS shell's Chromium -- its texture views pass a `swizzle` the browser
// did not know -- and 0.178 was vendored because it ran unpatched. v4537 probed the BOUNDARY rather than the newest
// and found 0.184 draws here, so the vendored build is 0.184.0 now. That is still a fact about one headless shell. Whether
// a rig's Chrome refuses the same build is the question, and nobody can answer it from here. three-probe.html is the
// instrument: it fetches a named three version's tarball from registry.npmjs.org (CORS *, measured), gunzips it with
// the browser's DecompressionStream, walks the tar (this file), rewrites the build's two internal imports to blob
// URLs, imports it, starts a WebGPURenderer, renders one TSL gradient into a render target and reads it back --
// beside the vendored 0.178 through the same steps as the control. tools/ship/threeProbe-selfcheck.mjs runs the
// same page here against a cached tarball and records what THIS box says; the rig's answer is RIG-PENDING until
// tools/ship/three-probe.json is saved from the page.
"use strict";

export const PROBE_CONTROL = Object.freeze({ label: "vendored 0.184", kind: "local", src: "./vendor/three-webgpu/" });

// *** v4537 -- THE NEWEST VERSION WAS NEVER THE ONE THAT MATTERED, AND THIS LIST HELD ONLY THE NEWEST. ***
// v4494 probed 0.185.1 because it was the newest, found it refused, and the gate's own closing line named
// what it had not done: "unchecked here: versions other than 0.185.1". The question a pin actually raises is
// not "does the newest work" but "WHERE IS THE LINE" -- the oldest version that clears whatever needs it, and
// the last one before the refusal. Nobody asked, so the tree sat on 0.178 while 0.184 ran here perfectly.
//
// Both sides of the line are probed now, and the boundary is the assertion: the version BELOW must draw and
// the version ABOVE must refuse. A three that starts refusing at 0.184, or one that starts drawing at 0.185,
// is a changed browser and the row says so instead of the pin quietly meaning something else.
export const PROBE_BOUNDARY = Object.freeze({
    at: "v4537",
    lastGood: "0.184.0",       // vendored since v4537; draws on WebGPU here, rev 184
    firstRefused: "0.185.1",   // GPUTextureViewDescriptor with `this.swizzle = 'rgba'`; this browser has no such member
    why: "the refusal is the BROWSER's -- Chromium's WebGPU has no GPUTextureComponentSwizzle -- so a rig whose " +
         "Chrome knows it will draw 0.185 on this same page, and the pin can move the day it does",
});
export const PROBE_VERSIONS = Object.freeze(["0.184.0", "0.185.1"]);   // both sides of the line; the page takes ?versions=
export const BUILD_FILES = Object.freeze(["three.webgpu.js", "three.core.js", "three.tsl.js"]);
export const tarballUrl = (version) => `https://registry.npmjs.org/three/-/three-${version}.tgz`;

/** Walk a POSIX/ustar tar: 512-byte headers, octal size, name + ustar prefix. Returns [{ name, bytes }] for regular files. */
export function untar(bytes) {
    const out = [];
    const td = new TextDecoder();
    const str = (o, n) => { let s = td.decode(bytes.subarray(o, o + n)); const z = s.indexOf("\0"); return z >= 0 ? s.slice(0, z) : s; };
    let p = 0;
    while (p + 512 <= bytes.length) {
        if (bytes[p] === 0) { let allZero = true; for (let i = 0; i < 512; i++) if (bytes[p + i]) { allZero = false; break; } if (allZero) break; }
        const name = str(p, 100), size = parseInt(str(p + 124, 12).trim() || "0", 8), type = String.fromCharCode(bytes[p + 156] || 48);
        const magic = str(p + 257, 6), prefix = magic.startsWith("ustar") ? str(p + 345, 155) : "";
        const full = prefix ? prefix + "/" + name : name;
        if (type === "0" || type === "\0" || type === "7") out.push({ name: full, bytes: bytes.subarray(p + 512, p + 512 + size) });
        p += 512 + Math.ceil(size / 512) * 512;
    }
    return out;
}

/** The three build files out of a package tarball's entries (package/build/<file>), as { file: text }. Throws naming what is missing. */
export function pickBuild(entries) {
    const td = new TextDecoder(), out = {};
    for (const f of BUILD_FILES) {
        const e = entries.find((x) => x.name === "package/build/" + f);
        if (!e) throw new Error("threeProbe: the tarball has no package/build/" + f);
        out[f] = td.decode(e.bytes);
    }
    return out;
}

/**
 * Rewrite the build's two internal imports so the three files can be imported from blob URLs (where relative
 * specifiers cannot resolve): three.webgpu.js's './three.core.js' and three.tsl.js's 'three/webgpu' -- the same
 * one-line edit vendor/three-webgpu carries for 0.178. `urls` maps file -> URL. Returns { file: text } and the count
 * of replacements, so a gate can hold that exactly the expected specifiers were touched and nothing else.
 */
export function rewriteImports(files, urls) {
    const out = {}, counts = {};
    for (const f of BUILD_FILES) {
        let t = files[f], n = 0;
        if (f === "three.webgpu.js") t = t.replace(/from\s+(['"])\.\/three\.core\.js\1/g, () => { n++; return `from "${urls["three.core.js"]}"`; });
        // the registry build says 'three/webgpu'; vendor/three-webgpu's copy already says './three.webgpu.js' (v4319's edit) -- both spellings
        if (f === "three.tsl.js") t = t.replace(/from\s+(['"])(?:three\/webgpu|\.\/three\.webgpu\.js)\1/g, () => { n++; return `from "${urls["three.webgpu.js"]}"`; });
        out[f] = t; counts[f] = n;
    }
    return { files: out, counts };
}

/** The page's record: { page: "three-probe.html", at, ua, when, route, results: [{ label, version, revision, backend, ok, error, ms }] }. Refuses lies. */
export function gradeProbe(j) {
    const problems = [];
    if (!j || j.page !== "three-probe.html") problems.push("not a three-probe record");
    const rs = Array.isArray(j && j.results) ? j.results : [];
    if (rs.length < 2) problems.push(`only ${rs.length} results (the control and at least one version)`);
    if (!rs.some((r) => r.label === PROBE_CONTROL.label)) problems.push("no vendored control");
    for (const r of rs) {
        if (typeof r.ok !== "boolean") { problems.push(`${r.label}: ok is not a boolean`); break; }
        if (r.ok && r.error) { problems.push(`${r.label}: ok with an error`); break; }
        if (!r.ok && !r.error) { problems.push(`${r.label}: failed with no error text`); break; }
        if (r.ok && !(typeof r.revision === "string" && /^\d+/.test(r.revision))) { problems.push(`${r.label}: ok with no revision`); break; }
        if (r.ok && !(r.backend === "webgpu" || r.backend === "webgl2")) { problems.push(`${r.label}: backend ${r.backend}`); break; }
        if (!(Number.isFinite(r.ms) && r.ms >= 0)) { problems.push(`${r.label}: ms not finite`); break; }
    }
    const control = rs.find((r) => r.label === PROBE_CONTROL.label);
    if (control && !control.ok) problems.push("the vendored control failed: the box, not the version, is the finding");
    return { ok: problems.length === 0, problems, route: j && j.route, newest: rs.filter((r) => r.label !== PROBE_CONTROL.label), control };
}
