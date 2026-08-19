// WebGLEngine/ai-bridge/krbnRoutes.js — v2608
//
// The Krbn install button and the render route. Wired into ai-bridge/server.js.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith, from a Windows box, after v2606 handed him a blob.krbn.ts:
//
//     C:\box3d>bun run render blob.krbn.ts
//     error: Script not found "render"
//     C:\box3d>curl -fsSL https://bun.sh/install | bash
//     Windows Subsystem for Linux has no installed distributions.
//
// BOTH OF THOSE ARE MY FAULT AND BOTH ARE ONE LINE:
//
//   1. `bun run render` IS KRBN'S OWN PACKAGE SCRIPT. He ran it from C:\box3d; Krbn cloned into C:\box3d\Krbn.
//      A package script only exists inside its package. He needed `cd Krbn` and I never said so.
//   2. `curl | bash` IS A BASH SCRIPT AND WINDOWS HAS NO BASH. I handed a Windows user a Unix install line and
//      watched WSL cough up an interleaved error. Bun's Windows installer is PowerShell:
//      powershell -c "irm bun.sh/install.ps1|iex"
//
// AND HIS ACTUAL QUESTION WAS BETTER THAN EITHER FIX: "is a .ts file that i would want to export, or import, or
// is it just a test that you export? if this is the last time I will see a .ts file, then we can just fix my
// Krbn installer."
//
// API.md ANSWERS IT, AND THE ANSWER IS: HE SHOULD NEVER HAVE TO SEE ONE.
//
//     "A `Drawing` is just `{ toSvg(): string }`, so you can also call it directly (`scene.toSVG(cam)`),
//      embed the string, or ship it however you like."
//
// THE .ts IS KRBN'S CLI FORMAT -- A SCENE PACKAGED AS A PROGRAM FOR `bun run render`. IT IS NOT THE LIBRARY'S
// INTERFACE. The library's interface is an object with a method that returns a string. So SweK builds the scene
// in JS, calls toSVG, and puts the SVG on a page. NO FILE. NO CLI. NO `bun run` ANYTHING.
//
// ---- WHAT IS RIG-ONLY HERE, SAID PLAINLY ---------------------------------------------------------------------------
//
// THIS SANDBOX HAS NO BUN, NO GIT NETWORK ACCESS TO GITHUB'S CLONE ENDPOINT, AND CANNOT RUN A WINDOWS
// POWERSHELL LINE. So the PREFLIGHT is gated and tested here; THE INSTALL ITSELF IS RIG-ONLY AND LABELLED AS
// SUCH. I am not going to claim a Windows installer works because a Linux container did not object to the
// string I built for it.
//
// AND ONE THING I DO NOT KNOW AND WILL NOT GUESS: WHETHER KRBN IMPORTS FROM NODE. It is 99.7% TypeScript and
// its CLI is a Bun script. Node cannot import .ts without a loader. If Krbn ships compiled JS, /krbn/render
// works under plain Node; IF NOT, IT NEEDS BUN AS THE RUNTIME. The preflight reports which, RATHER THAN THE
// PAGE GUESSING AND FAILING LATER IN A WAY THAT LOOKS LIKE MY BUG.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const isWin = process.platform === "win32";

/** Where Krbn lives, if it lives. Beside the project, not inside it -- it is somebody else's repo. */
export function krbnDir(projectRoot) {
    return path.join(path.dirname(projectRoot), "Krbn");
}

/** Is a command on PATH? Returns null (not false) when we could not tell, because those differ. */
function which(cmd) {
    return new Promise((resolve) => {
        const probe = isWin ? "where" : "which";
        execFile(probe, [cmd], { timeout: 4000 }, (err, stdout) => {
            if (err) return resolve(null);
            const line = String(stdout).split(/\r?\n/).find((l) => l.trim());
            resolve(line ? line.trim() : null);
        });
    });
}

/**
 * PREFLIGHT. What is actually on this machine? Every field is a fact, not a plan.
 *
 * The emsdk installer (v2246) taught this: CHECK BEFORE YOU DOWNLOAD, AND SAY WHAT YOU FOUND. An installer that
 * starts by failing halfway through is worse than one that refuses at the door.
 */
