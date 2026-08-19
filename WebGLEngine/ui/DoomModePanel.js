// =============================================================
// FILE: ui/DoomModePanel.js
// ROUND: 397
// =============================================================
//
// Doom-mode control panel. One-stop UI for the WAD pipeline shipped
// across v365-v396: load a WAD file, pick a map, choose which Doom
// features to enable (PLAYPAL swap, sector light tint, sprite
// billboards, animated textures), hit "Voxelize", see the result.
//
// LIFECYCLE:
//   1. Auto-discover /wads/*.wad on mount via fetch (if the engine
//      is served from a directory listing-capable server) OR fall
//      back to the manual "Load WAD file" file picker.
//   2. User picks WAD → parser runs, map dropdown populates.
//   3. User picks map + toggles options → "Voxelize" button enables.
//   4. Click "Voxelize" → wires up palette materials, builds the
//      texture lookup, registers sprites, voxelizes the map, spawns
//      billboards from THINGS, binds the animator. Status updates
//      as each step completes.
//
// The panel is mounted as a right-edge minitab labeled "DOOM" using
// the existing LCARSMiniTab infrastructure (round 79). Hover shows
// the controls; click drills into the WAD list.

import { createMiniTab } from "./LCARSMiniTab.js";

export function mountDoomModePanel() {
    // Build the panel DOM
    const panel = document.createElement("div");
    panel.className = "lcars-panel doom-mode-panel";
    panel.style.cssText = `
        position: fixed; right: 40px; top: 80px;
        width: 320px; padding: 12px;
        background: #0a0a0a; color: #ffaa00;
        font-family: 'Antonio', sans-serif; font-size: 13px;
        border: 2px solid #ffaa00; border-radius: 6px;
        z-index: 10000; display: none;
    `;
    document.body.appendChild(panel);

    panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px;">DOOM MODE</div>
        <div style="margin-bottom: 8px;">
            <label>WAD file:</label>
            <select id="doom-wad-select" style="width: 100%; background: #222; color: #ffaa00; border: 1px solid #ffaa00;">
                <option value="">-- pick a WAD --</option>
            </select>
            <input type="file" id="doom-wad-file" accept=".wad" style="margin-top: 4px; color: #ffaa00; font-size: 11px;" />
        </div>
        <div style="margin-bottom: 8px;">
            <label>Map:</label>
            <select id="doom-map-select" style="width: 100%; background: #222; color: #ffaa00; border: 1px solid #ffaa00;" disabled>
                <option value="">-- load a WAD first --</option>
            </select>
        </div>
        <div style="margin-bottom: 8px; font-size: 12px;">
            <div><label><input type="checkbox" id="doom-opt-palette" checked /> PLAYPAL swap</label></div>
            <div><label><input type="checkbox" id="doom-opt-light" checked /> Sector light tint</label></div>
            <div><label><input type="checkbox" id="doom-opt-sprites" checked /> Spawn sprite billboards</label></div>
            <div><label><input type="checkbox" id="doom-opt-animate" checked /> Animated textures</label></div>
            <div><label><input type="checkbox" id="doom-opt-walls" /> Wall texture atlas (v400)</label></div>
            <div><label><input type="checkbox" id="doom-opt-effects" /> Sector effects (v399)</label></div>
        </div>
        <button id="doom-voxelize" disabled style="
            width: 100%; padding: 8px; background: #ffaa00; color: #000;
            border: none; border-radius: 4px; font-weight: bold; cursor: pointer;
        ">Voxelize Map</button>
        <div id="doom-status" style="margin-top: 8px; min-height: 60px; font-size: 11px; color: #cca800; white-space: pre-wrap;"></div>
    `;

    const $ = (id) => panel.querySelector(`#${id}`);
    const status = (line) => {
        const el = $("doom-status");
        el.textContent = (el.textContent ? el.textContent + "\n" : "") + line;
        el.scrollTop = el.scrollHeight;
    };
    const clearStatus = () => { $("doom-status").textContent = ""; };

    // Minitab on right edge. v447 — the dock (Cameras/Civs/Kaiju/Assets/
    // Reset) stacks on the right edge via a separate system, so the DOOM
    // minitab was landing under the Reset World button. Anchor it to the
    // lower-right edge so it's no longer covered.
    const doomTab = createMiniTab({
        edge: "right",
        label: "DOOM",
        color: "burgundy",
        onClick: () => {
            panel.style.display = (panel.style.display === "none") ? "block" : "none";
            if (panel.style.display === "block") refreshWadList();
        },
    });
    try { doomTab.style.top = "auto"; doomTab.style.bottom = "120px"; } catch {}

    // v670 — hide the DOOM minitab by default; only show when the active
    // demo is wad-arena / fps_wad / cs (anything that actually uses WADs).
    // Watch the demoMenus event the engine fires on demo change.
    const DOOM_DEMOS = new Set(["wad_arena", "fps_wad", "cs", "fps", "doom"]);
    const updateDoomVisibility = () => {
        const curId = window.demoManager?.current?.id || "";
        const shouldShow = DOOM_DEMOS.has(curId);
        doomTab.style.display = shouldShow ? "" : "none";
        if (!shouldShow) panel.style.display = "none";
    };
    doomTab.style.display = "none";   // start hidden
    // Re-check on demo change. demoManager.setById fires no custom event,
    // but it logs to console; safer to poll every 2s. Cheap and correct.
    setInterval(updateDoomVisibility, 2000);
    // Also check once after a short delay (in case demoManager isn't ready
    // when this module is mounted).
    setTimeout(updateDoomVisibility, 500);

    // ---- WAD state ----
    let currentWad   = null;     // parsed WAD object
    let currentWadFile = null;     // ArrayBuffer
    let currentPalette = null;

    // Auto-discover /wads/*.wad. Best-effort — many static servers
    // don't list directory contents, in which case we silently
    // fall back to the file picker.
    async function refreshWadList() {
        const select = $("doom-wad-select");
        if (select.options.length > 1) return;   // already populated
        try {
            const resp = await fetch("/wads/");
            if (!resp.ok) return;
            const html = await resp.text();
            // Cheap dir-listing scrape: look for href="*.wad"
            const matches = [...html.matchAll(/href="([^"]+\.wad)"/gi)];
            for (const m of matches) {
                const opt = document.createElement("option");
                opt.value = "/wads/" + m[1].replace(/^.*\//, "");
                opt.textContent = m[1].replace(/^.*\//, "");
                select.appendChild(opt);
            }
            if (matches.length > 0) {
                status(`Found ${matches.length} WAD(s) in /wads/`);
            }
        } catch (e) {
            // No dir listing → user can still load via file picker
        }
    }

    // ---- Loading + parsing a WAD ----
    async function loadWadBuffer(buffer, label) {
        clearStatus();
        status(`Loading ${label}…`);
        try {
            const wadApi = await window.wad;        // promise OR resolved
            const wad = (wadApi.parse ?? wadApi).parse
                ? (wadApi.parse ?? wadApi).parse(buffer)
                : wadApi.parse(buffer);
            currentWadFile = buffer;
            currentWad = wad;
            // Build map dropdown
            const mapNames = wadApi.listMaps(wad);
            const mapSel = $("doom-map-select");
            mapSel.innerHTML = "";
            for (const name of mapNames) {
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                mapSel.appendChild(opt);
            }
            mapSel.disabled = mapNames.length === 0;
            $("doom-voxelize").disabled = mapNames.length === 0;
            currentPalette = wadApi.palette(wad);
            status(`OK: ${mapNames.length} map(s), palette loaded.`);
        } catch (e) {
            status(`ERROR: ${e.message}`);
        }
    }

    // File picker → buffer
    $("doom-wad-file").addEventListener("change", async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        const buffer = await file.arrayBuffer();
        await loadWadBuffer(buffer, file.name);
    });

    // Dropdown (auto-discovered list) → buffer
    $("doom-wad-select").addEventListener("change", async (ev) => {
        const url = ev.target.value;
        if (!url) return;
        try {
            const resp = await fetch(url);
            const buffer = await resp.arrayBuffer();
            await loadWadBuffer(buffer, url);
        } catch (e) {
            status(`Fetch failed: ${e.message}`);
        }
    });

    // ---- Voxelize button ----
    $("doom-voxelize").addEventListener("click", async () => {
        if (!currentWad || !currentPalette) {
            status("No WAD loaded");
            return;
        }
        const mapName = $("doom-map-select").value;
        if (!mapName) {
            status("No map selected");
            return;
        }
        const wadApi = await window.wad;
        clearStatus();
        status(`Voxelizing ${mapName}…`);

        const usePalette = $("doom-opt-palette").checked;
        const useLight   = $("doom-opt-light").checked;
        const useSprites = $("doom-opt-sprites").checked;
        const useAnimate = $("doom-opt-animate").checked;
        const useWalls   = $("doom-opt-walls").checked;
        const useEffects = $("doom-opt-effects").checked;

        // 1. Parse map (BSP-aware)
        const map = wadApi.parseMap(currentWad, mapName, { full: true });
        status(`  ${map.lines.length / 3} linedefs, ${map.sectors?.length ?? 0} sectors`);

        // 2. Wire palette + texture lookup + light tint
        const voxOpts = { centerOnPlayerStart: true };
        if (usePalette) {
            const lookup = wadApi.buildFlatColorLookup(currentWad, currentPalette, 100);
            voxOpts.floorTextureMap = lookup;
            status("  Palette swap enabled");
            // v398 — bulk-register PLAYPAL into the global
            // MaterialRegistry so the renderer + debris system see
            // the right colors without any further wiring.
            const palMats = wadApi.paletteToMaterials(currentPalette, 100);
            if (window.materials) {
                window.materials.bulkRegister(palMats);
                status(`  Registered ${palMats.length} PLAYPAL materials`);
            }
            window._wadPalMaterials = palMats;
        }
        if (useLight) {
            voxOpts.sectorLightTint = wadApi.buildSectorLightTint(currentPalette, 100);
            status("  Sector light tint enabled");
        }

        // v400 — wall texture atlas. Each unique wall texture gets
        // its own material id (1000+) with atlas UV box metadata.
        // Renderer with atlas-sample support reads the UV box from
        // the MaterialRegistry's meta(matId).uvBox.
        let wallAtlas = null;
        if (useWalls) {
            wallAtlas = wadApi.buildWallAtlas(currentWad, currentPalette, { baseMatId: 1000 });
            if (wallAtlas.overflow) {
                status(`  WARNING: atlas overflowed (>${4096}², ${wallAtlas.attemptedTextures} textures)`);
            } else {
                status(`  Wall atlas: ${wallAtlas.placedCount} textures in ${wallAtlas.width}×${wallAtlas.height}`);
                voxOpts.wallTextureMap = wallAtlas.matIdFor;
                window._wadWallAtlas = wallAtlas;
            }
        }

        // 3. Voxelize
        const result = wadApi.voxelize(map, voxOpts);
        status(`  → ${result.wallVoxelsWritten} walls, ${result.floorVoxelsWritten} floors${result.usedBSP ? " (BSP)" : ""}`);

        // 4. Sprite billboards
        if (useSprites) {
            const bm = wadApi.createBillboardManager({ cellSize: result.unitsPerVoxel ?? 16 });
            const registered = wadApi.bulkRegisterSprites(bm, currentWad, currentPalette);
            status(`  Sprites: ${registered} frames registered`);

            const placements = wadApi.things(map, { includeSpawns: false });
            const spawned = bm.spawnFromPlacements(placements, wadApi.spriteForThing,
                { unitsPerVoxel: result.unitsPerVoxel, baseY: 2,
                  centerWX: result.playerStart ? 0 : 0,
                  centerWZ: result.playerStart ? 0 : 0 });
            status(`  Billboards: ${spawned.length} spawned`);
            window._wadBillboards = bm;
        }

        // 5. Animator
        if (useAnimate) {
            const anim = wadApi.createAnimator();
            // Bind every animated texture in this map's flat list so
            // the engine's renderer can re-tint when frames advance.
            // The actual color-update callback is engine-specific; we
            // store the animator on a global where renderer code can
            // pick it up.
            const animatedFlatsSeen = new Set();
            for (const s of (map.sectors ?? [])) {
                if (wadApi.isAnimatedTexture(s.floorTex)) animatedFlatsSeen.add(s.floorTex);
                if (wadApi.isAnimatedTexture(s.ceilTex))   animatedFlatsSeen.add(s.ceilTex);
            }
            for (const name of animatedFlatsSeen) {
                anim.bind(name, (curFrame) => {
                    // v398 — push the new color into the global
                    // registry. Voxels using this flat's material id
                    // re-tint everywhere on the very next frame.
                    if (window.materials && wadApi.colorForFlatName) {
                        const newColor = wadApi.colorForFlatName(currentWad, curFrame, currentPalette);
                        if (newColor) {
                            // Map back to the material id this flat
                            // resolved to (use the cached lookup).
                            const palIdx = wadApi.closestPaletteIndex(newColor, currentPalette);
                            const matId = 100 + palIdx;
                            window.materials.update(matId,
                                newColor.r / 255, newColor.g / 255, newColor.b / 255);
                        }
                    }
                    // Legacy hook (still fires if anyone subscribed):
                    if (window._onWadTextureAdvance) {
                        window._onWadTextureAdvance(name, curFrame);
                    }
                });
            }
            window._wadAnimator = anim;
            status(`  Animator: ${animatedFlatsSeen.size} animated textures bound`);
        }

        // v399 — sector effects controller. Damage floors, secret
        // discovery, light flicker. Wires through a stub
        // getCameraSector that uses BSP point-to-subsector when
        // available; otherwise no-op (returns -1 = no effect).
        if (useEffects) {
            const getSector = () => {
                if (!window.camera || !map.subsectors) return -1;
                // Camera position is in voxel coords; convert back to WAD
                const ups = result.unitsPerVoxel ?? 16;
                const wx = window.camera.position.x * ups;
                const wz = window.camera.position.z * ups;
                // Use the voxelizer's own point-to-subsector helper.
                const { pointToSubsector, subsectorToSector } = wadApi;
                if (!pointToSubsector) return -1;
                const ss = pointToSubsector(map, wx, wz);
                return ss >= 0 ? subsectorToSector(map, ss) : -1;
            };
            const ctrl = new wadApi.SectorEffectController({
                map,
                getCameraSector: getSector,
                onDamage:      (rate, info) => {
                    if (window._onSectorDamage) window._onSectorDamage(rate, info);
                },
                onSecretFound: (sIdx) => {
                    status(`  ✨ SECRET FOUND (sector ${sIdx})`);
                    if (window._onSectorSecret) window._onSectorSecret(sIdx);
                },
                onEndLevel:    () => {
                    status(`  💀 END LEVEL TRIGGER`);
                    if (window._onSectorEndLevel) window._onSectorEndLevel();
                },
            });
            window._wadSectorEffects = ctrl;
            const s = ctrl.stats;
            status(`  Sector effects: ${s.damageCount} damage, ${s.secretCount} secret, ${s.lightCount} light`);
        }

        status(`Done.`);
    });

    return panel;
}
