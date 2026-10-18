// WebGLEngine/tools/ship/subAquariumServerHtml-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subAquariumServerHtml-selfcheck.mjs
//
// WHAT server.html GOT FOR THE SUB AQUARIUM: a FLY BRAIN chip and a FISH BRAIN chip beside the GPU BRAIN chip, and a "Sub" button on every online peer row that sends one of THIS box's own subs to that peer.
// The bridge's rules are gated in subAquariumBridge-selfcheck; this gate holds the PAGE's half, by RUNNING the added code (in node:vm, against a fake DOM and a fake fetch), not by grepping that it exists.
//   1  THE MARKUP   each chip has its status / dot / word ids exactly once, a click-through (fly -> /fly-connectome.html, fish -> /sub-aquarium.html), and sits INSIDE the peer-activity header with the GPU chip;
//                   the Arriving row links /sub-aquarium.html; pageSections.mjs files it in UNPLACED with a reason
//   2  THE CHIPS    run with the health answer 'standin' -> amber dot, word "stand-in"; 'live' -> green; 'offline' -> red; a fetch that throws -> "unreachable"; the detail becomes the hover title; each chip polls its
//                   OWN url, through swekTick (so a hidden tab pauses it), and the fish chip's url is not the fly's
//   3  THE SEND     run sendSubTo against a fake fetch/prompt/alert: it offers only the box's LOCAL subs; it POSTs {peer, id} to /subaquarium/send and nothing else; a cancelled prompt, a number off the list and an
//                   empty tank send nothing; a refusal from the bridge is shown, not swallowed; the button is restored. The peer row shows the button only for an ONLINE peer, and the click handler routes to sendSubTo
//   4  THE ROUTES   every url the additions fetch is one the bridge's route table owns
//
// SABOTAGE LOG -- each applied to server.html in place, the gate run, the file restored: see the commit that added this file for the table.
"use strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const B = require_(path.join(ENG, "ai-bridge/subAquariumBridge.js"));
const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const sections = fs.readFileSync(path.join(ENG, "tools/ship/pageSections.mjs"), "utf8");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const count = (s, sub) => s.split(sub).length - 1;