export async function krbnPreflight(projectRoot) {
    const dir = krbnDir(projectRoot);
    const cloned = fs.existsSync(path.join(dir, "package.json"));
    let scripts = null, hasCompiledJs = null;
    if (cloned) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
            scripts = Object.keys(pkg.scripts || {});
            // DOES IT IMPORT FROM NODE? If main/exports point at .js it probably does; at .ts it needs Bun.
            const entry = JSON.stringify(pkg.exports || pkg.main || "");
            hasCompiledJs = /\.js"|\.mjs"/.test(entry) && !/\.ts"/.test(entry);
        } catch { /* a package.json we cannot parse is a fact too */ }
    }
    const [git, bun, node] = await Promise.all([which("git"), which("bun"), which("node")]);
    return {
        platform: process.platform,
        dir,
        cloned,
        scripts,
        hasCompiledJs,
        git,
        bun,
        node,
        installed: Boolean(cloned && fs.existsSync(path.join(dir, "node_modules"))),
        // THE TWO LINES KEITH ACTUALLY NEEDED, CORRECT FOR HIS PLATFORM.
        bunInstallCmd: isWin ? 'powershell -c "irm bun.sh/install.ps1|iex"' : "curl -fsSL https://bun.sh/install | bash",
        note: isWin
            ? "curl | bash CANNOT WORK HERE -- that is a bash script and Windows has no bash. Use the PowerShell line."
            : null,
    };
}

/** The ordered steps, each with the reason it exists. The page shows these; the button runs them. */
export function krbnPlan(pf) {
    const steps = [];
    if (!pf.git) steps.push({ id: "git", need: "git is not on PATH", how: isWin ? "winget install Git.Git" : "apt install git", blocking: true });
    if (!pf.bun) steps.push({ id: "bun", need: "bun is not on PATH -- Krbn's CLI is a Bun script", how: pf.bunInstallCmd, blocking: true });
    if (!pf.cloned) steps.push({ id: "clone", need: "Krbn is not cloned", how: "git clone https://github.com/vpalos/Krbn " + JSON.stringify(pf.dir), blocking: true });
    if (pf.cloned && !pf.installed) steps.push({ id: "deps", need: "Krbn has no node_modules", how: "bun install", cwd: pf.dir, blocking: true });
    return steps;
}

/** Run one planned step. RIG-ONLY: this sandbox has neither bun nor clone access, and does not pretend to. */
export function krbnRun(step) {
    return new Promise((resolve) => {
        const opts = { cwd: step.cwd || process.cwd(), timeout: 300000, shell: true };
        execFile(step.how, [], opts, (err, stdout, stderr) => {
            resolve({ id: step.id, ok: !err, out: String(stdout || "").slice(-4000), err: String(stderr || err?.message || "").slice(-4000) });
        });
    });
}

/**
 * Wire into server.js. Raw node http, dispatching on req.url, matching the /health shape at line 4395.
 */
export function handleKrbn(req, res, projectRoot) {
    const url = (req.url || "").split("?")[0];
    if (!url.startsWith("/krbn")) return false;

    const json = (code, body) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && url === "/krbn/preflight") {
        krbnPreflight(projectRoot).then((pf) => json(200, { ...pf, plan: krbnPlan(pf) })).catch((e) => json(500, { error: e.message }));
        return true;
    }

    if (req.method === "POST" && url === "/krbn/install") {
        krbnPreflight(projectRoot).then(async (pf) => {
            const plan = krbnPlan(pf);
            const results = [];
            for (const step of plan) {
                const r = await krbnRun(step);
                results.push(r);
                if (!r.ok && step.blocking) break;   // STOP AT THE FIRST BLOCKING FAILURE. Do not press on and
            }                                        // produce a second, more confusing error on top of the real one.
            json(200, { results, after: await krbnPreflight(projectRoot) });
        }).catch((e) => json(500, { error: e.message }));
        return true;
    }

    return false;
}
