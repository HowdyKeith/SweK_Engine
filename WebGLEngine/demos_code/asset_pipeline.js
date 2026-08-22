// demos_code/asset_pipeline.js
//
// Round 277 — exercises the .vox import pipeline (TripoSR / cuda_voxelizer
// / MeshToVox). The demo shows the END USER side of the pipeline: a
// panel with controls to (a) upload a .vox file from disk and stamp it
// in front of the camera, (b) request voxelization of a server-side
// mesh path, or (c) generate a built-in test cube/pyramid to confirm
// the .vox parser + importer work without any external tools.
//
// Use this demo to:
//   - Verify the import path is wired correctly (test cube/pyramid)
//   - Test your own .vox files made in MagicaVoxel
//   - Test the bridge voxelizer with a known mesh
//   - Show off the pipeline to someone reviewing the portfolio
//
// The full TripoSR text→voxel chain needs ComfyUI + a configured
// workflow file — call `asset.generateThenImport({workflow})` from the
// console rather than wiring a JSON-editor UI inside the demo.

let panel = null;
let statusEl = null;

// v761 — showcase spin state. After a successful stamp, orbits the camera
// around the model's bbox center for a few seconds so the player can see
// the model from all sides. One spin at a time; new stamp cancels previous.
let _spinHandle = null;
let _spinStopFn = null;

function _stopShowcaseSpin() {
    if (_spinHandle != null) { try { cancelAnimationFrame(_spinHandle); } catch {} _spinHandle = null; }
    if (typeof _spinStopFn === "function") { try { _spinStopFn(); } catch {} _spinStopFn = null; }
}

// Orbit the engine camera around (centerX, centerY, centerZ) at the given
// radius/height for `durationMs`. Speed is a gentle 0.5 rev / 6s by default.
// Saves+restores prior camera state. Cancel anytime via _stopShowcaseSpin().
function _startShowcaseSpin(centerX, centerY, centerZ, radius = 14, height = 6, durationMs = 6000) {
    _stopShowcaseSpin();
    const cam = window._camera;
    if (!cam || !cam.position) { console.warn("[asset_pipeline] no camera for spin"); return; }
    // Snapshot prior camera state to restore on stop
    const snap = {
        x: cam.position.x, y: cam.position.y, z: cam.position.z,
        yaw: cam.yaw, pitch: cam.pitch,
    };
    const startMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
    let cancelled = false;
    _spinStopFn = () => {
        cancelled = true;
        // Restore camera
        try {
            cam.position.x = snap.x; cam.position.y = snap.y; cam.position.z = snap.z;
            if (cam.yaw != null)   cam.yaw   = snap.yaw;
            if (cam.pitch != null) cam.pitch = snap.pitch;
        } catch {}
    };
    const step = () => {
        if (cancelled) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const t = (now - startMs) / durationMs;
        if (t >= 1) { _stopShowcaseSpin(); return; }
        // Angle goes 0 → 2π over duration (one full orbit)
        const angle = t * Math.PI * 2;
        const cx = centerX + Math.sin(angle) * radius;
        const cz = centerZ + Math.cos(angle) * radius;
        // v765 — gentle pitch oscillation. Camera height sweeps a sin wave
        // over the orbit so we get a more cinematic "drone shot" feel
        // rather than a flat horizontal circle. Amplitude is 35% of height
        // to peek up at the model's silhouette near 1/4, then dip below
        // center near 3/4 for a low-angle hero shot.
        const heightOscillation = 1.0 + 0.35 * Math.sin(angle * 2);   // 2 cycles per orbit
        const curHeight = height * heightOscillation;
        // Pitch also oscillates so the lens always points roughly at the
        // model center as the camera bobs. Steeper pitch when high,
        // shallower when low. Range about [-0.45 .. -0.05].
        const curPitch = -0.25 - 0.20 * Math.sin(angle * 2);
        cam.position.x = cx;
        cam.position.y = centerY + curHeight;
        cam.position.z = cz;
        // Look back at center: yaw + π so we face the model
        if (cam.yaw   != null) cam.yaw   = angle + Math.PI;
        if (cam.pitch != null) cam.pitch = curPitch;
        _spinHandle = requestAnimationFrame(step);
    };
    _spinHandle = requestAnimationFrame(step);
    console.log(`[asset_pipeline] showcase spin → center (${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${centerZ.toFixed(1)}) r=${radius}`);
}

// v761 — write a persistent voxel-count + grid-dim result into the .ap-result
// div so it doesn't get overwritten by subsequent status messages. Called
// after every successful stamp/import.
function _setResult(opts = {}) {
    if (!panel) return;
    const el = panel.querySelector(".ap-result");
    if (!el) return;
    el.style.display = "block";
    const stamped = opts.stamped ?? "?";
    const dim     = opts.dim     ?? null;
    const sizeStr = (opts.sizeX != null && opts.sizeY != null && opts.sizeZ != null)
        ? `${opts.sizeX}×${opts.sizeY}×${opts.sizeZ}` : "?";
    const tool    = opts.tool ?? "";
    const ms      = opts.ms ?? null;
    const target  = opts.target ?? "";
    const parts = [];
    parts.push(`<span style="color:#9fb; font-weight:bold;">${stamped}</span> voxels`);
    parts.push(`<span style="color:#789;">model</span> ${sizeStr}`);
    if (dim != null)    parts.push(`<span style="color:#789;">dim</span> ${dim}`);
    if (tool)           parts.push(`<span style="color:#789;">tool</span> ${tool}`);
    if (ms != null)     parts.push(`<span style="color:#789;">${ms}ms</span>`);
    if (target)         parts.push(`<span style="color:#789;">@</span> ${target}`);
    el.innerHTML = parts.join(" · ");
}

