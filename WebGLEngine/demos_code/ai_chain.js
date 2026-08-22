// FILE: demos_code/ai_chain.js
// VERSION: v1 — round 162
//
// AI CHAIN DIAGNOSTIC
// =====================================================================
// Runs the full engine AI chain (narrative → OBJ → texture) end-to-end
// with timing measurement, so we can establish baselines and see where
// time is being spent.
//
// Why a dedicated demo?
//   - The main engine fires AI calls from many systems (CivManager,
//     KaijuManager, palchat, gpuAssetLoader). They overlap. We can't
//     measure cold-start or per-step time cleanly.
//   - This demo pauses the engine's AI clients while it runs, so
//     timings are unpolluted.
//
// What it measures (per step):
//   - Time to first token (cold-load + first thinking pass)
//   - Total generation time
//   - Tokens per second
//   - Output size / validity
//
// UI:
//   - Top: config form (URLs, model names, idle/total timeouts)
//   - Middle: 4 buttons (Narrative / OBJ / Texture / Full Chain)
//   - Bottom: results panel — per-step row with timing + preview
//
// On start: pauses both ollama + diffuser clients. On stop: resumes.
// Re-running is safe; results scroll into the log.

const PROMPTS = {
    narrative: "Describe a single moment when a giant kaiju first appears over a small coastal town. One vivid sentence.",
    obj:       "kaiju monster: tall, hulking, dragon-like silhouette with massive arms and tail",
    texture:   "a weathered stone wall texture, seamless, cracks and moss, top-down view",
};

let overlay = null;
let logEl = null;
let statusEl = null;
let busy = false;
let ctxRef = null;

// --- helpers ---------------------------------------------------------

function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const k in attrs) {
        if (k === "style")        Object.assign(e.style, attrs[k]);
        else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else                      e.setAttribute(k, attrs[k]);
    }
    for (const c of children) {
        if (c == null) continue;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
}

function logLine(html, color = "#ddd") {
    if (!logEl) return;
    const line = document.createElement("div");
    line.innerHTML = html;
    line.style.color = color;
    line.style.padding = "2px 0";
    line.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    line.style.fontFamily = "monospace";
    line.style.fontSize = "11px";
    line.style.lineHeight = "1.4";
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

function escapeHTML(s) {
    return String(s).replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
}

function setStatus(text, color = "#8af") {
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    }
}

// Read the current values from the config form.
function readConfig() {
    const q = id => overlay.querySelector(`[data-id="${id}"]`);
    return {
        ollamaUrl:        q("ollamaUrl").value.trim(),
        diffuserUrl:      q("diffuserUrl").value.trim(),
        narrativeModel:   q("narrativeModel").value.trim(),
        objModel:         q("objModel").value.trim(),
        textureModel:     q("textureModel").value.trim(),
        narrativePrompt:  q("narrativePrompt").value.trim(),
        objPrompt:        q("objPrompt").value.trim(),
        texturePrompt:    q("texturePrompt").value.trim(),
        idleTimeoutMs:    parseInt(q("idleTimeoutMs").value, 10) || 60_000,
        totalTimeoutMs:   parseInt(q("totalTimeoutMs").value, 10) || 600_000,
        textureSteps:     parseInt(q("textureSteps").value, 10)   || 20,
        textureSize:      parseInt(q("textureSize").value, 10)    || 512,
    };
}

// Apply config values to the live ollama + diffuser clients.
function applyConfigToClients(cfg) {
    const ollama   = window._ollama;
    const diffuser = window._diffuser;
    if (!ollama || !diffuser) return false;
    ollama.setBaseUrl(cfg.ollamaUrl);
    ollama.setNarrativeModel(cfg.narrativeModel);
    ollama.setObjModel(cfg.objModel);
    ollama.setIdleTimeoutMs(cfg.idleTimeoutMs);
    ollama.setTimeoutMs(cfg.totalTimeoutMs);
    diffuser.setBaseUrl(cfg.diffuserUrl);
    if (cfg.textureModel) diffuser.setModel(cfg.textureModel);
    diffuser.setTimeoutMs(cfg.totalTimeoutMs);
    return true;
}

