// WebGLEngine/tools/ship/textureInProbe.mjs -- v4691
//
// Run: node tools/ship/textureInProbe.mjs [--repeat N]
//
// *** WHERE bloomFusedTexture-selfcheck DIES ON KEITH'S RIG, ASKED OF THE RIG RATHER THAN GUESSED AT. ***
// On Windows (Dawn on D3D12, NVIDIA) the gate exits 0xC0000005 -- an access violation inside native code --
// with section 3's header as the last line captured. Section 3 is the only caller in the tree of the native
// texture-INPUT path (runWgslComputeToTextureNative with `inputTexel`), and it is the FIFTH native call in its
// process: four calls before it each created an instance and a device, and none of them destroyed either.
// On Linux (Dawn on SwiftShader Vulkan) the same gate is green, so this box cannot answer it.
//
// The captured last line is weak evidence on its own: a line still buffered when a process dies natively is
// lost, so "died in section 3" could be "died later, and the rest never arrived". This driver runs the gate's
// calls in child processes that mark each native step with a SYNCHRONOUS write before taking it, so the last
// marker is where the process was, and runs them four ways:
//
//   alone        the section-3 call and nothing else, in a fresh process
//   order        the gate's five calls in the gate's order, arguments unchanged
//   order-gc     the same, with a forced garbage collection after each call (--expose-gc)
//   order-quiet  the same order, with the input texels precomputed before any GPU work, so the section-3 call
//                allocates almost nothing on the JS heap while Dawn objects from the earlier calls are unreachable
//
// What each outcome would say, as hypotheses the readings then confirm or refute: alone crashing puts the fault
// in the texture-input path itself. alone clean and order crashing puts it in state left by the earlier calls;
// order-gc dying at a forced collection says those objects' FINALIZERS are what crashes, and order-quiet coming
// back clean says it is the section-3 call's own allocation that triggers that collection. Nothing is asserted:
// this is an instrument for one question, and its output is the reading.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ENG = path.resolve(path.dirname(SELF), "..", "..");
const MODES = ["alone", "order", "order-gc", "order-quiet"];
const MARK = "@@ ";

const childMode = process.env.SWEK_TEXIN_MODE;
if (childMode) {
    const { runWgslComputeToTextureNative: toTex, runWgslComputeNative: compute, headlessGpuSkipReason, exitCleanly } =
        await import("./headlessGpu.mjs");
    const B = await import("../../render/bloomFused.mjs");
    const mark = (s) => fs.writeSync(2, MARK + s + "\n");
    const skip = headlessGpuSkipReason();
    if (skip) { mark("skipped: " + skip); exitCleanly(0); }
    const T = 0.7, N = B.N, WG = (N / B.TILE) * (N / B.TILE), PN = 40;
    const table = childMode === "order-quiet"
        ? Array.from({ length: N * N }, (_, i) => { const [r, g, b] = B.sourceTexel(i % N, Math.floor(i / N)); return [r, g, b, 1]; })
        : null;
    const texel = table ? (x, y) => table[y * N + x] : (x, y) => { const [r, g, b] = B.sourceTexel(x, y); return [r, g, b, 1]; };
    const CALLS = [
        ["1 hdr", (trace) => toTex({ code: B.fusedWgslToTexture(), n: N, format: B.STORAGE_FORMATS.hdr, uniforms: [T, 0, 0, 0], workgroups: WG, trace })],
        ["1 buffer", () => compute({ code: B.fusedWgsl(), outCount: N * N * 3, uniforms: [T, 0, 0, 0], workgroups: WG })],
        ["1 padded", (trace) => toTex({ code: B.fusedWgslToTexture({ n: PN }), n: PN, format: B.STORAGE_FORMATS.hdr, uniforms: [T, 0, 0, 0],
                                        workgroups: (PN / B.TILE) * (PN / B.TILE), trace })],
        ["2 clipping", (trace) => toTex({ code: B.fusedWgslToTexture({ format: B.STORAGE_FORMATS.clipping }), n: N,
                                          format: B.STORAGE_FORMATS.clipping, uniforms: [T, 0, 0, 0], workgroups: WG, trace })],
        ["3 sampled", (trace) => toTex({ code: B.fusedWgslToTexture({ sampled: true }), n: N, format: B.STORAGE_FORMATS.hdr,
                                         uniforms: [T, 0, 0, 0], workgroups: WG, inputTexel: texel, trace })],
    ];
    for (const [name, run] of childMode === "alone" ? CALLS.slice(4) : CALLS) {
        const r = await run((s) => mark(`call ${name}: ${s}`));
        mark(`call ${name}: returned ok=${r.ok}${r.ok ? "" : " (" + String(r.reason).slice(0, 120) + ")"}`);
        if (childMode === "order-gc") { mark(`gc after call ${name}`); globalThis.gc(); }
    }
    mark("all calls returned; exiting");
    exitCleanly(0);
} else {
    // v4692 -- parsed by cliArgs.mjs, not read off process.argv: `--repat 3` used to run once and say nothing.
    const { parseArgs, refusalLines } = await import("./cliArgs.mjs");
    const CLI = { values: { "--repeat": "number" }, flags: [] };
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("textureInProbe", cli.errors, CLI)) console.error(l); process.exit(2); }
    const repeat = Math.floor(cli.values["--repeat"] || 1);
    console.log(`textureInProbe -- ${process.platform}/${process.arch}, node ${process.version}, ${repeat} run(s) per mode\n`);
    for (const mode of MODES) for (let k = 0; k < repeat; k++) {
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [...(mode === "order-gc" ? ["--expose-gc"] : []), SELF], {
            cwd: ENG, env: { ...process.env, SWEK_TEXIN_MODE: mode }, encoding: "utf8", timeout: 120000, windowsHide: true });
        const marks = String(r.stderr || "").split(/\r?\n/).filter((l) => l.startsWith(MARK)).map((l) => l.slice(MARK.length));
        const code = r.status === null ? (r.error ? "TIMED OUT/" + r.error.code : "signal " + r.signal)
                   : r.status > 255 ? `0x${(r.status >>> 0).toString(16).toUpperCase()}` : String(r.status);
        const last = marks.length ? marks[marks.length - 1] : "(no marker: it died before the first step)";
        console.log(`${mode.padEnd(12)} exit ${code.padEnd(11)} ${String(Date.now() - t0).padStart(6)} ms   last: ${last}`);
        if (code !== "0") for (const m of marks.slice(-4, -1)) console.log(`${"".padEnd(12)}   before it: ${m}`);
    }
}