function makePanel() {
    if (panel) return;
    const p = document.createElement("div");
    p.className = "demo-overlay";
    Object.assign(p.style, {
        position: "fixed", top: "12px", left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(8, 16, 24, 0.94)",
        border: "1px solid #4a8",
        borderRadius: "6px",
        padding: "12px 16px",
        font: "12px monospace",
        color: "#cfd",
        zIndex: 9000,
        minWidth: "520px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.55)",
    });
    p.innerHTML = `
        <div style="font-size:14px; color:#4ec; margin-bottom:8px; text-align:center;">ASSET PIPELINE — image → mesh → voxel</div>
        <div class="ap-tool-status" style="font-size:11px; color:#789; margin-bottom:8px; padding:6px 8px; background:#0a1014; border-radius:4px; font-family:monospace;">probing tools…</div>
        <div style="margin-bottom:8px; color:#9c9; font-size:11px; line-height:1.5;">
            Paths: <b>(A)</b> built-in pyramid — no tools. <b>(B)</b> upload a .vox. <b>(C)</b> voxelize .obj.
            <b>(D)</b> single image → mesh via picked tool. <b>(E)</b> race ALL configured tools in parallel.
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="ap-stamp-test"  style="flex:1; min-width:120px; background:#062; color:#cef; border:1px solid #0a6; padding:8px; font:11px monospace; cursor:pointer; border-radius:3px;">(A) STAMP TEST</button>
            <button class="ap-upload"      style="flex:1; min-width:120px; background:#358; color:#cef; border:1px solid #58a; padding:8px; font:11px monospace; cursor:pointer; border-radius:3px;">(B) UPLOAD .vox</button>
            <button class="ap-upload-mesh" style="flex:1; min-width:120px; background:#642; color:#fc8; border:1px solid #a64; padding:8px; font:11px monospace; cursor:pointer; border-radius:3px;">(C) UPLOAD .obj</button>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            <select class="ap-gen-tool" style="background:#001; color:#cef; border:1px solid #234; padding:6px; font:11px monospace; min-width:140px;">
                <option value="">— pick tool —</option>
            </select>
            <button class="ap-gen-mesh"  style="flex:1; min-width:120px; background:#446; color:#cef; border:1px solid #66a; padding:8px; font:11px monospace; cursor:pointer; border-radius:3px;">(D) IMAGE → MESH</button>
            <button class="ap-race-gens" style="flex:1; min-width:120px; background:#624; color:#fbc; border:1px solid #a48; padding:8px; font:11px monospace; cursor:pointer; border-radius:3px;">(E) RACE ALL</button>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            <select class="ap-spec-primary" style="background:#001; color:#cef; border:1px solid #234; padding:6px; font:11px monospace; min-width:120px;" title="Heavy, slow, high quality"><option value="">primary…</option></select>
            <select class="ap-spec-fallback" style="background:#001; color:#cef; border:1px solid #234; padding:6px; font:11px monospace; min-width:120px;" title="Fast, lightweight, lower quality"><option value="">fallback…</option></select>
            <button class="ap-spec-go" style="flex:1; min-width:120px; background:#525; color:#fcf; border:1px solid #a4a; padding:8px; font:11px monospace; cursor:pointer; border-radius:3px;" title="Fast fallback runs in parallel; you see SOMETHING quickly, then it's upgraded when the primary finishes">(F) SPECULATIVE</button>
        </div>
        <div style="margin-top:6px; display:flex; gap:6px; align-items:center; font-size:10px; color:#789;">
            <label style="cursor:pointer;"><input type="checkbox" class="ap-solid" /> solid fill</label>
            <label style="cursor:pointer;">dim <input type="number" class="ap-dim" value="128" min="16" max="512" step="16" style="width:60px; background:#001; color:#cef; border:1px solid #234; padding:2px 4px;" /></label>
            <label style="cursor:pointer;"><input type="checkbox" class="ap-async" checked /> async stamp</label>
            <label style="cursor:pointer;" title="Hole-fill + Laplacian smooth + recompute normals before voxelize"><input type="checkbox" class="ap-postproc" checked /> postprocess</label>
            <label style="cursor:pointer;" title="Use engine's idle scheduler (CPU yield-friendly) instead of bridge"><input type="checkbox" class="ap-via-idle" /> via idle scheduler</label>
            <label style="cursor:pointer;" title="v761 — after stamp, orbit the camera around the model for ~6s so you can see all sides"><input type="checkbox" class="ap-spin" checked /> spin showcase</label>
            <span style="color:#566; font-size:9px; margin-left:auto;">honest workers: see docs/asset-pipeline-workers.md</span>
        </div>
        <div class="ap-status" style="margin-top:8px; color:#9ef; min-height:18px; font-size:11px;">ready — pick a path</div>
        <div class="ap-result" style="margin-top:6px; padding:6px 8px; background:#0a1014; border-radius:4px; font:11px monospace; color:#7bf; min-height:16px; display:none;">awaiting first stamp…</div>
    `;
    document.body.appendChild(p);
    panel = p;
    statusEl = p.querySelector(".ap-status");

    p.querySelector(".ap-stamp-test").addEventListener("click",  stampTest);
    p.querySelector(".ap-upload").addEventListener("click",      uploadVox);
    p.querySelector(".ap-upload-mesh").addEventListener("click", uploadMesh);
    p.querySelector(".ap-gen-mesh").addEventListener("click",    generateMesh);
    p.querySelector(".ap-race-gens").addEventListener("click",   raceGenerators);
    p.querySelector(".ap-spec-go").addEventListener("click",     speculativeGenerate);

    // Probe tool status once when the panel opens. The bridge caches
    // the result so repeated opens are cheap.
    refreshToolStatus();
}

