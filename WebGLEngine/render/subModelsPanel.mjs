// WebGLEngine/render/subModelsPanel.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PICKER FOR A DOWNLOADED SUBMARINE MODEL (phase 3 of docs/SUB-GLB-MODEL-SWAP.md): the small form the Sub Aquarium page mounts, over a render/subModelsCore.mjs store and a render/subModels3d.mjs host.
// It assigns a .glb (a url, a file from GPU_Assets/subs/ listed by /assets/list, or a picked local file whose blob url lasts the session) to ONE hull of the tank or to "default", with the model's facing (yaw, up axis) and the four
// facts the store insists on or keeps: name, author, LICENCE (required; "unknown" is a statement and is allowed), source url. It shows, live, how the boats are doing (statusSummary), the warnings the fit raised (a long side across the
// nose, a heavy model), why a load failed, the attribution line of the model on the tank's present hull, and says in words that the model is rigid and stays on this machine.
// It changes nothing about the physics, the pilots or the tank; a form that assigns nothing leaves every boat procedural.
"use strict";
import { SUB_MODEL_CLASSES, DEFAULT_CLASS, UP_AXES, attributionLine, statusSummary, makeSubModelStore } from "./subModelsCore.mjs";
import { createSubModelHost } from "./subModels3d.mjs";

export const LICENCE_CHOICES = Object.freeze(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "Sketchfab Standard", "unknown"]);
export const NOTE_TEXT = "A downloaded submarine is drawn RIGID: its rudder and planes do not move (the list under each sub still prints what the pilot asks of them). Sketchfab models carry their OWN licence (read the model's page; many need attribution, some forbid commercial use): "
    + "write it below, it is shown while the model is in use. Models stay on this machine (drop them in GPU_Assets/subs/); they are never added to the repository or the release unless the licence allows it and the attribution goes with them. Draco-compressed files work; very heavy ones are refused.";

const STYLE = { box: "display:flex;flex-direction:column;gap:6px;font:12px ui-monospace,monospace;color:#cfe0f5;min-width:340px;max-width:760px", row: "display:flex;gap:6px;align-items:center;flex-wrap:wrap", input: "background:#0b1424;color:#cfe0f5;border:1px solid #2f486c;border-radius:4px;padding:2px 5px;font:inherit", btn: "background:#152136;color:#b9d4ff;border:1px solid #2f486c;border-radius:4px;cursor:pointer;font:inherit;padding:2px 8px" };

/**
 * Build the form in `container`. Options: store (a makeSubModelStore), host (a createSubModelHost: its `opts.keepColours` is the checkbox), hulls (the tank's hull names), labels ({ hull: text }),
 * getHull() (the tank's hull now), getStates() (the boats' model states), assetListUrl ("/assets/list"), refreshMs (500; 0 = no timer).
 * Answers { refresh(), dispose(), el }; `refresh()` redraws the status, warnings and attribution lines now.
 */
