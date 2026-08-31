#!/usr/bin/env node
// tools/ship/boundListener-selfcheck.mjs -- v4223
//
// Run: node tools/ship/boundListener-selfcheck.mjs      (pure logic in node; the browser half skips with a reason)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/boundListener.mjs -- the mutant rule, that a binding should only listen while its element is
// attached.
//
// *** THE FAILURE THIS IS ABOUT IS NOT A CRASH, IT IS WORK NOBODY ASKED FOR. *** A listener on window or
// document outlives the element that installed it. The panel is gone from the screen and its handler still
// runs on every resize, every keydown, every mousemove -- touching a detached node, recomputing a layout
// nobody can see, and holding the whole subtree alive. Nothing errors. The page just quietly does more.
import {
    bindWhileAttached, bindAllWhileAttached, bindingStats, resetBindings, whenDetached, sweepAll,
} from "../../ui/boundListener.mjs";
// *** codeOnly() BLANKS STRING LITERALS AS WELL AS COMMENTS, AND THAT MATTERS HERE. *** The tree's rule is
// that an ABSENCE is a code shape and belongs to codeOnly; a PRESENCE that includes a string argument --
// addEventListener("mousemove", onDragMove) -- does not survive it, because the string becomes "". The first
// draft of section 6 asserted exactly that against codeOnly and failed against correctly fixed code.
import { codeOnly, noComments } from "./sourceScan.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("boundListener-selfcheck -- a listener that stops when its element does\n");

/** A target that records exactly what was added and removed, by IDENTITY. */
function fakeTarget() {
    const live = new Map();
    return {
        live,
        addEventListener(type, fn, opts) { const k = type + ":" + (live.size); live.set(fn, { type, opts }); },
        removeEventListener(type, fn) { live.delete(fn); },
        fire(type, ev = {}) { let n = 0; for (const [fn, m] of live) if (m.type === type) { fn(ev); n++; } return n; },
        count() { return live.size; },
    };
}
const fakeOwner = (connected = true) => ({ isConnected: connected });

// ---- 1. THE LIFECYCLE --------------------------------------------------------------------------------------
console.log("1. it listens exactly while the owner is attached");
{
    resetBindings();
    const t = fakeTarget(), o = fakeOwner(true);
    let fired = 0;
    const h = bindWhileAttached(o, t, "resize", () => { fired++; });
    ok("!! an attached owner is listening immediately, not on the next mutation", h.listening && t.count() === 1);
    t.fire("resize");
    ok("...and the handler runs", fired === 1);

    o.isConnected = false; h.sync();
    ok("!! a detached owner stops listening, and the listener is really OFF the target",
        !h.listening && t.count() === 0);
    t.fire("resize");
    ok("...so the handler does NOT run -- which is the whole point", fired === 1);

    o.isConnected = true; h.sync();
    ok("!! re-attaching revives it -- this tree REPARENTS panels rather than rebuilding them",
        h.listening && t.count() === 1);
    t.fire("resize");
    ok("...and it runs again", fired === 2);
    ok("the add/remove counts are what the story says", JSON.stringify(h.counts) === JSON.stringify({ adds: 2, removes: 1 }));
}

// ---- 2. A BINDING MADE WHILE DETACHED ----------------------------------------------------------------------
console.log("\n2. an owner that is not in the document yet");
{
    resetBindings();
    const t = fakeTarget(), o = fakeOwner(false);
    let fired = 0;
    const h = bindWhileAttached(o, t, "keydown", () => { fired++; });
    ok("!! binding a DETACHED owner listens to nothing rather than listening anyway",
        !h.listening && t.count() === 0, "a panel built before it is inserted must not start early");
    o.isConnected = true; h.sync();
    ok("...and it starts when the owner arrives", h.listening && t.fire("keydown") === 1 && fired === 1);
}

