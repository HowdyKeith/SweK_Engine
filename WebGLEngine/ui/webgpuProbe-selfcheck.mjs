import path from "node:path";
// WebGLEngine/ui/webgpuProbe-selfcheck.mjs -- v3666
//
// Run: node ui/webgpuProbe-selfcheck.mjs
//
// *** KEITH'S REPORT WAS TWO TRUE STATEMENTS AT ONCE: "this computer has webgpu, it works with our blob webgpu
// and all the webgpu.com demos" AND server.html saying "this browser has no WebGPU". THE DETECTOR WAS NOT WRONG
// ABOUT THE FACT -- navigator.gpu really was undefined -- IT WAS WRONG ABOUT THE CAUSE, and the cause is the
// only part a person can act on. WebGPU is gated on a SECURE ORIGIN: https, or localhost. server.html is served
// from http://192.168.10.53:8787, A LAN IP, WHICH IS NEITHER, so the browser does not expose navigator.gpu on
// that page at all. "The browser has no WebGPU" and "this origin does not get WebGPU" are TWO THINGS WEARING
// ONE LABEL, and naming the wrong one sends the reader to check their GPU, their driver and their browser
// version -- none of which is the problem. ***
//
// Every global arrives as an argument, so each environment below is a literal instead of a browser.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describeWebGPU, probeAdapter } from "./webgpuProbe.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const env = (gpu, secure, host, proto = "http:") => ({
    navigator: gpu ? { gpu } : {}, isSecureContext: secure,
    location: { protocol: proto, hostname: host, host: host + ":8787", pathname: "/server.html" },
});

// --- 1. KEITH'S ACTUAL CASE ---------------------------------------------------------------------------------
{
    say("1. THE PAGE HE WAS LOOKING AT: http://192.168.10.53:8787/server.html");
    const r = describeWebGPU(env(null, false, "192.168.10.53"));
    say("     reason: " + r.reason);
    say("     message: " + r.message);
    ok("!! it names the ORIGIN, not the browser", r.reason === "insecure-origin" && !/this browser has no/.test(r.message),
        "the old line said 'this browser has no WebGPU' on a machine whose browser demonstrably has it");
    ok("and it says what to do about it", r.actionable === true && /https|localhost/.test(r.message),
        "a diagnosis a reader cannot act on is a complaint");
}

// --- 2. THE CASES IT MUST NOT CONFUSE ------------------------------------------------------------------------------
{
    say("2. THE SAME ABSENCE FROM FOUR DIFFERENT CAUSES.");
    const rows = [
        ["LAN IP, http", env(null, false, "192.168.10.53"), "insecure-origin"],
        ["localhost, http", env(null, false, "localhost"), "no-webgpu"],
        ["127.0.0.1, http", env(null, false, "127.0.0.1"), "no-webgpu"],
        ["https, truly absent", env(null, true, "example.com", "https:"), "no-webgpu"],
        ["https, present", env({}, true, "example.com", "https:"), "present"],
    ];
    for (const [name, e, want] of rows) {
        const r = describeWebGPU(e);
        say("     " + name.padEnd(20) + " -> " + r.reason + (r.reason === want ? "" : "   *** expected " + want + " ***"));
    }
    ok("!! every case lands on its own reason", rows.every(([, e, want]) => describeWebGPU(e).reason === want));
    ok("!! localhost over http is NOT reported as an insecure origin", describeWebGPU(env(null, false, "localhost")).reason === "no-webgpu",
        "THE BROWSER'S OWN RULE, NOT OURS: localhost and 127.0.0.1 count as secure even over http. Treating them " +
        "as insecure would tell a developer on their own machine to switch to https, which would not help and is " +
        "not true");
    ok("a real absence on a secure page still says the plain thing", /this browser has no WebGPU/.test(describeWebGPU(env(null, true, "example.com", "https:")).message),
        "the original message was not deleted -- it was NARROWED to the case where it is actually correct");
}