// --- the three test runs ---------------------------------------------

async function runNarrative(cfg) {
    const ollama = window._ollama;
    if (!ollama) { logLine("✗ no ollama client", "#f88"); return null; }

    logLine(`<b>NARRATIVE</b> · model=${escapeHTML(cfg.narrativeModel)} · idle=${(cfg.idleTimeoutMs/1000)|0}s`, "#6db9ff");
    const t0 = performance.now();
    let firstTokenAt = null;

    ollama.setPaused(false);   // momentarily un-pause for this call
    try {
        const text = await ollama.generate(cfg.narrativePrompt, {
            num_predict: 64,
            temperature: 0.7,
            idleTimeoutMs: cfg.idleTimeoutMs,
            timeoutMs: cfg.totalTimeoutMs,
            onProgress: ({ tokensReceived, elapsedMs }) => {
                if (firstTokenAt === null) {
                    firstTokenAt = elapsedMs;
                    logLine(`  ↳ first token at ${(elapsedMs/1000).toFixed(1)}s (cold load)`, "#aaa");
                }
                if (tokensReceived % 10 === 0) {
                    setStatus(`narrative: ${tokensReceived} tokens, ${(elapsedMs/1000).toFixed(1)}s…`, "#6db9ff");
                }
            },
        });
        const dur = (performance.now() - t0) / 1000;
        if (!text) {
            logLine(`  ✗ <b>FAILED</b> after ${dur.toFixed(1)}s (see console for reason)`, "#f88");
            return null;
        }
        logLine(`  ✓ <b>${dur.toFixed(1)}s</b> · first token ${firstTokenAt ? (firstTokenAt/1000).toFixed(1) : "?"}s`, "#8aff9e");
        logLine(`  "${escapeHTML(text.slice(0, 240))}${text.length > 240 ? "…" : ""}"`, "#ccc");
        return { ok: true, durationMs: dur * 1000, firstTokenMs: firstTokenAt, text };
    } finally {
        ollama.setPaused(true);
    }
}

async function runOBJ(cfg) {
    const ollama = window._ollama;
    if (!ollama) { logLine("✗ no ollama client", "#f88"); return null; }

    logLine(`<b>OBJ</b> · model=${escapeHTML(cfg.objModel)} · idle=${(cfg.idleTimeoutMs/1000)|0}s`, "#ffd884");
    const t0 = performance.now();
    let firstTokenAt = null;
    let lastTokenCount = 0;

    ollama.setPaused(false);
    try {
        const objText = await ollama.generateOBJ(cfg.objPrompt, {
            idleTimeoutMs: cfg.idleTimeoutMs,
            timeoutMs:     cfg.totalTimeoutMs,
            num_predict:   1024,
            onProgress: ({ tokensReceived, elapsedMs }) => {
                if (firstTokenAt === null) {
                    firstTokenAt = elapsedMs;
                    logLine(`  ↳ first token at ${(elapsedMs/1000).toFixed(1)}s (cold load)`, "#aaa");
                }
                lastTokenCount = tokensReceived;
                if (tokensReceived % 20 === 0) {
                    setStatus(`obj: ${tokensReceived} tokens, ${(elapsedMs/1000).toFixed(1)}s…`, "#ffd884");
                }
            },
        });
        const dur = (performance.now() - t0) / 1000;
        if (!objText) {
            logLine(`  ✗ <b>FAILED</b> after ${dur.toFixed(1)}s · last seen ${lastTokenCount} tokens`, "#f88");
            return null;
        }
        const vCount = (objText.match(/^v /gm) || []).length;
        const fCount = (objText.match(/^f /gm) || []).length;
        const isC3D  = /C3D Python parser/.test(objText);
        logLine(`  ✓ <b>${dur.toFixed(1)}s</b> · first token ${firstTokenAt ? (firstTokenAt/1000).toFixed(1) : "?"}s · ${vCount} verts, ${fCount} faces${isC3D ? " (C3D Python→OBJ)" : ""}`, "#8aff9e");
        // Show a peek of the OBJ
        const preview = objText.split("\n").slice(0, 6).join("\n");
        logLine(`<pre style="margin:2px 0 0 10px;font-size:10px;color:#999;">${escapeHTML(preview)}</pre>`, "#999");
        return { ok: true, durationMs: dur * 1000, firstTokenMs: firstTokenAt, verts: vCount, faces: fCount, obj: objText };
    } finally {
        ollama.setPaused(true);
    }
}