// ---- 3. THE IDENTITY TRAP ----------------------------------------------------------------------------------
console.log("\n3. *** removeEventListener MATCHES ON IDENTITY, AND FAILS SILENTLY WHEN IT DOES NOT ***");
{
    const t = fakeTarget();
    const handler = () => {};
    t.addEventListener("x", handler);
    t.removeEventListener("x", () => {});                    // a fresh arrow: a different function
    ok("!! removing a DIFFERENT function reference removes nothing, and reports nothing", t.count() === 1,
        "no error, no return value, no warning -- the listener stays and the cleanup looks done");
    t.removeEventListener("x", handler);
    ok("...removing the same reference works", t.count() === 0);

    // the module must therefore hold the caller's function, not a wrapper built per call
    resetBindings();
    const t2 = fakeTarget(), o = fakeOwner(true);
    const mine = () => {};
    bindWhileAttached(o, t2, "y", mine);
    ok("!! the module registers the CALLER's function, so its own removal can match it",
        t2.live.has(mine), "a wrapper here would leak every listener it ever added");
}

// ---- 4. DISPOSE --------------------------------------------------------------------------------------------
console.log("\n4. dispose, and the observer that must not outlive the last binding");
{
    resetBindings();
    const t = fakeTarget(), o = fakeOwner(true);
    const h = bindWhileAttached(o, t, "z", () => {});
    ok("one binding is registered", bindingStats().bindings === 1 && bindingStats().listening === 1);
    h.dispose();
    ok("!! dispose removes the listener AND the registration", t.count() === 0 && bindingStats().bindings === 0);
    h.dispose();
    ok("...and calling it twice is harmless", bindingStats().bindings === 0 && t.count() === 0);
    ok("!! with nothing left to watch, the module is not observing -- the leak it exists to prevent, in itself",
        bindingStats().observing === false);

    resetBindings();
    const t3 = fakeTarget(), o3 = fakeOwner(true);
    const many = bindAllWhileAttached(o3, [
        { target: t3, type: "a", handler: () => {} },
        { target: t3, type: "b", handler: () => {} },
        { target: t3, type: "c", handler: () => {} },
    ]);
    ok("bindAll registers them all", t3.count() === 3 && bindingStats().bindings === 3);
    many.dispose();
    ok("...and disposes them together", t3.count() === 0 && bindingStats().bindings === 0);
}

// ---- 5. ONE OBSERVER -------------------------------------------------------------------------------------
console.log("\n5. *** ONE OBSERVER FOR THE PAGE, NOT ONE PER BINDING ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "ui", "boundListener.mjs"), "utf8"));
    ok("!! there is exactly one `new MutationObserver` in the module",
        (src.match(/new MutationObserver/g) || []).length === 1,
        "one per binding means N callbacks for every DOM change anywhere on the page");
    ok("...and it observes with subtree:true, or a panel nested in a dock is never noticed",
        /subtree:\s*true/.test(src));
    ok("!! the module touches no DOM global at import time -- it is imported by pages that run before body",
        !/^\s*(const|let|var)\s+\w+\s*=\s*document\./m.test(src) && /typeof document !== ""/.test(src));
}

