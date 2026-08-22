// ============================================================================
// ai/RosterRunner.js
//
// Round 179 — headless roster execution. The kaiju roster demo used to
// own its own run loop, meaning closing the demo killed the run.
// Long roster runs (5-30 min without Trellis, hours with Trellis) made
// that a real annoyance: you couldn't watch the engine fill in with
// new kaiju materials/meshes unless you kept the demo overlay open.
//
// This runner extracts state + run loop into a singleton that lives
// across demo open/close cycles:
//   - The demo becomes a viewer over the runner's state
//   - On runAll(), runner pauses engine traffic + runs the pipeline
//   - Closing the demo does NOT cancel the run — runner keeps going,
//     keeps writing to materialSets + swapping meshes
//   - A small floating HUD (ui/rosterHud.js) shows progress when the
//     runner is active and the demo overlay is gone
//   - cancel() does cancel — explicit user action vs implicit close
//
// State is intentionally NOT persisted to localStorage. A multi-hour
// run that gets interrupted by a page refresh would be tricky to
// recover; cleaner to just re-start the relevant entries. Material
// sets that landed before the refresh DO survive (via the registry's
// own localStorage), so partial progress isn't lost.
// ============================================================================

import { OllamaClient }         from "./OllamaClient.js";
import { OllamaDiffuserClient } from "./OllamaDiffuserClient.js";
import { ComfyUIClient }        from "./ComfyUIClient.js";
import { materialSetFromDataUrl } from "./MaterialSet.js";
import { materialSets }         from "./MaterialSetRegistry.js";
import { THEMES, findTheme, narrativePrompt, objPrompt, texturePrompt } from "./KaijuThemes.js";

function _newEntryState() {
    return {
        status:  "idle",
        stages:  { narrative: "idle", obj: "idle", texture: "idle", trellis: "idle" },
        retried: { narrative: false,  obj: false,  texture: false,  trellis: false },
        results: { narrative: null,   obj: null,   texture: null,   trellis: null },
        error:   null,
    };
}

class RosterRunner {
    constructor() {
        this.currentTheme = null;
        this.entryStates = [];
        this.runActive = false;
        this.runStart = 0;
        this.trellisAvailable = false;
        // Cached AI clients — created on first run, reused across runs.
        // Keeps the cost of "click Generate" low (no client setup time)
        // and means pause state persists naturally between runs.
        this._ollama   = null;
        this._diffuser = null;
        this._comfyui  = null;
        // Remember pre-run pause state so we can restore on completion
        this._pausedEngine = { ollama: false, diffuser: false };
        // Listeners — the demo's viewer subscribes here. Multiple
        // subscribers OK (demo + HUD both want updates).
        this._listeners = new Set();
    }

    // ---- Theme management ---------------------------------------------------
    setTheme(themeId) {
        if (this.runActive) return false;   // can't change mid-run
        const theme = findTheme(themeId);
        if (!theme) return false;
        this.currentTheme = theme;
        this.entryStates  = theme.entries.map(() => _newEntryState());
        this._notify({ type: "theme-changed" });
        return true;
    }

    getTheme()  { return this.currentTheme; }
    getStates() { return this.entryStates;  }
    isActive()  { return this.runActive;    }
    elapsedSec() { return this.runActive ? (performance.now() - this.runStart) / 1000 : 0; }

    // Acquired = any entry whose texture step is green. Matches the
    // demo's "X of N targets acquired" framing.
    counts() {
        if (!this.currentTheme) return { acquired: 0, total: 0 };
        const total = this.currentTheme.entries.length;
        let acquired = 0;
        for (const st of this.entryStates) {
            if (st.stages.texture === "ok") acquired++;
        }
        return { acquired, total };
    }

    // ---- Listener API -------------------------------------------------------
    addListener(fn)    { this._listeners.add(fn); }
    removeListener(fn) { this._listeners.delete(fn); }
    _notify(event) {
        for (const fn of this._listeners) {
            try { fn(event); } catch (e) {
                console.warn("[RosterRunner] listener threw:", e);
            }
        }
    }