async function runTexture(cfg) {
    const diffuser = window._diffuser;
    if (!diffuser) { logLine("✗ no diffuser client", "#f88"); return null; }

    logLine(`<b>TEXTURE</b> · ${cfg.textureSize}×${cfg.textureSize} · ${cfg.textureSteps} steps · ${escapeHTML(cfg.textureModel || "(server default)")}`, "#ff8aff");
    setStatus(`texture: generating…`, "#ff8aff");
    const t0 = performance.now();
    diffuser.setPaused(false);
    try {
        const res = await diffuser.generate(cfg.texturePrompt, {
            width:  cfg.textureSize,
            height: cfg.textureSize,
            steps:  cfg.textureSteps,
        });
        const dur = (performance.now() - t0) / 1000;
        if (!res.ok) {
            logLine(`  ✗ <b>FAILED</b> after ${dur.toFixed(1)}s · ${escapeHTML(res.error)}`, "#f88");
            return null;
        }
        logLine(`  ✓ <b>${dur.toFixed(1)}s</b> · server reported ${res.duration_ms != null ? (res.duration_ms/1000).toFixed(1) + "s" : "?"} internal`, "#8aff9e");
        // Thumbnail
        const thumb = document.createElement("img");
        thumb.src = res.dataUrl;
        thumb.style.cssText = "display:block; margin:4px 0 0 10px; width:128px; height:128px; border:1px solid #555; image-rendering:pixelated;";
        const wrap = document.createElement("div");
        wrap.appendChild(thumb);
        logEl.appendChild(wrap);
        return { ok: true, durationMs: dur * 1000, dataUrl: res.dataUrl };
    } finally {
        diffuser.setPaused(true);
    }
}

// --- the full chain --------------------------------------------------

async function runFullChain() {
    if (busy) { logLine("(busy; ignoring)", "#aaa"); return; }
    busy = true;
    const cfg = readConfig();
    applyConfigToClients(cfg);
    logLine(`<b style="color:#fff;">━━━ Full Chain @ ${new Date().toLocaleTimeString()} ━━━</b>`);
    setStatus("running full chain…", "#fc4");

    const t0 = performance.now();
    const narr = await runNarrative(cfg);
    const obj  = await runOBJ(cfg);
    const tex  = await runTexture(cfg);
    const total = (performance.now() - t0) / 1000;

    const summary = [];
    if (narr) summary.push(`narrative ${(narr.durationMs/1000).toFixed(1)}s`);
    if (obj)  summary.push(`obj ${(obj.durationMs/1000).toFixed(1)}s`);
    if (tex)  summary.push(`texture ${(tex.durationMs/1000).toFixed(1)}s`);
    logLine(`<b>━━━ DONE</b> · total ${total.toFixed(1)}s · ${summary.join(" · ")}`, "#fff");
    setStatus("ready", "#8af");
    busy = false;
}

async function runOnly(which) {
    if (busy) { logLine("(busy; ignoring)", "#aaa"); return; }
    busy = true;
    const cfg = readConfig();
    applyConfigToClients(cfg);
    setStatus(`running ${which}…`, "#fc4");
    if (which === "narrative") await runNarrative(cfg);
    if (which === "obj")       await runOBJ(cfg);
    if (which === "texture")   await runTexture(cfg);
    setStatus("ready", "#8af");
    busy = false;
}

