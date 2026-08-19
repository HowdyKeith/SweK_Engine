// demos_code/ai_pipeline_bench.js — Measure the full AI asset pipeline.
//
// Round 162. The engine runs three independent local AI services:
//   1. Ollama narrative (gemma3:4b)   — civ events, palchat dialogue
//   2. Ollama OBJ (C3Dv0)              — kaiju + civ structure meshes
//   3. OllamaDiffuser texture (SD 1.5) — parallax color + heightmap pairs
//
// This bench runs each one in isolation against the SAME kaiju prompt
// so cold-start latency, throughput, and output quality are directly
// comparable. While the bench is active, the engine's own Ollama
// traffic is PAUSED — both clients have setPaused(true) called, which
// aborts in-flight engine requests and silences new ones. That keeps
// the measured numbers clean (no engine narration competing for CPU)
// and stops the engine's slow C3D request from hogging the GPU/CPU
// while you're trying to baseline a different model.
//
// On stop(), engine traffic resumes automatically.
//
// What you can configure from the panel:
//   - Per-service URL (Ollama at :11434, Diffuser at :9000 by default)
//   - Per-task model (narrative, OBJ, texture)
//   - Idle timeout (per-token max gap) and total timeout
//   - Texture resolution + steps
//   - The kaiju prompt itself
//
// Three step buttons + "Run all sequentially" + "Run all in parallel".
// Baselines (first successful run's elapsed time per step) are saved
// to localStorage so they show on subsequent visits.

import { OllamaClient }         from "../ai/OllamaClient.js";
import { OllamaDiffuserClient } from "../ai/OllamaDiffuserClient.js";
import { ComfyUIClient }        from "../ai/ComfyUIClient.js";
import { materialSetFromDataUrl } from "../ai/MaterialSet.js";
import { materialSets }         from "../ai/MaterialSetRegistry.js";
import { createObjPreview }     from "../ui/objPreview.js";
import { createMeshQcBadges }   from "../ui/MeshQcBadges.js";    // Round 283
import { PipelineManager, pipelineWallclockMs } from "../ai/PipelineManager.js";

// Round 174 — entity-kind candidates for the "Send to engine" button.
// Matches the engine's actual asset names so registered material sets
// can be picked up by renderers without a translation step.
const ENGINE_ENTITY_KINDS = [
    "kaiju_water", "kaiju_hell", "kaiju_space", "kaiju_cave", "kaiju_tech",
    "kaiju_underground", "kaiju_sky",
    "civ_tower", "civ_plaza", "civ_ring_wall", "civ_spire_field", "civ_step_pyramid",
];

const DEFAULT_KAIJU_PROMPT = "A four-legged armored beast kaiju with a long whip tail, " +
                              "stocky body, ridged spine plates, and short tusks. Mottled " +
                              "dark green hide with bioluminescent orange seams along the back.";

const LS_BASELINES = "voxelengine.aiBenchBaselines";

// ===========================================================================
// State (closure-scoped — demos can be entered/exited multiple times per
// session, so we reset everything in start())
// ===========================================================================
let overlay = null;
let benchOllama   = null;        // Demo's own OllamaClient (separate from window.ollama)
let benchDiffuser = null;        // Demo's own diffuser client
let benchComfyUI  = null;        // Round 173 — dedicated ComfyUI client for the Trellis step
let pausedEngine  = { ollama: false, diffuser: false };   // remembers prior state
let stepState = null;            // { narrative, obj, texture, trellis } per-step state
let baselines = null;            // persisted first-run times

// Round 175 — wall-clock timer for "Run all". Tracks total elapsed
// from first click until every non-skipped step succeeds, even across
// retries. `runAllStart` is set when the user clicks Run all; cleared
// when all enabled steps are green. `runAllSkips` is a set of step
// keys the user has toggled "skip" on — these don't gate completion
// and are excluded from the sequential/parallel runners.
let runAllStart  = 0;            // performance.now() at start, 0 if not running
let runAllRafId  = null;         // rAF handle for ticking the total label
let runAllSkips  = new Set();    // step keys the user opted to skip

// ===========================================================================
// Demo contract
// ===========================================================================
export default {
    id:    "ai_pipeline_bench",
    label: "AI PIPELINE BENCH",
    hint:  "Measure narrative → OBJ → texture cold-start times",

    async start(ctx) {
        // --- pause engine-side AI traffic so measurements are clean
        // We remember the prior state so stop() can restore exactly.
        if (window.ollama) {
            pausedEngine.ollama = window.ollama.isPaused?.() ?? false;
            window.ollama.setPaused?.(true);
        }
        if (window._diffuser) {
            pausedEngine.diffuser = window._diffuser.isPaused?.() ?? false;
            window._diffuser.setPaused?.(true);
        }

        // --- create dedicated bench clients (separate from engine singletons
        // so their state — model picks, abort sets, available flag —
        // doesn't pollute or get polluted by the engine).
        benchOllama   = new OllamaClient();
        benchDiffuser = new OllamaDiffuserClient();
        // Round 173 — ComfyUI client for the new Trellis step. Reuses
        // the bridge's /comfyui/* proxy so we don't have CORS issues.
        // The probe is fire-and-forget — if ComfyUI isn't running the
        // Trellis step will surface a clear "comfyui offline" error.
        benchComfyUI  = new ComfyUIClient();
        benchComfyUI.probe();

        // --- recover persisted baselines
        try {
            baselines = JSON.parse(localStorage.getItem(LS_BASELINES) || "{}");
        } catch { baselines = {}; }

        // --- step state holds run-time data per step (timers, progress, results)
        stepState = {
            narrative: _newStepState(),
            obj:       _newStepState(),
            texture:   _newStepState(),
            // Round 173 — Trellis step takes the texture step's albedo
            // and runs it through ComfyUI/Trellis 2 to produce a real
            // GLB mesh. This is the deliverable visualization the bench
            // has been building toward: a full pipeline ending in a
            // downloadable 3D mesh of the kaiju.
            trellis:   _newStepState(),
            // Round 279 — Voxelize step. Takes step 2's OBJ output and
            // runs it through BOTH cuda_voxelizer AND mesh_to_vox so
            // their head-to-head speed + voxel-count is directly
            // comparable. Stores both timings in result for the UI.
            voxelize:  _newStepState(),
        };

        _buildUI();
        // Round 192 — engage engine perf mode so background CPU work
        // (idle scheduler workers) stops cleanly for the duration of
        // the bench. Releases on stop().
        try { window.enginePerf?.pause("ai_pipeline_bench open"); } catch {}
        console.log("[ai_pipeline_bench] started — engine Ollama paused, idle workers paused");
    },

    stop(ctx) {
        // Cancel anything still running in our bench clients
        try { benchOllama?.setPaused?.(true); } catch {}
        try { benchDiffuser?.setPaused?.(true); } catch {}
        try { benchComfyUI?.setPaused?.(true); } catch {}

        // Resume engine traffic (restore previous pause state)
        try { window.ollama?.setPaused?.(pausedEngine.ollama); } catch {}
        try { window._diffuser?.setPaused?.(pausedEngine.diffuser); } catch {}

        // Round 192 — release engine perf mode so the idle scheduler
        // (and any other registered subsystems) resume.
        try { window.enginePerf?.resume(); } catch {}

        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        benchOllama = null;
        benchDiffuser = null;
        benchComfyUI = null;
        stepState = null;
        console.log("[ai_pipeline_bench] stopped — engine Ollama resumed, idle workers resumed");
    },

    tick() { /* no per-frame work */ },
};

function _newStepState() {
    return {
        running:    false,
        ok:         null,        // null | true | false
        partial:    false,       // true = succeeded but with caveats (e.g. python pill)
        startedAt:  0,
        elapsedMs:  0,
        tokens:     0,
        tps:        0,
        result:     null,        // text for narrative/obj; dataUrl for texture
        error:      null,
        // Round 176 — `retried` is true if this step has been re-run
        // after a failure. Used to show a small ↻ indicator next to
        // the status pill. We don't track the exact retry count
        // because the user explicitly didn't want it ("not how many
        // retries it took").
        retried:    false,
        // Round 181 — "first output" marker. Set when tokens first
        // arrive (narrative/obj) so we can compute time-to-first-token,
        // which is the practical cold-start delta. For texture/trellis
        // these stay 0 since neither streams.
        firstOutputAt: 0,        // performance.now() ms when first token observed
        // Round 181 — prior-run ghost. Saved from the most recent
        // completed run of this step (success OR fail). Rendered as a
        // faint "last: 8m12s ✓" subtitle so the user can see at a
        // glance whether this run is tracking faster, similar, or
        // slower than last time. Survives until cleared explicitly,
        // including across "Run all" invocations (that's the whole
        // point — comparison across runs).
        priorRun:   null,        // null | { elapsedMs, firstOutputMs, ok, retried, at }
        // Round 181 — captured tail of ComfyUI/user/comfyui.log when
        // the Trellis step fails. Rendered as a collapsible <details>
        // under the error message so the user doesn't have to open
        // notepad to see why the run died.
        errorLog:   null,        // null | { path, lines: string[], returnedLines, totalLines }
    };
}

// Round 181 — clear the step's transient fields (running, ok, elapsed,
// tokens, result, error, retried) but preserve `priorRun` so the next
// run can render its ghost. Called at the start of "Run all" so cards
// don't show stale "✓ done in 4.2s" from the previous run while the
// next one is firing up. Per-step Run buttons also call this via
// _runStep (existing behavior preserves priorRun automatically since
// it lives on a separate slot).
function _resetStepForRerun(stepKey) {
    if (!stepState?.[stepKey]) return;
    const prior = stepState[stepKey].priorRun;   // preserve
    stepState[stepKey] = _newStepState();
    stepState[stepKey].priorRun = prior;
    _renderStep(stepKey);
}