async function refreshToolStatus() {
    if (!panel) return;
    const el = panel.querySelector(".ap-tool-status");
    if (!el) return;
    try {
        const r = await fetch("/asset-pipeline/status");
        const j = await r.json();
        const cuda = j.cuda_voxelizer.found
            ? `<span style="color:#9f9">✓ cuda_voxelizer v${j.cuda_voxelizer.version}</span>`
            : `<span style="color:#f99">✗ cuda_voxelizer</span>`;
        const m2v = j.mesh_to_vox.found
            ? `<span style="color:#9f9">✓ mesh_to_vox v${j.mesh_to_vox.version}</span>`
            : `<span style="color:#f99">✗ mesh_to_vox</span>`;
        // Round 281 — mesh generator status line
        const genEntries = Object.entries(j.meshGenerators ?? {});
        const genLine = genEntries.length
            ? genEntries.map(([name, g]) => g.found
                ? `<span style="color:#9f9">✓${name}</span>`
                : `<span style="color:#888">✗${name}</span>`).join(" ")
            : `<span style="color:#666">(no generators configured)</span>`;
        const usLine = j.ultrashape?.found
            ? `<span style="color:#9f9">✓ultrashape</span>`
            : `<span style="color:#888">✗ultrashape</span>`;
        el.innerHTML = [
            `${cuda} &nbsp;·&nbsp; ${m2v} &nbsp;·&nbsp; <span style="color:#789">comfy: ${j.comfyUrl}</span>`,
            `<div style="margin-top:3px;">gens: ${genLine} &nbsp;·&nbsp; refine: ${usLine}</div>`,
        ].join("");
        // Populate the generator dropdown with all found tools
        const sel = panel.querySelector(".ap-gen-tool");
        if (sel) {
            const prevValue = sel.value;
            sel.innerHTML = '<option value="">— pick tool —</option>' +
                genEntries.filter(([, g]) => g.found)
                    .map(([name]) => `<option value="${name}">${name}</option>`).join("");
            if (prevValue) sel.value = prevValue;
        }
        // Round 284 — populate the primary/fallback dropdowns for
        // speculative generation
        const foundNames = genEntries.filter(([, g]) => g.found).map(([n]) => n);
        for (const cls of ["ap-spec-primary", "ap-spec-fallback"]) {
            const el = panel.querySelector("." + cls);
            if (!el) continue;
            const prev = el.value;
            // Smart defaults: primary = first heavy tool (hunyuan3d > unique3d)
            // fallback = first fast tool (instantmesh > crm)
            const heavyOrder = ["hunyuan3d", "unique3d", "instantmesh", "crm"];
            const fastOrder  = ["instantmesh", "crm", "unique3d", "hunyuan3d"];
            const order = cls.endsWith("primary") ? heavyOrder : fastOrder;
            const placeholder = cls.endsWith("primary") ? "primary…" : "fallback…";
            el.innerHTML = `<option value="">${placeholder}</option>` +
                foundNames.map((n) => `<option value="${n}">${n}</option>`).join("");
            if (prev && foundNames.includes(prev)) {
                el.value = prev;
            } else {
                for (const candidate of order) {
                    if (foundNames.includes(candidate)) { el.value = candidate; break; }
                }
            }
        }
        // Disable buttons that require missing tools
        const meshBtn = panel.querySelector(".ap-upload-mesh");
        if (meshBtn) {
            const haveVox = j.cuda_voxelizer.found || j.mesh_to_vox.found;
            meshBtn.disabled = !haveVox;
            meshBtn.title = haveVox ? "" : "No voxelizer found. Set cudaVoxelizerExe in asset-pipeline-config.json";
            meshBtn.style.opacity = haveVox ? "" : "0.4";
            meshBtn.style.cursor  = haveVox ? "pointer" : "not-allowed";
        }
        const hasAnyGen = genEntries.some(([, g]) => g.found);
        const genBtn = panel.querySelector(".ap-gen-mesh");
        if (genBtn) {
            genBtn.disabled = !hasAnyGen;
            genBtn.title = hasAnyGen ? "" : "No mesh generators configured. Set meshGenerators.<tool>.repoDir in asset-pipeline-config.json";
            genBtn.style.opacity = hasAnyGen ? "" : "0.4";
            genBtn.style.cursor  = hasAnyGen ? "pointer" : "not-allowed";
        }
        const raceBtn = panel.querySelector(".ap-race-gens");
        if (raceBtn) {
            raceBtn.disabled = !hasAnyGen;
            raceBtn.style.opacity = hasAnyGen ? "" : "0.4";
            raceBtn.style.cursor  = hasAnyGen ? "pointer" : "not-allowed";
        }
        // Round 284 — speculative needs at least 2 distinct generators
        const specBtn = panel.querySelector(".ap-spec-go");
        if (specBtn) {
            const haveTwo = foundNames.length >= 2;
            specBtn.disabled = !haveTwo;
            specBtn.title = haveTwo
                ? "Fast fallback runs in parallel; you see SOMETHING quickly, then it's upgraded when the primary finishes"
                : "Need at least 2 configured mesh generators (one slow, one fast)";
            specBtn.style.opacity = haveTwo ? "" : "0.4";
            specBtn.style.cursor  = haveTwo ? "pointer" : "not-allowed";
        }
    } catch (e) {
        el.innerHTML = `<span style="color:#f99">bridge unreachable — start ai-bridge/server.js</span>`;
    }
}

