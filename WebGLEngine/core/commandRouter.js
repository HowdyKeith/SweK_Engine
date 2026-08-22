// FILE: core/commandRouter.js
// VERSION: v2 - EXCEL CONTROL SURFACE
//
// Central dispatch for commands arriving over WebSocket (Excel/VBA via
// the ai-bridge relay) or fired internally from JS code. v1 handled
// only voxel:set / voxel:get / chunk:dump. v2 adds the sim:*, wave:*,
// and tv:* families so a spreadsheet can drive simulation tuning,
// water shader parameters, and TV-wall layout.
//
// Why an env object: v1 only needed `world`. v2 needs references to
// waterRenderer, tvWall, screenAgents, etc. Rather than churn the
// constructor signature, env is registered after construction:
//
//     const router = new CommandRouter(world);
//     router.register({ waterRenderer, tvWall });
//
// All v2 handlers gracefully no-op if their env ref is missing, so the
// router still works in pieces of the codebase that only need the v1
// voxel commands.
//
// Latent bug fixed in v2: v1 had a bare line `SUBSCRIBE SYSTEM (...)`
// in the class body where a comment was intended — the file would
// fail to parse and break the entire app at startup.

const VOXEL_AIR    = 0;
const VOXEL_WATER  = 10;
const VOXEL_FLOWING_WATER = 11;

const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));

export class CommandRouter {
    constructor(world, net = null) {
        this.world = world;
        this.net   = net;

        this.env = { world };  // populated more by register()
        this.subscribers = new Map();
        this.history = [];
    }

    // Inject extra dependencies (waterRenderer, tvWall, screenAgents, ...).
    // Idempotent — call multiple times to add or replace refs.
    register(extra) {
        Object.assign(this.env, extra || {});
    }

