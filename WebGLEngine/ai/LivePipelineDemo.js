// =============================================================================
// FILE: /ai/LivePipelineDemo.js
// ROUND: 189
// =============================================================================
//
// Orchestrates a "live" demo of the parallel-pipeline asset generator. Unlike
// the bench's batch panel which just shows table progress, this demo INSTALLS
// each stage's result into the running engine as it completes:
//
//   - OBJ      → assetLoader.installOBJText(kind, objText)
//                  → triggers mesh swap, EMR rebuilds VAOs, live entities
//                    of that kind start rendering the new geometry next frame
//   - Texture  → materialSets.register(kind, matSet)
//                  → parallax-capable shaders pick up the new material
//   - Trellis  → assetLoader.swapMesh(kind, glbUrl)
//                  → live entities render the Trellis-generated mesh
//
// The HUD overlay (ui/livePipelineHUD.js) is the visualization layer.
// The orchestrator owns the PipelineManager, the AI clients, and the
// engine-install plumbing.
//
// Public API:
//   const demo = new LivePipelineDemo({ hud });
//   demo.start({ count: 5, prompts?: [...], kinds?: [...], skipTrellis?: false });
//   demo.stop();
//   demo.isRunning() → bool
// =============================================================================

import { PipelineManager } from "./PipelineManager.js";
import { OllamaClient }    from "./OllamaClient.js";
import { OllamaDiffuserClient } from "./OllamaDiffuserClient.js";
import { ComfyUIClient }   from "./ComfyUIClient.js";
import { materialSetFromDataUrl } from "./MaterialSet.js";
import { materialSets }    from "./MaterialSetRegistry.js";

// Default pool of (kind, prompt) pairs the demo cycles through. Picks
// blend kaiju and civ so the user sees varied morphs across the world.
const DEFAULT_DEMO_TARGETS = [
    { kind: "kaiju_water",  prompt: "An aquatic kaiju with bioluminescent flippers, ridged dorsal fin, and a wide flat tail. Smooth blue-green hide marbled with paler aqua stripes." },
    { kind: "kaiju_tech",   prompt: "A robotic centurion kaiju with angular brushed-steel plates, twin antenna spires, glowing teal eye-slits, and articulated armored joints." },
    { kind: "kaiju_hell",   prompt: "A fire-elemental kaiju with cracked obsidian skin and glowing magma seams along the spine and limbs. Curved horns, smoldering eyes." },
    { kind: "civ_tower",    prompt: "A tall obsidian spire civilization tower with three ringed bands, a wide stepped base, and a tapered crystal-tipped pinnacle." },
    { kind: "kaiju_cave",   prompt: "A subterranean burrowing kaiju with mottled grey hide, oversized digging claws, four small eyes in a row, and an armored ridged back." },
    { kind: "civ_plaza",    prompt: "A circular stone civic plaza with concentric step rings descending toward a raised central altar, weathered tan masonry." },
    { kind: "kaiju_space",  prompt: "A void-born kaiju with translucent skin showing star-like inner luminescence, multiple thin limbs, hovering crystalline shards orbiting it." },
    { kind: "kaiju_underground", prompt: "A pale fungal kaiju with bioluminescent mushroom growths cresting its back, six insectile legs, blind milky eyes." },
];

export class LivePipelineDemo {
    constructor({ hud } = {}) {
        this.hud = hud || null;
        this._running = false;
        this._manager = null;

        // Build dedicated clients so the demo doesn't collide with
        // the bench's pause/unpause state. They read base URL +
        // default model from the same localStorage keys, so they
        // pick up whatever the user has configured.
        this._ollama   = new OllamaClient();
        this._diffuser = new OllamaDiffuserClient();
        this._comfyui  = new ComfyUIClient();
    }

    isRunning() { return this._running; }

