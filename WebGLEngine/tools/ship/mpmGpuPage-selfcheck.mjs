// tools/ship/mpmGpuPage-selfcheck.mjs -- v3809
//
// Run: node tools/ship/mpmGpuPage-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** WHAT THIS GATE EXISTS TO PREVENT IS THE SAME THING mpmPage-selfcheck PREVENTS, ONE STEP WORSE. *** That
// gate stops a page re-implementing the CPU loop in a script block. THIS one guards a page whose whole purpose
// is a SECOND IMPLEMENTATION of graded physics -- and a second implementation is legitimate only while it
// stays adjudicable. The failure it guards against is a page that quietly drifts its own copy of the kernel,
// or its own material constants, or its own timestep rule, until the thing on screen is no longer the thing
// physics/mpm/gpuKernel-selfcheck.mjs grades and mpm-gpu-check.html adjudicates.
//
// AND ONE FAILURE MODE THAT IS SPECIFIC TO THIS PAGE AND NOT TO THE CPU ONE: *** IT MUST NOT CLAIM A PRECISION
// THE HARDWARE CANNOT DELIVER. *** mpm.html's free-fall error reads 1e-15. This kernel runs in f32 and
// accumulates in fixed point, and both were measured: it earns the same key at about 4.7e-6. A page that
// showed the CPU's figure, or graded against a tolerance only f64 could meet, would be inviting somebody to
// tune a correct loop until the number improved. The page has to say the number and say why.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = readFileSync(path.join(root, "mpm-gpu.html"), "utf8");
const CHECK = readFileSync(path.join(root, "mpm-gpu-check.html"), "utf8");
const SRV = readFileSync(path.join(root, "server.html"), "utf8");
const KERNEL = readFileSync(path.join(root, "physics/mpm/gpuKernel.mjs"), "utf8");

// Comments legitimately discuss the very things the code must not do, so every source check runs on code.
const code = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const P = code(PAGE), C = code(CHECK);

console.log("1. BOTH PAGES RUN THE SHIPPED KERNEL RATHER THAN A COPY OF IT");
{
    for (const [name, src] of [["mpm-gpu.html", P], ["mpm-gpu-check.html", C]]) {
        ok("!! " + name + " imports MPM_WGSL from physics/mpm/gpuKernel.mjs",
            /import \{[^}]*MPM_WGSL[^}]*\} from "\/physics\/mpm\/gpuKernel\.mjs"/.test(src),
            "the SAME text gpuKernel-selfcheck parses the stencil out of. A page carrying its own WGSL would " +
            "be graded by nothing");
        ok("...and " + name + " contains no kernel of its own",
            !/@compute|atomicAdd|fn p2g|fn g2p|fn svd2|workgroup_size/.test(src),
            "no compute entry point, no atomic, no SVD anywhere in the page");
    }
    // The demo page draws, so it legitimately carries a VERTEX and FRAGMENT shader. That is the one shader a
    // page may own, and it is worth pinning down rather than waving through: it may read positions and
    // velocity for colour and it may not compute a step.
    ok("!! the demo page's own shader is a RENDER shader and nothing else",
        /@vertex/.test(P) && /@fragment/.test(P) && !/@compute/.test(P),
        "it reads position and velocity out of the particle buffer to place and tint a quad. DRAWING IS THE " +
        "ONE THING A PAGE IS ALLOWED TO DO WITH A SHADER");
}