    // ---- Client lifecycle ---------------------------------------------------
    _ensureClients() {
        if (!this._ollama)   this._ollama   = new OllamaClient();
        if (!this._diffuser) this._diffuser = new OllamaDiffuserClient();
        if (!this._comfyui) {
            this._comfyui = new ComfyUIClient();
            this._comfyui.probe();
        }
    }

    // Pause / unpause engine traffic so the roster has clean GPU/CPU.
    // Symmetric — runEnd() restores whatever the engine was doing
    // before runStart() touched it.
    _pauseEngine() {
        if (window.ollama) {
            this._pausedEngine.ollama = window.ollama.isPaused?.() ?? false;
            window.ollama.setPaused?.(true);
        }
        if (window._diffuser) {
            this._pausedEngine.diffuser = window._diffuser.isPaused?.() ?? false;
            window._diffuser.setPaused?.(true);
        }
    }
    _unpauseEngine() {
        try { window.ollama?.setPaused?.(this._pausedEngine.ollama); } catch {}
        try { window._diffuser?.setPaused?.(this._pausedEngine.diffuser); } catch {}
    }

    // ---- Single-entry runner ------------------------------------------------
    async _runEntry(idx) {
        if (!this.currentTheme || !this.entryStates[idx]) return;
        const entry = this.currentTheme.entries[idx];
        const st    = this.entryStates[idx];
        st.status = "run"; st.error = null;
        this._notify({ type: "entry-update", index: idx });

        // ---- 1. Narrative
        st.stages.narrative = "run"; this._notify({ type: "entry-update", index: idx });
        try {
            const text = await this._ollama.generate(narrativePrompt(entry), {
                model:        window.ollama?.model || this._ollama.model,
                num_predict:  200,
                temperature:  0.85,
                timeoutMs:    60000,
                idleTimeoutMs: 30000,
            });
            if (text) { st.results.narrative = text; st.stages.narrative = "ok"; }
            else      { st.stages.narrative = "fail"; }
        } catch (e) {
            st.stages.narrative = "fail";
        }
        this._notify({ type: "entry-update", index: idx });

        // ---- 2. OBJ
        st.stages.obj = "run"; this._notify({ type: "entry-update", index: idx });
        try {
            const obj = await this._ollama.generateOBJ(objPrompt(entry), {
                model:         this._ollama.objModel || "joshuaokolo/C3Dv0:latest",
                timeoutMs:     180000,
                idleTimeoutMs: 60000,
                source:        "roster",
            });
            if (obj) { st.results.obj = obj; st.stages.obj = "ok"; }
            else     { st.stages.obj = "fail"; }
        } catch (e) {
            st.stages.obj = "fail";
        }
        this._notify({ type: "entry-update", index: idx });

        // ---- 3. Texture
        st.stages.texture = "run"; this._notify({ type: "entry-update", index: idx });
        try {
            const res = await this._diffuser.generate(texturePrompt(entry), {
                width: 512, height: 512, steps: 20, cfg: 7.5,
                timeoutMs: 5 * 60 * 1000,
            });
            if (res?.dataUrl) {
                try {
                    const matSet = await materialSetFromDataUrl(res.dataUrl);
                    st.results.texture = matSet;
                    if (matSet?.albedo?.dataUrl) {
                        // Round 177 — registering here triggers the
                        // MaterialSetTextureCache listener which uploads
                        // the parallax textures, and the next render
                        // frame for any entity of this kind picks up
                        // the parallax shader path automatically. No
                        // additional "auto-bind" plumbing needed; the
                        // listener chain from round 174/177 carries it.
                        materialSets.register(entry.entityKind, matSet);
                    }
                    st.stages.texture = "ok";
                } catch (e) {
                    st.results.texture = { albedo: { dataUrl: res.dataUrl } };
                    st.stages.texture = "ok";
                }
            } else {
                st.stages.texture = "fail";
                if (!st.error) st.error = res?.error || "diffuser failed";
            }
        } catch (e) {
            st.stages.texture = "fail";
            if (!st.error) st.error = e?.message || String(e);
        }
        this._notify({ type: "entry-update", index: idx });

        // ---- 4. Trellis (skipped if unavailable)
        if (this.trellisAvailable && st.results.texture?.albedo?.dataUrl) {
            st.stages.trellis = "run"; this._notify({ type: "entry-update", index: idx });
            try {
                const albedoBlob = await (await fetch(st.results.texture.albedo.dataUrl)).blob();
                const glb = await this._comfyui.runImageToGLB(albedoBlob, {
                    resolution: 512, steps: 25, lowVRAM: true,
                    maxWaitMs:  20 * 60 * 1000,
                });
                if (glb?.url) {
                    st.results.trellis = glb;
                    st.stages.trellis = "ok";
                    // Round 178 — auto-swap engine mesh for this kind
                    if (window.assetLoader?.swapMesh) {
                        window.assetLoader.swapMesh(entry.entityKind, glb.url)
                            .catch(err => console.warn(`[RosterRunner] swap failed:`, err.message));
                    }
                } else {
                    st.stages.trellis = "fail";
                }
            } catch (e) {
                st.stages.trellis = "fail";
            }
        } else {
            st.stages.trellis = "skip";
        }
        this._notify({ type: "entry-update", index: idx });

        // Overall status
        const anyOk = ["narrative", "obj", "texture", "trellis"].some(k => st.stages[k] === "ok");
        st.status = anyOk ? "ok" : "fail";
        this._notify({ type: "entry-update", index: idx });
    }

