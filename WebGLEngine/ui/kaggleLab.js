// ui/kaggleLab.js — v645

import { mountKaggleSetupWizard }   from "./kaggleSetupWizard.js";   // v695 — first-time setup wizard
import { createMiniTab }            from "./LCARSMiniTab.js";        // v1572 — right-edge minitab
import { mountKaggleDatasetCache }  from "./kaggleDatasetCache.js";  // v696 — per-template dataset cache
//
// Direct Kaggle test panel: pick ONE image, pick which templates to run
// (Hunyuan3D / Trellis2 / both), submit them as parallel jobs tagged
// "lab" so they don't tangle with the auto-pipeline kaiju jobs. A
// dedicated reconciler polls /kaggle/jobs every 60s, downloads completed
// labs, registers the GLB in assetLoader as kind = `lab_<slug>` and
// offers a "Spawn at camera" button to view in the engine.
//
// The user's mental model: submit one image to multiple models, compare
// the results side by side in the engine. Same panel renders on the
// phone via control.html's Kaggle Lab tab — both surfaces read the same
// /kaggle/jobs list, so a phone-submitted job appears on PC and vice
// versa.
//
// On "priority over kaijus": the bridge submits jobs to Kaggle the
// instant they arrive (no internal queue holds them back). Kaiju jobs
// from the AAS pipeline submit identically. Both go straight to Kaggle's
// own compute queue, which is the only queue that matters and isn't
// ours to manipulate. What "priority" actually means here is that lab
// jobs are tagged + tracked separately so the reconciler processes them
// first locally (downloads + asset register), AND the lab's submit
// button takes no detour through the AAS at all.

const STORAGE_KEY = "voxelengine.kaggleLabSlugs";   // slug -> { template, ts, completed }

function _loadTracked() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function _saveTracked(map) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

// Read a File or DataTransferItem as a base64 data URL.
function _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("file read failed"));
        r.readAsDataURL(file);
    });
}

export async function fetchTemplates() {
    try {
        const r = await fetch("/kaggle/templates", { cache: "no-store" });
        if (!r.ok) return [];
        const j = await r.json();
        // Lab cares about image→3D templates only — drop the diagnostic.
        return (j.templates || []).filter(t => t.id !== "diagnostic");
    } catch { return []; }
}

/**
 * Submit ONE image to N templates in parallel. Returns array of
 * { template, ok, slug?, error? }. Each successful submit is tracked
 * in localStorage so the reconciler can pick them up.
 */
// v652 — Submit one source (image + optionally mesh) to N templates in
// parallel, tagged with "lab" so the reconciler picks them up. Returns an
// array of { template, ok, slug?, error? }. Each successful submit is
// tracked under voxelengine.kaggleLabSlugs so the lab reconciler downloads
// + registers the meshes when they're ready.
//
// v693 — accepts a `prompt` field too, for text-input templates (Z-Image,
// Qwen-Image, etc). Each template's buildNotebook only reads the field
// matching its inputKind, so we can send all three (image, mesh, prompt)
// in one body and let the templates discriminate.
export async function submitToTemplates(arg, ...legacy) {
    // Back-compat: old signature (imageDataUrl, templateIds, note)
    let imageDataUrl, meshDataUrl, meshFormat, meshName, templateIds, note, prompt;
    if (typeof arg === "string" || arg === null || arg === undefined) {
        imageDataUrl = arg; templateIds = legacy[0]; note = legacy[1];
    } else {
        imageDataUrl = arg.imageDataUrl;
        meshDataUrl  = arg.meshDataUrl;
        meshFormat   = arg.meshFormat;
        meshName     = arg.meshName;
        templateIds  = arg.templateIds;
        note         = arg.note;
        prompt       = arg.prompt;
    }
    if (!Array.isArray(templateIds) || templateIds.length === 0) throw new Error("no templates");
    if (!imageDataUrl && !meshDataUrl && !prompt) throw new Error("no input — pick an image, a mesh, or enter a text prompt");
    const imgB64  = imageDataUrl ? String(imageDataUrl).replace(/^data:[^;]+;base64,/, "") : null;
    const meshB64 = meshDataUrl  ? String(meshDataUrl).replace(/^data:[^;]+;base64,/, "")  : null;
    const out = [];
    const tracked = _loadTracked();
    // Submit in parallel so the user doesn't wait for serial pushes.
    const submits = templateIds.map(async tid => {
        try {
            const r = await fetch("/kaggle/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    template: tid,
                    params: {
                        // Image-input templates use this:
                        imageBase64: imgB64,
                        removeBackground: true,
                        withTexture: true,
                        seed: 42,
                        // Mesh-input templates (e.g. rig_anything) use these:
                        meshBase64: meshB64,
                        meshFormat: meshFormat || "glb",
                        meshName:   meshName || null,
                        simplify: true,
                        simplifyCount: 8192,
                        // v693 — text-input templates (Z-Image, Qwen-Image, etc.)
                        // use this. Each template's buildNotebook ignores fields
                        // it doesn't need so passing all of them is safe.
                        prompt: prompt || "",
                        // Bookkeeping
                        tags: ["lab"],
                        note: note || "Kaggle Lab one-shot",
                    },
                }),
            });
            const j = await r.json();
            if (r.ok && j.slug) {
                tracked[j.slug] = { template: tid, ts: Date.now(), completed: false };
                return { template: tid, ok: true, slug: j.slug };
            }
            return { template: tid, ok: false, error: j?.error || r.statusText };
        } catch (e) { return { template: tid, ok: false, error: e.message }; }
    });
    const results = await Promise.all(submits);
    _saveTracked(tracked);
    return results;
}