    async start(opts = {}) {
        if (this._running) {
            console.warn("[livepipeline] already running; ignoring start()");
            return;
        }
        const count       = Math.max(1, Math.min(8, opts.count ?? 5));
        const skipTrellis = !!opts.skipTrellis;
        // v467 — per-run Trellis expectation lowering. After this many Trellis
        // failures we stop attempting it for the rest of the run and lean on
        // the OBJ fallback (6 cheap OBJs beat 1 stuck Trellis).
        this._trellisFails = 0;
        this._maxTrellisFails = Math.max(1, opts.maxTrellisFails ?? 3);
        // v468 — HiTem3D is a second image→3D rung tried after Trellis. Same
        // expectation-lowering: give up on it for the run after a couple fails.
        this._hitemFails = 0;
        this._maxHitemFails = Math.max(1, opts.maxHitemFails ?? 2);
        const targets     = (opts.targets && opts.targets.length)
            ? opts.targets
            : DEFAULT_DEMO_TARGETS.slice(0, count);

        const objModel    = localStorage.getItem("voxelengine.ollamaObjModel") || "joshuaokolo/C3Dv0:latest";
        const narrModel   = localStorage.getItem("voxelengine.ollamaModel")    || "gemma3:4b";
        const idleTimeoutMs = 90 * 1000;
        const totalTimeoutMs = 6 * 60 * 1000;

        // ---- Build stage runners. Each one installs its result in the
        // engine as soon as it completes, on top of returning the raw
        // value so the next stage can see it via job.results.
        const assetLoader = window.assetLoader;
        if (!assetLoader) {
            console.error("[livepipeline] no window.assetLoader available; aborting demo");
            return;
        }

        const stages = [
            {
                name: "narrative", concurrency: 1, optional: true,   // v467 — flavor; never blocks the asset
                run: async (job) => {
                    const text = await this._ollama.generate(
                        this._narrativePrompt(job.input.prompt, job.input.kind),
                        { model: narrModel, idleTimeoutMs, timeoutMs: totalTimeoutMs,
                          num_predict: 160, temperature: 0.8 }
                    );
                    if (!text) throw new Error("no narrative");
                    // No engine wiring for narrative; it's flavor text.
                    // Optionally we could pipe to the event bus / palchat;
                    // skipping for v189 to keep scope tight.
                    return text;
                },
            },
            {
                name: "obj", concurrency: 1, retries: 2,   // v467 — the reliable floor; retry before giving up
                run: async (job) => {
                    const obj = await this._ollama.generateOBJ(
                        job.input.prompt,
                        { model: objModel, idleTimeoutMs, timeoutMs: totalTimeoutMs }
                    );
                    if (!obj) throw new Error("no OBJ returned");
                    // INSTALL into engine. After this completes, every
                    // live entity of `job.input.kind` will render this
                    // new geometry next frame (EMR's swap listener
                    // invalidates the stale VAO).
                    const mesh = await assetLoader.installOBJText(job.input.kind, obj);
                    if (!mesh) throw new Error("install failed");
                    return obj;
                },
            },
            {
                name: "texture", concurrency: 1, optional: true, retries: 1,   // v467 — nice-to-have; OBJ stands without it
                run: async (job) => {
                    const res = await this._diffuser.generate(
                        this._texturePrompt(job.input.prompt, job.input.kind),
                        { width: 512, height: 512, steps: 20 }
                    );
                    if (!res.ok) throw new Error(res.error || "diffuser failed");
                    let matSet;
                    try {
                        matSet = await materialSetFromDataUrl(res.dataUrl, {
                            height: { contrast: 1.8, bias: 96, center: 128 },
                            normal: { strength: 2.5 },
                        });
                    } catch (e) {
                        matSet = { dataUrl: res.dataUrl, partial: true };
                    }
                    // INSTALL: register for this kind so parallax-capable
                    // renderers see it. Tolerates the partial case (just
                    // the dataUrl) — register still records what it can.
                    try { materialSets.register(job.input.kind, matSet); } catch {}
                    return matSet;
                },
            },
        ];
        if (!skipTrellis) {
            stages.push({
                name: "trellis", concurrency: 1, optional: true,   // v467 — best quality, but the OBJ already stands if this fails
                run: async (job) => {
                    // v467 — per-run expectation lowering: once Trellis has
                    // failed MAX_TRELLIS_FAILS times this run, stop even trying
                    // it for the remaining jobs (don't burn ~20 min/asset on a
                    // step that clearly isn't working). They fall back to OBJ.
                    if (this._trellisFails >= this._maxTrellisFails) {
                        throw new Error(`Trellis disabled this run (${this._trellisFails} prior failures) — using OBJ fallback`);
                    }
                    try {
                        const texRes = job.results.texture;
                        const albedoDataUrl =
                            (texRes && typeof texRes === "object" && texRes.albedo?.dataUrl) ||
                            (texRes && texRes.dataUrl) || null;
                        if (!albedoDataUrl) throw new Error("no albedo from texture stage");
                        if (!(await this._comfyui.probe())) throw new Error("ComfyUI unreachable");
                        const trellisInfo = await this._comfyui.findTrellisNode();
                        if (!trellisInfo) throw new Error("Trellis node not found");
                        const glb = await this._comfyui.runTrellis(albedoDataUrl, trellisInfo, {
                            timeoutMs: 20 * 60 * 1000,
                        });
                        if (!glb?.url) throw new Error("Trellis returned no GLB url");
                        // INSTALL: swap engine mesh. Live entities of
                        // `job.input.kind` switch to the Trellis GLB.
                        try { await assetLoader.swapMesh(job.input.kind, glb.url); } catch (e) {
                            console.warn(`[livepipeline] swapMesh failed for ${job.input.kind}: ${e?.message}`);
                        }
                        return glb;
                    } catch (e) {
                        this._trellisFails++;
                        if (this._trellisFails >= this._maxTrellisFails) {
                            console.warn(`[livepipeline] Trellis hit ${this._trellisFails} failures — disabling it for the rest of this run; remaining assets use OBJ.`);
                        }
                        throw e;
                    }
                },
            });
            // v468 — HiTem3D rung. Tried AFTER Trellis: if Trellis already
            // produced a mesh this job is done (skip); otherwise attempt
            // HiTem3D (watertight OBJ/GLB, great for a voxel engine) before
            // we fall all the way back to the bare OBJ. Optional + capped, so
            // a missing node / offline ComfyUI just degrades to OBJ.
            stages.push({
                name: "hitem3d", concurrency: 1, optional: true,
                run: async (job) => {
                    if (job.results.trellis) return job.results.trellis;   // Trellis won — nothing to do
                    if (this._hitemFails >= this._maxHitemFails) {
                        throw new Error(`HiTem3D disabled this run (${this._hitemFails} prior failures) — using OBJ fallback`);
                    }
                    try {
                        const texRes = job.results.texture;
                        const albedoDataUrl =
                            (texRes && typeof texRes === "object" && texRes.albedo?.dataUrl) ||
                            (texRes && texRes.dataUrl) || null;
                        if (!albedoDataUrl) throw new Error("no albedo for HiTem3D");
                        if (!(await this._comfyui.probe())) throw new Error("ComfyUI unreachable");
                        const node = await this._comfyui.findHitem3dNode();
                        if (!node) throw new Error("HiTem3D node not found (install comfyui-hitem3d)");
                        const glb = await this._comfyui.runHitem3d(albedoDataUrl, node, {
                            timeoutMs: 20 * 60 * 1000,
                        });
                        if (!glb?.url) throw new Error("HiTem3D returned no GLB url");
                        try { await assetLoader.swapMesh(job.input.kind, glb.url); } catch (e) {
                            console.warn(`[livepipeline] HiTem3D swapMesh failed for ${job.input.kind}: ${e?.message}`);
                        }
                        return glb;
                    } catch (e) {
                        this._hitemFails++;
                        if (this._hitemFails >= this._maxHitemFails) {
                            console.warn(`[livepipeline] HiTem3D hit ${this._hitemFails} failures — disabling it for the rest of this run; remaining assets use OBJ.`);
                        }
                        throw e;
                    }
                },
            });

            // v643 — Kaggle stage. When trellis + hitem3d both fail (or are
            // disabled), and aiModels has 'kaggle' enabled, submit a Hunyuan3D
            // Kaggle job. Same approach as AssetAcquisitionService: return a
            // {pending:true} marker immediately; the assetService reconciler
            // (every 90s) catches the completion and swaps the GLB in. So the
            // demo "completes" with a Kaggle stage marked SUCCESS even though
            // the mesh upgrade lands later — matches the user's expectation
            // when they uncheck local 3D and check Kaggle.
            stages.push({
                name: "kaggle", concurrency: 1, optional: true,
                run: async (job) => {
                    if (typeof window !== "undefined" && window.aiModels && !window.aiModels.isEnabled("kaggle")) {
                        throw new Error("Kaggle disabled in AI Models settings — skipping");
                    }
                    if (job.results.trellis || job.results.hitem3d) {
                        return job.results.trellis || job.results.hitem3d;   // already have 3D
                    }
                    const texRes = job.results.texture;
                    const albedoDataUrl =
                        (texRes && typeof texRes === "object" && texRes.albedo?.dataUrl) ||
                        (texRes && texRes.dataUrl) || null;
                    if (!albedoDataUrl) throw new Error("no albedo for Kaggle submit");
                    const b64 = String(albedoDataUrl).replace(/^data:[^;]+;base64,/, "");
                    const sr = await fetch("/kaggle/submit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            template: "hunyuan3d",
                            params: { imageBase64: b64, removeBackground: true, withTexture: true, seed: 42 },
                        }),
                    });
                    let sj = null;
                    try { sj = await sr.json(); } catch {}
                    if (!sr.ok || !sj || sj.error || !sj.slug) {
                        throw new Error("kaggle submit failed: " + (sj?.error || sr.statusText || sr.status));
                    }
                    // Hand the slug to the AAS reconciler so it swaps the mesh
                    // when the cloud job lands. The AAS is the authority on
                    // pending Kaggle jobs across BOTH demo + non-demo paths.
                    try {
                        if (window.assetService?._kagglePending) {
                            window.assetService._kagglePending.set(sj.slug, job.input.kind);
                            window.assetService._saveKagglePending?.();
                        }
                    } catch {}
                    console.log(`[livepipeline] Kaggle Hunyuan3D submitted for ${job.input.kind}: ${sj.slug} (asset upgrades later when cloud job completes)`);
                    return { pending: true, slug: sj.slug, kind: job.input.kind };
                },
            });
        }

        this._manager = new PipelineManager({
            stages,
            onJobUpdate: (job) => { if (this.hud) this.hud.updateJob(job); },
        });

        if (this.hud) {
            this.hud.reset();
            this.hud.attachManager(this._manager);
            this.hud.show();
        }

        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            this._manager.submit({
                id: `demo${i + 1}`,
                kind: t.kind,
                prompt: t.prompt,
            });
        }

        this._running = true;
        console.log(`[livepipeline] starting ${targets.length}-job demo${skipTrellis ? " (Trellis skipped)" : ""}`);

        try {
            const jobs = await this._manager.run();
            const ok = jobs.filter(j => j.status === "done").length;
            console.log(`[livepipeline] done — ${ok}/${jobs.length} succeeded`);

            // v467 — "rigged OBJ running loose": for every job that produced an
            // OBJ but did NOT get a Trellis mesh (failed/skipped/disabled), drop
            // a rigged, animated entity of that kind near the camera so the OBJ
            // is actually walking around — not just installed and waiting for a
            // Trellis swap that may never come. When Trellis later succeeds for
            // that kind, swapMesh upgrades the live entity in place.
            for (const j of jobs) {
                const gotObj = !!j.results?.obj;
                const got3d  = !!j.results?.trellis || !!j.results?.hitem3d;   // v468 — either 3D path counts
                if (gotObj && !got3d && window.anim?.spawn) {
                    try {
                        const kind = j.input?.kind || j.kind;
                        const cam  = window._camera || window.camera || null;
                        const cx = cam ? cam.position.x : 0;
                        const cz = cam ? cam.position.z : 0;
                        const ox = cx + (Math.random() * 16 - 8);
                        const oz = cz + (Math.random() * 16 - 8);
                        const id = window.anim.spawn(ox, oz, 1.5, kind);
                        try { window.anim.setClip?.(id, "walk"); } catch {}
                        console.log(`[livepipeline] 🦴 spawned rigged OBJ "${kind}" running loose (id ${id}) — Trellis fallback`);
                    } catch (e) {
                        console.warn(`[livepipeline] rigged-OBJ spawn failed for ${j.input?.kind}: ${e?.message}`);
                    }
                }
            }
        } catch (e) {
            console.warn("[livepipeline] manager threw:", e);
        } finally {
            this._running = false;
            this._manager = null;
        }
    }

    stop() {
        // Soft stop: pause clients so in-flight HTTP calls reject/timeout
        // and queued stage calls fail fast. We can't cancel an in-flight
        // Trellis run cleanly from here without poking ComfyUI internals,
        // so accept that the last running stage finishes its work.
        try { this._ollama.setPaused?.(true); }   catch {}
        try { this._diffuser.setPaused?.(true); } catch {}
        console.log("[livepipeline] stop requested — paused clients; in-flight work will finish");
    }

    // --- prompt builders, mirrored from the bench so the demo produces
    //     compatible inputs to the same Ollama/Diffuser models
    _narrativePrompt(promptBody, kind) {
        return `Write a single short evocative paragraph (60 words max) describing a ${kind}: ${promptBody}. ` +
               `Focus on visual detail. No preamble, just the description.`;
    }
    _texturePrompt(promptBody, kind) {
        // Mirror the bench's albedo-focused prompt template
        return `seamless ${kind} surface texture, ${promptBody}, organic detail, ` +
               `even lighting, no shadows, square texture, hi-res, photoreal`;
    }
}
