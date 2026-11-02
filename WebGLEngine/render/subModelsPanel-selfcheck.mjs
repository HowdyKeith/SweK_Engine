// WebGLEngine/render/subModelsPanel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subModelsPanel-selfcheck.mjs      (~0.7 s with a browser; the source rows alone ~0.1 s)
//
// THE PICKER OF A DOWNLOADED SUBMARINE MODEL (phase 3 of docs/SUB-GLB-MODEL-SWAP.md), DRIVEN LIKE A PERSON WOULD: in headless Chromium through the engine's own origin the form is mounted over a real store, a real host and two real boats (a fake view holds them), and its
// inputs are filled and its buttons clicked. (needs a browser; SKIPPED, and said, without one.)
//   1  THE FORM     the class menu lists every hull (the page's labels) and the default; the note says rigid, licence and local-only in words; the fields start empty with no model assigned
//   2  ASSIGN       with no licence written it REFUSES (the reason in words, nothing stored); with one it stores every field (url, facing, up axis, name, author, licence, source) for the chosen class and says what it assigned
//   3  THE BOATS    once the host has synced, the status line counts the boats ("2 models"), and the attribution line shows the model on the tank's present hull; the hull menu fills the form from the store; a clear goes back to procedural
//   4  OPTIONS      the keep-colours box drives the host; a picked file is assigned under a blob url and named by its file; a load that fails shows the reason beside the status; the form does not fetch the asset list until the url box is used
//   5  THE PAGE     sub-aquarium.html mounts it in a details element through mountSubModelPicker only when the 3D view exists; downloaded models are ignored by git and the folder says why
//
// NOT GRADED, said plainly: how it looks, and a real Sketchfab file. SABOTAGED -- 52 mutants (51 red BY NAME, identity 0, one equivalent by design) of render/subModelsPanel.mjs and of the statusSummary in render/subModelsCore.mjs (the note words, the class labels, every field the Assign button passes, the refusal and its return, the blob and file naming, Clear and its refill, keep-colours, the class refill and each filled field, the status/failure/attribution texts, the hull the attribution resolves, the lazy asset list, the wiring: setModels, the states, the container check, dispose, the storage; the summary: plural, failed and loading counts, the texts, the slice, failed-only reasons, the unique filter, the junk filter), each in place and restored. FIRST PASS: 7 read 0 red or crashed -- ROWS ADDED: a fit warning shown beside the status, the three refusals and the storage, an unknown author left out of the box; a redundant .filter(Boolean) was CUT (the summary already ignores a boat with no state, which the one equivalent mutant shows).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import * as PN from "./subModelsPanel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (name, cond, detail) => { try { if (typeof cond === "function") cond = cond(); } catch (e) { cond = false; detail = "threw: " + e.message; } console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subModelsPanel-selfcheck -- the picker of a downloaded submarine model\n");