// --- 3. PRESENCE IS NOT CAPABILITY ------------------------------------------------------------------------------------
{
    say("3. navigator.gpu CAN EXIST AND STILL YIELD NO ADAPTER -- a case the old one-line check could not see.");
    const mk = (adapter, throws) => ({ ...env({ requestAdapter: async () => { if (throws) throw new Error("nope"); return adapter; } }, true, "example.com", "https:") });
    const good = await probeAdapter(mk({}));
    const none = await probeAdapter(mk(null));
    const boom = await probeAdapter(mk(null, true));
    say("     adapter returned -> " + good.reason + "   |   null adapter -> " + none.reason + "   |   threw -> " + boom.reason);
    ok("an adapter means available", good.available === true && good.reason === "adapter");
    ok("!! a null adapter is NOT available, and says so instead of rendering a blank canvas",
        none.available === false && none.reason === "no-adapter",
        "a blocklisted driver or a headless session hands back null with navigator.gpu still present. The old " +
        "check would have mounted the GPU surface and shown an empty box");
    ok("a throwing requestAdapter is caught, not propagated", boom.available === false && boom.reason === "adapter-threw");
    ok("and the insecure-origin case short-circuits without ever calling requestAdapter", (() => {
        let called = false;
        const e = env(null, false, "192.168.10.53");
        e.navigator = { gpu: undefined, requestAdapter: () => { called = true; } };
        return describeWebGPU(e).reason === "insecure-origin" && !called;
    })());
}

// --- 4. THE CENSUS, WHICH IS THE PART THAT IS NOT FIXED ------------------------------------------------------------------
{
    say("4. HOW MANY OTHER PLACES SPELL THIS TEST THEMSELVES.");
    // *** v3941 -- THIS SHELLED OUT TO `grep ... | grep -v`, AND IT DIED BEFORE IT EVER GOT THERE. ***
    // Two faults on one line, and Keith's box hit the first:
    //   (1) fileURLToPath WAS NEVER IMPORTED. A ReferenceError at section 4 killed the whole gate, so the
    //       eleven checks above it printed PASS and the process still exited 1 -- a gate that reported
    //       success line by line and failure overall, which is the worst of both readings.
    //   (2) THE CENSUS NEEDED A POSIX SHELL, grep, AND A PIPE. Fixing the import alone would have moved the
    //       crash one line later on Windows, where none of the three exist. Same family as todo-selfcheck's
    //       `bash -lc` and zipShapeFor's `tar -tf`: a tool reached for because it was in the author's
    //       terminal, in a tree whose own law is that main-module detection has to survive Windows.
    // The walk is node's, so the census runs anywhere the gate does. NOTE THE DUPLICATION HONESTLY: six other
    // modules here carry their own walk() (orphanScan, duplicateFiles, checkerCensus, deadImportScan,
    // shaderRefs, galaxyBind) and this is a seventh. Extracting one shared walker is the right round and is
    // not this one -- writing it down beats leaving the next reader to rediscover the count.
    const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const SKIP = new Set(["node_modules", ".git", "vendor", "rt", "__pycache__"]);
    const list = [];
    (function walk(dir) {
        for (const name of readdirSync(dir)) {
            if (SKIP.has(name)) continue;
            const q = path.join(dir, name);
            if (statSync(q).isDirectory()) { walk(q); continue; }
            if (!/\.(js|mjs|html)$/.test(name)) continue;
            if (readFileSync(q, "utf8").includes("navigator.gpu")) list.push(path.relative(ENG, q));
        }
    })(ENG);
    const secure = list.filter((f) => /isSecureContext/.test(readFileSync(path.join(ENG, f), "utf8")));
    say("     files touching navigator.gpu: " + list.length + "   of those considering the ORIGIN: " + secure.length);
    ok("!! the census actually WALKED something -- an empty scan is not a clean tree",
        list.length > 10 && secure.length > 0,
        "*** AN EMPTY REPORT AND A SCAN THAT NEVER RAN ARE INDISTINGUISHABLE, and this line exists because " +
        "the walk it grades replaced a shell-out that could not run on half the machines in the fleet. *** " +
        "Found " + list.length + " file(s) touching navigator.gpu.");
    ok("this module and its caller are among those that do", secure.length >= 2);
    say("   *** SO THE FIX IS ONE PANEL DEEP AND THE DEFECT IS TREE-WIDE. Keith said he has seen this on a few");
    say("   demos and would note the others; THIS CENSUS IS WHY THERE ARE OTHERS -- thirty-odd files each");
    say("   answering 'do we have WebGPU' in their own words, and all but a couple asking only whether the");
    say("   object exists. NOT REWRITTEN HERE: changing thirty files on one report is how a fix becomes a");
    say("   regression. The shared answer exists now; each one moves when its page is next touched. ***");
}