export function listTrackedLabJobs() {
    const m = _loadTracked();
    return Object.entries(m).map(([slug, meta]) => ({ slug, ...meta }));
}
export function forgetTracked(slug) {
    const m = _loadTracked(); delete m[slug]; _saveTracked(m);
}

// ---- LAB RECONCILER ----
// Separate from the AAS reconciler: this one is responsible for
// downloading lab job results, registering them in assetLoader under a
// distinct kind `lab_<slug-hash>`, and tagging them ready for spawn.
// The AAS reconciler ignores lab jobs because their AAS pending map
// never receives the slug (lab.submitToTemplates doesn't touch it).

let _reconcileTimer = null;
const _onLabCompleted = new Set();   // callbacks: (slug, kind, url) -> void

export function onLabCompleted(fn) {
    if (typeof fn === "function") _onLabCompleted.add(fn);
    return () => _onLabCompleted.delete(fn);
}

async function reconcileLabJobs() {
    const tracked = _loadTracked();
    const pendingSlugs = Object.keys(tracked).filter(s => !tracked[s].completed);
    if (pendingSlugs.length === 0) return;
    try {
        const r = await fetch("/kaggle/jobs", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
        for (const j of jobs) {
            if (!tracked[j.slug] || tracked[j.slug].completed) continue;
            const phase = String(j.lastStatus || "").toLowerCase();
            if (phase === "complete") {
                try {
                    const dr = await fetch("/kaggle/download", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slug: j.slug }),
                    });
                    const dj = await dr.json();
                    const files = Array.isArray(dj?.files) ? dj.files : [];
                    const glbFile = files.find(f => /\.glb$/i.test(String(f)));
                    if (glbFile) {
                        const url = "/GPU_Assets/" + String(glbFile).replace(/^\/+/, "");
                        // Derive a short stable kind from the slug
                        const shortSlug = String(j.slug).replace(/[^\w]+/g, "_").slice(-20);
                        const kind = "lab_" + (tracked[j.slug].template || "?") + "_" + shortSlug;
                        // Register without forcing a spawn — user picks Spawn in the panel.
                        try { await window.assetLoader?.swapMesh?.(kind, url); } catch (e) {
                            console.warn(`[kaggleLab] swapMesh failed for ${kind}: ${e?.message}`);
                        }
                        tracked[j.slug].completed = true;
                        tracked[j.slug].kind = kind;
                        tracked[j.slug].url = url;
                        _saveTracked(tracked);
                        console.log(`[kaggleLab] ✓ ${j.slug} (${tracked[j.slug].template}) → ${kind} ready at ${url}. Spawn from the panel or: anim.spawn(0,0,1,"${kind}")`);
                        try { if (window._kpAnnounceAssetLoaded) window._kpAnnounceAssetLoaded(kind + " (kaggle lab)"); } catch {}
                        for (const cb of _onLabCompleted) { try { cb(j.slug, kind, url); } catch {} }
                    } else {
                        console.warn(`[kaggleLab] ${j.slug} complete but no GLB in output (${files.length} file(s))`);
                        tracked[j.slug].completed = true;
                        tracked[j.slug].error = "no_glb_in_output";
                        _saveTracked(tracked);
                    }
                } catch (e) { console.warn(`[kaggleLab] download failed for ${j.slug}: ${e?.message}`); }
            } else if (phase === "error" || phase === "cancelled") {
                tracked[j.slug].completed = true;
                tracked[j.slug].error = phase;
                _saveTracked(tracked);
                console.warn(`[kaggleLab] ${j.slug} ended with ${phase}`);
            }
        }
    } catch (e) { /* bridge unreachable — try again next tick */ }
}

export function startReconciler() {
    if (_reconcileTimer) return;
    _reconcileTimer = setInterval(reconcileLabJobs, 60_000);
    setTimeout(reconcileLabJobs, 6_000);   // first sweep ~6s after start
}

// ---- PC PANEL UI ----
// Compact draggable panel; opens via the 🧪 Kaggle Lab button.

export function mountKaggleLab() {
    if (typeof document === "undefined") return null;
    startReconciler();   // ensure background polling

    let panel = null;
    const togglePanel = async () => {
        if (panel) { panel.remove(); panel = null; return; }
        panel = await _buildPanel();
        document.body.appendChild(panel);
        const closeBtn = panel.querySelector("#lab-close-btn");
        if (closeBtn) closeBtn.addEventListener("click", () => { if (panel) { panel.remove(); panel = null; } });
    };
    // v1572 — moved from a fixed top-right button to a RIGHT-edge minitab (auto-stacked below SPAWN) per request.
    const btn = createMiniTab({ edge: "right", label: "Kaggle Lab", color: "voyager", onClick: togglePanel });
    btn.id = "kaggle_lab_btn";
    btn.title = "Direct Kaggle test — submit one image to Hunyuan3D / Trellis2, view the meshes when they land";
    return { button: btn };
}