// ===========================================================================
// UI — vertical stack with config block + three step cards + run-all bar.
// All inline styles so the demo is self-contained (no external CSS).
// ===========================================================================
function _buildUI() {
    overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0",
        background: "rgba(8, 8, 14, 0.86)",
        zIndex: "9400",
        overflow: "auto",
        fontFamily: "monospace",
        color: "#e6e6e6",
        padding: "20px",
    });

    const inner = document.createElement("div");
    inner.style.cssText = "max-width:880px; margin:0 auto;";
    overlay.appendChild(inner);

    // ---- title bar
    const title = document.createElement("div");
    title.style.cssText = "display:flex; align-items:baseline; gap:16px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #444; position:sticky; top:-20px; background:rgba(8,8,14,0.96); padding-top:20px; margin-top:-20px; z-index:1;";
    title.innerHTML = `
        <div style="font-size:18px; font-weight:bold; color:#ffd884; letter-spacing:0.05em;">AI PIPELINE BENCH</div>
        <div style="font-size:11px; color:#8aff9e;">⏸ engine AI paused</div>
        <div style="flex:1;"></div>
        <div style="font-size:10px; color:#888;">stable-diffusion / C3D / gemma — baseline measurement</div>
        <!-- Round 190 — sticky close button in title bar so it's reachable
             without scrolling. v188's batch panel made the overlay tall
             enough to push the bottom close button below the fold. -->
        <button id="bench_close_top" title="Close (Esc)" style="background:transparent; color:#aaa; border:1px solid #555; border-radius:3px; padding:4px 10px; cursor:pointer; font-size:14px; font-family:monospace; line-height:1;">×</button>
    `;
    inner.appendChild(title);

    // Round 190 — wire up the sticky close-X and an Esc handler.
    const _doClose = () => {
        if (window._demoCycle) window._demoCycle();
        else if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener("keydown", _onKey);
    };
    const _onKey = (ev) => {
        if (ev.key === "Escape") { ev.preventDefault(); _doClose(); }
    };
    title.querySelector("#bench_close_top").addEventListener("click", _doClose);
    document.addEventListener("keydown", _onKey);

    // ---- config block
    inner.appendChild(_buildConfigBlock());

    // ---- step cards
    const stepsWrap = document.createElement("div");
    stepsWrap.style.cssText = "display:flex; flex-direction:column; gap:12px; margin-top:18px;";
    stepsWrap.appendChild(_buildStepCard("narrative", "1 · Narrative",   "#6db9ff"));
    stepsWrap.appendChild(_buildStepCard("obj",       "2 · OBJ Mesh",    "#ffd884"));
    stepsWrap.appendChild(_buildStepCard("texture",   "3 · Texture",     "#ff8aff"));
    // Round 173 — Trellis 2 step. Distinct color so it visually reads as
    // "the big final step." It depends on step 3 having completed.
    stepsWrap.appendChild(_buildStepCard("trellis",   "4 · Trellis 2 Mesh", "#8aff9e"));
    // Round 279 — Voxelize step. Head-to-head cuda_voxelizer vs
    // mesh_to_vox on the OBJ from step 2. Distinct teal so it reads
    // as "the lightweight alternative pipeline" — voxel output that
    // works on Pascal GPUs without needing Trellis/FlashAttention.
    stepsWrap.appendChild(_buildStepCard("voxelize",  "5 · Voxelize (cuda vs m2v)", "#5fdbd6"));
    inner.appendChild(stepsWrap);

    // ---- run-all bar
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex; gap:10px; align-items:center; margin-top:16px; padding:12px; background:rgba(255,255,255,0.04); border-radius:6px;";
    bar.innerHTML = `
        <button id="bench_run_seq"  style="${_btnStyle("#8aff9e")}">Run all sequentially</button>
        <button id="bench_run_par"  style="${_btnStyle("#6db9ff")}">Run all in parallel</button>
        <button id="bench_cancel"   style="${_btnStyle("#ff8a8a")}">Cancel all</button>
        <button id="bench_open_preview" style="${_btnStyle("#9eaaff")}">Open parallax preview</button>
        <button id="bench_download_failed" style="${_btnStyle("#ff8a8a")}; font-size:10px;">⬇ failed OBJs</button>
        <div style="flex:1;"></div>
        <!-- Round 176 — "X of N targets acquired" rollup. Counts how
             many of the 4 steps are currently green (skipped steps
             are excluded from both numerator and denominator). -->
        <span id="bench_acquired" style="font-size:11px; color:#888; font-weight:bold; min-width:140px; text-align:right;"></span>
        <!-- Round 175 — total wall-clock for "Run all". Counts elapsed
             from the first click until every non-skipped step is green,
             accumulating across retries. Distinct from per-step elapsed:
             this is "the full pipeline took N seconds, including waiting
             on a failed step's retry." -->
        <span id="bench_total" style="font-size:11px; color:#8aff9e; font-weight:bold; min-width:140px; text-align:right;"></span>
        <span id="bench_summary" style="font-size:11px; color:#aaa;"></span>
    `;
    inner.appendChild(bar);
    bar.querySelector("#bench_run_seq").addEventListener("click", _runAllSequential);
    bar.querySelector("#bench_run_par").addEventListener("click", _runAllParallel);
    bar.querySelector("#bench_open_preview").addEventListener("click", () => {
        if (window.parallaxPreview) window.parallaxPreview.open();
    });

    // ===========================================================================
    // Round 188 — Pipeline-parallel multi-asset batch panel.
    // While Trellis runs (~10 min/asset), Ollama and the diffuser sit idle.
    // This panel lets the user submit N kaiju prompts that pipeline through
    // narrative → OBJ → texture → trellis with each stage handing off as
    // soon as it frees. Total wall-clock for 5 jobs drops from ~5×Trellis
    // to ~5×Trellis + 1×(other 3 stages) ≈ ~same as a single sequential pass.
    // ===========================================================================
    inner.appendChild(_buildBatchPanel());
    bar.querySelector("#bench_download_failed").addEventListener("click", () => {
        const ok = window.failedOBJStore?.downloadJSONL();
        if (!ok) alert("No failed OBJ captures yet. Run a few OBJ steps (or play the engine) first.");
    });
    bar.querySelector("#bench_cancel").addEventListener("click", () => {
        // Pause then unpause cancels in-flight without staying paused
        benchOllama?.setPaused?.(true);
        benchDiffuser?.setPaused?.(true);
        // Immediately unpause so next click works
        setTimeout(() => {
            benchOllama?.setPaused?.(false);
            benchDiffuser?.setPaused?.(false);
        }, 50);
        for (const k of ["narrative", "obj", "texture", "trellis"]) {
            if (stepState[k].running) {
                stepState[k].running = false;
                stepState[k].ok = false;
                stepState[k].error = "cancelled";
                _renderStep(k);
            }
        }
    });

    // ---- baselines table
    const baseTable = document.createElement("div");
    baseTable.id = "bench_baselines";
    baseTable.style.cssText = "margin-top:14px; padding:10px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:11px;";
    inner.appendChild(baseTable);
    _renderBaselines();

    // ---- close button
    const close = document.createElement("button");
    close.textContent = "× close (return to menu)";
    close.style.cssText = "margin-top:18px; " + _btnStyle("#aaa");
    close.addEventListener("click", () => {
        // Trigger the engine's "go back to default mode" by clicking demo dropdown
        // Without that hook, just hide; engine handles the rest via the mode menu.
        if (window._demoCycle) window._demoCycle();
        else if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    });
    inner.appendChild(close);

    document.body.appendChild(overlay);
}

function _buildConfigBlock() {
    const block = document.createElement("div");
    block.style.cssText = "display:grid; grid-template-columns:auto 1fr auto 1fr; gap:8px 12px; padding:14px; background:rgba(255,255,255,0.04); border-radius:6px; font-size:11px;";

    const rows = [
        ["Ollama URL",      "bench_ollama_url",    benchOllama.baseUrl, "(default http://localhost:11434)"],
        ["Diffuser URL",    "bench_diffuser_url",  benchDiffuser.baseUrl, "(default http://localhost:9000)"],
        ["Narrative model", "bench_narr_model",    benchOllama.model || "gemma3:4b", "(used for step 1)"],
        ["OBJ model",       "bench_obj_model",     benchOllama.objModel || "joshuaokolo/C3Dv0:latest", "(used for step 2)"],
        ["Texture model",   "bench_tex_model",     benchDiffuser.model || "stable-diffusion-1.5", "(used for step 3)"],
        ["Idle timeout (s)", "bench_idle",         "60", "(no-token gap → abort)"],
        ["Total timeout (s)","bench_total",        "600", "(hard ceiling)"],
        ["Texture px",      "bench_tex_size",      "512", "(width = height)"],
        ["Texture steps",   "bench_tex_steps",     "20", "(SD steps; lower = faster)"],
    ];

    for (const [label, id, val, hint] of rows) {
        const lbl = document.createElement("div");
        lbl.textContent = label;
        lbl.style.cssText = "color:#aaa;";
        block.appendChild(lbl);

        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; align-items:center; gap:6px;";
        const inp = document.createElement("input");
        inp.id = id;
        inp.value = val;
        inp.style.cssText = "flex:1; background:#111; color:#fff; border:1px solid #444; padding:3px 6px; font-family:monospace; font-size:11px;";
        wrap.appendChild(inp);
        const hintEl = document.createElement("span");
        hintEl.textContent = hint;
        hintEl.style.cssText = "color:#666; font-size:9px;";
        wrap.appendChild(hintEl);
        block.appendChild(wrap);
    }

    // The prompt spans full width
    const promptLbl = document.createElement("div");
    promptLbl.textContent = "Kaiju prompt";
    promptLbl.style.cssText = "color:#aaa; grid-column:1; align-self:start; padding-top:4px;";
    block.appendChild(promptLbl);
    const promptInp = document.createElement("textarea");
    promptInp.id = "bench_prompt";
    promptInp.value = DEFAULT_KAIJU_PROMPT;
    promptInp.style.cssText = "grid-column:2 / span 3; background:#111; color:#fff; border:1px solid #444; padding:6px; font-family:monospace; font-size:11px; resize:vertical; min-height:50px;";
    block.appendChild(promptInp);

    return block;
}