// --- 5. purity -----------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./webgpuProbe.mjs", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("no globals of its own -- navigator, isSecureContext and location all arrive as arguments",
        !/\bwindow\./.test(code) && !/\bdocument\./.test(code) &&
        !/(^|[^.\w])navigator\s*\./.test(code.replace(/env\.navigator/g, "ENV")),
        "which is the only reason section 2 can state five browsers as five literals");
    say("   NOT CHECKED: that a real browser agrees. The secure-origin rule is the SPEC's, and this asserts what");
    say("   the spec says rather than what any particular build does. IF CHROME EVER EXPOSED navigator.gpu ON AN");
    say("   INSECURE ORIGIN, THIS WOULD STILL SAY 'insecure-origin' AND BE WRONG -- but it would only say it when");
    say("   navigator.gpu was ALREADY absent, so the failure mode is a wrong REASON, never a wrong verdict.");
}

// ---- THE ADVICE HAS TO BE TAKEABLE (v3771) -----------------------------------------------------------------
// *** KEITH HIT THIS MESSAGE ON server.html CYCLING PAST THE BLOB AVATAR, AND IT WAS RIGHT ABOUT THE CAUSE AND
// INCOMPLETE ABOUT THE FIX. It offered an https:// URL and said nothing about what makes that URL exist. The
// bridge DOES serve https -- ai-bridge/server.js builds an https.createServer with the same request handler,
// and getCreds() GENERATES a self-signed cert if none is present -- BUT ONLY WHEN THE ENVIRONMENT VARIABLE
// HTTPS IS SET, and a grep for HTTPS=1 across every .bat, .sh and .md in the tree returned NOTHING.
// NAMING A FIX THAT DOES NOT EXIST IS WORSE THAN NAMING NO FIX, BECAUSE IT SENDS SOMEBODY TO TRY IT. ***
{
    const insecure = describeWebGPU({ navigator: {}, isSecureContext: false,
        location: { protocol: "http:", hostname: "192.168.10.193", host: "192.168.10.193:8787", pathname: "/server.html" } });
    ok("!! *** THE INSECURE-ORIGIN MESSAGE NAMES THE SWITCH, NOT JUST THE URL ***",
        /HTTPS=1/.test(insecure.message) && /https:\/\/192\.168\.10\.193:8787/.test(insecure.message),
        "it claims `actionable: true`, so the reader must be able to ACT: the message now names HTTPS=1, says " +
        "the cert is generated on first run, and warns that the browser will complain once. IT ALSO OFFERS THE " +
        "CHEAPER ROUTE FIRST -- open it on the serving machine, where localhost counts as secure and no cert " +
        "is needed at all");
    // *** v3772 -- THE ROUTE A REMOTE VIEWER CAN ACTUALLY TAKE. Keith asked "can we fix the MacBook too?" and
    // route (1) is USELESS FROM ANOTHER MACHINE: localhost on the MacBook is the MacBook, not the server. The
    // engine already ships the answer -- the Tunnels panel runs cloudflared against this same port and returns
    // a *.trycloudflare.com URL with a PUBLICLY TRUSTED certificate, so there is no warning and no cert file.
    // A MESSAGE THAT ONLY OFFERS A LOCAL FIX TO A REMOTE READER HAS NAMED NOTHING THEY CAN DO. ***
    ok("!! *** IT NAMES A ROUTE THAT WORKS FROM ANOTHER MACHINE, NOT ONLY FROM THE SERVING ONE ***",
        /trycloudflare/.test(insecure.message) && /localhost:8787/.test(insecure.message) &&
        /HTTPS=1/.test(insecure.message),
        "all three routes present, cheapest first. The tunnel is the one that helps a REMOTE viewer and it is " +
        "strictly better than HTTPS=1 there -- a publicly trusted cert warns nobody, while a self-signed one " +
        "warns once PER DEVICE");
    ok("!! and it still names the actual origin it is complaining about",
        /192\.168\.10\.193/.test(insecure.message) && insecure.reason === "insecure-origin",
        "the host comes from loc.hostname; a message that said 'this page is http://' with nothing after it " +
        "would be a message about nothing");
    const local = describeWebGPU({ navigator: {}, isSecureContext: false,
        location: { protocol: "http:", hostname: "localhost", host: "localhost:8787", pathname: "/server.html" } });
    // *** v3779 -- WHERE THE TEXT LIVES IS PART OF WHETHER IT IS RIGHT. v3771 and v3772 grew this to three
    // numbered routes, each addition individually correct, AND NEITHER ASKED WHERE IT RENDERS: a note beside a
    // 223px avatar in a gauge dock. Keith read the result as a NEW FAILURE -- "this avatar worked fine before"
    // -- and the avatar had not changed; THE MESSAGE HAD. A CORRECT MESSAGE IN THE WRONG PLACE IS STILL A
    // DEFECT. ***
    ok("!! *** THERE IS A SHORT LINE FOR THE INLINE SPOT, AND IT FITS ONE ***",
        typeof insecure.short === "string" && insecure.short.length < 130 && insecure.short.length > 30,
        // *** THE DETAIL STRING MUST NOT DEREFERENCE WHAT THE CHECK IS TESTING FOR. Written as
        // `insecure.short.length`, removing the property made this gate THROW -- exit 1 with ZERO "FAIL"
        // LINES, so a grep for FAIL read CLEAN while the gate was entirely broken. SEVENTH INSTANCE THIS
        // SESSION of "a crash is not a red check", and the first one inside a MESSAGE rather than a condition:
        // the check itself was correct and its own explanation killed it. ***
        (insecure.short || "").length + " chars against the full text's " + insecure.message.length +
        ". The note sits beside a 223px avatar; a paragraph there DOMINATES THE PANEL");
    ok("!! and the short line still names a route the reader can take right now",
        /localhost/.test(insecure.short || "") && /tunnel/i.test(insecure.short || ""),
        "the two that need no certificate. THE DETAIL IS NOT DROPPED -- the full text is the note's title, so " +
        "hovering gives all three routes. MOVED, NOT DELETED");
    ok("!! the full message is UNCHANGED, so nothing was lost to make room",
        /HTTPS=1/.test(insecure.message) && /trycloudflare/.test(insecure.message) && /localhost:8787/.test(insecure.message),
        "all three routes still present in `message`");
    ok("!! localhost is NOT told to fix its origin -- the browser already treats it as secure",
        local.reason === "no-webgpu" && local.actionable === false && !/HTTPS=1/.test(local.message),
        "reason " + local.reason + ". A CHECK THAT FIRES ON CORRECT INPUT IS WORSE THAN NO CHECK: on localhost " +
        "the absence really is the browser, and telling somebody to enable TLS there would be a wrong answer " +
        "delivered confidently");
}

console.log("webgpuProbe-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