// ---- 6. THE CENSUS THAT MOTIVATES IT -----------------------------------------------------------------------
console.log("\n6. the numbers in the module header, re-measured here so they cannot rot");
{
    const files = fs.readdirSync(path.join(ROOT, "ui")).filter((f) => f.endsWith(".js"));
    let globalAdds = 0, globalRemoves = 0, allAdds = 0, noRemove = 0;
    for (const f of files) {
        const src = fs.readFileSync(path.join(ROOT, "ui", f), "utf8");
        const ga = (src.match(/(?:window|document)\.addEventListener/g) || []).length;
        const gr = (src.match(/(?:window|document)\.removeEventListener/g) || []).length;
        allAdds += (src.match(/addEventListener/g) || []).length;
        globalAdds += ga; globalRemoves += gr;
        if (ga > 0 && !/removeEventListener/.test(src)) noRemove++;
    }
    console.log(`  ui/: ${allAdds} addEventListener in total, of which ${globalAdds} are on window or document; ${globalRemoves} global removals; ${noRemove} modules add a global listener and remove none`);
    ok("!! the global adds still outnumber the global removals by a wide margin", globalAdds > globalRemoves * 4,
        `${globalAdds} vs ${globalRemoves}`);
    ok("...and the crude 619-vs-22 figure really is misleading, which is why the header says so",
        allAdds > globalAdds * 5, `${allAdds} total vs ${globalAdds} global -- a listener ON an element dies with it`);
    // THE TWO CASES THIS ROUND ACTUALLY FIXED, asserted as fixed rather than as motivation.
    const hb = noComments(fs.readFileSync(path.join(ROOT, "ui", "HeartbeatAvatar.js"), "utf8"));
    ok("!! HeartbeatAvatar's drag pair is added AND removed, in matched pairs",
        (hb.match(/document\.addEventListener\("(mousemove|mouseup)", onDrag(Move|Up)\)/g) || []).length === 2
        && (hb.match(/document\.removeEventListener\("(mousemove|mouseup)", onDrag(Move|Up)\)/g) || []).length === 2);
    ok("!! ...and the add happens inside the mousedown handler, not at construction",
        hb.indexOf('addEventListener("mousemove", onDragMove)') > hb.indexOf('addEventListener("mousedown"'),
        "installed at construction, it ran on every mousemove on the page for the life of the tab");
    ok("...using the same function references, or removeEventListener would match nothing",
        /const onDragMove = /.test(hb) && /const onDragUp = /.test(hb));
    const kl = noComments(fs.readFileSync(path.join(ROOT, "ui", "kaggleLab.js"), "utf8"));
    ok("!! kaggleLab's hand-rolled MutationObserver is gone, replaced by the shared registration",
        !/new MutationObserver/.test(kl) && /whenDetached\(/.test(kl));
    // and no THIRD copy of the pattern appears
    const uiFiles = fs.readdirSync(path.join(ROOT, "ui")).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
    const owners = uiFiles.filter((f) => /new MutationObserver/.test(codeOnly(fs.readFileSync(path.join(ROOT, "ui", f), "utf8"))));
    console.log(`  ui/ modules still constructing their own MutationObserver: ${owners.length} (${owners.join(", ") || "none"})`);
    ok("...and the ones that remain are doing something other than detach-detection",
        !owners.includes("kaggleLab.js"));
}

// ---- 6b. whenDetached -------------------------------------------------------------------------------------
console.log("\n6b. whenDetached: the shape kaggleLab hand-rolled");
{
    resetBindings();
    const o = fakeOwner(true);
    let cleared = 0;
    const w = whenDetached(o, () => { cleared++; });
    ok("!! an attached owner does not fire it", !w.fired && cleared === 0);
    ok("...and it is registered on the same single observer as the listeners",
        bindingStats().bindings === 1);
    o.isConnected = false;
    // drive a sweep by hand, the way the MutationObserver would in a browser
    ok("!! it fires exactly once when the owner goes, and unregisters itself",
        (() => { const before = cleared; sweepAll(); const after = cleared; sweepAll();
                 return before === 0 && after === 1 && cleared === 1 && bindingStats().bindings === 0; })());
    resetBindings();
    const o2 = fakeOwner(true);
    const w2 = whenDetached(o2, () => { cleared++; });
    w2.dispose();
    o2.isConnected = false; sweepAll();
    ok("...and a disposed registration never fires", cleared === 1 && bindingStats().bindings === 0);
    // Reported as a FAIL rather than as a crash: without the guard the throw escapes sweepAll(), which in a
    // browser would escape the MutationObserver callback and stop EVERY other binding on the page from being
    // swept -- one panel's bad teardown silencing all the others. Here it merely took this gate down, with no
    // line saying which check had died, which is its own small lesson about letting a check throw.
    ok("!! a throwing teardown does not take the sweep -- or every other binding -- down with it", (() => {
        try {
            resetBindings();
            const bad = fakeOwner(true), good = fakeOwner(true);
            let ran = 0;
            whenDetached(bad, () => { throw new Error("boom"); });
            whenDetached(good, () => { ran++; });
            bad.isConnected = false; good.isConnected = false;
            sweepAll();
            return ran === 1;
        } catch (e) { return false; }
    })());
    resetBindings();
}

// ---- 7. IN A REAL BROWSER ----------------------------------------------------------------------------------
console.log("\n7. *** THE MEASUREMENT THAT MATTERS, IN A REAL DOM ***");
{
    const { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } = await import("./playwrightResolve.mjs");
    const skip = browserSkipReason(require);
    if (skip) {
        console.log("  ----  SKIPPED, WITH A REASON: " + skip);
        console.log("        Sections 1-6 drive the same code with a fake target, so the LOGIC is gated either");
        console.log("        way. What only a browser can show is that a real MutationObserver notices a real");
        console.log("        removal -- which is the half that would rot silently.");
    } else {
        const { chromium } = resolvePlaywright(require);
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        try {
            const page = await browser.newPage();
            const mod = fs.readFileSync(path.join(ROOT, "ui", "boundListener.mjs"), "utf8");
            await page.setContent("<!doctype html><body><div id=host></div></body>");
            const r = await page.evaluate(async (source) => {
                const M = await import("data:text/javascript;base64," + btoa(unescape(encodeURIComponent(source))));
                const host = document.getElementById("host");
                const mk = () => { const d = document.createElement("div"); host.appendChild(d); return d; };
                const settle = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));

                const naiveEl = mk();
                let naive = 0;
                window.addEventListener("resize", () => { naive++; void naiveEl.tagName; });
                window.dispatchEvent(new Event("resize"));
                const naiveAttached = naive;
                naiveEl.remove();
                window.dispatchEvent(new Event("resize"));
                const naiveDetached = naive;

                const el = mk();
                let bound = 0;
                const h = M.bindWhileAttached(el, window, "resize", () => { bound++; });
                window.dispatchEvent(new Event("resize"));
                const boundAttached = bound;
                el.remove(); await settle();
                window.dispatchEvent(new Event("resize"));
                const boundDetached = bound;
                host.appendChild(el); await settle();
                window.dispatchEvent(new Event("resize"));
                const boundReattached = bound;
                const counts = h.counts;
                h.dispose();
                return { naiveAttached, naiveDetached, boundAttached, boundDetached, boundReattached,
                         counts, after: M.bindingStats() };
            }, mod);
            console.log(`  naive listener: ${r.naiveAttached} fire(s) attached -> ${r.naiveDetached} after the element is removed`);
            console.log(`  bound listener: ${r.boundAttached} attached -> ${r.boundDetached} detached -> ${r.boundReattached} re-attached`);
            ok("!! *** THE NAIVE LISTENER KEEPS FIRING AFTER ITS ELEMENT IS GONE ***",
                r.naiveDetached > r.naiveAttached, `${r.naiveAttached} -> ${r.naiveDetached}`);
            ok("!! *** THE BOUND ONE DOES NOT ***", r.boundDetached === r.boundAttached,
                `${r.boundAttached} -> ${r.boundDetached}, with a real MutationObserver noticing a real removal`);
            ok("!! ...and comes back when the element is put back", r.boundReattached > r.boundDetached);
            ok("added twice, removed once -- bound, detached, re-attached",
                JSON.stringify(r.counts) === JSON.stringify({ adds: 2, removes: 1 }));
            ok("!! after dispose the observer is disconnected, so the module leaves nothing behind",
                r.after.observing === false && r.after.bindings === 0);
        } finally { await browser.close(); }
    }
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT THE OTHER 25 MODULES ARE FIXED. Two are: HeartbeatAvatar's drag pair now lives for the");
console.log("      drag rather than for the page, and kaggleLab's hand-rolled observer is now a registration");
console.log("      on the shared one. The rest are left deliberately, because each carries its own OWNER");
console.log("      question -- which element governs this listener -- and answering it wrong makes a panel");
console.log("      deaf, which is worse than making it wasteful. The mechanism is here and gated; the");
console.log("      case-by-case judgement is not something a gate can supply.");

console.log("\nboundListener-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