// Round 281 — single image → mesh via the picked tool. Uses the
// generator dropdown's current selection; uploads the picked image
// via octet-stream so we don't need the user to drop the file
// somewhere on the server first.
async function generateMesh() {
    const sel  = panel?.querySelector(".ap-gen-tool");
    const tool = sel?.value || "";
    if (!tool) { setStatus("pick a generator from the dropdown first", "#fc8"); return; }
    setStatus(`pick an image for ${tool}…`);
    _clearResultPanel();
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp";
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) { setStatus("cancelled"); return; }
        setStatus(`running ${tool} on ${file.name}… (this can take minutes on cold start)`, "#9ef");
        const buf = await file.arrayBuffer();
        try {
            const r = await fetch(`/asset-pipeline/generate-mesh?tool=${encodeURIComponent(tool)}`, {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: buf,
            });
            const j = await r.json();
            if (!j.ok) {
                setStatus(`${tool} failed: ${j.error}`, "#f99");
                console.warn(`[${tool}]`, j.stderr ?? "");
                return;
            }
            let meshPath = j.meshPath;
            let qcStats = { verts: null, triangles: null, fileBytes: null };
            // Round 283 — fetch and quickly measure the raw mesh for
            // QC badges. Cheap on small meshes (1-50K verts).
            try {
                // v3103 -- A RESPONSE BODY READ WITHOUT CONSULTING .ok RETURNS THE ERROR PAGE AS DATA. A 404 on this
                // URL used to arrive here as an HTML document and go straight into the mesh parser: the fetch
                // resolved, nothing threw, and the parser got markup. Same bug v3054 fixed for downloads, in a
                // different filename. Refuse with the status, which is the fact the caller needs.
                const _r = await fetch(j.meshUrl);
                if (!_r.ok) throw new Error("mesh fetch failed: HTTP " + _r.status + " for " + j.meshUrl);
                const meshText = await _r.text();
                let verts = 0, tris = 0;
                for (const line of meshText.split(/\r?\n/)) {
                    if (!line) continue;
                    const c0 = line.charCodeAt(0);
                    if (c0 === 118 && (line[1] === " " || line[1] === "\t")) verts++;
                    else if (c0 === 102 && (line[1] === " " || line[1] === "\t")) {
                        const refs = line.trim().split(/\s+/).length - 1;
                        if (refs >= 3) tris += refs - 2;
                    }
                }
                qcStats = { verts, triangles: tris, fileBytes: meshText.length };
                _showQcBadges({ ...qcStats, processed: false });
                // Round 283 — drop in an OffscreenCanvas thumbnail so
                // the user can SEE the generated mesh before voxelize.
                _showThumbnail(meshText);
            } catch {}
            // Round 282 — post-process if enabled and output is .obj
            const usePostproc = !!panel?.querySelector(".ap-postproc")?.checked;
            const viaIdle     = !!panel?.querySelector(".ap-via-idle")?.checked;
            if (usePostproc && meshPath?.toLowerCase().endsWith(".obj")) {
                setStatus(`${tool} → ${j.meshUrl} (${j.durationMs}ms) — postprocessing${viaIdle?" via idle scheduler":""}…`, "#9ef");
                const pp = viaIdle
                    ? await window.asset.postprocessOnIdle(j.meshUrl)
                    : await window.asset.postprocessMesh(meshPath);
                if (pp?.ok) {
                    meshPath = pp.meshPath;
                    setStatus(`postproc done (${pp.beforeVerts}→${pp.afterVerts} verts, +${pp.addedTriangles} hole tris) — voxelizing…`, "#9ef");
                    // Round 283 — show the postprocess QC badges
                    _showQcBadges({
                        verts:        pp.afterVerts,
                        triangles:    pp.afterTris,
                        addedTris:    pp.addedTriangles,
                        unfilledHoles: pp.unfilledHoles,
                        smoothIters:  pp.smoothIterations,
                        normals:      true,
                        durationMs:   pp.durationMs,
                        processed:    true,
                    });
                } else {
                    setStatus(`postproc failed: ${pp?.error ?? "?"} — voxelizing raw…`, "#fc8");
                }
            } else {
                setStatus(`${tool} → ${j.meshUrl} in ${j.durationMs}ms — voxelizing…`, "#9ef");
            }
            const dim = parseInt(panel?.querySelector(".ap-dim")?.value ?? "128", 10);
            const solid = !!panel?.querySelector(".ap-solid")?.checked;
            const voxR = await fetch(`/asset-pipeline/voxelize-mesh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meshPath, dim, solid }),
            });
            const voxJ = await voxR.json();
            if (!voxJ.ok) { setStatus(`voxelize failed: ${voxJ.error}`, "#f99"); return; }
            const useAsync = !!panel?.querySelector(".ap-async")?.checked;
            const imp = useAsync
                ? await window.asset.importAsync(voxJ.voxUrl)
                : await window.asset.import(voxJ.voxUrl);
            setStatus(`done — ${tool}${usePostproc?" → postproc":""} → ${voxJ.tool} → ${imp?.stamped ?? 0} voxels in world`, "#9fb");
            // v761 — persistent display + showcase spin
            _setResult({
                stamped: imp?.stamped ?? 0,
                sizeX: imp?.model?.sizeX, sizeY: imp?.model?.sizeY, sizeZ: imp?.model?.sizeZ,
                dim, tool: `${tool} → ${voxJ.tool}`, ms: j.durationMs,
            });
            const wantSpin = panel?.querySelector(".ap-spin")?.checked;
            if (wantSpin && imp?.model) {
                // Approximate center from camera position 12u ahead (matches importer convention)
                const c = window._camera;
                const yaw = c?.yaw ?? 0;
                const cx = c ? Math.floor(c.position.x + Math.sin(yaw) * 12) : 0;
                const cz = c ? Math.floor(c.position.z + Math.cos(yaw) * 12) : 0;
                const cy = (window.world?._heightAt?.(cx, cz) ?? 0) + 1;
                const sx = imp.model.sizeX ?? 16;
                const sy = imp.model.sizeY ?? 16;
                const sz = imp.model.sizeZ ?? 16;
                const radius = Math.max(sx, sy, sz) * 1.6 + 4;
                _startShowcaseSpin(cx + sx / 2, cy + sz / 2, cz + sy / 2, radius, radius * 0.35);
            }
        } catch (e) {
            setStatus(`error: ${e?.message ?? e}`, "#f99");
        }
    });
    fileInput.click();
}

// Round 281 — race ALL configured generators on the same image in
// PARALLEL. This is the honest answer to "are we using our workers":
// at the bridge level each generator runs in its own subprocess, and
// Node's event loop async-juggles them. CPU isn't the bottleneck;
// GPU VRAM is. The result UI shows which tool was fastest and which
// failed (e.g. CUDA OOM on a Pascal card running 4 models at once).
async function raceGenerators() {
    setStatus("pick an image to race all generators on…");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp";
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) { setStatus("cancelled"); return; }
        // Race endpoint wants imageDataUrl. Convert.
        const reader = new FileReader();
        reader.onload = async () => {
            setStatus("racing all configured generators in parallel…", "#fbc");
            try {
                const r = await fetch("/asset-pipeline/race-generators", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageDataUrl: reader.result }),
                });
                const j = await r.json();
                if (!j.ok) {
                    setStatus(`race failed: ${j.error ?? "no winner"}`, "#f99");
                    return;
                }
                const lines = [];
                for (const [name, run] of Object.entries(j.results)) {
                    if (run.ok) lines.push(`✓ ${name} ${run.durationMs}ms`);
                    else        lines.push(`✗ ${name}`);
                }
                const winner = j.winner ? ` — winner: ${j.winner.tool} (${j.winner.durationMs}ms)` : "";
                setStatus(`${j.attempted.length} raced in ${j.durationMs}ms: ${lines.join(" · ")}${winner}`, "#9fb");
            } catch (e) {
                setStatus(`error: ${e?.message ?? e}`, "#f99");
            }
        };
        reader.readAsDataURL(file);
    });
    fileInput.click();
}

// Round 284 — speculative parallel fallback. Fires SLOW primary + FAST
// fallback in parallel; fallback's thumbnail+badges appear with a
// "PROVISIONAL" stamp as soon as it returns; primary supersedes when
// it lands. Honest framing: this is two parallel GPU subprocesses
// fighting for VRAM — on a Pascal card running Hunyuan3D + InstantMesh
// concurrently you may hit OOM. Pick a light fallback (CRM or
// InstantMesh) when the primary is heavy.
async function speculativeGenerate() {
    const pri = panel?.querySelector(".ap-spec-primary")?.value || "";
    const fbk = panel?.querySelector(".ap-spec-fallback")?.value || "";
    if (!pri || !fbk) { setStatus("pick both primary and fallback first", "#fc8"); return; }
    if (pri === fbk)  { setStatus("primary and fallback must differ", "#fc8"); return; }
    setStatus(`pick an image for speculative gen (${fbk} fast + ${pri} slow)…`);
    _clearResultPanel();
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp";
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) { setStatus("cancelled"); return; }
        const buf = await file.arrayBuffer();

        setStatus(`racing ${fbk} (fast) || ${pri} (slow) in parallel…`, "#fcf");

        // Both POSTs go out simultaneously — Node bridge spawns two
        // child Python processes that share the GPU. Whichever
        // finishes first triggers onPartial; primary's success
        // triggers onFinal.
        const t0 = performance.now();
        let partialFired = false;

        // Shared mesh-preview update + QC badges helper
        async function _showResult(j, role, toolName) {
            try {
                // v3103 -- A RESPONSE BODY READ WITHOUT CONSULTING .ok RETURNS THE ERROR PAGE AS DATA. A 404 on this
                // URL used to arrive here as an HTML document and go straight into the mesh parser: the fetch
                // resolved, nothing threw, and the parser got markup. Same bug v3054 fixed for downloads, in a
                // different filename. Refuse with the status, which is the fact the caller needs.
                const _r = await fetch(j.meshUrl);
                if (!_r.ok) throw new Error("mesh fetch failed: HTTP " + _r.status + " for " + j.meshUrl);
                const text = await _r.text();
                _showThumbnail(text);
                let v = 0, tr = 0;
                for (const line of text.split(/\r?\n/)) {
                    if (!line) continue;
                    const c0 = line.charCodeAt(0);
                    if (c0 === 118 && (line[1] === " " || line[1] === "\t")) v++;
                    else if (c0 === 102 && (line[1] === " " || line[1] === "\t")) {
                        const refs = line.trim().split(/\s+/).length - 1;
                        if (refs >= 3) tr += refs - 2;
                    }
                }
                _showQcBadges({
                    verts: v, triangles: tr, fileBytes: text.length,
                    warning: role === "provisional" ? `PROVISIONAL — ${toolName}` : null,
                });
            } catch {}
        }

        const fastP = fetch("/asset-pipeline/generate-mesh?tool=" + encodeURIComponent(fbk), {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: buf,
        }).then(r => r.json()).then(async (j) => {
            const dt = Math.round(performance.now() - t0);
            if (j?.ok && !partialFired) {
                partialFired = true;
                setStatus(`${fbk} (fast) provisional ready in ${dt}ms — waiting on ${pri}…`, "#fcf");
                await _showResult(j, "provisional", fbk);
            } else if (!j?.ok) {
                console.warn(`[speculative] fallback ${fbk} failed:`, j?.error);
            }
            return j;
        });

        const slowP = fetch("/asset-pipeline/generate-mesh?tool=" + encodeURIComponent(pri), {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: buf,
        }).then(r => r.json()).then(async (j) => {
            const dt = Math.round(performance.now() - t0);
            if (j?.ok) {
                if (!partialFired) {
                    partialFired = true;
                    setStatus(`${pri} (primary) beat fallback in ${dt}ms`, "#9fb");
                } else {
                    setStatus(`${pri} (final) ready in ${dt}ms — upgrading preview`, "#9fb");
                }
                await _showResult(j, "final", pri);
            } else {
                setStatus(`${pri} failed: ${j.error ?? "?"} — provisional from ${fbk} remains`, "#fc8");
            }
            return j;
        });

        await Promise.allSettled([fastP, slowP]);
    });
    fileInput.click();
}

function setStatus(msg, color = "#9ef") {
    if (statusEl) {
        statusEl.style.color = color;
        statusEl.textContent = msg;
    }
}

// Round 283 — result panel: surfaces QC badges + a live OffscreenCanvas
// thumbnail beside the demo's status bar so the user sees what came
// out of each pipeline stage as it happens. Reused across runs (cleared
// at the start of each generation).
let _resultPanel  = null;
let _resultThumb  = null;     // dispose handle of the current thumbnail
function _ensureResultPanel() {
    if (_resultPanel) return _resultPanel;
    if (!panel) return null;
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:8px; padding-top:8px; border-top:1px solid #234; display:none;";
    wrap.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
            <div class="ap-result-thumb" style="flex:0 0 128px;"></div>
            <div class="ap-result-stats" style="flex:1; min-width:0; display:flex; flex-direction:column; gap:4px;"></div>
        </div>`;
    panel.appendChild(wrap);
    _resultPanel = wrap;
    return wrap;
}
async function _showQcBadges(stats) {
    const root = _ensureResultPanel();
    if (!root) return;
    root.style.display = "block";
    const statsHost = root.querySelector(".ap-result-stats");
    if (!statsHost) return;
    try {
        const { createMeshQcBadges } = await import("../ui/MeshQcBadges.js");
        const badges = createMeshQcBadges(stats);
        // Stamp the badges with their stage so consecutive rows
        // (gen → postproc) both stay visible.
        if (stats.processed) badges.dataset.stage = "postproc";
        else                  badges.dataset.stage = "raw";
        // Replace same-stage row, append otherwise.
        const existing = statsHost.querySelector(`[data-stage="${badges.dataset.stage}"]`);
        if (existing) existing.replaceWith(badges);
        else          statsHost.appendChild(badges);
    } catch (e) {
        console.warn("[asset_pipeline demo] QC badge load failed:", e?.message ?? e);
    }
}
async function _showThumbnail(objText) {
    const root = _ensureResultPanel();
    if (!root) return;
    root.style.display = "block";
    const thumbHost = root.querySelector(".ap-result-thumb");
    if (!thumbHost) return;
    // Dispose previous thumbnail before swapping in the new one (each
    // thumbnail owns a worker; leaking would pile up worker threads).
    if (_resultThumb?.dispose) {
        try { _resultThumb.dispose(); } catch {}
        _resultThumb = null;
    }
    try {
        const { createObjThumbnail } = await import("../ui/objThumbnail.js");
        _resultThumb = createObjThumbnail(objText, { width: 128, height: 128 });
        thumbHost.replaceChildren(_resultThumb.element);
    } catch (e) {
        console.warn("[asset_pipeline demo] thumbnail load failed:", e?.message ?? e);
    }
}
function _clearResultPanel() {
    if (!_resultPanel) return;
    if (_resultThumb?.dispose) {
        try { _resultThumb.dispose(); } catch {}
        _resultThumb = null;
    }
    _resultPanel.style.display = "none";
    const s = _resultPanel.querySelector(".ap-result-stats");
    if (s) s.replaceChildren();
    const t = _resultPanel.querySelector(".ap-result-thumb");
    if (t) t.replaceChildren();
}

// Build a small in-memory .vox-like structure and run it through the
// importer. Useful as a smoke test — proves the engine half of the
// pipeline works without any external dependencies.
async function stampTest(ctx) {
    setStatus("building test pyramid (32×32×32, 4 colors)…");
    const SIZE = 32;
    const voxels = [];
    // Pyramid: y rises, x/z layer shrinks from center
    for (let y = 0; y < SIZE; y++) {
        const inset = Math.floor(y / 2);
        for (let x = inset; x < SIZE - inset; x++) {
            for (let z = inset; z < SIZE - inset; z++) {
                // Use 4 distinct color indices for visual variety
                const c = (((x + z) >> 2) & 1) === 0
                    ? (y < SIZE / 2 ? 1 : 2)
                    : (y < SIZE / 2 ? 3 : 4);
                voxels.push({ x, y: z, z: y, c });   // MagicaVoxel convention (Y=depth, Z=up)
            }
        }
    }
    // Faux parsed-vox shape
    const fakeParsed = {
        ok: true,
        version: 150,
        models: [{ sizeX: SIZE, sizeY: SIZE, sizeZ: SIZE, voxels }],
        palette: [
            [0, 0, 0, 0],            // 0 — empty
            [200,  60,  60, 255],    // 1 — red (→ DIRT)
            [ 60, 200,  60, 255],    // 2 — green (→ GRASS)
            [ 60, 100, 220, 255],    // 3 — blue (→ WATER)
            [240, 240, 240, 255],    // 4 — white (→ SNOW)
        ],
    };
    const { VoxImporter } = await import("../tools/voxImporter.js");
    const imp = new VoxImporter(window.world ?? null);
    // Place 12 ahead of camera at ground level
    const c = window._camera;
    const yaw = c?.yaw ?? 0;
    const x = c ? Math.floor(c.position.x + Math.sin(yaw) * 12) : 0;
    const z = c ? Math.floor(c.position.z + Math.cos(yaw) * 12) : 0;
    const groundY = (window.world?._heightAt?.(x, z) ?? 0) + 1;
    const r = imp.stamp(fakeParsed, { x, y: groundY, z });
    setStatus(`stamped ${r.stamped} voxels at (${x}, ${groundY}, ${z}) — walk forward to see`, "#9fb");
    // v761 — persistent voxel-count display + showcase spin
    _setResult({ stamped: r.stamped, sizeX: SIZE, sizeY: SIZE, sizeZ: SIZE, tool: "pyramid", target: `(${x},${groundY},${z})` });
    const wantSpin = panel?.querySelector(".ap-spin")?.checked;
    if (wantSpin) {
        // Pyramid base is at (x, groundY, z) with size SIZE — bbox center
        _startShowcaseSpin(x + SIZE / 2, groundY + SIZE / 2, z + SIZE / 2, SIZE * 0.9, SIZE * 0.35);
    }
    try { ctx.kpop?.info?.("Asset pipeline", `Test pyramid placed at (${x}, ${groundY}, ${z})`); } catch {}
}

async function uploadVox() {
    setStatus("waiting for file pick…");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".vox";
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) { setStatus("cancelled"); return; }
        setStatus(`parsing ${file.name} (${(file.size / 1024).toFixed(1)} KB)…`);
        try {
            const buf = await file.arrayBuffer();
            const { parseVox } = await import("../tools/voxParser.js");
            const { VoxImporter } = await import("../tools/voxImporter.js");
            const parsed = parseVox(buf);
            if (!parsed.ok) { setStatus(`parse failed: ${parsed.error}`, "#f99"); return; }
            const m = parsed.models[0];
            setStatus(`parsed ${parsed.models.length} model(s), first is ${m.sizeX}×${m.sizeY}×${m.sizeZ} (${m.voxels.length} voxels) — stamping…`);
            const imp = new VoxImporter(window.world);
            const c = window._camera;
            const yaw = c?.yaw ?? 0;
            const x = c ? Math.floor(c.position.x + Math.sin(yaw) * 12) : 0;
            const z = c ? Math.floor(c.position.z + Math.cos(yaw) * 12) : 0;
            const groundY = (window.world?._heightAt?.(x, z) ?? 0) + 1;
            const r = imp.stamp(parsed, { x, y: groundY, z });
            setStatus(`stamped ${r.stamped} voxels — walk forward to see your model`, "#9fb");
            // v761 — persistent display + showcase spin
            _setResult({ stamped: r.stamped, sizeX: m.sizeX, sizeY: m.sizeY, sizeZ: m.sizeZ, tool: "vox upload", target: `(${x},${groundY},${z})` });
            const wantSpin = panel?.querySelector(".ap-spin")?.checked;
            if (wantSpin) {
                // MagicaVoxel convention: stamp uses Z=up; bbox half = sizeZ/2
                const halfX = m.sizeX / 2, halfZ = m.sizeY / 2, halfY = m.sizeZ / 2;
                const radius = Math.max(halfX, halfZ, halfY) * 1.6 + 4;
                _startShowcaseSpin(x + halfX, groundY + halfY, z + halfZ, radius, radius * 0.35);
            }
        } catch (e) {
            setStatus("error: " + (e?.message ?? e), "#f99");
        }
    });
    input.click();
}