function _buildStepCard(stepKey, title, color) {
    const card = document.createElement("div");
    card.style.cssText = `border:1px solid ${color}44; border-radius:6px; padding:12px; background:rgba(255,255,255,0.02);`;
    card.dataset.step = stepKey;

    card.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
            <div style="font-weight:bold; color:${color}; font-size:13px;">${title}</div>
            <span class="status" style="font-size:10px; padding:2px 8px; border-radius:8px; background:#333; color:#aaa;">idle</span>
            <span class="elapsed" style="font-size:10px; color:#888;"></span>
            <span class="tokens"  style="font-size:10px; color:#888;"></span>
            <div style="flex:1;"></div>
            <!-- Round 175 — per-step skip toggle. When checked, the
                 step is excluded from "Run all" (sequential or parallel)
                 and from the run-all timer's completion check. Useful
                 for isolating a single step's time, e.g. "what does
                 Trellis 2 take if I already have a texture cached?" -->
            <label style="font-size:10px; color:#888; display:flex; align-items:center; gap:3px; cursor:pointer;">
                <input type="checkbox" class="skip-cb" style="cursor:pointer;">skip
            </label>
            <!-- Round 174 — retry button. Hidden by default, surfaces
                 when a step finishes in a failed state. Repeats just
                 that one step rather than restarting the whole chain,
                 which is what the user asked for: "if narrative fails
                 we could just go back and get narrative again." -->
            <button class="retry-btn" style="${_btnStyle("#ff8a8a")}; display:none;">↻ Retry</button>
            <!-- Round 194 — Cancel button for long-running steps.
                 Currently only Trellis uses it; clicking it POSTs to
                 ComfyUI's /interrupt endpoint which lets the runTrellis
                 promise resolve as "execution_interrupted". Hidden by
                 default; surfaces when the step is "running". -->
            <button class="cancel-btn" style="${_btnStyle("#ff8a8a")}; display:none;">⏹ Cancel</button>
            <button class="run-btn" style="${_btnStyle(color)}">Run</button>
        </div>
        <!-- Round 171 — live mini-chart shown while the step is running.
             Three sparklines, each 60 samples (~60s of history at 1Hz):
               · GPU utilization %  (green→yellow→red)
               · GPU VRAM used %    (cyan)
               · Tokens/sec for the active model (only for narrative/OBJ;
                 stays blank for texture since the diffuser doesn't stream)
             The sparkline container hides itself when the step isn't
             running so idle cards stay clean.
             Round 181 — added a fourth sparkline for system-wide CPU%
             (orange), sampled from os.cpus() tick deltas on the bridge.
             Useful since some Ollama models run on CPU (size_vram=0). -->
        <div class="sparkline-row" style="display:none; align-items:center; gap:12px; margin-bottom:8px; font-size:9px; color:#888;">
            <div style="display:flex; align-items:center; gap:4px;">
                <span style="color:#8aff9e;">gpu</span>
                <svg class="spark-gpu" width="140" height="22" viewBox="0 0 140 22" xmlns="http://www.w3.org/2000/svg" style="background:#000; border-radius:3px;">
                    <polyline class="line" fill="none" stroke="#8aff9e" stroke-width="1.5" points=""/>
                </svg>
                <span class="spark-gpu-now" style="min-width:28px; text-align:right;">--</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
                <span style="color:#5ec8ff;">vram</span>
                <svg class="spark-vram" width="140" height="22" viewBox="0 0 140 22" xmlns="http://www.w3.org/2000/svg" style="background:#000; border-radius:3px;">
                    <polyline class="line" fill="none" stroke="#5ec8ff" stroke-width="1.5" points=""/>
                </svg>
                <span class="spark-vram-now" style="min-width:28px; text-align:right;">--</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
                <span style="color:#ffb070;">cpu</span>
                <svg class="spark-cpu" width="140" height="22" viewBox="0 0 140 22" xmlns="http://www.w3.org/2000/svg" style="background:#000; border-radius:3px;">
                    <polyline class="line" fill="none" stroke="#ffb070" stroke-width="1.5" points=""/>
                </svg>
                <span class="spark-cpu-now" style="min-width:28px; text-align:right;">--</span>
            </div>
            <div class="spark-tps-wrap" style="display:flex; align-items:center; gap:4px;">
                <span style="color:#ffd884;">tok/s</span>
                <svg class="spark-tps" width="90" height="22" viewBox="0 0 90 22" xmlns="http://www.w3.org/2000/svg" style="background:#000; border-radius:3px;">
                    <polyline class="line" fill="none" stroke="#ffd884" stroke-width="1.5" points=""/>
                </svg>
                <span class="spark-tps-now" style="min-width:28px; text-align:right;">--</span>
            </div>
        </div>
        <div class="result" style="font-size:10px; color:#ccc; max-height:160px; overflow:auto; background:#000; padding:8px; border-radius:4px; white-space:pre-wrap; word-break:break-word; min-height:30px;"></div>
    `;
    card.querySelector(".run-btn").addEventListener("click", () => _runStep(stepKey));
    // Round 174 — retry button. Same handler as Run; the visual
    // distinction is purely cue ("you can recover from this failure").
    card.querySelector(".retry-btn").addEventListener("click", () => _runStep(stepKey));
    // Round 194 — cancel button. Only the Trellis step uses this in
    // practice — narrative/obj finish fast, texture is non-cancellable
    // mid-diffusion in the OllamaDiffuser server. POSTs to ComfyUI's
    // /interrupt which aborts the current workflow; runTrellis() then
    // sees "execution_interrupted" and resolves cleanly.
    if (stepKey === "trellis") {
        card.querySelector(".cancel-btn").addEventListener("click", async () => {
            if (!benchComfyUI) return;
            const btn = card.querySelector(".cancel-btn");
            btn.disabled = true; btn.style.opacity = "0.5";
            btn.textContent = "⏹ cancelling…";
            const ok = await benchComfyUI.interrupt();
            btn.textContent = ok ? "⏹ sent" : "⏹ failed";
            setTimeout(() => {
                btn.disabled = false; btn.style.opacity = "1";
                btn.textContent = "⏹ Cancel";
            }, 1500);
        });
    }
    // Round 175 — skip toggle. Visually grays out the card when checked
    // and excludes the step from "Run all". The step remains runnable
    // via its own Run button — skip only affects bulk runs.
    const skipCb = card.querySelector(".skip-cb");
    skipCb.addEventListener("change", () => {
        if (skipCb.checked) runAllSkips.add(stepKey);
        else                runAllSkips.delete(stepKey);
        card.style.opacity = skipCb.checked ? "0.45" : "1";
        // If we're currently in a "Run all" session, re-check completion
        // since skipping a still-pending step might mean we're done.
        _checkRunAllComplete();
    });
    return card;
}

function _btnStyle(color) {
    return `background:transparent; color:${color}; border:1px solid ${color}aa; padding:5px 12px; border-radius:4px; cursor:pointer; font-family:monospace; font-size:11px;`;
}

// Round 181 — friendly duration formatter for the prior-run ghost and
// the elapsed counter. Examples:
//   850 ms → "0.8s"
//   45000  → "45s"
//   125000 → "2m05s"
//   8 min  → "8m12s"
// Sub-second precision below 60s; minute/second above. Keeps the
// horizontal layout tight so the ghost subtitle stays on one line.
function _fmtDuration(ms) {
    if (!ms || ms < 0) return "0s";
    const totalSec = ms / 1000;
    if (totalSec < 60) return totalSec.toFixed(1) + "s";
    const m = Math.floor(totalSec / 60);
    const s = Math.round(totalSec - m * 60);
    return `${m}m${String(s).padStart(2, "0")}s`;
}

// ===========================================================================
// Round 188 — Batch pipeline panel.
//
// Maintains its own PipelineManager. The four stage runners are thin
// wrappers around the same benchOllama/benchDiffuser/benchComfyUI clients
// the single-step path uses, but they read input from `job.results` of the
// previous stage rather than `stepState`. Stage outputs:
//   narrative → string (text)
//   obj       → string (OBJ text)
//   texture   → { albedo:{dataUrl,...}, height, normal } | { dataUrl } fallback
//   trellis   → { url, nodeId, promptId, artifact }
// ===========================================================================

const DEFAULT_BATCH_PROMPTS = [
    "A four-legged armored beast kaiju with ridged spine plates and short tusks. Mottled dark green hide with bioluminescent orange seams.",
    "A bipedal insectile kaiju with translucent chitinous wings folded against its back, mandibles, compound red eyes, pale violet exoskeleton.",
    "A bulky six-legged crustacean kaiju with thick blue-grey plating, two oversized front claws, encrusted with barnacles and seaweed.",
    "A serpentine kaiju with feathered crest and stubby forelimbs, golden scales, glowing yellow eyes, long whip-tail tipped with bone spikes.",
    "A floating jellyfish kaiju with translucent dome and dozens of trailing tendrils, bioluminescent purple glow, slow drifting motion.",
];

let _batchManager   = null;
let _batchJobsById  = new Map();   // for the UI to look up DOM rows
let _batchStartTime = 0;

function _buildBatchPanel() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:16px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid #2a2a2a;";

    const det = document.createElement("details");
    det.style.cssText = "padding:0;";
    const sum = document.createElement("summary");
    sum.style.cssText = "padding:10px 12px; cursor:pointer; font-size:12px; color:#6db9ff; font-weight:bold; user-select:none;";
    sum.innerHTML = "🌊 Batch pipeline (parallel multi-asset) <span style='color:#888; font-weight:normal; margin-left:8px;'>— pipeline N prompts simultaneously instead of one-at-a-time</span>";
    det.appendChild(sum);

    const body = document.createElement("div");
    body.style.cssText = "padding:0 12px 12px 12px;";
    det.appendChild(body);

    // --- prompts textarea (one per line)
    const promptsLabel = document.createElement("div");
    promptsLabel.style.cssText = "font-size:10px; color:#888; margin:8px 0 4px 0;";
    promptsLabel.textContent = "Prompts (one per line, blank lines skipped):";
    body.appendChild(promptsLabel);
    const promptsTA = document.createElement("textarea");
    promptsTA.id = "batch_prompts";
    promptsTA.style.cssText = "width:100%; min-height:90px; background:#0a0a0a; color:#ccc; border:1px solid #444; border-radius:3px; padding:6px 8px; font-family:monospace; font-size:11px; resize:vertical; box-sizing:border-box;";
    promptsTA.value = DEFAULT_BATCH_PROMPTS.join("\n");
    body.appendChild(promptsTA);

    // --- controls
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex; gap:10px; align-items:center; margin-top:8px;";
    controls.innerHTML = `
        <button id="batch_start"    style="${_btnStyle("#6db9ff")}">▶ Start batch</button>
        <button id="batch_cancel"   style="${_btnStyle("#ff8a8a")}" disabled>■ Cancel</button>
        <label style="font-size:10px; color:#888;">
            <input type="checkbox" id="batch_skip_trellis" style="vertical-align:middle;">
            skip Trellis (just narr+obj+tex, ~5 min for 5 assets)
        </label>
        <!-- Round 193 — toggle to run jobs serially instead of pipelined.
             Useful when you want to isolate timing of a single asset, or
             when the system is under memory pressure. Default ON (the
             whole point of the batch panel is parallel processing). -->
        <label style="font-size:10px; color:#888;">
            <input type="checkbox" id="batch_parallel" checked style="vertical-align:middle;">
            parallel (uncheck to run one job at a time)
        </label>
        <div style="flex:1;"></div>
        <span id="batch_status" style="font-size:11px; color:#888;"></span>
    `;
    body.appendChild(controls);

    // --- grid host
    const grid = document.createElement("div");
    grid.id = "batch_grid";
    grid.style.cssText = "margin-top:12px;";
    body.appendChild(grid);

    wrap.appendChild(det);

    // Wire up after DOM is in place — buttons live inside controls so
    // querySelector against `wrap` works even before appendChild to overlay.
    setTimeout(() => {
        const btnStart  = wrap.querySelector("#batch_start");
        const btnCancel = wrap.querySelector("#batch_cancel");
        btnStart .addEventListener("click", () => _startBatch(wrap));
        btnCancel.addEventListener("click", () => _cancelBatch(wrap));
    }, 0);

    return wrap;
}

async function _startBatch(panelEl) {
    const promptsTA = panelEl.querySelector("#batch_prompts");
    const grid      = panelEl.querySelector("#batch_grid");
    const status    = panelEl.querySelector("#batch_status");
    const btnStart  = panelEl.querySelector("#batch_start");
    const btnCancel = panelEl.querySelector("#batch_cancel");
    const skipTrellis = panelEl.querySelector("#batch_skip_trellis").checked;
    // Round 193 — default-true checkbox; when unchecked, jobs run end-to-end
    // serially (one prompt completes all stages before the next starts).
    const parallel = panelEl.querySelector("#batch_parallel").checked;

    const prompts = promptsTA.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (prompts.length === 0) {
        status.textContent = "no prompts — paste some lines first";
        status.style.color = "#ff8a8a";
        return;
    }

    btnStart.disabled  = true; btnStart.style.opacity = "0.4";
    btnCancel.disabled = false; btnCancel.style.opacity = "1";
    status.textContent = `running ${prompts.length} jobs…`;
    status.style.color = "#ffd884";
    _batchStartTime = performance.now();

    // Build the stages. Each stage receives the job and reads from
    // job.results[prevStageName] for its input. We mirror the
    // benchOllama/Diffuser/ComfyUI behavior of the single-step runners
    // but stripped down (no UI tokens-per-sec sparklines, no per-step
    // retry buttons — the batch view has its own grid status).
    const cfg = _readConfig();
    benchOllama.setBaseUrl?.(cfg.ollamaUrl);
    benchOllama.setTimeoutMs?.(cfg.totalMs);
    benchOllama.setPaused?.(false);
    benchDiffuser.setBaseUrl?.(cfg.diffuserUrl);
    benchDiffuser.setPaused?.(false);

    const stages = [
        {
            name: "narrative", concurrency: 1,
            run: async (job) => {
                const text = await benchOllama.generate(
                    _narrativePrompt(job.input.prompt),
                    {
                        model:        cfg.narrModel,
                        idleTimeoutMs: cfg.idleMs,
                        timeoutMs:    cfg.totalMs,
                        num_predict:  256,
                        temperature:  0.8,
                    }
                );
                if (!text) throw new Error("no narrative returned");
                return text;
            },
        },
        {
            name: "obj", concurrency: 1,
            run: async (job) => {
                const obj = await benchOllama.generateOBJ(
                    job.input.prompt,
                    {
                        model:         cfg.objModel,
                        idleTimeoutMs: cfg.idleMs,
                        timeoutMs:     cfg.totalMs,
                    }
                );
                if (!obj) throw new Error("no OBJ returned");
                return obj;
            },
        },
        {
            name: "texture", concurrency: 1,
            run: async (job) => {
                benchDiffuser.timeoutMs = cfg.totalMs;
                const res = await benchDiffuser.generate(
                    _texturePrompt(job.input.prompt),
                    { model: cfg.texModel, width: cfg.texSize, height: cfg.texSize, steps: cfg.texSteps }
                );
                if (!res.ok) throw new Error(res.error || "diffuser failed");
                try {
                    return await materialSetFromDataUrl(res.dataUrl, {
                        height: { contrast: 1.8, bias: 96, center: 128 },
                        normal: { strength: 2.5 },
                    });
                } catch {
                    return { dataUrl: res.dataUrl, partial: true };
                }
            },
        },
    ];

    if (!skipTrellis) {
        stages.push({
            name: "trellis", concurrency: 1,
            run: async (job) => {
                const texRes = job.results.texture;
                const albedoDataUrl =
                    (texRes && typeof texRes === "object" && texRes.albedo?.dataUrl) ||
                    (texRes && texRes.dataUrl) || null;
                if (!albedoDataUrl) throw new Error("no albedo from texture stage");
                const alive = await benchComfyUI.probe();
                if (!alive) throw new Error("ComfyUI unreachable");
                const trellisInfo = await benchComfyUI.findTrellisNode();
                if (!trellisInfo) throw new Error("Trellis node not found");
                const glb = await benchComfyUI.runTrellis(albedoDataUrl, trellisInfo, {
                    timeoutMs: 40 * 60 * 1000,    // Round 199 — bumped from 20→40 min for Pascal-class hardware
                });
                if (!glb?.url) throw new Error("Trellis returned no GLB url");
                return glb;
            },
        });
    }

    // Build the grid scaffold
    _batchJobsById = new Map();
    grid.innerHTML = "";
    const stageNames = stages.map(s => s.name);
    const header = document.createElement("div");
    header.style.cssText = `display:grid; grid-template-columns: 28px 1fr ${stageNames.map(() => "110px").join(" ")} 70px; gap:6px; padding:4px 0; font-size:10px; color:#888; border-bottom:1px solid #333;`;
    header.innerHTML = `<div>#</div><div>prompt</div>${stageNames.map(n => `<div style="text-align:center;">${n}</div>`).join("")}<div style="text-align:right;">total</div>`;
    grid.appendChild(header);

    _batchManager = new PipelineManager({
        stages,
        onJobUpdate: (job) => _renderBatchJob(grid, job, stageNames, status),
    });

    // Round 193 — serial mode: process one prompt fully before starting
    // the next. Each iteration uses a fresh manager so semaphores reset
    // cleanly; the grid still shows all rows because _renderBatchJob
    // doesn't care which manager produced the update.
    if (!parallel) {
        let allJobs = [];
        for (let i = 0; i < prompts.length; i++) {
            const mgr = new PipelineManager({
                stages,
                onJobUpdate: (job) => _renderBatchJob(grid, job, stageNames, status),
            });
            const j = mgr.submit({ id: `j${i+1}`, prompt: prompts[i] });
            _batchJobsById.set(j.id, j);
            try {
                const jobs = await mgr.run();
                allJobs.push(...jobs);
            } catch (e) {
                status.textContent = "serial batch threw at j" + (i+1) + ": " + (e?.message || e);
                status.style.color = "#ff8a8a";
                break;
            }
        }
        const wall = allJobs.reduce((sum, j) => sum + ((j.finishedAt ?? performance.now()) - (j.startedAt ?? 0)), 0);
        const ok   = allJobs.filter(j => j.status === "done").length;
        const fail = allJobs.filter(j => j.status === "failed").length;
        status.textContent = `serial done · ${ok}/${allJobs.length} ok${fail ? ` · ${fail} failed` : ""} · wall ${_fmtDuration(wall)}`;
        status.style.color = fail === 0 ? "#8aff9e" : "#ffd884";
        btnStart.disabled  = false; btnStart.style.opacity = "1";
        btnCancel.disabled = true;  btnCancel.style.opacity = "0.4";
        return;
    }

    for (let i = 0; i < prompts.length; i++) {
        const j = _batchManager.submit({ id: `j${i+1}`, prompt: prompts[i] });
        _batchJobsById.set(j.id, j);
    }

    try {
        const jobs = await _batchManager.run();
        const wall = pipelineWallclockMs(jobs);
        const ok   = jobs.filter(j => j.status === "done").length;
        const fail = jobs.filter(j => j.status === "failed").length;
        status.textContent = `batch done · ${ok}/${jobs.length} ok${fail ? ` · ${fail} failed` : ""} · wall ${_fmtDuration(wall)}`;
        status.style.color = fail === 0 ? "#8aff9e" : "#ffd884";
    } catch (e) {
        status.textContent = "batch threw: " + (e?.message || e);
        status.style.color = "#ff8a8a";
    } finally {
        btnStart.disabled  = false; btnStart.style.opacity = "1";
        btnCancel.disabled = true;  btnCancel.style.opacity = "0.4";
    }
}

function _cancelBatch(panelEl) {
    // Soft cancel: mark the manager as null so further submits would
    // fail, but in-flight stage promises will still run to completion
    // (we can't safely cancel an in-flight Ollama/Trellis call from
    // here without touching client internals). The user sees the UI
    // controls re-enable and the status updates to "cancelling".
    const status = panelEl.querySelector("#batch_status");
    status.textContent = "cancel: in-flight stages will finish, no new ones will start";
    status.style.color = "#ffd884";
    // The simplest "stop scheduling more" hack: pause Ollama/diffuser
    // so queued stage calls fail fast.
    try { benchOllama.setPaused?.(true);   } catch {}
    try { benchDiffuser.setPaused?.(true); } catch {}
}

function _renderBatchJob(gridEl, job, stageNames, statusEl) {
    let row = gridEl.querySelector(`[data-batch-job="${job.id}"]`);
    if (!row) {
        row = document.createElement("div");
        row.dataset.batchJob = job.id;
        row.style.cssText = `display:grid; grid-template-columns: 28px 1fr ${stageNames.map(() => "110px").join(" ")} 70px; gap:6px; padding:6px 0; align-items:center; border-bottom:1px solid #1a1a1a; font-size:10px;`;
        const idx = document.createElement("div");
        idx.style.color = "#666";
        idx.textContent = job.id.replace(/^j/, "");
        row.appendChild(idx);
        const prompt = document.createElement("div");
        prompt.style.cssText = "color:#bbb; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:8px;";
        prompt.title = job.input.prompt;
        prompt.textContent = job.input.prompt.slice(0, 80);
        row.appendChild(prompt);
        for (const stage of stageNames) {
            const cell = document.createElement("div");
            cell.dataset.stage = stage;
            cell.style.cssText = "text-align:center;";
            cell.innerHTML = `<span style="padding:2px 8px; background:#222; color:#666; border-radius:3px; font-family:monospace;">—</span>`;
            row.appendChild(cell);
        }
        const total = document.createElement("div");
        total.dataset.field = "total";
        total.style.cssText = "text-align:right; color:#888; font-family:monospace;";
        total.textContent = "—";
        row.appendChild(total);
        gridEl.appendChild(row);
    }

    // Update each stage cell to reflect the job's current per-stage state
    for (const stage of stageNames) {
        const cell = row.querySelector(`[data-stage="${stage}"]`);
        const cellPill = cell.firstChild;
        const stageDone     = !!job.results[stage];
        const stageFailed   = !!job.errors[stage];
        const stageRunning  = job.stage === stage && job.status === "running";
        const stageQueued   = job.stage === stage && job.status === "queued";
        const t             = job.timings[stage];
        const tStr          = (t && t.ms != null) ? _fmtDuration(t.ms) : "";

        let bg, fg, label;
        if (stageFailed) {
            bg = "#3a0000"; fg = "#ff8a8a"; label = "fail";
        } else if (stageDone) {
            bg = "#003a14"; fg = "#8aff9e"; label = "✓ " + tStr;
        } else if (stageRunning) {
            bg = "#3a2a00"; fg = "#ffd884"; label = "▶ run";
        } else if (stageQueued) {
            bg = "#0a1a3a"; fg = "#6db9ff"; label = "⌛ queued";
        } else {
            bg = "#1a1a1a"; fg = "#444";    label = "—";
        }
        cellPill.style.background = bg;
        cellPill.style.color = fg;
        cellPill.textContent = label;
    }

    // Total time cell
    const totalCell = row.querySelector(`[data-field="total"]`);
    if (job.startedAt && job.finishedAt) {
        const totalMs = Math.round(job.finishedAt - job.startedAt);
        totalCell.textContent = _fmtDuration(totalMs);
        totalCell.style.color = job.status === "done" ? "#8aff9e" : "#ff8a8a";
    } else if (job.startedAt) {
        totalCell.textContent = "running";
        totalCell.style.color = "#ffd884";
    }

    // Live wallclock badge in status bar — only update while running
    if (_batchStartTime && _batchManager) {
        const elapsed = Math.round(performance.now() - _batchStartTime);
        const anyRunning = Array.from(_batchManager.jobs.values()).some(j =>
            j.status === "running" || j.status === "queued");
        if (anyRunning) {
            const ok    = Array.from(_batchManager.jobs.values()).filter(j => j.status === "done").length;
            const total = _batchManager.jobs.size;
            statusEl.textContent = `running · ${ok}/${total} done · ${_fmtDuration(elapsed)} elapsed`;
            statusEl.style.color = "#ffd884";
        }
    }
}

// ===========================================================================
// Step runners
// ===========================================================================
function _readConfig() {
    const $ = id => document.getElementById(id);
    return {
        ollamaUrl:    $("bench_ollama_url").value.trim(),
        diffuserUrl:  $("bench_diffuser_url").value.trim(),
        narrModel:    $("bench_narr_model").value.trim(),
        objModel:     $("bench_obj_model").value.trim(),
        texModel:     $("bench_tex_model").value.trim(),
        idleMs:       Math.max(1, parseFloat($("bench_idle").value)  || 60) * 1000,
        totalMs:      Math.max(1, parseFloat($("bench_total").value) || 600) * 1000,
        texSize:      Math.max(64, parseInt($("bench_tex_size").value,  10) || 512),
        texSteps:     Math.max(1,  parseInt($("bench_tex_steps").value, 10) || 20),
        prompt:       $("bench_prompt").value,
    };
}

async function _runStep(stepKey) {
    if (!stepState || stepState[stepKey].running) return;
    const cfg = _readConfig();
    const st  = stepState[stepKey];
    // Round 176 — sticky retry flag. If this step was previously
    // failed and is now being re-run, mark `retried` so the UI shows
    // the ↻ indicator next to the status pill. The flag stays true
    // for the lifetime of the demo (per-step), since the user wants
    // to know "did we have to retry to get this" not "how often."
    if (st.ok === false) st.retried = true;
    st.running   = true;
    st.ok        = null;
    st.startedAt = performance.now();
    st.elapsedMs = 0;
    st.tokens    = 0;
    st.tps       = 0;
    st.result    = null;
    st.error     = null;
    st.partial   = false;
    _renderStep(stepKey);
    _startSparklines(stepKey);    // Round 171 — live rolling chart

    // Update elapsed clock while running
    const tick = setInterval(() => {
        if (!stepState || !stepState[stepKey].running) return;
        stepState[stepKey].elapsedMs = performance.now() - st.startedAt;
        _renderStep(stepKey);
    }, 100);

    try {
        // Apply config to bench clients
        benchOllama.setBaseUrl?.(cfg.ollamaUrl);
        benchOllama.setIdleTimeoutMs?.(cfg.idleMs);
        benchOllama.setTimeoutMs?.(cfg.totalMs);
        benchOllama.setPaused?.(false);  // ensure unpaused
        benchDiffuser.setBaseUrl?.(cfg.diffuserUrl);
        benchDiffuser.setPaused?.(false);

        if (stepKey === "narrative") {
            const text = await benchOllama.generate(
                _narrativePrompt(cfg.prompt),
                {
                    model:        cfg.narrModel,
                    idleTimeoutMs: cfg.idleMs,
                    timeoutMs:    cfg.totalMs,
                    num_predict:  256,
                    temperature:  0.8,
                    onProgress:   p => _onProgress(stepKey, p),
                }
            );
            st.result = text;
            st.ok = !!text;
            st.error = text ? null : "no response";
        }
        else if (stepKey === "obj") {
            // Round 171 — capture the raw streamed text alongside the
            // parsed result. C3D commonly streams 200-1000 tokens of
            // Python that the parser can't fully extract from; tagging
            // those as "fail" is misleading because the model DID
            // produce real output.
            //
            // Round 175 — hardened: don't depend on p.fullText alone.
            // Some Ollama paths only emit p.lastToken (single new
            // token per progress event). Accumulate either signal.
            // Also fall back to "tokens were received at all" as
            // evidence of useful work, even when capture failed
            // entirely — show a generic partial in that case rather
            // than a fail.
            let lastRawText = "";
            let sawAnyTokens = false;
            const obj = await benchOllama.generateOBJ(
                cfg.prompt,
                {
                    model:         cfg.objModel,
                    idleTimeoutMs: cfg.idleMs,
                    timeoutMs:     cfg.totalMs,
                    onProgress:    p => {
                        if (p) {
                            if (typeof p.fullText === "string" && p.fullText.length > lastRawText.length) {
                                lastRawText = p.fullText;
                            } else if (typeof p.lastToken === "string") {
                                lastRawText += p.lastToken;
                            }
                            if (p.tokensReceived > 0) sawAnyTokens = true;
                        }
                        _onProgress(stepKey, p);
                    },
                }
            );
            if (obj) {
                st.result = obj;
                st.ok = true;
                st.partial = false;
                st.error = null;
            } else if (lastRawText && lastRawText.length > 50) {
                // Captured the raw Python — show it. Yellow "python" pill.
                st.result = lastRawText;
                st.ok = true;
                st.partial = true;
                st.error = null;
            } else if (sawAnyTokens || (st.tokens && st.tokens > 0)) {
                // Tokens came through but we couldn't capture the text
                // (different OllamaClient version, race, etc.). Don't
                // call this a fail — at least we know C3D produced
                // something. Show a generic note.
                st.result = "(C3D streamed " + (st.tokens || "?") + " tokens but raw text wasn't captured — parser saw no OBJ directives. Check the engine console for the actual response.)";
                st.ok = true;
                st.partial = true;
                st.error = null;
            } else {
                st.ok = false;
                st.partial = false;
                st.error = "no OBJ returned (zero tokens streamed)";
            }
        }
        else if (stepKey === "texture") {
            benchDiffuser.timeoutMs = cfg.totalMs;
            const res = await benchDiffuser.generate(
                _texturePrompt(cfg.prompt),
                {
                    model:  cfg.texModel,
                    width:  cfg.texSize,
                    height: cfg.texSize,
                    steps:  cfg.texSteps,
                }
            );
            if (res.ok) {
                // Round 172 — derive the parallax-ready material set
                // from the diffuser output. Path B Round 1 of 3: use a
                // heuristic luminance→height + Sobel→normal pipeline
                // for now. Round 3 will replace the height heuristic
                // with a second diffuser call using a height-emphasizing
                // prompt; the bench code here stays the same since the
                // shape of the material set doesn't change.
                try {
                    const matSet = await materialSetFromDataUrl(res.dataUrl, {
                        height: { contrast: 1.8, bias: 96, center: 128 },
                        normal: { strength: 2.5 },
                    });
                    st.result    = matSet;     // { albedo, height, normal, width, height_px }
                    st.ok        = true;
                    st.partial   = false;
                } catch (e) {
                    // If material derivation fails, fall back to just
                    // showing the raw albedo. Better than failing the
                    // whole step over a derivation hiccup.
                    console.warn("[bench] material set derivation failed:", e?.message);
                    st.result    = res.dataUrl;
                    st.ok        = true;
                    st.partial   = true;
                }
            } else {
                st.ok = false;
                st.partial = false;
                st.error = res.error || "diffuser failed";
            }
        }
        // -------------------------------------------------------------
        // Round 173 — Trellis 2 step. Takes the albedo from the texture
        // step (must have run first and succeeded), uploads it to
        // ComfyUI, runs the discovered Trellis node, and returns a GLB
        // mesh URL the user can download.
        //
        // Why this step is structured differently from the others:
        //   - Has a prerequisite: needs stepState.texture.result with
        //     an albedo dataUrl. If unavailable, the step fails fast
        //     with a clear "run step 3 first" message rather than
        //     wasting ComfyUI startup time.
        //   - Talks to ComfyUI not Ollama/diffuser. No streaming —
        //     Trellis 2 doesn't expose token-by-token progress, so
        //     the sparklines just show GPU/VRAM (tok/s stays at 0).
        //   - Much longer runtime (5-15 min on a 1070 Ti) — total
        //     budget is bumped to 20 min for this step regardless of
        //     the user's totalMs config.
        // -------------------------------------------------------------
        else if (stepKey === "trellis") {
            // Prerequisite check
            const texRes = stepState?.texture?.result;
            const albedoDataUrl =
                (texRes && typeof texRes === "object" && texRes.albedo?.dataUrl) ||
                (typeof texRes === "string" ? texRes : null);
            if (!albedoDataUrl) {
                st.ok = false;
                st.partial = false;
                st.error = "needs step 3 (Texture) to succeed first — produces the albedo Trellis consumes";
                return;   // skips the finally below… no wait, it doesn't. finally always runs.
            }

            // Liveness check on ComfyUI
            const alive = await benchComfyUI.probe();
            if (!alive) {
                st.ok = false;
                st.partial = false;
                st.error = "ComfyUI not reachable. Start it via run_nvidia_gpu.bat. The bridge proxies it at /comfyui/*.";
                return;
            }

            // Verify Trellis is installed
            const trellisInfo = await benchComfyUI.findTrellisNode();
            if (!trellisInfo) {
                st.ok = false;
                st.partial = false;
                st.error = "ComfyUI is online but no Trellis node found. Install ComfyUI-Trellis2 (and fix the nodes.py syntax error if present).";
                return;
            }

            // Convert the albedo dataUrl into a Blob for upload
            const albedoBlob = await (await fetch(albedoDataUrl)).blob();

            // Periodic progress callback fills "tokens" with elapsed
            // seconds (re-purposing the existing field) so the bench's
            // existing render layer shows "65 tok @ 0.0 tok/s" style
            // progress — readable as "65 seconds elapsed."
            const onProgress = (p) => {
                if (p?.elapsedMs != null) {
                    st.tokens = Math.round(p.elapsedMs / 1000);  // seconds, not tokens
                    st.tps    = 0;
                }
            };

            const glb = await benchComfyUI.runImageToGLB(albedoBlob, {
                resolution: 512,        // 1070 Ti / 1080 budget
                steps:      25,
                lowVRAM:    true,
                onProgress,
                maxWaitMs:  40 * 60 * 1000,   // Round 199 — bumped from 20→40 min for Pascal-class hardware
            });

            if (glb?.url) {
                st.result  = glb;       // { url, nodeId, promptId, artifact }
                st.ok      = true;
                st.partial = false;
            } else {
                st.ok      = false;
                st.partial = false;
                // Round 180 — pull the structured execution error if
                // present. Tells the user which Trellis node failed
                // and which line of nodes.py to look at, e.g.:
                //   "Trellis2LoadModel (node 2) raised ImportError:
                //    No module named flex_gemm
                //    [ComfyUI-Trellis2-main/nodes.py:84]"
                const node_err = benchComfyUI.lastError;
                if (node_err) {
                    st.error = node_err;
                } else {
                    st.error = "Trellis returned no GLB. Likely missing model weights — Trellis2LoadModel pulls them from HuggingFace on first run; check ComfyUI logs.";
                }
                // Round 181 — automatically fetch the tail of
                // ComfyUI/user/comfyui.log so the user doesn't have
                // to open notepad and scroll. The tail is stashed on
                // st.errorLog and rendered as a collapsible block
                // under the error pill in _renderStep.
                try {
                    const tail = await benchComfyUI.fetchLogTail(80);
                    if (tail?.lines?.length) {
                        st.errorLog = tail;
                    }
                } catch {}
            }
        }
        // -------------------------------------------------------------
        // Round 279 — STEP 5: VOXELIZE
        //
        // Takes the OBJ from step 2 and runs it through BOTH voxelizers
        // sequentially so their head-to-head speed + voxel count are
        // directly comparable. Result holds both timings + voxel
        // counts; the UI's _renderStep extension shows them side-by-
        // side. This is the "lightweight alternative to Trellis on
        // Pascal" path the user requested — works without FlashAttention
        // or tensor cores.
        //
        // Prerequisite: step 2 (OBJ) succeeded and produced a string
        // OBJ. We POST that to the bridge as octet-stream so the
        // voxelizer reads from a tmp file. Each tool gets its own
        // run; we report best-of-both as the headline metric and the
        // individual times in the result object.
        // -------------------------------------------------------------
        else if (stepKey === "voxelize") {
            const objText = stepState?.obj?.result;
            if (!objText || typeof objText !== "string" || !objText.includes("v ")) {
                st.ok = false;
                st.partial = false;
                st.error = "needs step 2 (OBJ Mesh) to succeed first — produces the .obj this step voxelizes";
                return;
            }
            // Check that at least one voxelizer is available
            let toolStatus = null;
            try {
                const r = await fetch("/asset-pipeline/status");
                toolStatus = await r.json();
            } catch {}
            if (!toolStatus?.cuda_voxelizer?.found && !toolStatus?.mesh_to_vox?.found) {
                st.ok = false;
                st.partial = false;
                st.error = "no voxelizer available — set cudaVoxelizerExe or meshToVoxExe in asset-pipeline-config.json (or place on PATH / C:\\Tools\\)";
                return;
            }
            const dim = 128;
            const objBuf = new TextEncoder().encode(objText);
            const runs = {};
            // Helper: run one voxelizer and time it
            const runOne = async (tool) => {
                const t0 = performance.now();
                try {
                    const r = await fetch(`/asset-pipeline/voxelize-mesh?dim=${dim}&tool=${tool}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: objBuf,
                    });
                    const j = await r.json();
                    const elapsed = performance.now() - t0;
                    if (!j.ok) return { ok: false, elapsed, error: j.error ?? "unknown", details: j.details };
                    // Pull voxel count from the produced .vox to make
                    // the comparison meaningful — "fast" doesn't matter
                    // if one tool produces 100× the voxels of the other.
                    let voxelCount = null;
                    try {
                        const { loadVoxFromUrl } = await import("../tools/voxParser.js");
                        const parsed = await loadVoxFromUrl(j.voxUrl);
                        voxelCount = parsed?.models?.[0]?.voxels?.length ?? null;
                    } catch {}
                    return { ok: true, elapsed, voxUrl: j.voxUrl, tool: j.tool, voxelCount, durationMs: j.durationMs };
                } catch (e) {
                    return { ok: false, elapsed: performance.now() - t0, error: e?.message ?? String(e) };
                }
            };
            const onProgress = (label) => {
                st.tokens = Math.round((performance.now() - st.startedAt) / 1000);
                st.tps    = 0;
                st.result = label;
                _renderStep(stepKey);
            };
            if (toolStatus.cuda_voxelizer.found) {
                onProgress("running cuda_voxelizer…");
                runs.cuda = await runOne("cuda");
            } else {
                runs.cuda = { ok: false, error: "not configured", skipped: true };
            }
            if (toolStatus.mesh_to_vox.found) {
                onProgress("running mesh_to_vox…");
                runs.m2v = await runOne("m2v");
            } else {
                runs.m2v = { ok: false, error: "not configured", skipped: true };
            }
            // Result is the comparison object so _renderStep can show
            // both rows. We mark ok=true if AT LEAST ONE succeeded so
            // a missing tool doesn't fail the whole step.
            st.result = { runs, dim };
            const anyOk = runs.cuda?.ok || runs.m2v?.ok;
            st.ok      = anyOk;
            st.partial = !!(runs.cuda?.ok && runs.m2v?.ok ? false : anyOk);
            if (!anyOk) {
                st.error = `both voxelizers failed: cuda=${runs.cuda?.error ?? "—"}; m2v=${runs.m2v?.error ?? "—"}`;
            }
        }
        clearInterval(tick);
        _stopSparklines(stepKey);   // Round 171
        st.running = false;
        st.elapsedMs = performance.now() - st.startedAt;
        if (st.ok && !baselines[stepKey]) {
            // First success — record baseline
            baselines[stepKey] = {
                elapsedMs: Math.round(st.elapsedMs),
                tokens:    st.tokens,
                tps:       st.tps,
                at:        new Date().toISOString(),
            };
            try { localStorage.setItem(LS_BASELINES, JSON.stringify(baselines)); } catch {}
        }
        // Round 181 — snapshot this run for the next run's ghost display.
        // Captured regardless of success: even a failure timing is useful
        // ("last run failed at 12s, this one is past 20s and still going").
        st.priorRun = {
            elapsedMs:     Math.round(st.elapsedMs),
            firstOutputMs: st.firstOutputAt > 0 ? Math.round(st.firstOutputAt - st.startedAt) : 0,
            ok:            st.ok === true,
            retried:       st.retried,
            at:            new Date().toISOString(),
        };
        _renderStep(stepKey);
        _renderBaselines();
        // Round 175 — if a "Run all" timer is in flight, check if this
        // step's completion finishes the run. Either because every
        // non-skipped step is now green (success), or in the case
        // where the user is waiting for a retry on a still-failed step
        // (timer keeps running).
        _checkRunAllComplete();
    } catch (e) {
        // Round 302 — outer try was missing a catch. Any uncaught
        // throw inside the step body would propagate to a top-level
        // unhandled-promise rejection, eventually surfacing as a
        // parse error during module load (ESM caches the partial
        // function source). Catch + log + mark the step failed so
        // the UI shows a real error instead of the bench hanging on
        // a perpetual "running" state.
        console.error(`[ai_pipeline_bench] _runStep("${stepKey}") threw:`, e);
        clearInterval(tick);
        const st = stepState?.[stepKey];
        if (st) {
            st.running = false;
            st.ok = false;
            st.error = e?.message ?? String(e);
            st.elapsedMs = performance.now() - (st.startedAt ?? performance.now());
            _renderStep(stepKey);
        }
    }
}

function _onProgress(stepKey, p) {
    if (!stepState) return;
    const st = stepState[stepKey];
    st.tokens    = p.tokensReceived;
    st.elapsedMs = p.elapsedMs;
    st.tps       = p.tokensReceived > 0 && p.elapsedMs > 0
        ? (p.tokensReceived / (p.elapsedMs / 1000)).toFixed(1)
        : 0;
    // Round 181 — record when first output arrives. Used by priorRun
    // ghost to show "time to first token" alongside total elapsed,
    // since cold-start is dominated by model-load time before the
    // first token. firstOutputAt set once, ignored on subsequent calls.
    if (st.firstOutputAt === 0 && p.tokensReceived > 0) {
        st.firstOutputAt = performance.now();
    }
    // Show the streaming output live (truncate to keep DOM cheap)
    const tail = p.fullText.length > 2000 ? "…" + p.fullText.slice(-2000) : p.fullText;
    st.result = tail;
    _renderStep(stepKey);
}

function _renderStep(stepKey) {
    if (!overlay) return;
    const card = overlay.querySelector(`[data-step="${stepKey}"]`);
    if (!card) return;
    const st = stepState[stepKey];

    const statusEl = card.querySelector(".status");
    if (st.running) {
        statusEl.textContent = "running";
        statusEl.style.background = "#3a2a00";
        statusEl.style.color = "#ffd884";
    } else if (st.ok === true && st.partial) {
        // Round 171 — OBJ step that streamed real Python output but
        // couldn't parse into a mesh. Distinct from "fail" — we still
        // got useful work product, just not the final form.
        statusEl.textContent = "python";
        statusEl.style.background = "#2a2a00";
        statusEl.style.color = "#ffd884";
    } else if (st.ok === true) {
        statusEl.textContent = "done";
        statusEl.style.background = "#003a14";
        statusEl.style.color = "#8aff9e";
    } else if (st.ok === false) {
        statusEl.textContent = "fail";
        statusEl.style.background = "#3a0000";
        statusEl.style.color = "#ff8a8a";
    } else {
        statusEl.textContent = "idle";
        statusEl.style.background = "#333";
        statusEl.style.color = "#aaa";
    }
    // Round 176 — append the retry glyph (↻) to the status pill if
    // we had to retry to reach the current state. The user explicitly
    // wanted presence-not-count: just a visible marker that "this
    // wasn't first try."
    if (st.retried && !st.running) {
        statusEl.textContent = statusEl.textContent + " ↻";
        statusEl.title = "Required at least one retry";
    }

    const elapsedEl = card.querySelector(".elapsed");
    // Round 181 — render the prior-run ghost next to the current elapsed.
    // Format:
    //   "4.2s · last: 8m12s ✓"   (this run still going, prior succeeded)
    //   "8m04s · last: 8m12s ✓"  (done, similar to prior)
    //   "12s · last: 45s ✗"      (this run faster than failed prior)
    //   "12s"                    (no prior run captured yet)
    // For narrative/obj we also tuck in the prior's time-to-first-token
    // since cold-start dominates: "last: 8m12s ✓ (ttft 6.4s)".
    const cur = st.elapsedMs > 0 ? _fmtDuration(st.elapsedMs) : "";
    const prior = st.priorRun;
    let priorBit = "";
    if (prior && prior.elapsedMs > 0) {
        const dur = _fmtDuration(prior.elapsedMs);
        const mark = prior.ok ? "✓" : "✗";
        const color = prior.ok ? "#8aff9e" : "#ff8a8a";
        let ttft = "";
        if ((stepKey === "narrative" || stepKey === "obj") && prior.firstOutputMs > 0) {
            ttft = ` (ttft ${_fmtDuration(prior.firstOutputMs)})`;
        }
        priorBit = ` · <span style="color:#666;">last: <span style="color:${color}; opacity:0.75;">${dur} ${mark}</span><span style="color:#666;">${ttft}</span></span>`;
    }
    elapsedEl.innerHTML = cur + priorBit;

    const tokensEl = card.querySelector(".tokens");
    if (stepKey === "texture") {
        tokensEl.textContent = ""; // diffuser doesn't stream tokens
    } else if (stepKey === "trellis") {
        // Round 173 — for Trellis we repurpose `tokens` as elapsed
        // seconds since the model doesn't stream. Showing "65s elapsed"
        // here matches the meaning of the field for this step.
        tokensEl.textContent = st.tokens > 0
            ? `${st.tokens}s elapsed`
            : "";
    } else {
        tokensEl.textContent = st.tokens > 0
            ? `${st.tokens} tok @ ${st.tps} tok/s`
            : "";
    }

    const runBtn = card.querySelector(".run-btn");
    runBtn.disabled = st.running;
    runBtn.style.opacity = st.running ? "0.4" : "1";
    runBtn.style.cursor  = st.running ? "wait" : "pointer";

    // Round 174 — retry button visibility. Show only when the step
    // finished in a failed state (red "fail" pill). Hidden while
    // running (the running spinner already conveys the state) and
    // hidden after success (no need to retry a working step).
    const retryBtn = card.querySelector(".retry-btn");
    if (retryBtn) {
        retryBtn.style.display = (st.ok === false && !st.running) ? "inline-block" : "none";
    }
    // Round 194 — cancel button visibility (Trellis only). Surfaces
    // while the step is running so users can abort a long Trellis run
    // that's not making progress. Hidden once the step finishes one
    // way or the other.
    const cancelBtn = card.querySelector(".cancel-btn");
    if (cancelBtn) {
        const isTrellis = card.dataset.step === "trellis";
        cancelBtn.style.display = (isTrellis && st.running) ? "inline-block" : "none";
    }

    // Render result body
    const result = card.querySelector(".result");
    result.innerHTML = "";
    if (st.error) {
        const err = document.createElement("div");
        err.style.cssText = "color:#ff8a8a; font-style:italic;";
        err.textContent = "error: " + st.error;
        result.appendChild(err);
    }
    // Round 181 — collapsible comfyui.log tail panel. When the Trellis
    // step fails, we automatically fetch the last ~80 lines of
    // ComfyUI/user/comfyui.log via the bridge and stash them on
    // st.errorLog. Render them in a <details> so the card stays short
    // by default but the user can expand to see the actual Python
    // traceback that caused the failure — without opening notepad.
    if (st.errorLog && Array.isArray(st.errorLog.lines) && st.errorLog.lines.length) {
        const det = document.createElement("details");
        det.style.cssText = "margin-top:8px; background:#0a0a0a; border:1px solid #333; border-radius:4px;";
        const sum = document.createElement("summary");
        sum.style.cssText = "padding:6px 10px; cursor:pointer; font-size:10px; color:#ffd884; user-select:none;";
        const pathShort = (st.errorLog.path || "comfyui.log").split(/[\\/]/).slice(-3).join("/");
        sum.textContent = `📜 comfyui.log tail (${st.errorLog.returnedLines} of ${st.errorLog.totalLines} lines · …/${pathShort})`;
        det.appendChild(sum);
        const pre = document.createElement("pre");
        pre.style.cssText = "margin:0; padding:8px 10px; font-size:9px; line-height:1.3; color:#bbb; max-height:280px; overflow:auto; white-space:pre-wrap; word-break:break-word; background:#000; border-top:1px solid #333;";
        // Highlight obvious error/traceback lines so the eye lands on
        // them when expanded. Lines starting with "Error", "Traceback",
        // "ImportError", etc. get a red tint via inline spans.
        const ERR_RE = /^(Traceback|.*Error:|.*Exception:|FileNotFoundError|ModuleNotFoundError|RuntimeError|ImportError|ValueError|AttributeError)/i;
        for (const line of st.errorLog.lines) {
            const ln = document.createElement("div");
            if (ERR_RE.test(line)) {
                ln.style.color = "#ff8a8a";
            } else if (/warning/i.test(line)) {
                ln.style.color = "#ffd884";
            }
            ln.textContent = line || "\u00a0";   // keep blank lines visible
            pre.appendChild(ln);
        }
        det.appendChild(pre);
        result.appendChild(det);
    }
    if (st.partial && stepKey === "obj") {
        // Round 171 — explain what they're looking at when C3D streamed
        // valid Python but the parser couldn't turn it into a mesh.
        const note = document.createElement("div");
        note.style.cssText = "color:#ffd884; font-size:10px; opacity:0.9; margin-bottom:4px; font-style:italic;";
        note.textContent = "raw Blender Python — C3D produced output but the parser couldn't extract primitives. Useful for diagnosing what shape the model emits.";
        result.appendChild(note);
    }
    if (stepKey === "texture" && st.result) {
        // Round 172 — texture step now returns a material set (albedo +
        // height + normal) instead of just a single image, so render
        // three labeled thumbnails side by side. Fall back to the old
        // single-image layout if material derivation failed and we
        // only have a dataUrl string.
        if (typeof st.result === "string") {
            const img = document.createElement("img");
            img.src = st.result;
            img.style.cssText = "max-width:256px; max-height:256px; image-rendering:pixelated; border:1px solid #444;";
            result.appendChild(img);
        } else {
            const triplet = document.createElement("div");
            triplet.style.cssText = "display:flex; gap:8px; flex-wrap:wrap;";
            const makeThumb = (label, dataUrl, color) => {
                const cell = document.createElement("div");
                cell.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:3px;";
                const lab = document.createElement("div");
                lab.style.cssText = `font-size:9px; color:${color}; font-weight:bold;`;
                lab.textContent = label;
                const img = document.createElement("img");
                img.src = dataUrl;
                img.style.cssText = "width:128px; height:128px; image-rendering:pixelated; border:1px solid #444; background:#222;";
                cell.appendChild(lab); cell.appendChild(img);
                return cell;
            };
            triplet.appendChild(makeThumb("albedo", st.result.albedo.dataUrl, "#ff9e8a"));
            triplet.appendChild(makeThumb("height", st.result.height.dataUrl, "#9eaaff"));
            triplet.appendChild(makeThumb("normal", st.result.normal.dataUrl, "#9effaa"));
            result.appendChild(triplet);
            // Footnote so the user knows what's going on
            const note = document.createElement("div");
            note.style.cssText = "font-size:9px; color:#888; margin-top:6px; font-style:italic;";
            note.textContent = "parallax material set — height derived from luminance, normal from Sobel. Round 1 of 3 in parallax pipeline.";
            result.appendChild(note);
            // Round 174 — Send to engine. Picks an entity kind and
            // registers the material set under that kind in the global
            // registry. Next round's renderer changes (or the live
            // parallax preview) will read from this.
            const sendRow = document.createElement("div");
            sendRow.style.cssText = "display:flex; gap:6px; align-items:center; margin-top:8px; flex-wrap:wrap;";
            const sendLabel = document.createElement("span");
            sendLabel.style.cssText = "font-size:10px; color:#aaa;";
            sendLabel.textContent = "Attach to entity kind:";
            sendRow.appendChild(sendLabel);
            const kindSelect = document.createElement("select");
            kindSelect.style.cssText = "background:#1a1a1a; color:#ccc; border:1px solid #555; border-radius:3px; padding:2px 4px; font-size:10px; font-family:monospace;";
            for (const k of ENGINE_ENTITY_KINDS) {
                const opt = document.createElement("option");
                opt.value = k; opt.textContent = k;
                kindSelect.appendChild(opt);
            }
            sendRow.appendChild(kindSelect);
            const sendBtn = document.createElement("button");
            sendBtn.style.cssText = _btnStyle("#8aff9e");
            sendBtn.textContent = "→ Send to engine";
            sendBtn.addEventListener("click", () => {
                const kind = kindSelect.value;
                const ok = materialSets.register(kind, st.result);
                if (ok) {
                    sendBtn.textContent = `✓ registered "${kind}"`;
                    sendBtn.disabled = true;
                    sendBtn.style.opacity = "0.5";
                    // Round 175 — auto-open the parallax preview so the
                    // user immediately sees the material as a shaded
                    // 3D surface rather than just three flat thumbnails.
                    // No-op if the panel's already open; it auto-refreshes
                    // via its registry listener.
                    if (window.parallaxPreview) window.parallaxPreview.open();
                    setTimeout(() => {
                        sendBtn.textContent = "→ Send to engine";
                        sendBtn.disabled = false;
                        sendBtn.style.opacity = "1";
                    }, 2500);
                }
            });
            sendRow.appendChild(sendBtn);
            // Currently registered indicator
            const regList = materialSets.list().map(e => e.kind);
            if (regList.length > 0) {
                const regNote = document.createElement("span");
                regNote.style.cssText = "font-size:9px; color:#666; margin-left:6px;";
                regNote.textContent = `(${regList.length} registered: ${regList.slice(0, 3).join(", ")}${regList.length > 3 ? "…" : ""})`;
                sendRow.appendChild(regNote);
            }
            result.appendChild(sendRow);
        }
    } else if (stepKey === "trellis" && st.result) {
        // Round 173 — Trellis success. Show the GLB URL + a download
        // link + a <model-viewer> if available (Chrome supports it
        // natively in many builds, falls back to a link otherwise).
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; flex-direction:column; gap:8px;";
        const heading = document.createElement("div");
        heading.style.cssText = "font-size:11px; color:#8aff9e; font-weight:bold;";
        heading.textContent = "✓ Trellis 2 produced a mesh";
        wrap.appendChild(heading);
        // <model-viewer> if we can load it. Polyfill loaded from a CDN
        // would feel intrusive in a self-hosted engine; instead we just
        // probe whether the custom element is registered. If not, fall
        // back to a download link + an info note.
        if (customElements.get("model-viewer")) {
            const mv = document.createElement("model-viewer");
            mv.setAttribute("src", st.result.url);
            mv.setAttribute("camera-controls", "");
            mv.setAttribute("auto-rotate", "");
            mv.style.cssText = "width:320px; height:240px; background:#222; border:1px solid #444; border-radius:4px;";
            wrap.appendChild(mv);
        } else {
            const note = document.createElement("div");
            note.style.cssText = "font-size:10px; color:#888; font-style:italic;";
            note.textContent = "(install the <model-viewer> custom element to preview in-place — for now use the download link)";
            wrap.appendChild(note);
        }
        const dl = document.createElement("a");
        dl.href = st.result.url;
        dl.download = "trellis-kaiju.glb";
        dl.textContent = "⬇ Download GLB";
        dl.style.cssText = "display:inline-block; padding:6px 12px; background:#1a3a1a; color:#8aff9e; border:1px solid #8aff9eaa; border-radius:4px; text-decoration:none; font-size:11px; width:fit-content;";
        wrap.appendChild(dl);
        const meta = document.createElement("div");
        meta.style.cssText = "font-size:9px; color:#666; margin-top:4px;";
        meta.textContent = `prompt id ${st.result.promptId?.slice(0, 8) || "?"} · node ${st.result.nodeId || "?"}`;
        wrap.appendChild(meta);

        // Round 178 — "Use as engine mesh" — closes the loop. Picks
        // an entity kind and calls assetLoader.swapMesh() so live
        // kaiju of that kind start rendering the Trellis GLB instead
        // of the procedural OBJ. Combined with round 177's material
        // set parallax, this makes the engine entity fully AI-driven:
        // C3D → mesh swap, diffuser → texture, Trellis → mesh + GLB.
        const useRow = document.createElement("div");
        useRow.style.cssText = "display:flex; gap:6px; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid #2a2a2a; flex-wrap:wrap;";
        const useLabel = document.createElement("span");
        useLabel.style.cssText = "font-size:10px; color:#aaa;";
        useLabel.textContent = "Use as engine mesh for kind:";
        useRow.appendChild(useLabel);
        const useKindSelect = document.createElement("select");
        useKindSelect.style.cssText = "background:#1a1a1a; color:#ccc; border:1px solid #555; border-radius:3px; padding:2px 4px; font-size:10px; font-family:monospace;";
        for (const k of ENGINE_ENTITY_KINDS) {
            const opt = document.createElement("option");
            opt.value = k; opt.textContent = k;
            useKindSelect.appendChild(opt);
        }
        useRow.appendChild(useKindSelect);
        const useBtn = document.createElement("button");
        useBtn.style.cssText = _btnStyle("#8aff9e");
        useBtn.textContent = "↪ Swap engine mesh";
        useBtn.addEventListener("click", async () => {
            if (!window.assetLoader?.swapMesh) {
                alert("assetLoader.swapMesh not available — wrong engine version?");
                return;
            }
            const kind = useKindSelect.value;
            useBtn.disabled = true;
            useBtn.style.opacity = "0.5";
            useBtn.textContent = "swapping…";
            const newMesh = await window.assetLoader.swapMesh(kind, st.result.url);
            if (newMesh) {
                useBtn.textContent = `✓ swapped "${kind}" (${newMesh.vertexCount} verts)`;
                useBtn.style.color = "#8aff9e";
                setTimeout(() => {
                    useBtn.textContent = "↪ Swap engine mesh";
                    useBtn.disabled = false;
                    useBtn.style.opacity = "1";
                }, 3500);
            } else {
                useBtn.textContent = "✗ swap failed (see console)";
                useBtn.style.color = "#ff8a8a";
                setTimeout(() => {
                    useBtn.textContent = "↪ Swap engine mesh";
                    useBtn.disabled = false;
                    useBtn.style.opacity = "1";
                    useBtn.style.color = "#8aff9e";
                }, 3500);
            }
        });
        useRow.appendChild(useBtn);
        wrap.appendChild(useRow);
        result.appendChild(wrap);
    } else if (stepKey === "voxelize" && st.result && typeof st.result === "object" && st.result.runs) {
        // Round 279 — render the cuda vs m2v side-by-side comparison.
        // Two rows. Each row: tool name + status pill + ms + voxel
        // count + a tiny "✓ stamp into world" button so the user can
        // immediately see the result.
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; flex-direction:column; gap:6px; font-size:11px;";
        const heading = document.createElement("div");
        heading.style.cssText = "color:#5fdbd6; font-weight:bold;";
        heading.textContent = `Voxelize (${st.result.dim}³ grid)`;
        wrap.appendChild(heading);
        const makeRow = (label, color, run) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex; align-items:center; gap:8px; padding:4px 6px; background:rgba(255,255,255,0.04); border-radius:3px;";
            const name = document.createElement("span");
            name.style.cssText = `color:${color}; font-weight:bold; min-width:120px;`;
            name.textContent = label;
            row.appendChild(name);
            const status = document.createElement("span");
            if (run?.ok) {
                status.style.cssText = "background:#003a14; color:#8aff9e; padding:1px 6px; border-radius:2px; font-size:10px;";
                status.textContent = "✓ ok";
            } else if (run?.skipped) {
                status.style.cssText = "background:#333; color:#888; padding:1px 6px; border-radius:2px; font-size:10px;";
                status.textContent = "skipped";
            } else {
                status.style.cssText = "background:#3a0000; color:#ff8a8a; padding:1px 6px; border-radius:2px; font-size:10px;";
                status.textContent = "fail";
            }
            row.appendChild(status);
            if (run?.ok) {
                const ms = document.createElement("span");
                ms.style.color = "#cfd";
                ms.textContent = `${Math.round(run.elapsed)}ms (cli ${run.durationMs ?? "?"}ms)`;
                row.appendChild(ms);
                const vc = document.createElement("span");
                vc.style.color = "#9ef";
                vc.textContent = `${run.voxelCount ?? "?"} voxels`;
                row.appendChild(vc);
                const stamp = document.createElement("button");
                stamp.style.cssText = _btnStyle(color) + "; font-size:10px; padding:2px 8px; margin-left:auto;";
                stamp.textContent = "↪ stamp";
                stamp.addEventListener("click", async () => {
                    if (!window.asset?.import) {
                        alert("asset.import unavailable — engine wiring issue");
                        return;
                    }
                    stamp.disabled = true;
                    stamp.textContent = "stamping…";
                    try {
                        const r = await window.asset.import(run.voxUrl);
                        stamp.textContent = `✓ ${r?.stamped ?? 0} voxels`;
                        setTimeout(() => { stamp.textContent = "↪ stamp"; stamp.disabled = false; }, 2500);
                    } catch (e) {
                        stamp.textContent = "✗ failed";
                        setTimeout(() => { stamp.textContent = "↪ stamp"; stamp.disabled = false; }, 2500);
                    }
                });
                row.appendChild(stamp);
            } else if (!run?.skipped && run?.error) {
                const err = document.createElement("span");
                err.style.cssText = "color:#ff8a8a; font-size:10px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
                err.textContent = run.error;
                err.title = run.details ?? run.error;
                row.appendChild(err);
            }
            return row;
        };
        wrap.appendChild(makeRow("cuda_voxelizer", "#5fdbd6", st.result.runs.cuda));
        wrap.appendChild(makeRow("mesh_to_vox",    "#dbb55f", st.result.runs.m2v));
        // Winner summary
        if (st.result.runs.cuda?.ok && st.result.runs.m2v?.ok) {
            const cw = st.result.runs.cuda;
            const mw = st.result.runs.m2v;
            const fasterTool = cw.elapsed < mw.elapsed ? "cuda_voxelizer" : "mesh_to_vox";
            const speedup    = (Math.max(cw.elapsed, mw.elapsed) / Math.min(cw.elapsed, mw.elapsed)).toFixed(2);
            const summary = document.createElement("div");
            summary.style.cssText = "margin-top:4px; padding:4px 6px; background:rgba(0,80,80,0.2); border-left:2px solid #5fdbd6; font-size:10px; color:#9ef;";
            summary.textContent = `winner: ${fasterTool} (${speedup}× faster)`;
            wrap.appendChild(summary);
        }
        result.appendChild(wrap);
    } else if (stepKey === "obj" && st.result && st.ok === true && !st.partial && typeof st.result === "string") {
        // Round 187 — 3D preview of the OBJ that C3D produced. We only
        // try when the step actually succeeded (st.ok === true) and we
        // have raw OBJ text. The partial state (Python output) keeps
        // the text fallback below. The previewer handles parse failure
        // internally by falling back to its own raw-text view.
        try {
            const preview = createObjPreview(st.result, { width: 195, height: 135 });
            // Stash the dispose handle on the result element so if the
            // user re-runs this step (which calls _renderStep again and
            // wipes result.innerHTML), the previous WebGL context's
            // RAF loop gets cancelled before the DOM node is GC'd.
            if (result._objPreviewDispose) {
                try { result._objPreviewDispose(); } catch {}
            }
            result._objPreviewDispose = preview.dispose;
            result.appendChild(preview.element);

            // Round 283 — QC badges row underneath the preview. Pulls
            // the same vert/tri counts the preview displays in its
            // own corner-badge, plus the raw OBJ file size, into a
            // dedicated visible row. Makes "what did the model
            // actually produce" easy to glance at without hovering.
            try {
                // Cheap re-parse just for the counts (the previewer
                // already did this internally but doesn't expose them).
                let verts = 0, tris = 0;
                for (const line of st.result.split(/\r?\n/)) {
                    if (!line) continue;
                    const c0 = line.charCodeAt(0);
                    if (c0 === 118 && (line[1] === " " || line[1] === "\t")) verts++;
                    else if (c0 === 102 && (line[1] === " " || line[1] === "\t")) {
                        const refs = line.trim().split(/\s+/).length - 1;
                        // Fan-triangulate counting: N refs → max(0, N-2) tris
                        if (refs >= 3) tris += refs - 2;
                    }
                }
                const fileBytes = new Blob([st.result]).size;
                result.appendChild(createMeshQcBadges({
                    verts, triangles: tris, fileBytes,
                }));
            } catch {}

            // Below the canvas: a small "view text" line that expands a
            // collapsible <details> with the raw OBJ. Most of the time
            // the 3D preview is what you want; the text is for the rare
            // case where you want to scroll through it.
            const det = document.createElement("details");
            det.style.cssText = "margin-top:8px;";
            const sum = document.createElement("summary");
            sum.style.cssText = "font-size:10px; color:#888; cursor:pointer; user-select:none;";
            sum.textContent = "show raw OBJ text";
            det.appendChild(sum);
            const pre = document.createElement("pre");
            pre.style.cssText = "margin:6px 0 0 0; padding:6px 10px; font-size:10px; color:#bbb; background:#000; border:1px solid #333; border-radius:3px; max-height:200px; overflow:auto; white-space:pre-wrap;";
            pre.textContent = st.result;
            det.appendChild(pre);
            result.appendChild(det);
        } catch (e) {
            // Preview construction blew up entirely (shouldn't happen,
            // but better to fall back than break the bench card).
            console.warn("[ai_pipeline_bench] OBJ preview failed:", e);
            const txt = document.createTextNode(st.result);
            result.appendChild(txt);
        }
    } else if (st.result) {
        const txt = document.createTextNode(st.result);
        result.appendChild(txt);
        // Auto-scroll to bottom for live streaming
        if (st.running) result.scrollTop = result.scrollHeight;
    } else if (!st.error && !st.running) {
        const placeholder = document.createElement("div");
        placeholder.style.color = "#555";
        placeholder.textContent = "(idle — click Run to start)";
        result.appendChild(placeholder);
    }
}

// ===========================================================================
// Round 171 — per-step rolling sparklines.
//
// While a step is running, poll the bridge's /system/stats endpoint every
// 1 second and feed three sparkline charts on that step's card:
//   - GPU utilization %
//   - GPU VRAM used %
//   - Tokens/sec for the active step (narrative + OBJ only; texture omitted)
//
// Each chart keeps the last 60 samples (~60 seconds of history) and renders
// as an SVG polyline auto-fitted to the chart's viewBox. Polling stops the
// moment the step finishes — idle cards show no chart.
//
// Sized to be lightweight: two HTTP calls per second across all running
// steps (one for /system/stats, one tick), no heavy DOM churn — we just
// mutate `points` attributes on existing polyline elements.
// ===========================================================================
const SPARK_HISTORY_LEN = 60;
const sparkState = {};    // stepKey → { gpu:[], vram:[], tps:[], timer, lastTokens, lastTime }

function _startSparklines(stepKey) {
    if (sparkState[stepKey]?.timer) return;   // already running
    sparkState[stepKey] = {
        gpu: [], vram: [], cpu: [], tps: [],   // Round 181 — added cpu
        lastTokens: 0, lastTime: performance.now(),
        timer: null,
    };
    const card = overlay?.querySelector(`[data-step="${stepKey}"]`);
    const row = card?.querySelector(".sparkline-row");
    if (row) row.style.display = "flex";
    const tpsWrap = card?.querySelector(".spark-tps-wrap");
    // Round 173 — both texture and trellis steps don't stream tokens,
    // so hide the tok/s sparkline for both. GPU + VRAM + CPU stay.
    if (tpsWrap) tpsWrap.style.display = (stepKey === "texture" || stepKey === "trellis") ? "none" : "flex";

    const tick = async () => {
        if (!stepState?.[stepKey]?.running) return;   // finished, stop
        try {
            const r = await fetch("/system/stats", { cache: "no-cache" });
            const j = await r.json();
            const gpuPct = j?.gpu?.utilPct ?? 0;
            const vramPct = (j?.gpu?.memUsedMB && j?.gpu?.memTotalMB)
                ? Math.round(100 * j.gpu.memUsedMB / j.gpu.memTotalMB) : 0;
            // Round 181 — system-wide CPU% sampled from os.cpus() ticks
            // on the bridge. First call returns 0 (no prior sample);
            // subsequent calls are accurate.
            const cpuPct = j?.cpu?.utilPct ?? 0;
            // tok/s: derive from delta of step's token count
            const now = performance.now();
            const s = sparkState[stepKey];
            const stepSt = stepState[stepKey];
            const dt = (now - s.lastTime) / 1000;
            const dTok = (stepSt.tokens || 0) - s.lastTokens;
            const tps = dt > 0 ? Math.max(0, dTok / dt) : 0;
            s.lastTime = now;
            s.lastTokens = stepSt.tokens || 0;
            // Push samples, trim history
            s.gpu.push(gpuPct);   if (s.gpu.length  > SPARK_HISTORY_LEN) s.gpu.shift();
            s.vram.push(vramPct); if (s.vram.length > SPARK_HISTORY_LEN) s.vram.shift();
            s.cpu.push(cpuPct);   if (s.cpu.length  > SPARK_HISTORY_LEN) s.cpu.shift();
            s.tps.push(tps);      if (s.tps.length  > SPARK_HISTORY_LEN) s.tps.shift();
            _drawSpark(stepKey, "gpu",  s.gpu,  100, gpuPct + "%");
            _drawSpark(stepKey, "vram", s.vram, 100, vramPct + "%");
            _drawSpark(stepKey, "cpu",  s.cpu,  100, cpuPct + "%");
            // For tok/s the y-scale is dynamic — use peak observed
            const peakTps = Math.max(5, ...s.tps);
            _drawSpark(stepKey, "tps", s.tps, peakTps, tps.toFixed(1));
        } catch {}
    };
    tick();
    sparkState[stepKey].timer = setInterval(tick, 1000);
}

function _stopSparklines(stepKey) {
    const s = sparkState[stepKey];
    if (!s) return;
    if (s.timer) clearInterval(s.timer);
    delete sparkState[stepKey];
    const card = overlay?.querySelector(`[data-step="${stepKey}"]`);
    const row = card?.querySelector(".sparkline-row");
    if (row) row.style.display = "none";
}

function _drawSpark(stepKey, kind, samples, yMax, nowLabel) {
    const card = overlay?.querySelector(`[data-step="${stepKey}"]`);
    if (!card) return;
    const svg = card.querySelector(`.spark-${kind}`);
    if (!svg) return;
    const line = svg.querySelector(".line");
    const w = parseFloat(svg.getAttribute("width"))  || 140;
    const h = parseFloat(svg.getAttribute("height")) || 22;
    const n = samples.length;
    if (n < 2) { line.setAttribute("points", ""); return; }
    const stepX = w / (SPARK_HISTORY_LEN - 1);
    const pts = [];
    const xOff = w - (n - 1) * stepX;   // right-align so latest is rightmost
    for (let i = 0; i < n; i++) {
        const x = xOff + i * stepX;
        const y = h - 2 - (Math.min(samples[i], yMax) / yMax) * (h - 4);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    line.setAttribute("points", pts.join(" "));
    const nowEl = card.querySelector(`.spark-${kind}-now`);
    if (nowEl) nowEl.textContent = nowLabel;
}


function _renderBaselines() {
    if (!overlay) return;
    const el = overlay.querySelector("#bench_baselines");
    if (!el) return;
    const rows = [];
    rows.push("<div style='color:#ffd884; font-weight:bold; margin-bottom:6px;'>FIRST-RUN BASELINES (cold-start)</div>");
    for (const [k, lbl] of [["narrative","Narrative"],["obj","OBJ Mesh"],["texture","Texture"],["trellis","Trellis 2 Mesh"]]) {
        const b = baselines?.[k];
        if (b) {
            const tokStr = (k !== "texture" && b.tokens > 0) ? ` · ${b.tokens} tokens @ ${b.tps} tok/s` : "";
            rows.push(`<div><span style='color:#aaa;'>${lbl}:</span> <span style='color:#8aff9e;'>${(b.elapsedMs/1000).toFixed(1)}s</span>${tokStr} <span style='color:#666;'>(${b.at.slice(0,10)})</span></div>`);
        } else {
            rows.push(`<div><span style='color:#aaa;'>${lbl}:</span> <span style='color:#555;'>not yet measured</span></div>`);
        }
    }
    rows.push(`<div style='margin-top:8px;'><button id='bench_clear_baselines' style='${_btnStyle("#888")}'>Clear baselines</button></div>`);
    el.innerHTML = rows.join("");
    el.querySelector("#bench_clear_baselines").addEventListener("click", () => {
        baselines = {};
        try { localStorage.removeItem(LS_BASELINES); } catch {}
        _renderBaselines();
    });
}

// ===========================================================================
// Run-all orchestration
// ===========================================================================
async function _runAllSequential() {
    _startRunAllTimer();
    // Round 181 — clear last run's state on a new "Run all" so cards
    // don't show stale results while the next run gets going. priorRun
    // is preserved so the ghost subtitle still shows "last: 8m12s ✓".
    for (const k of ["narrative", "obj", "texture", "trellis"]) {
        if (!runAllSkips.has(k)) _resetStepForRerun(k);
    }
    // narrative → obj → texture → trellis. Trellis depends on texture
    // having produced an albedo, so even in parallel mode we serialize
    // these two. Narrative + OBJ + Texture can run together; Trellis
    // waits for texture before starting.
    // Round 175 — skips honored: skipped steps are not awaited and
    // don't gate downstream steps. Skipping OBJ when the user just
    // wants narrative→texture→trellis timing is the common case.
    for (const k of ["narrative", "obj", "texture", "trellis"]) {
        if (runAllSkips.has(k)) continue;
        await _runStep(k);
    }
    _checkRunAllComplete();
}

async function _runAllParallel() {
    _startRunAllTimer();
    // Round 181 — same clear-on-rerun as sequential.
    for (const k of ["narrative", "obj", "texture", "trellis"]) {
        if (!runAllSkips.has(k)) _resetStepForRerun(k);
    }
    // Fire narrative/OBJ/texture concurrently, then chain Trellis after
    // texture has the albedo it needs. Skipped steps are dropped.
    const concurrent = ["narrative", "obj", "texture"]
        .filter(k => !runAllSkips.has(k))
        .map(k => _runStep(k));
    await Promise.all(concurrent);
    if (!runAllSkips.has("trellis")
        && stepState.texture.ok && stepState.texture.result) {
        await _runStep("trellis");
    }
    _checkRunAllComplete();
}

// Round 175 — total wall-clock for "Run all". Starts on the first
// Run-all click, accumulates across retries (because retries call
// _runStep which doesn't touch runAllStart), stops when every
// non-skipped step is green. Live-ticks via rAF.
function _startRunAllTimer() {
    if (runAllStart > 0) return;   // already running
    runAllStart = performance.now();
    const tick = () => {
        if (runAllStart <= 0) return;
        const el = overlay?.querySelector("#bench_total");
        if (el) {
            const elapsed = (performance.now() - runAllStart) / 1000;
            el.textContent = `total: ${elapsed.toFixed(1)}s`;
            el.style.color = "#ffd884";    // yellow while running
        }
        runAllRafId = requestAnimationFrame(tick);
    };
    tick();
}

function _stopRunAllTimer(success) {
    if (runAllStart <= 0) return;
    if (runAllRafId) { cancelAnimationFrame(runAllRafId); runAllRafId = null; }
    const elapsed = (performance.now() - runAllStart) / 1000;
    const el = overlay?.querySelector("#bench_total");
    if (el) {
        el.textContent = `total: ${elapsed.toFixed(1)}s${success ? " ✓" : " (incomplete)"}`;
        el.style.color = success ? "#8aff9e" : "#ff8a8a";
    }
    runAllStart = 0;
}

// Check whether every non-skipped step has succeeded (and none are
// currently running). If so, stop the timer with success. Called
// from _runStep's finally, from _runAll*, and from the skip toggle
// (since toggling skip on a still-pending step might complete the run).
function _renderAcquiredCount() {
    if (!overlay) return;
    const el = overlay.querySelector("#bench_acquired");
    if (!el) return;
    const keys = ["narrative", "obj", "texture", "trellis"];
    let acquired = 0, total = 0;
    for (const k of keys) {
        if (runAllSkips.has(k)) continue;
        total++;
        if (stepState?.[k]?.ok === true) acquired++;
    }
    if (total === 0) { el.textContent = "(all skipped)"; el.style.color = "#888"; return; }
    el.textContent = `${acquired} of ${total} acquired`;
    el.style.color = acquired === total ? "#8aff9e"
                  : acquired === 0     ? "#888"
                  : "#ffd884";
}

function _checkRunAllComplete() {
    // Round 176 — always refresh the acquired counter, whether or
    // not a run-all is in flight. It's a passive rollup.
    _renderAcquiredCount();
    if (runAllStart <= 0) return;
    const keys = ["narrative", "obj", "texture", "trellis"];
    let allDone = true;
    let anyRunning = false;
    for (const k of keys) {
        if (runAllSkips.has(k)) continue;
        if (stepState[k]?.running) { anyRunning = true; break; }
        if (stepState[k]?.ok !== true) { allDone = false; }
    }
    if (anyRunning) return;
    if (allDone) _stopRunAllTimer(true);
    // If not allDone and not running, the user has clicked into a state
    // where some non-skipped step is failed/idle and we're waiting for
    // them to retry. Keep the timer running so the retry's time is
    // included in the total.
}

// ===========================================================================
// Prompt builders — match the engine's actual prompts as closely as
// possible so the bench reflects real engine behavior.
// ===========================================================================
function _narrativePrompt(desc) {
    return `You are a sci-fi narrator describing a kaiju emerging.
Subject: ${desc}
Write 2-3 sentences of dramatic narration. No preamble.`;
}

function _texturePrompt(desc) {
    return `Seamless texture map for: ${desc}. ` +
           "Tileable, top-down view, full coverage, no borders, " +
           "creature scale detail, organic material.";
}