export function mountSubModelsPanel(container, { store, host, hulls = [], labels = {}, getHull = () => "", getStates = () => [], assetListUrl = "/assets/list", refreshMs = 500 } = {}) {
    if (!container || !store || typeof store.set !== "function") throw new Error("subModelsPanel.mountSubModelsPanel: a container and a store are needed");
    const doc = container.ownerDocument, mk = (tag, css, attrs = {}) => { const e = doc.createElement(tag); if (css) e.style.cssText = css; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    container.textContent = "";
    const box = mk("div", STYLE.box), note = mk("div", "color:#8de0c0"); note.textContent = NOTE_TEXT; box.appendChild(note);
    const field = (id, ph, w) => { const i = mk("input", STYLE.input + (w ? ";width:" + w : ""), { id: "sm_" + id, type: "text", placeholder: ph }); return i; };
    const cls = mk("select", STYLE.input, { id: "sm_class", title: "Which hull of the tank this model is for; 'default' is used by every hull without its own" });
    for (const c of SUB_MODEL_CLASSES) { const o = mk("option"); o.value = c; o.textContent = c === DEFAULT_CLASS ? "default (every hull)" : (labels[c] || c); cls.appendChild(o); }
    const url = field("url", "/GPU_Assets/subs/boat.glb or https://...", "260px"), list = mk("datalist", "", { id: "sm_assets" }); url.setAttribute("list", "sm_assets");
    const file = mk("input", "width:170px;font:inherit;color:#7d8fa8", { id: "sm_file", type: "file", accept: ".glb,.gltf" });
    const yaw = mk("select", STYLE.input, { id: "sm_yaw", title: "turn the model about the vertical until its nose points forward" }); for (const y of [0, 90, 180, 270]) { const o = mk("option"); o.value = String(y); o.textContent = y + "° facing"; yaw.appendChild(o); }
    const up = mk("select", STYLE.input, { id: "sm_up", title: "which of the model's own axes is UP (a Z-up export needs 'z')" }); for (const u of UP_AXES) { const o = mk("option"); o.value = u; o.textContent = "up " + u; up.appendChild(o); }
    const name = field("name", "name", "140px"), author = field("author", "author", "140px"), licence = field("licence", "licence (required): CC-BY-4.0, CC0-1.0, unknown...", "260px"), source = field("source", "source url (the model's page)", "260px");
    const lic = mk("datalist", "", { id: "sm_licences" }); for (const l of LICENCE_CHOICES) { const o = mk("option"); o.value = l; lic.appendChild(o); } licence.setAttribute("list", "sm_licences");
    const assign = mk("button", STYLE.btn, { id: "sm_assign" }); assign.textContent = "Assign"; const clear = mk("button", STYLE.btn, { id: "sm_clear", title: "back to the procedural hull" }); clear.textContent = "Clear";
    const keepL = mk("label", "display:flex;gap:4px;align-items:center", { title: "draw the model in its own colours (the hue marker stays); off tints it 30 percent toward each boat's hue so ten boats can be told apart" }), keep = mk("input", "", { id: "sm_keep", type: "checkbox" }); keepL.append(keep, doc.createTextNode(" keep the model's colours"));
    const msg = mk("div", "min-height:1.2em", { id: "sm_msg" }), status = mk("div", "color:#9fb4c8", { id: "sm_status" }), warn = mk("div", "color:#f6a623", { id: "sm_warn" }), attr = mk("div", "color:#8de0c0", { id: "sm_attr" });
    const r1 = mk("div", STYLE.row), r2 = mk("div", STYLE.row), r3 = mk("div", STYLE.row), r4 = mk("div", STYLE.row);
    r1.append(cls, url, file); r2.append(yaw, up, name, author); r3.append(licence, source); r4.append(assign, clear, keepL);
    box.append(r1, r2, r3, r4, list, lic, msg, status, warn, attr); container.appendChild(box);

    let blob = null;   // a picked local file: its blob url, which lasts the session
    const say = (text, bad) => { msg.textContent = text; msg.style.color = bad ? "#ff8a80" : "#8de0c0"; };
    const fill = () => { const e = store.get(cls.value); url.value = e ? e.url : ""; yaw.value = e ? String(e.yaw) : "0"; up.value = e ? e.up : "y"; name.value = e ? e.name : ""; author.value = e && e.author !== "unknown" ? e.author : ""; licence.value = e ? e.licence : ""; source.value = e ? e.sourceUrl : ""; blob = null; };
    cls.addEventListener("change", () => { fill(); say(""); });
    file.addEventListener("change", () => { const f = file.files && file.files[0]; if (!f) return; blob = { label: f.name + " (this session)", url: URL.createObjectURL(f) }; url.value = blob.label; if (!name.value) name.value = f.name; });
    assign.addEventListener("click", () => {
        const useBlob = blob && url.value === blob.label, r = store.set(cls.value, { url: useBlob ? blob.url : url.value, yaw: Number(yaw.value), up: up.value, name: name.value, author: author.value, licence: licence.value, sourceUrl: source.value });
        if (!r.ok) { say("not assigned: " + r.error, true); return; }
        say(`assigned to ${cls.value === DEFAULT_CLASS ? "every hull without its own" : labels[cls.value] || cls.value}: ${r.entry.name}` + (useBlob ? " (a picked file: it lasts this session)" : ""), false); refresh();
    });
    clear.addEventListener("click", () => { store.clear(cls.value); fill(); say("cleared: the procedural hull", false); refresh(); });
    keep.addEventListener("change", () => { if (host && host.opts) host.opts.keepColours = keep.checked; });
    if (host && host.opts) keep.checked = !!host.opts.keepColours;
    // the asset list is fetched the first time the url box is used, not when the page loads: a server without /assets/list would otherwise log a failed request on every page load
    const loadList = async () => { try { const r = await fetch(assetListUrl); if (!r.ok) return; const j = await r.json(), arr = Array.isArray(j) ? j : (j && (j.assets || j.files || j.list)) || []; for (const x of arr.map((v) => (typeof v === "string" ? v : v && (v.url || v.path || v.file))).filter((u) => u && /\.(glb|gltf)$/i.test(u))) { const o = mk("option"); o.value = x; list.appendChild(o); } } catch (e) { /* no asset list: the url box still works */ } };
    url.addEventListener("focus", loadList, { once: true });
    function refresh() {
        const s = statusSummary(getStates()), cur = store.resolve(getHull());
        status.textContent = `boats: ${s.text}`; warn.textContent = [...s.warnings, ...s.failures.map((f) => "load failed: " + f)].join(" | ");
        attr.textContent = cur ? "in use on this hull: " + attributionLine(cur) : "no model assigned to this hull: the procedural hull is drawn";
        return s;
    }
    fill(); refresh();
    const timer = refreshMs > 0 && typeof setInterval === "function" ? setInterval(refresh, refreshMs) : null;
    return { refresh, dispose() { if (timer) clearInterval(timer); container.textContent = ""; }, el: box };
}

/**
 * The whole wiring a page needs, in one call: a store (the browser's storage unless `storage` is given), a host over it for `THREE`, the host handed to the 3D `view` (its setModels), and the form mounted in `container` with the boats' states read from
 * the view. Answers { store, host, panel }. A page without a 3D view does not call this.
 */
export function mountSubModelPicker(THREE, view, container, { hulls = [], labels = {}, getHull = () => "", storage, load } = {}) {
    const store = makeSubModelStore(storage), host = createSubModelHost(THREE, load ? { store, load } : { store });
    view.setModels(host);
    const panel = mountSubModelsPanel(container, { store, host, hulls, labels, getHull, getStates: () => [...view.subs.values()].map((g) => g.userData.modelState) });
    return { store, host, panel };
}

export function reportLines() {
    return [`[subModelsPanel] the picker: a url, an asset or a picked file for one hull or the default, facing, up axis, name, author, a REQUIRED licence, source; live status, warnings, failures and the attribution line; rigid and local-only said in words`];
}