// ---- 1 THE MARKUP
console.log("1  THE MARKUP");
for (const k of ["fly", "fish"]) for (const part of ["Status", "Dot", "Word"]) ok(`id ${k}Brain${part} appears once`, count(html, `id="${k}Brain${part}"`) === 1);
const chipTag = (k) => { const i = html.indexOf(`id="${k}BrainStatus"`); return i < 0 ? "" : html.slice(i, i + 700); };
ok("the fly chip opens /fly-connectome.html", /onclick="window\.open\('\/fly-connectome\.html'/.test(chipTag("fly")));
ok("the fish chip opens /sub-aquarium.html", /onclick="window\.open\('\/sub-aquarium\.html'/.test(chipTag("fish")));
const gpuI = html.indexOf('id="gpuBrainStatus"'), flyI = html.indexOf('id="flyBrainStatus"'), fishI = html.indexOf('id="fishBrainStatus"'), peersI = html.indexOf('id="paSync"');
ok("both chips sit after the GPU chip and before the peer sync line (inside the peer header)", gpuI > 0 && gpuI < flyI && flyI < fishI && fishI < peersI);
ok("the Arriving row links /sub-aquarium.html", /<a href="\/sub-aquarium\.html"[^>]*>[^<]*Sub Aquarium<\/a>/.test(html));
ok("pageSections.mjs files sub-aquarium.html in UNPLACED with a reason", /\["sub-aquarium\.html", "[^"]{20,}"\]/.test(sections));

// ---- 2 THE CHIPS
console.log("2  THE CHIPS");
const chipScript = (() => { const i = html.indexOf("chip(\"fly\""); if (i < 0) return null; const s = html.lastIndexOf("<script>", i), e = html.indexOf("</script>", i); return html.slice(s + 8, e); })();
ok("the chip script is found", !!chipScript);
function runChips(answer) {
    const els = {}, ticks = [], fetched = [];
    const el = () => ({ style: {}, textContent: "", title: "" });
    for (const k of ["fly", "fish"]) for (const p of ["Dot", "Word", "Status"]) els[`${k}Brain${p}`] = el();
    const ctx = {
        document: { getElementById: (id) => els[id] || null },
        fetch: async (url) => { fetched.push(url); if (answer === "throw") throw new Error("down"); return { ok: true, json: async () => answer }; },
        swekTick: (key, fn) => { ticks.push(key); return fn(); },
        setInterval: (fn) => { fn(); return 1; },
    };
    vm.runInNewContext(chipScript, ctx);
    return new Promise((r) => setTimeout(() => r({ els, ticks, fetched }), 30));
}
if (chipScript) {
    const st = await runChips({ ok: true, state: "standin", detail: "fish brain: STAND-IN" });
    ok("standin -> amber dot", st.els.fishBrainDot.style.background === "#f6a623");
    ok("standin -> the word reads stand-in", st.els.fishBrainWord.textContent === "stand-in");
    ok("the detail becomes the hover title", st.els.fishBrainStatus.title === "fish brain: STAND-IN");
    const lv = await runChips({ ok: true, state: "live", detail: "x" });
    ok("live -> green dot and the word live", lv.els.flyBrainDot.style.background === "#4ade80" && lv.els.flyBrainWord.textContent === "live");
    const of = await runChips({ ok: true, state: "offline", detail: "x" });
    ok("offline -> red dot", of.els.flyBrainDot.style.background === "#ff5a5a" && of.els.fishBrainWord.textContent === "offline");
    const th = await runChips("throw");
    ok("a fetch that throws -> unreachable on both chips, grey dot", th.els.flyBrainWord.textContent === "unreachable" && th.els.fishBrainWord.textContent === "unreachable" && th.els.fishBrainDot.style.background === "#555");
    ok("each chip polls its own url", st.fetched.includes("/ai/flybrain/health") && st.fetched.includes("/ai/fishbrain/health"));
    ok("both polls go through swekTick, under different keys", st.ticks.length >= 2 && new Set(st.ticks).size === 2 && !st.ticks.includes("brain-health"));
}

// ---- 3 THE SEND
console.log("3  THE SEND");
const fnSrc = (() => { const i = html.indexOf("async function sendSubTo("); if (i < 0) return null; let d = 0, j = html.indexOf("{", i); for (let k = j; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}" && --d === 0) return html.slice(i, k + 1); } return null; })();
ok("sendSubTo is found", !!fnSrc);
const SUBS = [{ id: "a1", name: "Local One", pilot: "network", local: true, weights: [0.5, 0.25], theta: null }, { id: "r1", name: "Remote", pilot: "autopilot", local: false }, { id: "a2", name: "Local Two", pilot: "autopilot", local: true }];
async function runSend({ subs = SUBS, pick = "2", reply = { ok: true, reply: { id: "x", replaced: false } }, listFails = false } = {}) {
    const posts = [], alerts = [], prompts = [], gets = [];
    const ctx = {
        fetch: async (url, opt) => {
            if (!opt || !opt.method) { gets.push(url); if (listFails) throw new Error("no"); return { json: async () => ({ ok: true, subs }) }; }
            posts.push({ url, method: opt.method, body: JSON.parse(opt.body) }); return { json: async () => reply };
        },
        prompt: (m) => { prompts.push(m); return pick; }, alert: (m) => alerts.push(m), parseInt, JSON, Promise, Error,
    };
    vm.createContext(ctx); vm.runInContext(fnSrc + "\nthis.sendSubTo = sendSubTo;", ctx);
    const btn = { textContent: "⚓ Sub", disabled: false };
    let threw = null;
    try { await ctx.sendSubTo("http://192.168.1.7:8787", btn); } catch (e) { threw = String(e && e.message || e); }
    return { posts, alerts, prompts, gets, btn, threw };
}
if (fnSrc) {
    const a = await runSend();
    ok("the sub list is read from /subaquarium/list", a.gets.length === 1 && a.gets[0] === "/subaquarium/list");
    ok("the menu offers local subs only (Remote is not on it)", a.prompts.length === 1 && a.prompts[0].includes("Local One") && a.prompts[0].includes("Local Two") && !a.prompts[0].includes("Remote"));
    ok("choosing 2 sends the SECOND LOCAL sub (a2), not the second in the list", a.posts.length === 1 && a.posts[0].body.id === "a2");
    ok("it POSTs {peer, id} to /subaquarium/send and nothing else", a.posts[0].url === "/subaquarium/send" && a.posts[0].method === "POST" && a.posts[0].body.peer === "http://192.168.1.7:8787" && Object.keys(a.posts[0].body).sort().join() === "id,peer");
    ok("success is reported, and the button is restored", /Sent/.test(a.alerts[0] || "") && a.btn.textContent === "⚓ Sub" && a.btn.disabled === false);
    ok("a replaced copy says so", /replaced/.test((await runSend({ reply: { ok: true, reply: { id: "x", replaced: true } } })).alerts[0] || ""));
    ok("a cancelled prompt sends nothing and says nothing", await (async () => { const r = await runSend({ pick: null }); return r.posts.length === 0 && r.alerts.length === 0; })());
    ok("sendSubTo never throws, whatever the answers", await (async () => { for (const o of [{}, { pick: null }, { pick: "9" }, { subs: [] }, { listFails: true }, { reply: { ok: false } }, { reply: null }]) if ((await runSend(o)).threw) return false; return true; })());
    ok("the whole sub (its weights) is never put in the request", (await runSend({ pick: "1" })).posts[0].body.weights === undefined);
    ok("a number off the list sends nothing and says so", await (async () => { const r = await runSend({ pick: "9" }); return r.posts.length === 0 && r.alerts.length === 1; })());
    ok("text instead of a number sends nothing", (await runSend({ pick: "abc" })).posts.length === 0);
    ok("no local subs: nothing is sent and the user is told to offer them", await (async () => { const r = await runSend({ subs: [SUBS[1]] }); return r.posts.length === 0 && /Offer my subs/.test(r.alerts[0] || "") && r.prompts.length === 0; })());
    ok("the list failing sends nothing", (await runSend({ listFails: true, pick: "1" })).posts.length === 0);
    ok("a refusal from the bridge is shown", await (async () => { const r = await runSend({ reply: { ok: false, error: "peer refused: too many" } }); return /Not sent: peer refused: too many/.test(r.alerts[0] || "") && r.btn.disabled === false; })());
    ok("the sub name never reaches markup (the function uses no innerHTML)", !/innerHTML|outerHTML|insertAdjacent|document\.write/.test(fnSrc));
}
ok("the peer row shows the Sub button only for an ONLINE peer", /\(off\?"":"<button data-sendsub='1'/.test(html));
ok("the click handler routes data-sendsub to sendSubTo(url, button)", /closest\("button\[data-sendsub\]"\); if\(ss\)\{ sendSubTo\(url,ss\); return; \}/.test(html));
ok("sendSubTo is declared before renderPeers uses it, in the same scope", html.indexOf("async function sendSubTo(") > 0 && html.indexOf("async function sendSubTo(") < html.indexOf("function renderPeers(list)"));

// ---- 4 THE ROUTES
console.log("4  THE ROUTES");
const added = (chipScript || "") + (fnSrc || "");
const urls = [...added.matchAll(/["'](\/(?:ai|subaquarium)\/[a-z\/]+)["']/g)].map((m) => m[1]);
ok("the additions fetch at least four urls", urls.length >= 4, urls.join(" "));
for (const u of new Set(urls)) ok(`the bridge owns ${u}`, B.ROUTES.has(u));

console.log(fails ? `\nsubAquariumServerHtml-selfcheck: ${fails} FAILED` : "\nsubAquariumServerHtml-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
