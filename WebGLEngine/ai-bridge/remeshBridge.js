// remeshBridge.js -- AutoRemesher (huxingyi/autoremesher) integration.
//
// Turns dense generated meshes (Trellis / ComfyUI-3D / cuda_voxelizer output)
// into clean QUAD topology, and makes LODs via a target-quads count. Wired as
// a timeout-guarded subprocess, exactly like the other external tools -- mesh
// in, quad mesh out, and on ANY failure the ORIGINAL mesh is kept (never a
// hard dependency).
//
// HONESTY ABOUT THE CLI: the 1.0.0 release added a command-line interface with
// adaptivity / sharp-edge / smooth-normal / target-quads parameters, but the
// EXACT flag names are not documented upstream. Per our standing rule (never
// bake un-verified install/invoke commands -- prior AI docs fabricated them),
// this bridge DISCOVERS the syntax at runtime by probing `--help`, caches what
// it actually sees, and refuses to invoke with guessed flags. If the probe
// cannot confirm how to pass input/output, it reports that plainly so the user
// can supply the invocation, instead of running a fabricated command.

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IS_WIN = process.platform === "win32";

// ---- locate the binary (reuses the same paths autoInstall detects) ----
const CANDIDATE_PATHS = [
    process.env.SWEK_AUTOREMESHER,
    path.join(__dirname, "..", "vendor", "autoremesher", IS_WIN ? "autoremesher.exe" : "autoremesher"),   // v2084 -- built-from-source output
    path.join(os.homedir(), "autoremesher", IS_WIN ? "autoremesher.exe" : "autoremesher"),
    "C:\\Program Files\\AutoRemesher\\autoremesher.exe",
    "C:\\Program Files (x86)\\AutoRemesher\\autoremesher.exe",
    path.join(os.homedir(), "AppData", "Local", "AutoRemesher", "autoremesher.exe"),
    "/usr/local/bin/autoremesher", "/usr/bin/autoremesher",
    "/Applications/AutoRemesher.app/Contents/MacOS/autoremesher",
    path.join(os.homedir(), "Applications", "AutoRemesher.app", "Contents", "MacOS", "autoremesher"),
].filter(Boolean);

function findBinary() {
    for (const p of CANDIDATE_PATHS) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    // last resort: on PATH
    const which = IS_WIN ? "where" : "which";
    try {
        const r = spawnSync(which, ["autoremesher"], { windowsHide: true, timeout: 6000, encoding: "utf8" });
        if (r.status === 0 && r.stdout) {
            const line = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
            if (line && fs.existsSync(line)) return line;
        }
    } catch {}
    return null;
}

// ---- discover the CLI syntax from --help (cached) ----
// We look for the flags the release notes named. We ONLY use a flag if we saw
// it in --help output; otherwise it stays unset (or, for input/output, we
// report that we could not verify how to pass them).
let _cliCache = null;   // { bin, help, flags:{ input, output, targetQuads, adaptivity, sharp, smooth }, verified }
function discoverCli(bin) {
    if (_cliCache && _cliCache.bin === bin) return _cliCache;
    let help = "";
    for (const flag of ["--help", "-h", "/?"]) {
        try {
            const r = spawnSync(bin, [flag], { windowsHide: true, timeout: 15000, encoding: "utf8" });
            help = ((r.stdout || "") + "\n" + (r.stderr || "")).trim();
            if (help && /usage|option|--\w|input|output/i.test(help)) break;
        } catch {}
    }
    // match a long flag by the concept words it would contain; return the exact
    // token as printed so we invoke with the real spelling, never a guess.
    const pick = (res) => {
        for (const re of res) {
            const m = help.match(re);
            if (m) return m[1];
        }
        return null;
    };
    const flags = {
        input:       pick([/(--input(?:-mesh|-file)?)\b/i, /(-i)\b(?=[\s,]|$)/]),
        output:      pick([/(--output(?:-mesh|-file)?)\b/i, /(-o)\b(?=[\s,]|$)/]),
        targetQuads: pick([/(--target-?quads?[\w-]*)\b/i]),
        adaptivity:  pick([/(--adaptivity[\w-]*)\b/i]),
        sharp:       pick([/(--sharp[\w-]*)\b/i]),
        smooth:      pick([/(--smooth[\w-]*)\b/i]),
    };
    // "verified" means we could see BOTH how to pass input and output. Some
    // builds accept positional `autoremesher in.obj out.obj`; if --help shows a
    // positional usage pattern, allow that too.
    const positional = /usage:\s*\S*autoremesher\S*\s+\S*input\S*\s+\S*output/i.test(help) ||
                       /autoremesher\s+<?input>?\s+<?output>?/i.test(help);
    const verified = !!((flags.input && flags.output) || positional);
    _cliCache = { bin, help, flags, positional, verified };
    return _cliCache;
}