async function _buildPanel() {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
        position: "fixed", top: "118px", right: "16px", zIndex: "8510",
        width: "320px", maxHeight: "calc(100vh - 140px)", overflow: "auto",
        background: "rgba(8,10,16,0.96)", color: "#cfd",
        border: "1px solid #553a7a", borderRadius: "8px", padding: "10px 12px",
        fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
    });
    wrap.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; color:#c9b; font-weight:bold; border-bottom:1px solid #443; padding-bottom:6px; margin-bottom:6px; letter-spacing:.04em;">
            <span>🧪 KAGGLE LAB</span>
            <span style="display:flex; gap:4px;">
                <button id="lab-cache-btn" title="Manage cached weights (Kaggle Datasets) per template" style="background:transparent; color:#9bc; border:1px solid #443; border-radius:3px; cursor:pointer; font:10px ui-monospace,Menlo,monospace; padding:2px 8px;">📦 Cache</button>
                <button id="lab-setup-btn" title="Walk through first-time Kaggle setup" style="background:transparent; color:#9bc; border:1px solid #443; border-radius:3px; cursor:pointer; font:10px ui-monospace,Menlo,monospace; padding:2px 8px;">⚙ Setup</button>
                <button id="lab-close-btn" title="Close panel" style="background:transparent; color:#c66; border:1px solid #644; border-radius:3px; cursor:pointer; font:11px ui-monospace,Menlo,monospace; padding:2px 8px;">×</button>
            </span>
        </div>
        <div id="lab-status-strip" style="display:flex; gap:10px; align-items:center; padding:3px 0 8px; border-bottom:1px solid #443; margin-bottom:8px; font:10px ui-monospace,Menlo,monospace; color:#789;">
            <span class="lab-status-dot" data-key="configured" style="color:#789;">◯ creds</span>
            <span class="lab-status-dot" data-key="kaggleInstalled" style="color:#789;">◯ kaggle pkg</span>
            <span class="lab-status-dot" data-key="authOk" style="color:#789;">◯ auth</span>
            <span style="flex:1;"></span>
            <span id="lab-status-jobcount" style="color:#789;"></span>
        </div>
        <label style="display:block; margin-bottom:4px; color:#9bc;">1. Pick an image</label>
        <input type="file" id="lab-img" accept="image/*" style="margin-bottom:8px; color:#cde; font-size:11px; width:100%;"/>
        <!-- v713 — Local image generation pulldown. Opens an inline prompt
             panel; POSTs to /diffuser/generate; result becomes the lab
             image so the user can submit it to a 3D-from-image template
             without leaving this panel. -->
        <details id="lab-localgen-wrap" style="margin:-4px 0 8px; padding:4px 0; border-top:1px dashed #443;">
          <summary style="cursor:pointer; color:#c9f; font-size:11px; padding:4px 0;">🎨 …or generate the image locally (free, no Kaggle quota)</summary>
          <div style="padding:6px 4px 4px;">
            <textarea id="lab-localgen-prompt" rows="2" placeholder="e.g. 'a small grey robot, side view, transparent background'"
              style="width:100%; box-sizing:border-box; padding:4px 6px; background:#15131e; color:#cfd; border:1px solid #443; border-radius:4px; font:11px ui-monospace,Menlo,monospace; resize:vertical;"></textarea>
            <div style="display:flex; gap:6px; align-items:center; margin-top:4px;">
              <button id="lab-localgen-btn" style="padding:4px 12px; background:#3a4a6a; color:#cde; border:1px solid #5a6a8a; border-radius:4px; cursor:pointer; font:11px ui-monospace,Menlo,monospace;">Generate</button>
              <span id="lab-localgen-msg" style="font-size:10px; color:#8b97a8; flex:1;"></span>
            </div>
            <p style="margin:6px 0 0; color:#789; font-size:10px;">Uses OllamaDiffuser at /diffuser/generate. The diffuser must be running (Settings → AI → Auto-start image diffuser, or POST /diffuser/launch manually). 512×512 PNG, ~5–25s on GTX 1070. Mesh-gen has no local equivalent yet — Trellis2/LGM run in ComfyUI not the diffuser bridge.</p>
          </div>
        </details>
        <!-- v716 — Local mesh generation via ComfyUI. Uses the image
             already picked / generated above as the input to a workflow
             from comfyui-workflows/. The workflow JSON is exported by the
             user from their own ComfyUI install (Save → API Format). -->
        <details id="lab-comfymesh-wrap" style="margin:-4px 0 8px; padding:4px 0; border-top:1px dashed #443;">
          <summary style="cursor:pointer; color:#9f9; font-size:11px; padding:4px 0;">🧊 …or generate the mesh locally via ComfyUI (image → 3D)</summary>
          <div style="padding:6px 4px 4px;">
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
              <label style="font-size:11px; color:#9bc;">Workflow:</label>
              <select id="lab-comfymesh-select" style="flex:1; padding:3px 6px; background:#15131e; color:#cfd; border:1px solid #443; border-radius:4px; font:11px ui-monospace,Menlo,monospace;">
                <option value="">(refresh to load)</option>
              </select>
              <button id="lab-comfymesh-refresh" title="Re-scan ai-bridge/comfyui-workflows/" style="padding:3px 8px; background:#2a3340; color:#cde; border:1px solid #455; border-radius:4px; cursor:pointer; font-size:11px;">🔄</button>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button id="lab-comfymesh-btn" disabled style="padding:4px 12px; background:#3a6a4a; color:#cfe; border:1px solid #5a8a6a; border-radius:4px; cursor:pointer; font:11px ui-monospace,Menlo,monospace; opacity:.55;">Generate mesh</button>
              <span id="lab-comfymesh-msg" style="font-size:10px; color:#8b97a8; flex:1;"></span>
            </div>
            <div id="lab-comfymesh-results" style="margin-top:6px;"></div>
            <p style="margin:6px 0 0; color:#789; font-size:10px;">Needs ComfyUI running + a workflow .json exported from ComfyUI's Save (API Format) into <code>ai-bridge/comfyui-workflows/</code>. See the README in that folder. Workflow loader matches LoadImage / LoadImage|pysssss / LoadImageFromPath / Image Load / WAS_LoadImage / easy loadImage nodes.</p>
          </div>
        </details>
        <img id="lab-preview" style="display:none; max-width:100%; max-height:140px; border:1px solid #443; border-radius:4px; margin-bottom:8px;"/>
        <label style="display:block; margin-bottom:4px; color:#9bc;">1b. Or pick a mesh (for rigging templates)</label>
        <input type="file" id="lab-mesh" accept=".glb,.obj" style="margin-bottom:8px; color:#cde; font-size:11px; width:100%;"/>
        <div id="lab-mesh-info" style="display:none; padding:4px 8px; background:#1a1622; color:#9bc; border:1px solid #443; border-radius:4px; margin-bottom:8px; font-size:10px; font-family:ui-monospace,Menlo,monospace;"></div>
        <div id="lab-prompt-wrap" style="display:none; margin-bottom:8px;">
            <label style="display:block; margin-bottom:4px; color:#9bc;">1c. Or enter a text prompt (for text-to-image / text-to-3D templates)</label>
            <textarea id="lab-prompt" rows="3" placeholder="e.g. 'a pixel-art oak tree, side view, transparent background' (Z-Image, Qwen-Image)" style="width:100%; padding:4px 6px; background:#15131e; color:#cfd; border:1px solid #443; border-radius:4px; font:11px ui-monospace,Menlo,monospace; resize:vertical;"></textarea>
        </div>
        <label style="display:block; margin-bottom:4px; color:#9bc;">2. Pick model(s)</label>
        <div id="lab-templates" style="margin-bottom:8px;">loading…</div>
        <label style="display:block; margin-bottom:4px; color:#9bc;">3. Optional note</label>
        <input type="text" id="lab-note" placeholder="note, or motion prompt for Kimodo (e.g. 'person walks, waves, sits')" style="width:100%; margin-bottom:8px; padding:4px 6px; background:#15131e; color:#cfd; border:1px solid #443; border-radius:4px; font:11px ui-monospace,Menlo,monospace;"/>
        <button id="lab-submit" disabled style="width:100%; padding:6px; background:#553a7a; color:#fff; border:0; border-radius:4px; cursor:pointer; font:bold 11px ui-monospace,Menlo,monospace; opacity:.55;">Submit</button>
        <div id="lab-msg" style="color:#9bc; font-size:10px; margin-top:6px; min-height:1.4em;"></div>
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid #333; color:#9bc; font-size:11px; display:flex; justify-content:space-between; align-items:center; gap:6px;">
          <span>Tracked lab jobs:</span>
          <span>
            <a href="/view.html?queue=lab" target="_blank" rel="noopener" style="color:#c9f; text-decoration:none; font-size:10px; padding:2px 6px; border:1px solid #553a7a; border-radius:3px;">🃏 Lab queue</a>
            <a href="/view.html?queue=creatures" target="_blank" rel="noopener" style="color:#c9f; text-decoration:none; font-size:10px; padding:2px 6px; border:1px solid #553a7a; border-radius:3px; margin-left:3px;">🧬 Creatures</a>
            <a href="/view.html?queue=all_glb" target="_blank" rel="noopener" style="color:#c9f; text-decoration:none; font-size:10px; padding:2px 6px; border:1px solid #553a7a; border-radius:3px; margin-left:3px;">📦 All GLBs</a>
          </span>
        </div>
        <div id="lab-jobs" style="margin-top:4px; font-size:11px;"></div>
    `;

    const $ = sel => wrap.querySelector(sel);
    const fileIn = $("#lab-img"), prev = $("#lab-preview"), tplDiv = $("#lab-templates");
    const meshIn = $("#lab-mesh"), meshInfo = $("#lab-mesh-info");
    const submitBtn = $("#lab-submit"), msg = $("#lab-msg"), jobsDiv = $("#lab-jobs");
    const noteIn = $("#lab-note");
    // v693 — prompt input for text-to-image / text-to-3D templates
    const promptWrap = $("#lab-prompt-wrap"), promptIn = $("#lab-prompt");
    let imageDataUrl = null;
    let meshDataUrl  = null;
    let meshFormat   = null;
    let meshName     = null;

    // v713 — local image generation via /diffuser/generate. Wires the
    // Generate button inside <details id="lab-localgen-wrap">. On success
    // the returned PNG becomes the imageDataUrl as if the user had picked
    // a file, so the existing Submit flow handles it unchanged.
    const localGenBtn    = wrap.querySelector("#lab-localgen-btn");
    const localGenPrompt = wrap.querySelector("#lab-localgen-prompt");
    const localGenMsg    = wrap.querySelector("#lab-localgen-msg");
    if (localGenBtn) {
        localGenBtn.addEventListener("click", async () => {
            const p = (localGenPrompt.value || "").trim();
            if (!p) { localGenMsg.textContent = "type a prompt first"; localGenMsg.style.color = "#fb6"; return; }
            localGenBtn.disabled = true;
            localGenMsg.textContent = "generating… (5–25s on GTX 1070)";
            localGenMsg.style.color = "#8b97a8";
            const t0 = Date.now();
            try {
                const r = await fetch("/diffuser/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: p, frames: 1, width: 512, height: 512 }),
                });
                const j = await r.json();
                if (!j.ok) {
                    localGenMsg.textContent = "failed: " + (j.error || "?");
                    localGenMsg.style.color = "#f88";
                    if (/diffuser not running/i.test(j.error || "")) {
                        localGenMsg.textContent += " — Settings → AI → Auto-start image diffuser, then reload";
                    }
                    return;
                }
                const img0 = (j.images && j.images[0]) || null;
                if (!img0) {
                    localGenMsg.textContent = "no image returned";
                    localGenMsg.style.color = "#f88"; return;
                }
                // Normalize to a data: URL whether the bridge returned one or raw base64
                const dataUrl = /^data:image\//.test(img0) ? img0 : ("data:image/png;base64," + img0);
                imageDataUrl = dataUrl;
                prev.src = dataUrl;
                prev.style.display = "block";
                localGenMsg.textContent = "✓ generated in " + ((Date.now() - t0)/1000).toFixed(1) + "s · ready to submit";
                localGenMsg.style.color = "#9fe88f";
                // Trigger the same submit-ready check the file picker uses
                refreshSubmitState && refreshSubmitState();
            } catch (e) {
                localGenMsg.textContent = "error: " + (e.message || e);
                localGenMsg.style.color = "#f88";
            } finally {
                localGenBtn.disabled = false;
            }
        });
    }

    // v716 — ComfyUI mesh-gen picker. Lists workflows from the bridge,
    // submits a selected one with the current imageDataUrl, polls until
    // done, then renders download + "load in engine" links.
    const cmBtn      = wrap.querySelector("#lab-comfymesh-btn");
    const cmSelect   = wrap.querySelector("#lab-comfymesh-select");
    const cmRefresh  = wrap.querySelector("#lab-comfymesh-refresh");
    const cmMsg      = wrap.querySelector("#lab-comfymesh-msg");
    const cmResults  = wrap.querySelector("#lab-comfymesh-results");
    let cmPollTimer = null;

    async function refreshComfyWorkflows() {
        try {
            const r = await fetch("/comfyui/mesh-gen/workflows");
            const j = await r.json();
            const workflows = (j && j.workflows) || [];
            cmSelect.innerHTML = "";
            if (workflows.length === 0) {
                const opt = document.createElement("option");
                opt.value = ""; opt.textContent = "(none — drop a .json into comfyui-workflows/)";
                cmSelect.appendChild(opt);
                cmBtn.disabled = true; cmBtn.style.opacity = ".55";
            } else {
                workflows.forEach(w => {
                    const opt = document.createElement("option");
                    opt.value = w; opt.textContent = w;
                    cmSelect.appendChild(opt);
                });
                updateCmBtnState();
            }
            cmMsg.textContent = workflows.length ? `${workflows.length} workflow(s)` : "no workflows found";
            cmMsg.style.color = "#8b97a8";
        } catch (e) {
            cmSelect.innerHTML = '<option value="">(bridge unreachable)</option>';
            cmMsg.textContent = "list error: " + (e.message || e);
            cmMsg.style.color = "#f88";
            cmBtn.disabled = true; cmBtn.style.opacity = ".55";
        }
    }
    function updateCmBtnState() {
        const hasImg = !!imageDataUrl;
        const hasWf  = !!(cmSelect.value && cmSelect.value.length);
        const ready  = hasImg && hasWf;
        cmBtn.disabled = !ready;
        cmBtn.style.opacity = ready ? "1" : ".55";
        if (!hasImg) cmMsg.textContent = "pick or generate an image first";
        else if (!hasWf) cmMsg.textContent = "pick a workflow";
        else cmMsg.textContent = "ready · click Generate mesh";
        cmMsg.style.color = "#8b97a8";
    }
    cmSelect && cmSelect.addEventListener("change", updateCmBtnState);
    cmRefresh && cmRefresh.addEventListener("click", refreshComfyWorkflows);

    // Hook into refreshSubmitState so the ComfyUI button re-evaluates
    // when the image source changes (file picker, local-gen, etc.).
    const _prevRefresh = refreshSubmitState;
    refreshSubmitState = function() {
        try { _prevRefresh && _prevRefresh.apply(this, arguments); } catch {}
        try { updateCmBtnState(); } catch {}
    };

    // Lazy-load the list when the user opens the pulldown
    const cmDetailsWrap = wrap.querySelector("#lab-comfymesh-wrap");
    cmDetailsWrap && cmDetailsWrap.addEventListener("toggle", () => {
        if (cmDetailsWrap.open && cmSelect.options.length <= 1) refreshComfyWorkflows();
    });

    cmBtn && cmBtn.addEventListener("click", async () => {
        if (!imageDataUrl) { cmMsg.textContent = "no image"; cmMsg.style.color = "#fb6"; return; }
        const wf = cmSelect.value;
        if (!wf) { cmMsg.textContent = "pick a workflow"; cmMsg.style.color = "#fb6"; return; }
        cmBtn.disabled = true; cmBtn.style.opacity = ".55";
        cmResults.innerHTML = "";
        cmMsg.textContent = "submitting…";
        cmMsg.style.color = "#8b97a8";
        try {
            const r = await fetch("/comfyui/mesh-gen", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflow: wf, image: imageDataUrl }),
            });
            const j = await r.json();
            if (!j.ok) {
                cmMsg.textContent = "failed: " + (j.error || "?");
                cmMsg.style.color = "#f88";
                cmBtn.disabled = false; cmBtn.style.opacity = "1";
                return;
            }
            const promptId = j.promptId;
            cmMsg.textContent = `submitted · prompt ${promptId.slice(0,8)} · polling…`;
            cmMsg.style.color = "#9bc";
            // Poll every 2s for up to 5 minutes
            const tStart = Date.now();
            const POLL_MS = 2000, MAX_MS = 5 * 60 * 1000;
            if (cmPollTimer) { clearInterval(cmPollTimer); cmPollTimer = null; }
            cmPollTimer = setInterval(async () => {
                try {
                    const s = await fetch("/comfyui/mesh-gen/" + encodeURIComponent(promptId));
                    const sj = await s.json();
                    const elapsed = ((Date.now() - tStart)/1000).toFixed(0);
                    if (!sj.ok) {
                        cmMsg.textContent = `error after ${elapsed}s: ${sj.error || "?"}`;
                        cmMsg.style.color = "#f88";
                        clearInterval(cmPollTimer); cmPollTimer = null;
                        cmBtn.disabled = false; cmBtn.style.opacity = "1";
                        return;
                    }
                    if (sj.done) {
                        clearInterval(cmPollTimer); cmPollTimer = null;
                        cmBtn.disabled = false; cmBtn.style.opacity = "1";
                        if (sj.execution_error) {
                            cmMsg.textContent = `execution error: ${sj.execution_error.exception_message || sj.execution_error.status_str || "?"}`;
                            cmMsg.style.color = "#f88";
                            return;
                        }
                        const outputs = sj.outputs || [];
                        if (outputs.length === 0) {
                            cmMsg.textContent = `done in ${elapsed}s · no output files`;
                            cmMsg.style.color = "#fb6";
                            return;
                        }
                        cmMsg.textContent = `✓ done in ${elapsed}s · ${outputs.length} file(s)`;
                        cmMsg.style.color = "#9fe88f";
                        cmResults.innerHTML = outputs.map(f => {
                            const isMesh = /\.(glb|gltf|obj|ply|stl)$/i.test(f.filename);
                            return `
                            <div style="background:#0c1018; border:1px solid #2a3340; border-radius:4px; padding:4px 6px; margin-top:4px; display:flex; gap:6px; align-items:center;">
                                <span style="font-size:11px; color:#cfd; flex:1; overflow:hidden; text-overflow:ellipsis;">${f.filename}</span>
                                <a href="${f.url}" target="_blank" rel="noopener" style="font-size:10px; padding:2px 6px; background:#2a3340; color:#cde; border:1px solid #455; border-radius:3px; text-decoration:none;">⬇ download</a>
                                ${isMesh ? `<button data-url="${f.url}" data-name="${f.filename}" class="lab-comfy-load" style="font-size:10px; padding:2px 6px; background:#2a4d3a; color:#cfe; border:1px solid #4a7d5a; border-radius:3px; cursor:pointer;">📦 load in engine</button>` : ""}
                            </div>`;
                        }).join("");
                        // Wire load-in-engine buttons
                        cmResults.querySelectorAll(".lab-comfy-load").forEach(b => {
                            b.addEventListener("click", async () => {
                                const url = b.dataset.url;
                                const name = b.dataset.name;
                                try {
                                    // The asset loader takes a URL + label; ping it via
                                    // the existing window.engineAssetLoader if available.
                                    if (window.assetLoader?.loadGLBFromUrl) {
                                        await window.assetLoader.loadGLBFromUrl(url, name);
                                        b.textContent = "✓ loaded";
                                        b.style.background = "#3a6a4a";
                                    } else {
                                        // Fallback: open the URL — user can drag into engine
                                        window.open(url, "_blank");
                                        b.textContent = "↗ opened";
                                    }
                                } catch (e) {
                                    b.textContent = "✗ " + (e.message || e).slice(0,30);
                                    b.style.background = "#5a2a2a";
                                }
                            });
                        });
                        return;
                    }
                    cmMsg.textContent = `running… ${elapsed}s`;
                    if (Date.now() - tStart > MAX_MS) {
                        cmMsg.textContent = `timed out after ${elapsed}s (still running on ComfyUI — refresh /history/${promptId} manually)`;
                        cmMsg.style.color = "#fb6";
                        clearInterval(cmPollTimer); cmPollTimer = null;
                        cmBtn.disabled = false; cmBtn.style.opacity = "1";
                    }
                } catch (e) {
                    // Don't stop polling on transient errors — ComfyUI may not have
                    // written history yet. Just note in status.
                    cmMsg.textContent = `polling… (${(e.message || e).slice(0,30)})`;
                    cmMsg.style.color = "#fb6";
                }
            }, POLL_MS);
        } catch (e) {
            cmMsg.textContent = "submit error: " + (e.message || e);
            cmMsg.style.color = "#f88";
            cmBtn.disabled = false; cmBtn.style.opacity = "1";
        }
    });

    // Templates
    const templates = await fetchTemplates();
    if (templates.length === 0) {
        tplDiv.innerHTML = '<span style="color:#a86;">no templates available (bridge unreachable?)</span>';
    } else {
        tplDiv.innerHTML = templates.map((t, i) =>
            `<label style="display:block; margin:3px 0; cursor:pointer; color:#cfd;">
                <input type="checkbox" name="lab-t" value="${t.id}" data-input="${t.inputKind || "image"}" ${i === 0 ? "checked" : ""}/>
                <span style="color:#cfd;">${t.label}</span>
             </label>`
        ).join("");
    }

    // v695 — first-time setup wizard. The Setup button mounts the wizard
    // on demand; we also auto-open it once if /kaggle/status reports the
    // bridge isn't configured yet (and the user hasn't dismissed via a
    // session flag). This shows new users the right path immediately
    // instead of letting them click Submit and get a config-required error.
    const wizard = mountKaggleSetupWizard();
    wrap.querySelector("#lab-setup-btn")?.addEventListener("click", () => wizard.open());
    try {
        if (sessionStorage.getItem("voxelengine.kaggleSetupSeen") !== "1") {
            const opened = await wizard.autoOpenIfNeeded();
            if (opened) sessionStorage.setItem("voxelengine.kaggleSetupSeen", "1");
        }
    } catch { /* sessionStorage may be unavailable */ }

    // v696 — per-template Kaggle Dataset cache manager. Lets the user
    // attach pre-downloaded weights as Kaggle Datasets to skip the slow
    // first-run HF download for Z-Image / Qwen-Image / Pixal3D / LiTo.
    const cachePanel = mountKaggleDatasetCache();
    wrap.querySelector("#lab-cache-btn")?.addEventListener("click", () => cachePanel.open());

    // v696 — status strip in the panel head. Three dots show live state
    // from GET /kaggle/status: creds saved / kaggle pkg installed / auth
    // works. Replaces the standalone KaggleInfoPanel's status section.
    async function refreshStatusStrip() {
        try {
            const r = await fetch("/kaggle/status", { cache: "no-store" });
            if (!r.ok) return;
            const st = await r.json();
            const dots = wrap.querySelectorAll(".lab-status-dot");
            dots.forEach(d => {
                const key = d.dataset.key;
                const ok = !!st[key];
                d.style.color = ok ? "#6c8" : "#a86";
                d.textContent = (ok ? "✓ " : "✗ ") + d.textContent.replace(/^[◯✓✗]\s*/, "");
            });
            const jc = wrap.querySelector("#lab-status-jobcount");
            if (jc) jc.textContent = st.jobCount ? `${st.jobCount} jobs` : "";
        } catch { /* bridge unreachable — leave dots gray */ }
    }
    refreshStatusStrip();
    // Refresh periodically + after wizard/cache panels close (in case
    // creds got saved or kaggle pkg installed via the wizard).
    const _statusInterval = setInterval(refreshStatusStrip, 60_000);
    // When panel removes itself (e.g. user reopens), clear the interval.
    // The dock system may remove the wrap; use a MutationObserver as a
    // safety net for that case.
    try {
        const obs = new MutationObserver(() => {
            if (!document.body.contains(wrap)) { clearInterval(_statusInterval); obs.disconnect(); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    } catch {}

    function refreshSubmitState() {
        // v693 — submit is ready when EVERY selected template has its required
        // input present. Image-input templates need an image; mesh-input templates
        // need a mesh; text-input templates need a non-empty prompt. Also show /
        // hide the prompt textarea based on whether any text template is selected.
        const checked = [...wrap.querySelectorAll('input[name="lab-t"]:checked')];
        if (checked.length === 0) {
            submitBtn.disabled = true; submitBtn.style.opacity = "0.55";
            promptWrap.style.display = "none";
            return;
        }
        const needsImage = checked.some(c => (c.dataset.input || "image") === "image");
        const needsMesh  = checked.some(c => c.dataset.input === "mesh");
        const needsText  = checked.some(c => c.dataset.input === "text");
        // Toggle prompt textarea visibility
        promptWrap.style.display = needsText ? "block" : "none";
        const hasPrompt = (promptIn.value || "").trim().length > 0;
        const ready = (!needsImage || !!imageDataUrl)
                   && (!needsMesh  || !!meshDataUrl)
                   && (!needsText  || hasPrompt);
        submitBtn.disabled = !ready;
        submitBtn.style.opacity = ready ? "1" : "0.55";
    }

    fileIn.addEventListener("change", async () => {
        const f = fileIn.files?.[0]; if (!f) return;
        imageDataUrl = await _readFileAsDataUrl(f);
        prev.src = imageDataUrl; prev.style.display = "block";
        refreshSubmitState();
    });
    meshIn.addEventListener("change", async () => {
        const f = meshIn.files?.[0]; if (!f) return;
        meshDataUrl = await _readFileAsDataUrl(f);
        meshName    = f.name;
        meshFormat  = (f.name.toLowerCase().endsWith(".obj")) ? "obj" : "glb";
        const sizeKB = Math.round((f.size || 0) / 1024);
        meshInfo.textContent = `${f.name}  ·  ${meshFormat.toUpperCase()}  ·  ${sizeKB} KB`;
        meshInfo.style.display = "block";
        refreshSubmitState();
    });
    // v693 — typing in the prompt textarea retriggers submit-ready check
    promptIn.addEventListener("input", refreshSubmitState);
    wrap.addEventListener("change", refreshSubmitState);

    submitBtn.addEventListener("click", async () => {
        const ids = [...wrap.querySelectorAll('input[name="lab-t"]:checked')].map(c => c.value);
        submitBtn.disabled = true; submitBtn.textContent = "Submitting…"; msg.textContent = "";
        try {
            const results = await submitToTemplates({
                imageDataUrl, meshDataUrl, meshFormat, meshName,
                templateIds: ids,
                note: noteIn.value || null,
                // v693 — pass the prompt to text-input templates
                prompt: (promptIn.value || "").trim() || null,
            });
            const okCount = results.filter(r => r.ok).length;
            msg.innerHTML = results.map(r =>
                r.ok ? `<span style="color:#6c8;">✓ ${r.template}: ${r.slug}</span>`
                     : `<span style="color:#c66;">✗ ${r.template}: ${r.error}</span>`
            ).join("<br>");
            console.log(`[kaggleLab] submitted ${okCount}/${results.length} job(s) — reconciler will fetch + register meshes when done (~15–45 min)`);
            renderJobs();
        } catch (e) {
            msg.innerHTML = '<span style="color:#c66;">' + e.message + '</span>';
        } finally {
            submitBtn.disabled = false; submitBtn.textContent = "Submit";
        }
    });

    function renderJobs() {
        const tracked = listTrackedLabJobs().sort((a, b) => (b.ts || 0) - (a.ts || 0));
        if (tracked.length === 0) { jobsDiv.innerHTML = '<span style="color:#666;">(none yet — submit one above)</span>'; return; }
        jobsDiv.innerHTML = tracked.slice(0, 12).map(t => {
            const age = Math.round(((Date.now()) - (t.ts || 0)) / 60000);
            if (t.completed && t.kind) {
                return `<div style="margin:4px 0; padding:4px 6px; background:#0a1814; border-radius:4px;">
                    <div style="color:#6c8;">✓ ${t.template}  ·  ${age}m</div>
                    <div style="color:#789; font-size:10px; word-break:break-all;">${t.kind}</div>
                    <button data-spawn="${t.kind}" style="margin-top:3px; padding:3px 6px; font-size:10px; background:#234; color:#cde; border:1px solid #456; border-radius:3px; cursor:pointer;">spawn at camera</button>
                    <button data-view="${t.url}" data-label="${t.kind}" style="margin-top:3px; margin-left:4px; padding:3px 6px; font-size:10px; background:#2a234c; color:#c9f; border:1px solid #553a7a; border-radius:3px; cursor:pointer;">view</button>
                    <button data-forget="${t.slug}" style="margin-top:3px; margin-left:4px; padding:3px 6px; font-size:10px; background:#231; color:#a86; border:1px solid #543; border-radius:3px; cursor:pointer;">forget</button>
                </div>`;
            } else if (t.completed && t.error) {
                return `<div style="margin:4px 0; padding:4px 6px; background:#1a0a0a; border-radius:4px;">
                    <div style="color:#c66;">✗ ${t.template}  ·  ${t.error}</div>
                    <button data-log="${t.slug}" style="margin-top:3px; padding:3px 6px; font-size:10px; background:#2a1a1a; color:#fb8; border:1px solid #844; border-radius:3px; cursor:pointer;">📋 log</button>
                    <button data-forget="${t.slug}" style="margin-top:3px; margin-left:4px; padding:3px 6px; font-size:10px; background:#231; color:#a86; border:1px solid #543; border-radius:3px; cursor:pointer;">forget</button>
                    <pre data-logbox="${t.slug}" style="display:none; margin-top:6px; padding:6px 8px; background:#0a0606; color:#fdb; font-size:10px; line-height:1.35; max-height:240px; overflow:auto; white-space:pre-wrap; word-break:break-all; border:1px solid #543; border-radius:3px;"></pre>
                </div>`;
            } else {
                return `<div style="margin:4px 0; padding:4px 6px; background:#15131e; border-radius:4px;">
                    <div style="color:#9bc;">⠋ ${t.template}  ·  ${age}m</div>
                    <div style="color:#666; font-size:10px; word-break:break-all;">${t.slug}</div>
                </div>`;
            }
        }).join("");
        // Wire spawn + view + forget buttons
        wrap.querySelectorAll("button[data-spawn]").forEach(b => b.addEventListener("click", () => {
            const kind = b.dataset.spawn;
            try {
                const id = window.anim?.spawn?.(0, 0, 1.6, kind);
                console.log(`[kaggleLab] spawned ${kind} as entity id=${id}`);
                msg.innerHTML = `<span style="color:#6c8;">spawned ${kind} at camera (id ${id})</span>`;
            } catch (e) { msg.innerHTML = '<span style="color:#c66;">spawn failed: ' + e.message + '</span>'; }
        }));
        wrap.querySelectorAll("button[data-view]").forEach(b => b.addEventListener("click", () => {
            const url = b.dataset.view, label = b.dataset.label || "";
            const u = `/view.html?glb=${encodeURIComponent(url)}`;
            window.open(u, "_blank", "noopener");
        }));
        wrap.querySelectorAll("button[data-forget]").forEach(b => b.addEventListener("click", () => {
            forgetTracked(b.dataset.forget); renderJobs();
        }));
        // v649 — log button on error jobs. Fetches /kaggle/log?slug=...
        // which runs `kaggle kernels output` to capture the Python stdout
        // + traceback from the failed run, then renders the tail inline.
        wrap.querySelectorAll("button[data-log]").forEach(b => b.addEventListener("click", async () => {
            const slug = b.dataset.log;
            const box  = wrap.querySelector('pre[data-logbox="' + slug.replace(/"/g, '\\"') + '"]');
            if (!box) return;
            if (box.style.display === "block") { box.style.display = "none"; return; }
            box.style.display = "block";
            box.textContent = "fetching log…";
            try {
                const r = await fetch("/kaggle/log?slug=" + encodeURIComponent(slug));
                const j = await r.json();
                if (j?.log) {
                    box.textContent = j.log + (j.cached ? "\n\n[cached " + Math.round((Date.now() - j.at) / 60000) + "m ago]" : "");
                } else {
                    box.textContent = "no log available (CLI returned: " + JSON.stringify(j).slice(0, 200) + ")";
                }
            } catch (e) {
                box.textContent = "log fetch failed: " + (e.message || "unknown");
            }
        }));
    }
    renderJobs();
    setInterval(renderJobs, 5000);

    return wrap;
}