    // ---- Public: re-run a single entry. Marks fail-stages as retried. -------
    async retryEntry(idx) {
        const st = this.entryStates[idx];
        if (!st || this.runActive) return;
        for (const k of ["narrative", "obj", "texture", "trellis"]) {
            if (st.stages[k] === "fail") st.retried[k] = true;
            st.stages[k] = "idle";
        }
        st.status = "idle"; st.error = null;
        this.runActive = true;
        this._ensureClients();
        try { await this._runEntry(idx); }
        finally { this.runActive = false; this._notify({ type: "run-end" }); }
    }

    // ---- Public: run the whole roster sequentially --------------------------
    async runAll() {
        if (this.runActive || !this.currentTheme || this.currentTheme.entries.length === 0) return;
        this.runActive = true;
        this.runStart  = performance.now();
        this._ensureClients();
        this._pauseEngine();
        this._notify({ type: "run-start" });

        // Probe Trellis once at the top so all entries see a consistent flag.
        this.trellisAvailable = await this._comfyui.probe()
            && !!(await this._comfyui.findTrellisNode());
        this._notify({ type: "trellis-probed", available: this.trellisAvailable });

        for (let i = 0; i < this.currentTheme.entries.length; i++) {
            if (!this.runActive) break;   // cancel() flipped the flag
            await this._runEntry(i);
        }

        this.runActive = false;
        this._unpauseEngine();
        this._notify({ type: "run-end" });
    }

    cancel() {
        if (!this.runActive) return;
        this.runActive = false;
        // Pause the clients so any in-flight call aborts. Brief
        // re-unpause so future retries work normally.
        try { this._ollama?.setPaused?.(true);   } catch {}
        try { this._diffuser?.setPaused?.(true); } catch {}
        try { this._comfyui?.setPaused?.(true);  } catch {}
        setTimeout(() => {
            try { this._ollama?.setPaused?.(false);   } catch {}
            try { this._diffuser?.setPaused?.(false); } catch {}
            try { this._comfyui?.setPaused?.(false);  } catch {}
        }, 100);
        this._unpauseEngine();
        this._notify({ type: "run-end" });
    }
}

export const rosterRunner = new RosterRunner();
// Pre-seed the theme so the HUD has something coherent to render even
// if the demo has never been opened. The user can change theme via
// the demo when it opens.
rosterRunner.setTheme("kaiju_classic_foes");