// --- demo lifecycle --------------------------------------------------

function buildUI() {
    const cfg = {
        // Pull current values from the live clients as defaults
        ollamaUrl:       window._ollama?.baseUrl   ?? "http://localhost:11434",
        diffuserUrl:     window._diffuser?.baseUrl ?? "http://localhost:9000",
        narrativeModel:  window._ollama?.model     ?? "gemma3:4b",
        objModel:        window._ollama?.objModel  ?? "joshuaokolo/C3Dv0:latest",
        textureModel:    window._diffuser?.model   ?? "stable-diffusion-1.5",
        idleTimeoutMs:   window._ollama?.idleTimeoutMs ?? 60_000,
        totalTimeoutMs:  window._ollama?.timeoutMs ?? 600_000,
    };

    overlay = el("div", {
        style: {
            position: "fixed", left: "20px", top: "60px",
            width: "440px", maxHeight: "calc(100vh - 100px)",
            background: "rgba(8, 10, 20, 0.93)", color: "#ddd",
            border: "1px solid #344", borderRadius: "6px",
            padding: "10px 12px", fontFamily: "monospace", fontSize: "11px",
            zIndex: "9200",
            display: "flex", flexDirection: "column", gap: "6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        },
    });

    const title = el("div", { style: { display:"flex", alignItems:"center", gap:"8px" } },
        el("span", { style: { fontWeight:"bold", color:"#fff", letterSpacing:"0.05em" } }, "AI CHAIN DIAGNOSTIC"),
        el("span", { "data-id":"status",
            style: { fontSize:"10px", color:"#8af", marginLeft:"auto" } }, "ready"),
    );
    statusEl = title.querySelector('[data-id="status"]');
    overlay.appendChild(title);

    // ---- config form ----
    const form = el("div", { style: { display:"grid", gridTemplateColumns:"110px 1fr", gap:"3px 8px", fontSize:"10px" } });
    const addField = (label, id, value, type = "text", title = "") => {
        form.appendChild(el("label", { style: { color:"#999", lineHeight:"22px" }, title }, label));
        const input = el("input", { type, "data-id": id, value: String(value),
            style: { background:"#111", color:"#ddd", border:"1px solid #344", padding:"2px 4px", fontFamily:"monospace", fontSize:"10px" }
        });
        form.appendChild(input);
    };
    addField("Ollama URL",      "ollamaUrl",      cfg.ollamaUrl, "text", "http://host:port");
    addField("Diffuser URL",    "diffuserUrl",    cfg.diffuserUrl, "text", "http://host:port");
    addField("Narrative model", "narrativeModel", cfg.narrativeModel, "text");
    addField("OBJ model",       "objModel",       cfg.objModel, "text");
    addField("Texture model",   "textureModel",   cfg.textureModel, "text");
    addField("Idle timeout ms", "idleTimeoutMs",  cfg.idleTimeoutMs, "number", "abort if no token for this many ms");
    addField("Total timeout ms","totalTimeoutMs", cfg.totalTimeoutMs, "number", "hard ceiling per generation");
    addField("Texture size",    "textureSize",    512, "number", "image size in pixels (square)");
    addField("Texture steps",   "textureSteps",   20, "number", "diffusion steps; lower=faster, fuzzier");
    overlay.appendChild(form);

    // ---- prompt fields (collapsible would be nice; for now just 3 small textareas) ----
    const promptWrap = el("div", { style: { display:"flex", flexDirection:"column", gap:"3px" } });
    const addPrompt = (label, id, value) => {
        promptWrap.appendChild(el("div", { style:{ color:"#999", fontSize:"10px", marginTop:"4px" } }, label));
        const ta = el("textarea", { "data-id": id,
            style: { width:"100%", height:"34px", resize:"vertical",
                     background:"#111", color:"#ddd", border:"1px solid #344",
                     padding:"3px 4px", fontFamily:"monospace", fontSize:"10px", boxSizing:"border-box" }
        });
        ta.value = value;
        promptWrap.appendChild(ta);
    };
    addPrompt("Narrative prompt", "narrativePrompt", PROMPTS.narrative);
    addPrompt("OBJ prompt",       "objPrompt",       PROMPTS.obj);
    addPrompt("Texture prompt",   "texturePrompt",   PROMPTS.texture);
    overlay.appendChild(promptWrap);

    // ---- action buttons ----
    const btnRow = el("div", { style: { display:"flex", gap:"4px", flexWrap:"wrap", marginTop:"6px" } });
    const mkBtn = (label, color, onclick) => {
        const b = el("button", { onClick: onclick,
            style: { flex:"1", minWidth:"80px", background:"transparent",
                     border:`1px solid ${color}`, color, padding:"5px 8px",
                     fontFamily:"monospace", fontSize:"11px", cursor:"pointer",
                     borderRadius:"3px" } }, label);
        return b;
    };
    btnRow.appendChild(mkBtn("Narrative", "#6db9ff", () => runOnly("narrative")));
    btnRow.appendChild(mkBtn("OBJ",       "#ffd884", () => runOnly("obj")));
    btnRow.appendChild(mkBtn("Texture",   "#ff8aff", () => runOnly("texture")));
    btnRow.appendChild(mkBtn("Full Chain","#8aff9e", runFullChain));
    overlay.appendChild(btnRow);

    // Engine pause note
    overlay.appendChild(el("div", { style:{ fontSize:"9px", color:"#777", marginTop:"4px" } },
        "Engine AI is paused while this demo is open — narrative/OBJ/texture calls from other systems return null until you stop the demo."));

    // ---- results log ----
    logEl = el("div", {
        style: { background:"#000", border:"1px solid #233", borderRadius:"3px",
                 padding:"6px 8px", marginTop:"4px", flex:"1",
                 minHeight:"160px", maxHeight:"420px", overflowY:"auto" }
    });
    logLine("Ready. Pick a button to run a single step, or Full Chain.", "#888");
    overlay.appendChild(logEl);

    document.body.appendChild(overlay);
}

// --- demo exports ----------------------------------------------------

export default {
    id:    "ai_chain",
    label: "AI CHAIN DIAGNOSTIC",
    hint:  "Run narrative → OBJ → texture end-to-end with timing baselines",
    controls: [
        "Pick a single step to test, or Full Chain for all three in sequence",
        "Engine AI is auto-paused while open — clean baselines, no contention",
        "First-token time is the cold-load cost; total minus that is the warm gen rate",
    ],

    async start(ctx) {
        ctxRef = ctx;
        if (!window._ollama || !window._diffuser) {
            console.warn("[ai_chain] window._ollama or window._diffuser missing — engine didn't initialize them");
            return;
        }
        // Pause both clients so nothing else fires while we measure.
        window._ollama.setPaused(true);
        window._diffuser.setPaused(true);
        buildUI();
        try { ctx.lookAt?.(0, 30, 0); } catch {}
        try { ctx.kpop?.info?.("AI Chain Diagnostic", "engine AI paused; pick a step"); } catch {}
        console.log("[ai_chain] started; engine AI paused");
    },

    tick(/*ctx, dt*/) {
        // No simulation. The demo is just UI + async runs.
    },

    stop() {
        if (overlay) { overlay.remove(); overlay = null; }
        logEl = null;
        statusEl = null;
        busy = false;
        // Resume engine AI
        try { window._ollama?.setPaused(false); } catch {}
        try { window._diffuser?.setPaused(false); } catch {}
        console.log("[ai_chain] stopped; engine AI resumed");
    },
};