sec("1-4. THE FORM, DRIVEN (a browser)");
{
    const skip = webgpuSkipReason();
    if (skip) console.log("  SKIP  " + skip + " -- the form rows are NOT graded on this machine");
    else {
        const SCRIPT = `async () => {
            const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/subAquarium3d.mjs"), P = await import("/render/subModelsPanel.mjs"), BC = await import("/render/subBallastCues.mjs");
            const store = new Map(), storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } };
            const boats = new Map(); for (const [id, hue] of [["a", 30], ["b", 200]]) { const geo = {}, g = V.buildSub(THREE, new THREE.MeshStandardMaterial(), geo); BC.attachCues(THREE, g, geo, 16); boats.set(id, g); }
            const view = { subs: boats, setModels(h) { this.host = h; return h; } };
            const tpl = () => { const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xaa4422 }))); return s; };
            const loads = []; const load = (u) => { loads.push(u); return u.includes("bad") ? Promise.reject(new Error("no such file here")) : Promise.resolve(tpl()); };
            const div = document.createElement("div"); document.body.appendChild(div); let hull = "nominal";
            const { store: st, host, panel } = P.mountSubModelPicker(THREE, view, div, { hulls: ["nominal", "heavy"], labels: { nominal: "Explorer (nominal)", heavy: "heavy (1.4x mass)" }, getHull: () => hull, storage, load });
            const q = (id) => div.querySelector("#sm_" + id), out = {}; out.refused = [() => P.mountSubModelsPanel(null, { store: st }), () => P.mountSubModelsPanel(div, {}), () => P.mountSubModelsPanel(div, { store: {} })].map((f) => { try { f(); return false; } catch (e) { return /container and a store/.test(e.message); } });
            const set = (id, v) => { q(id).value = v; q(id).dispatchEvent(new Event("input", { bubbles: true })); };
            const sync = async () => { for (const [id, g] of boats) host.sync(g, { hull, hue: id === "a" ? 30 : 200 }); await host.settled(); panel.refresh(); };
            out.form = { options: [...q("class").options].map((o) => o.value + "|" + o.textContent), note: div.textContent.includes("RIGID") && /licence/i.test(div.textContent) && /stay on this machine/.test(div.textContent), attr: q("attr").textContent, status: q("status").textContent, hostSet: view.host === host, fields: ["url", "name", "author", "licence", "source"].map((i) => q(i).value) };
            await sync(); out.afterSync = q("status").textContent;
            set("class", "default"); q("class").dispatchEvent(new Event("change")); set("url", "/GPU_Assets/subs/boat.glb"); set("name", "Boat"); set("author", "Me"); set("source", "https://x.example/boat"); set("yaw", "90"); set("up", "z");
            q("assign").click(); out.noLicence = { msg: q("msg").textContent, stored: JSON.stringify(st.all()) };
            set("licence", "CC-BY-4.0"); q("assign").click(); out.assigned = { msg: q("msg").textContent, entry: st.get("default"), stored: Object.keys(st.all()) };
            await sync(); out.boats = { status: q("status").textContent, attr: q("attr").textContent, warn: q("warn").textContent, states: [...boats.values()].map((g) => g.userData.modelState.status), loads: loads.length };
            q("class").value = "nominal"; q("class").dispatchEvent(new Event("change")); out.nominalBlank = ["url", "name", "licence"].map((i) => q(i).value);
            set("url", "/GPU_Assets/subs/nominal.glb"); set("licence", "unknown"); q("assign").click(); await sync(); out.nominal = { entry: st.get("nominal"), attr: q("attr").textContent, msg: q("msg").textContent };
            set("yaw", "90"); q("assign").click(); await sync(); out.warnShown = q("warn").textContent; out.nominalYaw = st.get("nominal").yaw; set("yaw", "0"); q("assign").click(); await sync();
            q("class").value = "nominal"; q("class").dispatchEvent(new Event("change")); out.nominalAuthor = q("author").value; q("class").value = "default"; q("class").dispatchEvent(new Event("change")); out.refill = ["url", "name", "author", "licence", "source", "yaw", "up"].map((i) => q(i).value);
            q("class").value = "nominal"; q("class").dispatchEvent(new Event("change")); q("clear").click(); await sync(); out.cleared = { nominal: st.get("nominal"), msg: q("msg").textContent, attr: q("attr").textContent, fields: ["url", "licence"].map((i) => q(i).value), states: [...boats.values()].map((g) => g.userData.modelState.status), parts: [...boats.values()].every((g) => Object.values(g.userData.parts).every((p) => p.visible)) };
            q("keep").click(); out.keepOn = host.opts.keepColours; q("keep").click(); out.keepOff = host.opts.keepColours;
            const dt = new DataTransfer(); dt.items.add(new File(["glb"], "my-sub.glb")); q("file").files = dt.files; q("file").dispatchEvent(new Event("change"));
            out.picked = { url: q("url").value, name: q("name").value }; q("class").value = "nominal"; set("licence", "CC0-1.0"); q("assign").click(); out.pickedEntry = st.get("nominal") && { url: st.get("nominal").url.slice(0, 5), name: st.get("nominal").name, msg: q("msg").textContent };
            set("url", "/GPU_Assets/subs/bad.glb"); q("assign").click(); await sync(); out.failed = { status: q("status").textContent, warn: q("warn").textContent, states: [...boats.values()].map((g) => g.userData.modelState.status) };
            hull = "heavy"; await sync(); out.otherHull = { attr: q("attr").textContent, status: q("status").textContent };
            out.persisted = store.has("swek.subModels.v1"); panel.dispose(); out.disposed = div.textContent === "";
            return out;
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        const r = out.ok && out.result;
        if (!r) { console.log("  FAIL  the browser run did not complete: " + (out.reason || (out.pageErrors || []).join(" | ")).slice(0, 300)); fails++; }
        else {
            const f = r.form;
            ok("!! the class menu lists all 13 hulls and the default, the labels the page gives are used for the hulls and 'default (every hull)' for the default, and the note says RIGID, licence and 'stay on this machine' in words", f.note && f.options.some((o) => o === "nominal|Explorer (nominal)") && f.options.some((o) => o.startsWith("default|default (every hull)")) && f.options.length === 14);
            ok("!! the form starts empty with no model assigned: empty fields, the attribution line says the procedural hull is drawn, the status says 'no boats', and the host was handed to the view", f.fields.every((x) => x === "") && /procedural hull is drawn/.test(f.attr) && f.status === "boats: no boats" && f.hostSet && r.afterSync === "boats: procedural hull");
            ok("!! with the licence EMPTY, Assign refuses in words ('not assigned: ... no stated licence') and stores nothing", /not assigned: .*no stated licence/.test(r.noLicence.msg) && r.noLicence.stored === "{}");
            ok("!! with a licence written it stores the whole entry for 'default' (url, yaw 90, up z, name, author, licence, source) and says what it assigned", r.assigned.entry && r.assigned.entry.url === "/GPU_Assets/subs/boat.glb" && r.assigned.entry.yaw === 90 && r.assigned.entry.up === "z" && r.assigned.entry.name === "Boat" && r.assigned.entry.author === "Me" && r.assigned.entry.licence === "CC-BY-4.0" && r.assigned.entry.sourceUrl === "https://x.example/boat" && /assigned to every hull without its own: Boat/.test(r.assigned.msg) && r.assigned.stored.join() === "default");
            ok("!! once the host has synced both boats wear it: the status reads 'boats: 2 models' (one load for the url), the attribution line is 'in use on this hull: Boat by Me -- licence: CC-BY-4.0 -- source'", r.boats.status === "boats: 2 models" && r.boats.states.join() === "model,model" && r.boats.loads === 1 && r.boats.attr === "in use on this hull: Boat by Me -- licence: CC-BY-4.0 -- https://x.example/boat");
            ok("!! an unknown author is not written into the author box (the box stays empty for 'unknown', so it is not re-saved as a name)", r.nominalAuthor === "");
            ok("!! choosing another class empties the fields (nothing stored for it); assigning there with the licence 'unknown' is accepted and that hull's own model takes over the attribution line", r.nominalBlank.every((x) => x === "") && r.nominal.entry && r.nominal.entry.licence === "unknown" && /nominal\.glb by unknown -- licence: unknown/.test(r.nominal.attr) && r.refill.join() === "/GPU_Assets/subs/boat.glb,Boat,Me,CC-BY-4.0,https://x.example/boat,90,z");
            ok("!! Clear removes that hull's own model: nothing stored for it, the fields empty, 'cleared: the procedural hull'; the hull falls back to the DEFAULT model (the boats are models again) and the attribution is the default's", r.cleared.nominal === null && /cleared/.test(r.cleared.msg) && r.cleared.fields.every((x) => x === "") && r.cleared.states.join() === "model,model" && /Boat by Me/.test(r.cleared.attr));
            ok("!! a model whose fit raised a warning shows it: a yaw of 90 on a model whose nose is +X puts the warning 'turn it 90 or 270 degrees' beside the status, and Assign takes the yaw", /90 or 270/.test(r.warnShown) && r.nominalYaw === 90);
            ok("!! the panel refuses a missing container, a missing store and a store without set(), and it writes through the storage it was given (the swek.subModels.v1 key is in the mock)", r.refused.join() === "true,true,true" && r.persisted === true);
            ok("!! the keep-colours box drives the host's option (on, then off); a picked file shows as 'my-sub.glb (this session)', names the model by its file, and is assigned under a blob url", r.keepOn === true && r.keepOff === false && r.picked.url === "my-sub.glb (this session)" && r.picked.name === "my-sub.glb" && r.pickedEntry && r.pickedEntry.url === "blob:" && r.pickedEntry.name === "my-sub.glb" && /a picked file: it lasts this session/.test(r.pickedEntry.msg));
            ok("!! a url that fails to load: both boats read failed, the status says '2 failed', and the reason is beside it ('load failed: no such file here'); the procedural hulls come back", /boats: 2 failed/.test(r.failed.status) && /load failed: no such file here/.test(r.failed.warn) && r.failed.states.join() === "failed,failed");
            ok("!! the attribution line follows the tank's hull: on a hull with no model of its own it shows the default's, and the panel clears its container when disposed", /in use on this hull: Boat by Me/.test(r.otherHull.attr) && r.disposed === true);
        }
        const errs = (out.pageErrors || []).filter((e) => !/status of 404/.test(e));
        if (errs.length) { console.log("  FAIL  page errors: " + errs.join(" | ").slice(0, 300)); fails++; }
        if (process.env.SUBPANEL_DEBUG && r) console.log(J(r));
    }
}

sec("5. THE PAGE AND THE FILES");
{
    const src = fs.readFileSync(path.join(ENG, "render", "subModelsPanel.mjs"), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), page = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! the panel does not fetch the asset list at mount: the only fetch is inside loadList, which runs the first time the url box is focused (a server without /assets/list would otherwise log a failed request on every page load)", (code.match(/fetch\(/g) || []).length === 1 && /const loadList = async \(\) => \{ try \{ const r = await fetch\(assetListUrl\);/.test(code) && /url\.addEventListener\("focus", loadList, \{ once: true \}\)/.test(code));
    ok("!! the page has the details element and mounts the picker through mountSubModelPicker only when the 3D view exists (otherwise the element is hidden); a failed import shows a message instead of breaking the page", /<details id="subModels"[^>]*><summary>sub model \(\.glb\)<\/summary><div id="subModelsPanel"><\/div><\/details>/.test(page) && /if \(!view3d\) \$\("subModels"\)\.style\.display = "none";\s*else try \{/.test(page) && /P\.mountSubModelPicker\(THREE, view3d, \$\("subModelsPanel"\), \{ hulls: Object\.keys\(LABELS\), labels: LABELS, getHull: \(\) => tank\.hull \}\);/.test(page) && /the model picker is unavailable here/.test(page) && !/createSubModel/.test(page));
    let ignored = "", readme = "";
    try { ignored = execFileSync("git", ["check-ignore", "-v", "WebGLEngine/GPU_Assets/subs/boat.glb"], { cwd: path.join(ENG, ".."), encoding: "utf8" }); } catch (e) { ignored = ""; }
    let kept = true; try { execFileSync("git", ["check-ignore", "-q", "WebGLEngine/GPU_Assets/subs/README.md"], { cwd: path.join(ENG, "..") }); kept = false; } catch (e) { kept = true; }
    try { readme = fs.readFileSync(path.join(ENG, "GPU_Assets", "subs", "README.md"), "utf8"); } catch (e) { readme = ""; }
    ok("!! a downloaded model dropped in GPU_Assets/subs/ is IGNORED by git (so it can not reach the repository or the release by accident), the folder's README is not, and the README says licences are real, nothing is committed, the model is rigid and where to drop it", /GPU_Assets\/subs\/\*/.test(ignored) && kept && /OWN licence/.test(readme) && /Nothing here is committed/.test(readme) && /Rigid/.test(readme) && /GPU_Assets\/subs/.test(readme) && /WRITE ITS LICENCE/.test(readme));
    ok("!! the licence menu offers the Creative Commons choices and 'unknown' (a statement the store accepts), the note is the words the page shows (rigid, licence, local, Draco), and reportLines names the picker", PN.LICENCE_CHOICES.includes("CC0-1.0") && PN.LICENCE_CHOICES.includes("CC-BY-4.0") && PN.LICENCE_CHOICES.includes("unknown") && /RIGID/.test(PN.NOTE_TEXT) && /OWN licence/.test(PN.NOTE_TEXT) && /Draco/.test(PN.NOTE_TEXT) && /the picker/.test(PN.reportLines()[0]) && typeof PN.mountSubModelPicker === "function" && typeof PN.mountSubModelsPanel === "function");
    ok("!! the panel imports only the core and the host (no direct DOM globals other than through the container's document), and its note says what the design note says", !/\b(document|window)\b/.test(code.replace(/container\.ownerDocument/g, "")) && /RIGID/.test(src) && /OWN licence/.test(src) && /GPU_Assets\/subs\//.test(src));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