function status() {
    const bin = findBinary();
    if (!bin) return { installed: false, bin: null, verified: false,
        note: "AutoRemesher not found. Install the prebuilt release (deps bundled) from https://github.com/huxingyi/autoremesher/releases, or build from source (VS2022/CMake + TBB)." };
    const cli = discoverCli(bin);
    return {
        installed: true, bin, verified: cli.verified, positional: cli.positional,
        flags: cli.flags,
        help: cli.help || "",   // v2082 -- raw --help output, so the UI can show it for copy/report
        note: cli.verified
            ? "AutoRemesher ready. CLI syntax discovered from --help."
            : "AutoRemesher found, but its command-line syntax could not be auto-verified from --help. Set SWEK_AUTOREMESHER_ARGS to a template (use {in} and {out}) to invoke it, e.g. \"{in} {out} --target-quads 5000\".",
    };
}

// ---- build the argv, honestly ----
// Returns { argv } or { error }. Honors an explicit override template
// (SWEK_AUTOREMESHER_ARGS with {in}/{out}) so the user can supply the exact
// invocation when auto-discovery is not confident.
function buildArgs(cli, inPath, outPath, opts = {}) {
    const tmpl = process.env.SWEK_AUTOREMESHER_ARGS;
    if (tmpl && tmpl.includes("{in}") && tmpl.includes("{out}")) {
        const filled = tmpl.replace(/\{in\}/g, inPath).replace(/\{out\}/g, outPath);
        // naive shell-free split on spaces (paths are in temp, no spaces by construction)
        return { argv: filled.split(/\s+/).filter(Boolean) };
    }
    if (!cli.verified) {
        return { error: "AutoRemesher CLI syntax not verified and no SWEK_AUTOREMESHER_ARGS template set. " +
                        "Refusing to run a guessed command. Set SWEK_AUTOREMESHER_ARGS=\"{in} {out} ...\" once you know the flags." };
    }
    const f = cli.flags;
    const argv = [];
    if (cli.positional && !(f.input && f.output)) {
        argv.push(inPath, outPath);
    } else {
        argv.push(f.input, inPath, f.output, outPath);
    }
    if (opts.targetQuads != null && f.targetQuads) argv.push(f.targetQuads, String(parseInt(opts.targetQuads, 10)));
    if (opts.adaptivity != null && f.adaptivity)   argv.push(f.adaptivity, String(Number(opts.adaptivity)));
    if (opts.sharp != null && f.sharp)             argv.push(f.sharp, String(Number(opts.sharp)));
    if (opts.smooth != null && f.smooth)           argv.push(f.smooth, String(Number(opts.smooth)));
    return { argv };
}

// ---- run: mesh in (OBJ/STL/PLY path), quad mesh out; timeout-guarded ----
// opts: { targetQuads, adaptivity, sharp, smooth, timeoutMs }
// Resolves { ok, out, ms } or { ok:false, error, fallback:true } -- on any
// failure the caller keeps the ORIGINAL mesh.
function remesh(inPath, outPath, opts = {}) {
    return new Promise((resolve) => {
        const bin = findBinary();
        if (!bin) { resolve({ ok: false, error: "AutoRemesher not installed", fallback: true }); return; }
        if (!fs.existsSync(inPath)) { resolve({ ok: false, error: "input mesh not found: " + inPath, fallback: true }); return; }
        const cli = discoverCli(bin);
        const built = buildArgs(cli, inPath, outPath, opts);
        if (built.error) { resolve({ ok: false, error: built.error, fallback: true }); return; }

        const timeoutMs = opts.timeoutMs || 180000;   // 3 min default; retopo is slow, and the tool can hang on bad meshes
        const t0 = Date.now();
        let child, done = false, timer = null;
        const finish = (r) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(r); };
        try {
            child = spawn(bin, built.argv, { windowsHide: true });
        } catch (e) {
            finish({ ok: false, error: "spawn failed: " + (e && e.message), fallback: true }); return;
        }
        let stderr = "";
        child.stderr && child.stderr.on("data", (d) => { stderr += String(d).slice(0, 2000); });
        timer = setTimeout(() => {
            // the Blender-addon fork documents AutoRemesher can HANG on some
            // (esp. low-poly) meshes -- so we hard-kill on timeout and fall back.
            try { child.kill("SIGKILL"); } catch {}
            finish({ ok: false, error: "AutoRemesher timed out after " + timeoutMs + "ms (kept original mesh)", fallback: true });
        }, timeoutMs);
        child.on("error", (e) => finish({ ok: false, error: "process error: " + (e && e.message), fallback: true }));
        child.on("exit", (code) => {
            const ms = Date.now() - t0;
            if (code === 0 && fs.existsSync(outPath)) finish({ ok: true, out: outPath, ms });
            else finish({ ok: false, error: "exit " + code + (stderr ? (" -- " + stderr.slice(0, 300)) : ""), fallback: true, ms });
        });
    });
}

module.exports = { status, remesh, findBinary, discoverCli, buildArgs, CANDIDATE_PATHS };