console.log("\n2. NEITHER PAGE ADDS PHYSICS, AND NEITHER RETYPES A MATERIAL CONSTANT");
{
    // *** THE ONE LEGITIMATE APPEARANCE OF "p2g" AND "g2p" IN A PAGE IS AS A QUOTED ENTRY-POINT NAME. ***
    // A page has to name the stages to dispatch them. It must not DEFINE or CALL them. Loosening the physics
    // scan to let the quoted form through would also let `p2g(` through, and the first version of this gate
    // fired on exactly this -- so the quoted selectors are removed FIRST and the broad scan then runs on what
    // is left, which is the form that still catches the mistake this is really about.
    const STAGE = /"(clear|p2g|grid|g2p)"/g;
    const noStages = (s) => s.replace(STAGE, '"<stage>"');
    for (const [name, src] of [["mpm-gpu.html", P], ["mpm-gpu-check.html", C]]) {
        const dispatchOnly = noStages(src);
        ok("!! " + name + " names the kernel stages ONLY as quoted entry points",
            !/\bp2g\s*\(|\bg2p\s*\(|fn p2g|fn g2p/.test(src),
            "the page hands a string to createComputePipeline and to dispatch. It never calls a transfer");
        ok("!! " + name + " adds no physics of its own",
            !/firstPiola|returnMap|dpReturn|quadWeights|advanceF|\bp2g\b|\bg2p\b|normalise|stressForces/.test(dispatchOnly),
            "no stress, no return mapping, no transfer, no weights. Every number either page shows was " +
            "computed by a module with a gate behind it");
        ok("!! ...and it gets its material from the graded modules rather than typing one",
            /lame\(500, 0\.3\)/.test(src) && /alphaOf\(/.test(src) && /clampLimits\(\)/.test(src) &&
            !/0\.025|0\.0075/.test(src),
            "lame() for the moduli, alphaOf() for the friction coefficient, clampLimits() for the plastic " +
            "limits -- and clampLimits MEASURES those from returnMap rather than reading them from a source " +
            "file, so plasticity.mjs stays the only place they exist");
        ok("!! ...and its fixed-point scales are derived, not chosen",
            /fixedPointScales\(\{ h/.test(src),
            "scaleFor() is arithmetic on a measured peak scaled to the cell size in use. A SCALE TYPED INTO A " +
            "PAGE WOULD BE RIGHT ON THE GRID IT WAS TRIED ON AND WRONG ON THE OTHER TWO");
        ok("!! ...and the particles come from the graded fixture",
            /restBlock\(/.test(src) && /centreOfMass\(/.test(src),
            "restBlock decides what a particle at rest IS -- rest velocity, zero affine matrix, identity F, F0 " +
            "and Fp. The page decides only where blocks sit");
    }
}

console.log("\n3. THE DEMO PAGE DOES NOT CLAIM A PRECISION THE HARDWARE CANNOT GIVE");
{
    ok("!! *** THE ANALYTIC VALUE IS THE DISCRETE FALL, NOT THE TEXTBOOK PARABOLA ***",
        /steps \* \(steps \+ 1\) \/ 2/.test(P) && !/0\.5 \* GY \* t \* t/.test(P),
        "g*dt^2*n(n+1)/2. Symplectic Euler advects with the velocity AFTER the kick, so the discrete fall is " +
        "one half-step from g*t^2/2 -- and grading against the continuous form would show a GROWING ERROR ON A " +
        "CORRECT LOOP");
    // *** THE FLOOR IS QUOTED IN TWO PLACES AND BOTH ARE GUARDED, WHICH THE FIRST VERSION OF THIS GATE DID
    // NOT DO. *** It sits in the demo:desc meta -- which is what catalogues, the page index and every other
    // surface read -- and in the footnote a person actually sees. A check satisfied by EITHER would let the
    // two drift apart, and the one that drifts is the one nobody has open. The sabotage below found this by
    // removing one copy and watching the gate stay green.
    const META = (PAGE.match(/name="demo:desc" content="([^"]*)"/) || ["", ""])[1];
    const BODY = PAGE.replace(META, "");
    ok("!! *** AND THE PAGE STATES THE f32 FLOOR RATHER THAN INHERITING THE CPU'S CLAIM, IN BOTH PLACES ***",
        /4\.7e-6/.test(META) && /8\.9e-16/.test(META) && /4\.7e-6/.test(BODY) && /8\.9e-16/.test(BODY),
        "mpm.html reads 1e-15 here and this kernel cannot and must not. Both numbers were MEASURED -- the " +
        "kernel on a WGSL interpreter, the CPU loop in f64 -- and the page prints both so the gap is " +
        "attributed to single precision instead of being read as a defect");
    ok("...and its own tolerance is set at the measured floor, not below it",
        /err < 1e-4 \? "ok"/.test(P),
        "an indicator that could only ever be green on f64 is decoration; one set below the hardware's floor " +
        "would be permanently red and teach the reader to ignore it");
    ok("!! it shows the sideways drift as well as the vertical error", /sideways drift/.test(PAGE),
        "gravity is vertical and NOTHING ELSE MAY PUSH -- a non-zero drift means the stencil or the force " +
        "scatter has gone asymmetric, and it is the cheapest thing to notice by eye");
    ok("!! and it reports saturated scatters, which is the failure that is otherwise invisible",
        /saturat/i.test(PAGE) && /saturation/.test(P),
        "an i32 accumulator that overflows WRAPS rather than crashing, and the material then does something " +
        "plausible and wrong. The count makes it sayable");
}

console.log("\n4. THE TIMESTEP IS DERIVED FROM THE CELL SIZE, WHICH IS WHAT MAKES THE RESOLUTIONS SAFE");
{
    ok("!! *** dt SCALES WITH h RATHER THAN BEING A CONSTANT ***",
        /dtFor = \(h\) => h \/ 120/.test(P),
        "*** AN EXPLICIT MPM STEP IS LIMITED BY THE WAVE SPEED CROSSING A CELL. mpm.html runs h = 0.5 at " +
        "dt = 1/240; offering a 256-cell grid at that same dt would put the CFL number sixteen times over and " +
        "THE MATERIAL WOULD SIMPLY EXPLODE -- which reads on screen as a bad kernel rather than as a bad " +
        "timestep. h/120 holds the CFL number at exactly the value the graded loop already runs at, so " +
        "choosing a finer grid changes the resolution and changes nothing about the stability ***");
    ok("!! and the wall standoff is in CELLS, so it survives a change of resolution",
        /\(scene\.walls\.lo \+ 1\) \* h/.test(P),
        "three cells is 0.375 at 64 cells and 0.094 at 256. A FIXED OFFSET IN METRES WOULD HAVE STARTED THE " +
        "MATERIAL INSIDE THE BOUNDARY ON ONE GRID AND NOT THE OTHER, and a block embedded in a wall does not " +
        "fail -- it quietly sheds the momentum the wall zeroes");
    ok("...and the walls still stand three cells in, as v3798 proved they must",
        /lo: 3, hi: 3/.test(P) && !/lo: 1/.test(P),
        "a quadratic stencil reaches one cell each way, so a particle a fraction above the domain edge has a " +
        "stencil base of -1 -- a row that does not exist and that both halves of the transfer skip. mpm.html " +
        "shipped with lo:1 and lost 99.9% of its horizontal momentum to it");
}

console.log("\n5. THE ADJUDICATOR IS A REAL ADJUDICATOR");
{
    ok("!! it puts the kernel against the GRADED loop, not against itself",
        /from "\/physics\/mpm\/step\.mjs"/.test(C) && /\bstep\(/.test(C),
        "physics/mpm/step.mjs is what tools/roundhouse grades. Comparing the kernel to a second copy of the " +
        "kernel would agree beautifully and mean nothing");
    ok("!! it compares particle by particle rather than by a summary",
        /worstGap/.test(C) && /worst particle apart/.test(CHECK),
        "a centre of mass can agree while every particle is wrong: the errors cancel. THE SUMMARY IS THE ONE " +
        "STATISTIC A BROKEN TRANSFER IS MOST LIKELY TO GET RIGHT");
    ok("!! *** IT TESTS DETERMINISM, WHICH IS THE ONE CLAIM ONLY REAL HARDWARE CAN TEST ***",
        /bit-identical/.test(CHECK) && /steps: 40/.test(C),
        "the WGSL interpreter runs invocations ONE AFTER ANOTHER, so it cannot see a race however long it " +
        "runs. On a GPU the order genuinely varies, and integer atomics are the reason the answer should not");
    ok("!! it asks the GPU to earn the key ALONE, and against the discrete form",
        /KEY_STEPS \* \(KEY_STEPS \+ 1\) \/ 2/.test(C),
        "agreement with the CPU and earning an analytic result are different claims: the first can be passed " +
        "by two implementations that are wrong the same way");
    ok("!! it checks the fixed point never clipped during any run above",
        /saturated/.test(CHECK) && /\.sat/.test(C));
    ok("!! *** THERE IS A SABOTAGE AND IT CORRUPTS THE ONE THING THE KERNEL RETYPES ***",
        /o\.w1 = 0\.75 -/.test(C) && /0\.755/.test(C),
        "the B-spline coefficient is the only arithmetic in the kernel that also exists in JavaScript, so it " +
        "is the only place a typo could put the two implementations out of step. THE SAME CORRUPTION IS " +
        "PLANTED IN physics/mpm/gpuKernel-selfcheck.mjs, so both halves of the defence have been watched " +
        "failing on the identical mistake");
    ok("...and the sabotage's tolerance could actually catch it",
        /w\.rel < 1e-4/.test(C),
        "1e-4 relative against a measured 1.6e-7 of honest f32 disagreement: loose enough for single " +
        "precision, three orders too tight for a weight that breaks partition of unity");
}

console.log("\n6. BOTH PAGES HAVE A FRONT DOOR, AND A WAY BACK OUT");
{
    ok("!! server.html carries an anchor to the demo", /href="\/mpm-gpu\.html"/.test(SRV));
    ok("!! server.html carries an anchor to the adjudicator", /href="\/mpm-gpu-check\.html"/.test(SRV));
    // *** v3853 -- THIS CHECK MATCHED PROSE, AND THE COMMENT DIRECTLY BELOW IT ALREADY NAMED THAT MISTAKE FOR
    // ITS SIBLING. *** v3816 unpinned the "has no WebGPU" wording two lines down with the words "a gate that
    // forbids its own fix is a gate that gets edited to agree with whatever shipped" -- and this line went on
    // matching two exact title sentences, so gateQuality counted it as a prose-as-code offender and the
    // debt-does-not-grow wall went red on it. THE LESSON WAS LEARNED FOR ONE CHECK AND NOT THE ONE BESIDE IT.
    //
    // THE PROPERTY IS "THE ANCHOR EXPLAINS THE PAGE RATHER THAN NAMING IT", and that is structural: the link
    // TEXT is a short label ("MPM GPU") and the TITLE is the explanation. Asserted as a relationship between
    // the two, so any rewording survives and an anchor that degrades to a bare name does not.
    const anchor = (href) => {
        const esc = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = SRV.match(new RegExp('<a[^>]*href="' + esc + '"[^>]*>([^<]*)</a>'));
        if (!m) return null;
        const t = m[0].match(/title="([^"]*)"/);
        return { text: m[1].trim(), title: t ? t[1].trim() : "" };
    };
    for (const href of ["/mpm-gpu.html", "/mpm-gpu-check.html"]) {
        const a = anchor(href);
        ok(`the ${href} anchor EXPLAINS the page rather than naming it`,
            !!a && a.title !== a.text && a.title.length > 8 * Math.max(a.text.length, 1),
            a ? `link text ${JSON.stringify(a.text)} (${a.text.length} chars), title ${a.title.length} chars -- ` +
                "a bare name would fail this and any rewording passes it" : "anchor not found");
    }
    // v3816 -- THIS CHECK USED TO REQUIRE THE STRING "has no WebGPU" AND WENT RED WHEN THAT SENTENCE WAS
    // CORRECTLY REMOVED. It was pinned to a WORDING when the property is "the page asks why, and says where
    // the physics runs without a GPU". A gate that forbids its own fix is a gate that gets edited to agree
    // with whatever shipped -- so it now asserts the module is consulted, which is the thing that must not
    // regress. See ui/webgpuOrigin-selfcheck.mjs for why the old sentence was wrong on a LAN origin.
    ok("!! the demo page names the CPU page as the fallback, and ASKS WHY rather than assuming",
        /mpm\.html/.test(P) && /webgpuProbe/.test(P),
        "a page that needs hardware the reader may not have must say where the same physics runs without it -- " +
        "and must not tell a reader on a LAN origin that their browser lacks WebGPU when it does not");
    ok("!! ...and it points at the adjudicator, which is where its own claim is settled",
        /mpm-gpu-check\.html/.test(PAGE),
        "a demo asserting it runs graded physics should carry the link to the thing that checks the assertion");
}

console.log("\n7. THE KERNEL'S OWN HEADER DOES NOT OVERSTATE WHAT HAS BEEN ESTABLISHED");
{
    ok("!! it still says the kernel is untried on a real GPU",
        /UNTRIED ON A GPU|CORRECT ON AN INTERPRETER/.test(KERNEL),
        "*** IT HAS BEEN RUN ON A WGSL INTERPRETER AND THAT IS NOT THE SAME AS HAVING BEEN RUN. *** An " +
        "interpreter cannot prove the shader compiles on a driver and cannot see a race. The day " +
        "mpm-gpu-check.html reports a verdict from Keith's machine, this line is what should change");
    ok("...and it records that the interpreter's first disagreement was the interpreter's own bug",
        /24 of 64|workgroup_size\(64\)/.test(KERNEL),
        "the harness ran 24 of 64 invocations and the kernel was blamed for it. A HARNESS IS AN INSTRUMENT AND " +
        "AN UNCHECKED INSTRUMENT IS A RUMOUR");
}

console.log("\n8. THE SABOTAGES, BECAUSE A CHECK NOBODY HAS WATCHED FAIL IS A CHECK NOBODY SHOULD TRUST");
{
    // Each of these corrupts the page text in the exact way this gate exists to catch, and re-runs the check
    // that should catch it. They operate on copies; nothing is written.
    const stage = (s) => s.replace(/"(clear|p2g|grid|g2p)"/g, '"<stage>"');

    const inlined = P.replace("const wg = (x)", "function p2g(ps, g) { return quadWeights(ps.x, g.h); }\n  const wg = (x)");
    ok("!! SABOTAGE: a transfer inlined into the page IS caught",
        /firstPiola|returnMap|dpReturn|quadWeights|advanceF|\bp2g\b|\bg2p\b|normalise|stressForces/.test(stage(inlined)),
        "and the quoted entry-point names in the same page still do NOT trip it -- which is the distinction " +
        "the first version of this gate got wrong");

    const typed = P.replace("clampLimits()", "{ thetaC: 0.025, thetaS: 0.0075 }");
    ok("!! SABOTAGE: clamp limits typed into the page instead of measured ARE caught",
        !(/clampLimits\(\)/.test(typed) && !/0\.025|0\.0075/.test(typed)),
        "0.025 and 0.0075 are plasticity.mjs's defaults, and a page carrying its own copy would keep working " +
        "perfectly right up until somebody changed the model");

    const fixedDt = P.replace("const dtFor = (h) => h / 120;", "const dtFor = (h) => 1 / 240;");
    ok("!! SABOTAGE: a constant timestep IS caught", !/dtFor = \(h\) => h \/ 120/.test(fixedDt),
        "which is the failure that would look like a broken kernel: at 256 cells a fixed dt puts the CFL " +
        "number sixteen times over and the material simply explodes");

    // *** THE ONE I MOST WANTED A CONTROL FOR, AND IT EARNED ITS KEEP IMMEDIATELY. *** A page inheriting
    // mpm.html's 1e-15 would look more impressive, pass every other check here, and quietly invite somebody
    // to tune a correct loop until a number f32 cannot reach came out. Written first as a single
    // string replace, it FAILED -- because the floor is quoted twice and String.replace takes the first
    // occurrence, so the gate was still finding the second and calling itself satisfied. THE SABOTAGE FOUND
    // A HOLE IN THE CHECK IT WAS WRITTEN TO PROVE, which is the entire argument for writing sabotages.
    const meta = (PAGE.match(/name="demo:desc" content="([^"]*)"/) || ["", ""])[1];
    const metaGone = PAGE.replace(meta, meta.replace(/4\.7e-6/g, "1.2e-15"));
    const bodyGone = PAGE.replace(meta, "<META>").replace(/4\.7e-6/g, "1.2e-15").replace("<META>", meta);
    const guarded = (src) => {
        const m = (src.match(/name="demo:desc" content="([^"]*)"/) || ["", ""])[1];
        const b = src.replace(m, "");
        return /4\.7e-6/.test(m) && /4\.7e-6/.test(b);
    };
    ok("!! SABOTAGE: the CPU's precision claim in the META alone IS caught", !guarded(metaGone),
        "the meta description is what catalogues and the page index read, and it is the copy nobody has open");
    ok("!! SABOTAGE: ...and in the VISIBLE FOOTNOTE alone, separately", !guarded(bodyGone),
        "two copies of one number need two controls, and one control passing for both is how they drift");

    const noSab = CHECK.replace(/0\.755/g, "0.75");
    ok("!! SABOTAGE: an adjudicator whose sabotage button does nothing IS caught",
        !/0\.755/.test(noSab),
        "a corruption button that corrupts nothing is the worst possible object in this tree: it produces a " +
        "green run that a reader has been told is evidence the check can go red");
}

console.log("\n9. A REAL BROWSER LOADS BOTH PAGES, BECAUSE SOURCE CHECKS DID NOT CATCH THE ONE THAT MATTERED");
//
// *** EVERY CHECK ABOVE THIS ONE PASSED ON A PAGE THAT DID NOT RUN. *** physics/mpm's modules end in a
// command-line demo guarded by `if (process.argv[1] ...)`, and `process` is a NODE GLOBAL. In a browser that
// throws ReferenceError AT MODULE SCOPE, which kills the whole import graph -- so mpm.html rendered its
// headings and then nothing at all, and had done since v3795. THE CHANGELOG ASKED KEITH TO LOOK AT A PAGE
// THAT COULD NOT DRAW. Eight modules were guarded at v3809 and all three pages now load clean.
//
// A source scan would not have found it: the line is CORRECT, in the language it was written for. Only
// loading the page finds this class of defect, so the gate loads the page.
{
    const { execFileSync } = await import("node:child_process");
    // *** v3941 -- SAME BUG AS browserSafety-selfcheck.mjs, IN A CHILD PROCESS WEARING IT DIFFERENTLY. *** A
    // single hardcoded PW path -- no fallback list at all -- and a message that said "no chromium at SHELL"
    // whenever the shell was present and only playwright was the missing half. Both files independently hit
    // this and browserSafety's own header already named the fix in v3940; this one still had the v3939 shape.
    // RESOLVED IN THE PARENT, NOT THE CHILD: the child script cannot try a list of require() paths and report
    // which worked back to something a human reads, so resolution happens here and the ONE path that worked is
    // baked into the spawned script as a literal.
    const { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } = await import("./playwrightResolve.mjs");
    const { createRequire } = await import("node:module");
    const { chromium: _probe, from: pwFrom } = resolvePlaywright(createRequire(import.meta.url));
    const SHELL = HEADLESS_SHELL;
    const PW = pwFrom;
    const why = browserSkipReason(_probe, pwFrom);
    if (why) {
        console.log("  SKIP  the live page load   " + why + " -- SKIPPING WITH A REASON RATHER THAN PASSING QUIETLY.");
    } else {
        const script = `
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const { chromium } = createRequire(${JSON.stringify(PW)})(${JSON.stringify(PW)});
const ROOT = ${JSON.stringify(root)};
const MIME = { ".html":"text/html", ".mjs":"text/javascript", ".js":"text/javascript" };
const srv = http.createServer((req,res)=>{
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {"Content-Type": MIME[path.extname(f)] || "application/octet-stream"});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>srv.listen(8749, r));
const b = await chromium.launch({ executablePath: ${JSON.stringify(SHELL)} });
const out = {};
for (const page of ["mpm.html","mpm-gpu.html","mpm-gpu-check.html"]) {
  const p = await b.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(String(e).split("\\n")[0]));
  await p.goto("http://127.0.0.1:8749/" + page, { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  const said = await p.evaluate(() => {
    const e = document.getElementById("err") || document.getElementById("verdict");
    return { fallback: !!(e && getComputedStyle(e).display !== "none" && e.innerText.trim().length > 0),
             links: [...document.querySelectorAll("a")].map(a => a.getAttribute("href") || "").join(",") };
  });
  out[page] = { errs, ...said };
  await p.close();
}
await b.close(); srv.close();
console.log("__J__" + JSON.stringify(out));`;
        try {
            const raw = execFileSync(process.execPath, ["--input-type=module", "-e", script],
                { encoding: "utf8", timeout: 90000 });
            const res = JSON.parse(raw.split("__J__")[1]);
            for (const page of ["mpm.html", "mpm-gpu.html", "mpm-gpu-check.html"]) {
                ok("!! " + page.padEnd(19) + " loads in a real browser with NO page error",
                    res[page].errs.length === 0,
                    res[page].errs.length ? res[page].errs.join(" | ")
                        : "clean. *** THIS IS THE CHECK THAT WOULD HAVE CAUGHT `process is not defined`, AND " +
                          "NOTHING ELSE IN THIS FILE COULD HAVE ***");
            }
            ok("!! *** WITHOUT WebGPU, mpm-gpu.html SAYS SO INSTEAD OF SHOWING AN EMPTY CANVAS ***",
                res["mpm-gpu.html"].fallback && /\/mpm\.html/.test(res["mpm-gpu.html"].links),
                "the headless shell has no adapter, which makes it exactly the reader whose machine cannot run " +
                "this page -- and what that reader gets is a sentence and a link to the CPU version, not a " +
                "black rectangle");
            ok("...and the adjudicator degrades the same way rather than throwing",
                res["mpm-gpu-check.html"].errs.length === 0);
        } catch (e) {
            ok("the live page load completed", false, String(e.message).slice(0, 200));
        }
    }
}

report("WHAT THIS GATE DOES NOT DO",
    "It loads the pages but it cannot JUDGE them: the headless shell has no WebGPU adapter, so the kernel never " +
    "executes here and no particle is ever drawn. Whether the material looks like sand is Keith's reading, and " +
    "whether the shader compiles on his driver is mpm-gpu-check.html's. " +
    "What is checked is that both pages are wired to the graded modules, add no physics, derive every constant " +
    "rather than typing it, scale the timestep with the cell size, and report the f32 floor honestly rather " +
    "than borrowing the CPU page's. *** THE TWO THINGS WORTH READING BACK ARE WHETHER mpm-gpu-check.html GOES " +
    "GREEN ON REAL HARDWARE -- AND ESPECIALLY ITS DETERMINISM ROW, WHICH NOTHING BEFORE IT COULD TEST -- AND " +
    "WHETHER THE PILE'S FRICTION SELECTOR STILL VISIBLY NARROWS THE SPREAD AT SIXTY-FIVE THOUSAND PARTICLES " +
    "THE WAY IT DOES AT THIRTY-SIX. ***");

console.log("\nmpmGpuPage-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