    // ---------------------------------------------------------------------
    // ENTRY POINT — accepts JSON-shaped commands, dispatches by cmd.type.
    // Unknown types are logged once and ignored.
    // ---------------------------------------------------------------------
    exec(cmd) {
        if (!cmd || !cmd.type) return;
        this.history.push(cmd);
        if (this.history.length > 500) this.history.shift();

        const t = cmd.type;

        // ----- voxel ops (v1) -------------------------------------------
        if (t === "voxel:set") {
            this.world.setVoxel(cmd.x, cmd.y, cmd.z, cmd.v);
            this._emit("voxel:set", cmd);
            this._maybeForward(cmd);
            return;
        }
        if (t === "voxel:get") {
            const v = this.world.voxelAt(cmd.x, cmd.y, cmd.z);
            this._emit("voxel:get", { ...cmd, value: v });
            return v;
        }
        if (t === "chunk:dump") {
            const chunk = this.world.getChunk(cmd.x, cmd.z);
            this._emit("chunk:dump", { cx: cmd.x, cz: cmd.z, chunk });
            return chunk;
        }

        // ----- bulk voxel ops (v2.19) -----------------------------------
        if (t === "world:fillBox") {
            // Inclusive box, axis-aligned. Sane order regardless of which
            // corner is min/max. Capped at 200×200×200 to keep big mistakes
            // from locking the loop.
            const x1 = Math.min(+cmd.x1, +cmd.x2);
            const x2 = Math.max(+cmd.x1, +cmd.x2);
            const y1 = Math.min(+cmd.y1, +cmd.y2);
            const y2 = Math.max(+cmd.y1, +cmd.y2);
            const z1 = Math.min(+cmd.z1, +cmd.z2);
            const z2 = Math.max(+cmd.z1, +cmd.z2);
            const v = +cmd.v;
            const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
            if (dx > 200 || dy > 200 || dz > 200) {
                console.warn("[Router] fillBox too large (>200), refusing");
                return;
            }
            let n = 0;
            for (let x = x1; x <= x2; x++) {
                for (let y = y1; y <= y2; y++) {
                    for (let z = z1; z <= z2; z++) {
                        this.world.setVoxel(x, y, z, v);
                        n++;
                    }
                }
            }
            this._emit("world:filled", { count: n });
            return n;
        }
        if (t === "world:bulkVoxelSet") {
            // Two accepted shapes:
            //   { voxels: [[x,y,z,v], [x,y,z,v], ...] }
            //   { anchor: [ax,ay,az], v: <id>, offsets: [[dx,dy,dz], ...] }
            const ax = cmd.anchor?.[0] ?? 0;
            const ay = cmd.anchor?.[1] ?? 0;
            const az = cmd.anchor?.[2] ?? 0;
            const fixedV = cmd.v != null ? +cmd.v : null;

            let n = 0;
            if (Array.isArray(cmd.voxels)) {
                for (const tup of cmd.voxels) {
                    if (!tup) continue;
                    const v = fixedV != null ? fixedV : +tup[3];
                    this.world.setVoxel(ax + +tup[0], ay + +tup[1], az + +tup[2], v);
                    n++;
                }
            } else if (Array.isArray(cmd.offsets)) {
                if (fixedV == null) {
                    console.warn("[Router] bulkVoxelSet with offsets requires v");
                    return;
                }
                for (const off of cmd.offsets) {
                    if (!off) continue;
                    this.world.setVoxel(ax + +off[0], ay + +off[1], az + +off[2], fixedV);
                    n++;
                }
            }
            this._emit("world:bulk", { count: n });
            return n;
        }

        // ----- simulation tuning ----------------------------------------
        if (t === "sim:setRainIntensity") {
            const r = this.world.rain;
            if (r) r.intensity = clamp01(cmd.value);
            this._emit("sim:state", this._simState());
            return;
        }
        if (t === "sim:setRainHeight") {
            const r = this.world.rain;
            if (r) r.spawnHeight = +cmd.value;
            return;
        }
        if (t === "sim:setRainArea") {
            const r = this.world.rain;
            if (r) r.areaSize = Math.max(1, +cmd.value);
            return;
        }
        if (t === "sim:seedWater") {
            const w = Math.max(1, +cmd.w || 1);
            const h = Math.max(1, +cmd.h || 1);
            for (let dx = 0; dx < w; dx++) {
                for (let dz = 0; dz < h; dz++) {
                    this.world.setVoxel(+cmd.x + dx, +cmd.y, +cmd.z + dz, VOXEL_WATER);
                }
            }
            this._emit("sim:state", this._simState());
            return;
        }
        if (t === "sim:clearWater") {
            // Sweep all loaded chunks and convert WATER + FLOWING_WATER to AIR.
            let cleared = 0;
            for (const chunk of this.world.chunks.values()) {
                for (let i = 0; i < chunk.voxels.length; i++) {
                    const v = chunk.voxels[i];
                    if (v === VOXEL_WATER || v === VOXEL_FLOWING_WATER) {
                        chunk.voxels[i] = VOXEL_AIR;
                        cleared++;
                    }
                }
                chunk.dirty = true;
            }
            this._emit("sim:state", { ...this._simState(), cleared });
            return;
        }

        // ----- water shader knob ----------------------------------------
        if (t === "wave:setAmplitude") {
            if (this.env.waterRenderer) {
                this.env.waterRenderer.amplitude = Math.max(0, +cmd.value);
            }
            return;
        }

        // ----- TV wall control ------------------------------------------
        if (t === "tv:setLayout") {
            if (this.env.tvWall) this.env.tvWall.setLayout(+cmd.cols, +cmd.rows);
            return;
        }
        if (t === "tv:setScreenCamera") {
            if (!this.env.tvWall) return;
            const fields = {};
            if (cmd.x != null || cmd.y != null || cmd.z != null) {
                fields.position = {};
                if (cmd.x != null) fields.position.x = +cmd.x;
                if (cmd.y != null) fields.position.y = +cmd.y;
                if (cmd.z != null) fields.position.z = +cmd.z;
            }
            if (cmd.yaw   != null) fields.yaw   = +cmd.yaw;
            if (cmd.pitch != null) fields.pitch = +cmd.pitch;
            this.env.tvWall.setScreenCamera(+cmd.id, fields);
            return;
        }

        // ----- LLM narrator control -------------------------------------
        if (t === "narrative:setModel") {
            if (this.env.ollama) {
                this.env.ollama.model = String(cmd.model || "llama3.2");
                // Reset availability so the next call probes the new model
                this.env.ollama.available = null;
                this.env.ollama._warnedDown = false;
            }
            return;
        }
        if (t === "narrative:probe") {
            if (this.env.ollama) {
                this.env.ollama.available = null;
                this.env.ollama._warnedDown = false;
                this.env.ollama.probe().then((ok) => {
                    this._emit("narrative:state", { available: ok, model: this.env.ollama.model });
                });
            }
            return;
        }

        // ----- LLM-generated terrain (v2.20) ----------------------------
        if (t === "terrain:ollamaGenerate") {
            // Fire-and-forget. Result lands via "terrain:generated" event
            // because LLM calls take seconds and the WS caller doesn't
            // wait for a synchronous return.
            this._handleOllamaTerrain(cmd).catch((e) => {
                console.warn("[Router] terrain:ollamaGenerate failed:", e?.message);
                this._emit("terrain:generated", { ok: false, reason: e?.message || "error" });
            });
            return;
        }

        // ----- persistence (v2.21) --------------------------------------
        if (t === "world:save") {
            if (!this.env.persistence) return;
            const r = this.env.persistence.save();
            this.env.persistence.saveCamera(this.env.camera);
            this._emit("world:saved", r);
            return r;
        }
        if (t === "world:load") {
            if (!this.env.persistence) return;
            const r = this.env.persistence.load();
            this.env.persistence.loadCamera(this.env.camera);
            this._emit("world:loaded", r);
            return r;
        }
        if (t === "world:reset") {
            // Clear save AND wipe modifications from in-memory chunks.
            // Doesn't regenerate terrain — call manually if you want a
            // truly-fresh start (or just reload the page after reset).
            //
            // v333 — also clear the painter/placer "_applied" flags so
            // biome painter, ruin placer, and cave carver actually re-run
            // on next load. Without this, fresh chunks (which have no
            // ruins/biomes baked in) stay sterile after reset because
            // the gates prevent re-application.
            //
            // v337 — ALSO clear ECS entities (player/enemies/props that
            // came from scene.json on a prior boot) AND set a one-shot
            // skipSceneOnce flag so scene.json doesn't reload on the next
            // boot. Without this, the user clicks Reset, reloads, and the
            // 7 entities at y=25..30 in scene.json come back as "sky stuff."
            if (!this.env.persistence) return;
            this.env.persistence.clear();
            this.env.persistence.clearCamera();
            try {
                localStorage.removeItem("voxelengine.biomes_v2_applied");
                localStorage.removeItem("voxelengine.ruins_v1_applied");
                localStorage.removeItem("voxelengine.caves_v1_applied");
                // v337 — block scene.json on next boot (one-shot)
                localStorage.setItem("voxelengine.skipSceneOnce", "1");
            } catch {}
            // v337 — clear ECS in-memory
            if (this.env.ecs?.clearAll) {
                const r = this.env.ecs.clearAll();
                console.log(`[router] world:reset cleared ${r.cleared} ECS entities`);
            }
            this._emit("world:reset", { ok: true });
            return { ok: true };
        }
        if (t === "world:hardReset") {
            // v333 — nuclear option. Clears EVERY localStorage key that
            // starts with "voxelengine." — voxel diffs, gate flags,
            // camera, AI model selections, KPop settings, anything we
            // own. Use when world:reset isn't going far enough (e.g.
            // resurrecting bugs persist across normal resets because
            // they're cached in some setting).
            //
            // v337 — also clears ECS entities (in-memory) and sets the
            // permanent scene.json disable flag so the bundled fallback
            // scene with sky-height entities can't re-populate after reload.
            const cleared = [];
            try {
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith("voxelengine.")) keys.push(k);
                }
                for (const k of keys) {
                    localStorage.removeItem(k);
                    cleared.push(k);
                }
                // Also wipe in-memory _modified flags so beforeunload
                // save doesn't restore anything during the reload window.
                if (this.env.world?.chunks) {
                    for (const c of this.env.world.chunks.values()) {
                        c._modified = false;
                    }
                }
                // v337 — permanently disable scene.json. The user can
                // re-enable via window.enableSceneJson() if they want
                // the default fallback entities back.
                localStorage.setItem("voxelengine.disableScene", "1");
            } catch (e) {
                return { ok: false, error: e?.message ?? String(e) };
            }
            // v337 — clear ECS in-memory
            if (this.env.ecs?.clearAll) {
                const r = this.env.ecs.clearAll();
                console.log(`[router] world:hardReset cleared ${r.cleared} ECS entities`);
            }
            this._emit("world:reset", { ok: true, hard: true, cleared: cleared.length });
            console.log(`[router] world:hardReset cleared ${cleared.length} localStorage keys:`, cleared);
            return { ok: true, hard: true, cleared: cleared.length, keys: cleared };
        }

        // ----- entity spawn (mesh) -------------------------------------------
        // Drops an ECS entity at a position with a mesh assetId. The entity
        // mesh renderer picks it up next frame and kicks off the asset load
        // (gpuAssetLoader fetches /GPU_Assets/<assetId>/{mesh.json,vertices.bin,
        // indices.bin}). v2.23 — closes the GLB → mesh-rendering loop alongside
        // VBA's modGLBExport.
        //
        // Shape:
        //   { type:"entity:spawnMesh", assetId:"alien",
        //     x:0, y:30, z:0, scale:1, kind:"prop" }
        if (t === "entity:spawnMesh") {
            const ecs = this.env.ecs;
            if (!ecs || !ecs.createEntity) {
                console.warn("[router] entity:spawnMesh — no ecs registered");
                return;
            }
            const ecsTypes = this.env.ecsTypes;
            if (!ecsTypes) {
                console.warn("[router] entity:spawnMesh — no ecsTypes registered");
                return;
            }
            const id = ecs.createEntity();
            ecs.addComponent(id, new ecsTypes.Position(
                +cmd.x || 0, +cmd.y || 0, +cmd.z || 0));
            ecs.addComponent(id, new ecsTypes.Render({
                type: "mesh",
                assetId: String(cmd.assetId || "unknown"),
                scale: (cmd.scale != null) ? +cmd.scale : 1,
                // Round 41 — non-uniform scale support
                scaleX: (cmd.scaleX != null) ? +cmd.scaleX : null,
                scaleY: (cmd.scaleY != null) ? +cmd.scaleY : null,
                scaleZ: (cmd.scaleZ != null) ? +cmd.scaleZ : null,
            }));
            ecs.addComponent(id, new ecsTypes.Tag(cmd.kind || "prop"));

            // Round 62 — eagerly create the SkeletalAnimator for rigged
            // assets so anim.setClip() works immediately after anim.spawn()
            // instead of failing with "no animator for entity N" because
            // the renderer hadn't drawn the entity yet. ensureAnimator()
            // returns null (silently) if the asset isn't loaded yet or
            // isn't rigged — the draw path catches those cases later.
            if (this.env.entityMeshRenderer?.ensureAnimator) {
                this.env.entityMeshRenderer.ensureAnimator(
                    id, String(cmd.assetId || "unknown")
                );
            }

            this._emit("entity:spawned", {
                id, assetId: cmd.assetId, x: cmd.x, y: cmd.y, z: cmd.z,
            });
            return { ok: true, id };
        }

        // entity:move — update an existing ECS entity's position. Used
        // by KaijuManager (round 14) to sync mesh entities to kaiju
        // positions each tick.
        if (t === "entity:move") {
            const ecs = this.env.ecs;
            const ecsTypes = this.env.ecsTypes;
            if (!ecs || !ecsTypes) return;
            const pos = ecs.getComponent(cmd.id, ecsTypes.Position);
            if (pos) {
                pos.x = +cmd.x; pos.y = +cmd.y; pos.z = +cmd.z;
                // Round 53 — orientation sync (yaw + tilt). Both optional.
                // Round 81 — added tiltZ (roll) for tumbling projectiles.
                if (cmd.yaw   != null) pos.yaw   = +cmd.yaw;
                if (cmd.tiltX != null) pos.tiltX = +cmd.tiltX;
                if (cmd.tiltZ != null) pos.tiltZ = +cmd.tiltZ;
            }
            return;
        }

        // Round 4 of OGRE arc — entity:rescale: change Render.scale of an
        // existing entity. Used to make the OGRE 4× normal size.
        // Round 41 — also accepts scaleX/Y/Z for non-uniform rescale.
        if (t === "entity:rescale") {
            const ecs = this.env.ecs;
            const ecsTypes = this.env.ecsTypes;
            if (!ecs || !ecsTypes) return;
            const render = ecs.getComponent(cmd.id, ecsTypes.Render);
            if (render) {
                if (cmd.scale != null)  render.scale  = +cmd.scale;
                if (cmd.scaleX != null) render.scaleX = +cmd.scaleX;
                if (cmd.scaleY != null) render.scaleY = +cmd.scaleY;
                if (cmd.scaleZ != null) render.scaleZ = +cmd.scaleZ;
            }
            return;
        }

        // Round 19 stage 3 — entity:setAnimClip: switch the active
        // animation clip on a rigged-mesh entity. Used by gameplay
        // (e.g., kaiju "engaging" → setAnimClip("attack")).
        if (t === "entity:setAnimClip") {
            const ecs = this.env.ecs;
            const ecsTypes = this.env.ecsTypes;
            if (!ecs || !ecsTypes) return;
            const render = ecs.getComponent(cmd.id, ecsTypes.Render);
            if (render && cmd.clip != null) render.animClip = cmd.clip;
            return;
        }

        // Round 22 — entity:setColorMul: per-instance brightness
        // multiplier. Renderer multiplies kind color by this value.
        // Used to darken damaged units (low HP = dim chassis).
        if (t === "entity:setColorMul") {
            const ecs = this.env.ecs;
            const ecsTypes = this.env.ecsTypes;
            if (!ecs || !ecsTypes) return;
            const render = ecs.getComponent(cmd.id, ecsTypes.Render);
            if (render && cmd.mul != null) render.colorMul = +cmd.mul;
            return;
        }

        // Round 26 — entity:setColorTint: additive RGB tint.
        // Final color = kindColor * colorMul + colorTint. Used for hue
        // shifts (low-HP red glow) without affecting brightness scaling.
        if (t === "entity:setColorTint") {
            const ecs = this.env.ecs;
            const ecsTypes = this.env.ecsTypes;
            if (!ecs || !ecsTypes) return;
            const render = ecs.getComponent(cmd.id, ecsTypes.Render);
            if (render && Array.isArray(cmd.tint)) render.colorTint = cmd.tint;
            return;
        }

        // v549 — entity:tint: per-entity lerp toward a target colour.
        // { id, color:[r,g,b] (0..1), mix:0..1 }. mix 0 = normal, 1 = solid
        // color. Composes on top of colorMul/colorTint. The general recolor
        // hook (camouflage, freeze, poison, fade, team recolor, hit flash).
        // Pass mix<=0 (or omit color) to clear it.
        if (t === "entity:tint") {
            const ecs = this.env.ecs;
            const ecsTypes = this.env.ecsTypes;
            if (!ecs || !ecsTypes) return;
            const render = ecs.getComponent(cmd.id, ecsTypes.Render);
            if (render) {
                const mix = (cmd.mix != null) ? Math.max(0, Math.min(1, +cmd.mix)) : 0;
                if (mix > 0 && Array.isArray(cmd.color)) {
                    render.tintColor = [+cmd.color[0] || 0, +cmd.color[1] || 0, +cmd.color[2] || 0];
                    render.tintMix = mix;
                } else {
                    render.tintColor = null; render.tintMix = 0;   // clear
                }
            }
            return;
        }

        // entity:despawn — remove an ECS entity by id. Round 14 uses
        // this to clean up mesh entities when the kaiju/civ they
        // were attached to dies.
        if (t === "entity:despawn") {
            const ecs = this.env.ecs;
            if (!ecs || !ecs.removeEntity) return;
            // Round 62 — drop the animator first so it doesn't outlive
            // the entity in the renderer's _animators map. Safe no-op if
            // there isn't one (static mesh, or never animated).
            if (this.env.entityMeshRenderer?.removeAnimator) {
                this.env.entityMeshRenderer.removeAnimator(cmd.id);
            }
            ecs.removeEntity(cmd.id);
            this._emit("entity:despawned", { id: cmd.id });
            return;
        }

        // ----- network forward (legacy v1 fallback) ---------------------
        if (this.net && cmd.sync !== false) {
            this.net.sendCommand(cmd);
        }
    }

    _maybeForward(cmd) {
        if (this.net && cmd.sync !== false) this.net.sendCommand(cmd);
    }

    _simState() {
        const r = this.world.rain;
        return {
            rainIntensity: r?.intensity ?? null,
            rainSpawned: r?.totalSpawned ?? 0,
            rainLanded: r?.totalLanded ?? 0,
            activeFluid: this.world.fluid?.active?.length ?? 0,
        };
    }

    // ---------------------------------------------------------------------
    // SUBSCRIBE SYSTEM (Excel / UI / Debug HUD)
    // ---------------------------------------------------------------------
    on(event, fn) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }
        this.subscribers.get(event).push(fn);
    }

    _emit(event, data) {
        const subs = this.subscribers.get(event);
        if (!subs) return;
        for (const fn of subs) {
            try { fn(data); } catch (e) { console.warn("[Router] subscriber error:", e); }
        }
    }

    snapshot() {
        return {
            cmds: this.history.length,
            envKeys: Object.keys(this.env),
        };
    }

    // ---------------------------------------------------------------------
    // OLLAMA TERRAIN HELPERS (v2.20)
    // ---------------------------------------------------------------------
    // Bounded, validated voxel placement from an LLM response. Designed
    // for failure: bad/missing JSON degrades to a single emitted event;
    // out-of-range coords / invalid ids are silently dropped per-voxel.
    //
    // Voxel id whitelist matches world/voxelFormat.js; LAVA (12) included
    // for fun, SCREEN (20) excluded because it requires media binding.

    async _handleOllamaTerrain(cmd) {
        if (!this.env.ollama) {
            this._emit("terrain:generated", { ok: false, reason: "no Ollama client" });
            return;
        }
        const prompt = String(cmd.prompt || "").trim();
        if (!prompt) {
            this._emit("terrain:generated", { ok: false, reason: "empty prompt" });
            return;
        }
        const anchor = Array.isArray(cmd.anchor) && cmd.anchor.length === 3
            ? cmd.anchor.map(Number)
            : [0, 30, 0];

        const fullPrompt = this._buildTerrainPrompt(prompt);
        const response = await this.env.ollama.generate(fullPrompt, {
            // Larger budget than narrative; one structure can be 100s of voxels.
            num_predict: cmd.num_predict ?? 1024,
            temperature: cmd.temperature ?? 0.55,
            stop: ["\n\n\n", "Request:", "</voxels>"],
        });
        if (!response) {
            this._emit("terrain:generated", { ok: false, reason: "no LLM response" });
            return;
        }

        const parsed = this._extractTerrainJSON(response);
        if (!parsed || !Array.isArray(parsed.voxels)) {
            this._emit("terrain:generated", {
                ok: false,
                reason: "could not parse JSON",
                raw: response.slice(0, 200),
            });
            return;
        }

        const VALID_IDS = new Set([0, 1, 2, 3, 4, 10, 11, 12]);
        const MAX_VOXELS = 500;
        const RANGE = 20;

        let placed = 0, dropped = 0;
        const list = parsed.voxels.slice(0, MAX_VOXELS);
        for (const tup of list) {
            if (!Array.isArray(tup) || tup.length < 4) { dropped++; continue; }
            const dx = +tup[0], dy = +tup[1], dz = +tup[2], v = +tup[3];
            if (!Number.isFinite(dx) || !Number.isFinite(dy)
                || !Number.isFinite(dz) || !Number.isFinite(v)) { dropped++; continue; }
            if (Math.abs(dx) > RANGE || Math.abs(dy) > RANGE || Math.abs(dz) > RANGE) {
                dropped++; continue;
            }
            if (!VALID_IDS.has(v)) { dropped++; continue; }
            this.world.setVoxel(anchor[0] + dx, anchor[1] + dy, anchor[2] + dz, v);
            placed++;
        }

        this._emit("terrain:generated", {
            ok: true,
            prompt,
            anchor,
            placed,
            dropped,
            truncated: parsed.voxels.length > MAX_VOXELS,
        });
        console.log(`[Router] terrain "${prompt.slice(0, 40)}" placed=${placed} dropped=${dropped}`);
    }

    _buildTerrainPrompt(userPrompt) {
        return [
            'You generate small voxel structures for a 3D voxel world.',
            'Return ONLY a single JSON object. No markdown fences, no preamble, no explanation.',
            'Format: {"voxels":[[dx,dy,dz,v], ...]}',
            'dx,dy,dz are integer offsets from the anchor in the range -15..15. Y is up.',
            'v is the voxel id from this set:',
            '  0=AIR  1=STONE  2=DIRT  3=GRASS  4=SAND  10=WATER  11=FLOWING_WATER  12=LAVA',
            'Keep it under 200 voxels. Be deliberate — every voxel should serve the form.',
            '',
            'Example:',
            'Request: "a small stone pillar"',
            'JSON: {"voxels":[[0,0,0,1],[0,1,0,1],[0,2,0,1],[0,3,0,1]]}',
            '',
            'Example:',
            'Request: "a tiny water pool surrounded by sand"',
            'JSON: {"voxels":[[0,0,0,10],[1,0,0,10],[-1,0,0,10],[0,0,1,10],[0,0,-1,10],[2,0,0,4],[-2,0,0,4],[0,0,2,4],[0,0,-2,4]]}',
            '',
            `Request: "${userPrompt}"`,
            'JSON:'
        ].join('\n');
    }

    _extractTerrainJSON(text) {
        if (!text) return null;
        let s = text.trim();
        // Strip markdown code fences
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        // Direct parse
        try { return JSON.parse(s); } catch {}
        // Greedy match {...}: works when LLM wrapped the JSON in prose
        const m = s.match(/\{[\s\S]*\}/);
        if (m) {
            try { return JSON.parse(m[0]); } catch {}
            // Some LLMs emit trailing commas; strip and retry once
            try { return JSON.parse(m[0].replace(/,(\s*[}\]])/g, '$1')); } catch {}
        }
        return null;
    }
}
