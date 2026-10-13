// WebGLEngine/ui/tacticsPanel.mjs -- v4839 (v4849: the 'trained' choice)
//
// THE "LOAD TACTICS" PANEL, ONCE, FOR BOTH PAGES THAT RUN THE ENDLESS-SKY FIGHT (flight-gpu.html and es-box3d.html -- the same sim, two views). brain/tacticsRoster.mjs decides what the choices are and
// what weights each resolves to; this is the DOM around it: a button in the HUD, a panel with one select per side, Start Fight, Default tactics, Import weights, a line saying what each side is and
// what its eight numbers are, and the honest paragraph about what a "choice" here is.
//
// *** A CHOICE TAKES EFFECT AT START FIGHT, NOT WHEN THE SELECT MOVES. *** The page reads weights(team) -- the COMMITTED lineup. The selects edit a pending one (saved in this browser as they change);
// Start Fight commits it, clears the tally and rebuilds the battle through the page's onStart(). A tally is therefore always the score of one lineup. If the selects differ from the committed lineup
// the note says "pending". On load the saved choices are committed, so a reload fights what the selects show.
//
// Nothing here fetches the GPU Brain unless the page lets it: `served` is read once from GET /ai/brain/tactics and offered only if the bridge returned trained weights (it returns weights:null until
// it has learned from enough outcomes -- ai-bridge/tacticsBridge.js's own honesty rule). A static server answers 404 and the choice is simply not offered.
"use strict";
import * as R from "../brain/tacticsRoster.mjs";

export const STORE_KEY = "swek.tacticsRoster.v1";
export const IMPORT_KEY = "swek.tacticsRoster.imported.v1";
const BTN_CSS = "background:#152136;color:#b9d4ff;border:1px solid #2f486c;border-radius:5px;cursor:pointer;font:11px ui-monospace,monospace;padding:2px 9px;";
const SEL_CSS = "background:#0c1424;color:#b9d4ff;border:1px solid #2f486c;font:inherit;max-width:300px;";

const readStore = (storage, key) => { try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; } };
const writeStore = (storage, key, v) => { try { if (v == null) storage.removeItem(key); else storage.setItem(key, JSON.stringify(v)); } catch { /* private window / blocked storage: the panel works, it just does not remember */ } };

/**
 * Mount the panel. opts: { doc, win, hud (the element the button goes into), onStart(resolved) (the page clears its tally and rebuilds the battle), storage, fetchImpl, servedUrl }.
 * Returns the api the page reads: weights(team) -> the committed weight vector for a side; plus the hooks the gate drives.
 */