async function uploadMesh() {
    setStatus("waiting for .obj or .glb file…");
    if (!window.asset?.voxelizeUpload) {
        setStatus("asset.voxelizeUpload missing — was main.js wired?", "#f99");
        return;
    }
    const dimEl   = panel?.querySelector(".ap-dim");
    const solidEl = panel?.querySelector(".ap-solid");
    const dim   = Math.max(16, Math.min(512, parseInt(dimEl?.value, 10) || 128));
    const solid = !!solidEl?.checked;
    const result = await window.asset.voxelizeUpload(dim, solid);
    if (!result?.ok) {
        setStatus(`voxelize failed: ${result?.error ?? "no result"} ${result?.hint ?? ""}`, "#f99");
        return;
    }
    setStatus(`voxelized via ${result.tool}${result.solid?" (solid)":""} in ${result.durationMs}ms → importing…`, "#9ef");
    const r = await window.asset.import(result.voxUrl);
    if (!r) { setStatus("import failed (see console)", "#f99"); return; }
    setStatus(`done — ${r.stamped} voxels stamped from ${r.model.sizeX}³ grid`, "#9fb");
    // v761 — persistent display + showcase spin
    _setResult({
        stamped: r.stamped,
        sizeX: r.model?.sizeX, sizeY: r.model?.sizeY, sizeZ: r.model?.sizeZ,
        dim, tool: result.tool, ms: result.durationMs,
    });
    const wantSpin = panel?.querySelector(".ap-spin")?.checked;
    if (wantSpin) {
        // window.asset.import doesn't return stamp coords directly. Use camera
        // position 12u ahead (same convention as uploadVox) as the approximate
        // model center, with bbox half from the model dimensions.
        const c = window._camera;
        const yaw = c?.yaw ?? 0;
        const cx = c ? Math.floor(c.position.x + Math.sin(yaw) * 12) : 0;
        const cz = c ? Math.floor(c.position.z + Math.cos(yaw) * 12) : 0;
        const cy = (window.world?._heightAt?.(cx, cz) ?? 0) + 1;
        const sx = r.model?.sizeX ?? 16;
        const sy = r.model?.sizeY ?? 16;
        const sz = r.model?.sizeZ ?? 16;
        const radius = Math.max(sx, sy, sz) * 1.6 + 4;
        _startShowcaseSpin(cx + sx / 2, cy + sz / 2, cz + sy / 2, radius, radius * 0.35);
    }
}

export default {
    id:    "asset_pipeline",
    label: "ASSET PIPELINE",
    hint:  "TripoSR / cuda_voxelizer / .vox import — three test paths",
    controls: [
        "(A) STAMP TEST — built-in pyramid, no external tools",
        "(B) UPLOAD .vox — local parse + import, works with any MagicaVoxel file",
        "(C) UPLOAD .obj — server-side voxelize via configured tools",
    ],

    start(ctx) {
        makePanel();
        try { ctx.kpop?.info?.("Asset pipeline", "Pick a path in the top panel"); } catch {}
    },

    stop(ctx) {
        if (panel) { panel.remove(); panel = null; }
        statusEl = null;
        // Round 283 — dispose the thumbnail worker if one is alive
        if (_resultThumb?.dispose) {
            try { _resultThumb.dispose(); } catch {}
            _resultThumb = null;
        }
        _resultPanel = null;
        // v761 — cancel showcase spin so camera is restored if user exits mid-orbit
        _stopShowcaseSpin();
    },

    tick() {},
};