export function mountTacticsPanel(opts = {}) {
    const doc = opts.doc || document, win = opts.win || globalThis, hud = opts.hud || doc.body, onStart = opts.onStart || (() => {});
    const storage = opts.storage || (() => { try { return win.localStorage; } catch { return null; } })() || { getItem: () => null, setItem() {}, removeItem() {} };
    const fetchImpl = opts.fetchImpl === undefined ? win.fetch && win.fetch.bind(win) : opts.fetchImpl, servedUrl = opts.servedUrl || "/ai/brain/tactics", trainedUrl = opts.trainedUrl || "/brain/tacticsWeightsTrained.json";

    let specs = R.sanitizeSpecs(readStore(storage, STORE_KEY));
    let imported = (() => { const s = R.sanitizeWeights(readStore(storage, IMPORT_KEY)); return s.weights; })();
    let served = null, servedSamples = 0, importNote = "", trained = null;
    const ctx = () => ({ served, imported, trained });
    let pending = R.resolveRoster(specs, ctx()), committed = pending, battleNo = 0;

    const el = (tag, css, text) => { const e = doc.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
    const btn = el("button", BTN_CSS, "⚔ Tactics"); btn.id = "tacticsBtn";
    btn.title = "Load Tactics (v4839): choose how EACH side picks its targets and when it breaks off -- a preset, the weights the GPU Brain serves, or a file you import -- then Start Fight";
    hud.appendChild(btn);

    const panel = el("div", "position:fixed;top:56px;left:12px;z-index:6;display:none;background:#0a1220;border:1px solid #2f486c;border-radius:8px;padding:10px;max-width:460px;box-shadow:0 8px 30px #000a;color:#b9d4ff;font:11px ui-monospace,monospace;");
    panel.id = "tacticsPanel";
    panel.appendChild(el("div", "margin-bottom:6px;color:#f6a623;letter-spacing:.08em;", "LOAD TACTICS"));
    const table = el("table", "border-collapse:collapse;margin-bottom:6px;"), tb = el("tbody");
    const selects = {};
    for (const [t, color] of [["A", "#7fa8ff"], ["B", "#ff9a7f"]]) {
        const tr = el("tr"), td1 = el("td", `padding:2px 10px 2px 0;color:${color};`, "side " + t), td2 = el("td"), sel = el("select", SEL_CSS);
        sel.id = "tactics" + t; selects[t] = sel; td2.appendChild(sel); tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
    }
    table.appendChild(tb); panel.appendChild(table);
    const row = el("div", "display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;");
    const startBtn = el("button", "background:#1d3a2a;color:#9fe6c0;border:1px solid #2f486c;border-radius:5px;cursor:pointer;font:11px ui-monospace,monospace;padding:2px 9px;", "Start Fight"); startBtn.id = "tacticsStart";
    const resetBtn = el("button", BTN_CSS, "Default tactics"); resetBtn.id = "tacticsReset";
    const impBtn = el("button", BTN_CSS, "Import weights…"); impBtn.id = "tacticsImportBtn";
    const clrBtn = el("button", BTN_CSS, "Clear import"); clrBtn.id = "tacticsImportClear";
    const file = el("input"); file.type = "file"; file.accept = "application/json,.json"; file.id = "tacticsImportFile"; file.style.display = "none";
    row.append(startBtn, resetBtn, impBtn, clrBtn, file); panel.appendChild(row);
    const note = el("div", "color:#7fb069;margin-bottom:4px;white-space:pre-wrap;"); note.id = "tacticsNote"; panel.appendChild(note);
    panel.appendChild(el("div", "color:#5f7aa0;line-height:1.4;", "A side's tactics are eight numbers -- five that weigh a target (nearness, how hurt it is, how dangerous, whether it is the player, whether it was the last target) and three that decide when to break off. " +
        "They are NOT the fly-wired network the dogfight and space-battle pilots run on; every ship here is flown by the same stepAI, and a choice only changes whom it shoots and when it runs. " +
        "A choice takes effect at Start Fight, which clears the tally. 'Served' appears only when the GPU Brain has learned enough from outcomes to be trusted; 'trained' is the vector fitted in the arena (box3d, six ships a side, against all eight presets from both sides) and shipped as brain/tacticsWeightsTrained.json -- still eight numbers, and it was fitted in that arena, not on your fleet; an import is read from a JSON object of the eight keys (or {weights:{...}}), anything out of range is held to its range and said so."));
    doc.body.appendChild(panel);

    // the pending lineup differs from the committed one if any side's id or any of its eight numbers does (two resolves are never the same object)
    const differs = () => R.TEAMS.some((t) => pending[t].id !== committed[t].id || R.KEYS.some((k) => pending[t].weights[k] !== committed[t].weights[k]));
    function renderNote() {
        const lines = [R.describe(committed) + (battleNo ? "" : "  (the lineup the page opened with)")];
        for (const t of R.TEAMS) lines.push(`  ${t}: ${R.summary(committed[t].weights)}`);
        const isPending = differs();
        if (isPending) lines.push(`pending (press Start Fight): ${R.describe(pending)}`);
        const probs = [...committed.problems, ...(isPending ? pending.problems : []), ...(importNote ? [importNote] : [])];
        if (probs.length) lines.push(probs.join("; "));
        if (served) lines.push(`served: the GPU Brain's policy from ${servedSamples} recorded outcomes is offered`);
        if (trained) lines.push("trained: the vector fitted in the arena against the eight presets (tools/ship/trainTactics.mjs) is offered");
        note.textContent = lines.join("\n");
    }
    function renderSelects() {
        const ch = R.choices(ctx());
        for (const t of R.TEAMS) {
            const sel = selects[t], keep = specs[t];
            sel.textContent = "";
            for (const c of ch) { const o = doc.createElement("option"); o.value = c.id; o.textContent = c.label; sel.appendChild(o); }
            if (!ch.some((c) => c.id === keep)) { const o = doc.createElement("option"); o.value = keep; o.textContent = keep + " (not available here)"; sel.appendChild(o); }
            sel.value = keep;
        }
        clrBtn.style.display = imported ? "" : "none";
    }
    function repend() { pending = R.resolveRoster(specs, ctx()); renderNote(); }
    function setSpecs(x) { specs = R.sanitizeSpecs(x); writeStore(storage, STORE_KEY, specs); renderSelects(); repend(); }
    function commit() { committed = R.resolveRoster(specs, ctx()); pending = committed; renderNote(); return committed; }
    function start() { commit(); battleNo++; onStart(committed); return committed; }
    for (const t of R.TEAMS) selects[t].addEventListener("change", () => setSpecs({ ...specs, [t]: selects[t].value }));
    btn.onclick = () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; renderSelects(); renderNote(); };
    startBtn.onclick = () => { start(); };
    resetBtn.onclick = () => { setSpecs(R.defaultSpecs()); };
    function setImported(weights, message = "") {
        imported = weights || null; importNote = message; writeStore(storage, IMPORT_KEY, imported ? Object.fromEntries(R.KEYS.map((k) => [k, imported[k]])) : null);
        // an "imported" choice with nothing imported is refused by name at resolve, not silently kept
        renderSelects(); repend();
    }
    function importText(text) {
        const r = R.parseImport(text);
        if (r.error) { importNote = "import refused: " + r.error; renderNote(); return r; }
        if (!r.weights) { importNote = "import refused: " + r.problems.join("; "); renderNote(); return r; }
        setImported(r.weights, r.problems.length ? "imported, with: " + r.problems.join("; ") : "imported");
        return r;
    }
    impBtn.onclick = () => file.click();
    clrBtn.onclick = () => { setImported(null, "import cleared"); };
    file.addEventListener("change", () => {
        const f = file.files && file.files[0]; file.value = ""; if (!f) return;
        const fr = new win.FileReader(); fr.onload = () => importText(String(fr.result)); fr.onerror = () => { importNote = "import failed: could not read the file"; renderNote(); }; fr.readAsText(f);
    });

    renderSelects(); commit();
    // the GPU Brain's policy, if the bridge has one it trusts; the panel works without it and never says "served" for the hand policy
    const servedReady = (async () => {
        if (!fetchImpl) return false;
        try {
            const r = await fetchImpl(servedUrl, { cache: "no-store" }); if (!r || !r.ok) return false;
            const j = await r.json();
            if (j && j.ok && j.weights) { const s = R.sanitizeWeights(j.weights); if (s.weights) { served = s.weights; servedSamples = Number(j.samples) || 0; renderSelects(); repend(); return true; } }
        } catch { /* no bridge: presets only */ }
        return false;
    })();

    // v4849 -- the vector fitted in the arena (tools/ship/trainTactics.mjs): a swek-tactics-v1 file the page ships. ONLY a file that says it is one is taken (a stub or a server answering every URL with the served policy is not a trained file);
    // a missing, malformed or out-of-format answer offers nothing and says nothing, like the served policy.
    const trainedReady = (async () => {
        if (!fetchImpl) return false;
        try {
            const r = await fetchImpl(trainedUrl, { cache: "no-store" }); if (!r || !r.ok) return false;
            const j = await r.json();
            if (j && j.format === "swek-tactics-v1" && j.weights) { const s = R.sanitizeWeights(j.weights); if (s.weights) { trained = s.weights; renderSelects(); repend(); if (!battleNo && (specs.A === "trained" || specs.B === "trained")) commit(); return true; } }   // a SAVED choice of it, made before the file arrived, is what a reload fights (nothing has been started yet, so nothing is rebuilt)
        } catch { /* no file: the other choices stand */ }
        return false;
    })();

    return {
        /** The committed weight vector for a side: what the fight hands to decide(). Stable between Start Fights (the same object), so a page may keep it. */
        weights(team) { return committed[team].weights; },
        get committed() { return committed; }, get pending() { return pending; }, get specs() { return specs; }, get battleNo() { return battleNo; },
        choices: () => R.choices(ctx()), setSpecs, start, importText, setImported, ready: servedReady, trainedReady,
        get imported() { return imported; }, get served() { return served; }, get trained() { return trained; },
        panel, button: btn, selects, note,
    };
}
