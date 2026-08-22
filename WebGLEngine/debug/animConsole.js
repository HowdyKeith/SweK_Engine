// FILE: debug/animConsole.js
// VERSION: v1 - round 52
//
// window.anim - console helpers for skeletal animation. Lets you:
//   anim.list()                    - all rigged entities currently visible
//   anim.clips(id)                 - list clip names for one entity
//   anim.setClip(id, name, blend?) - switch active clip (default 0.2s blend)
//   anim.info(id)                  - dump animator state for one entity
//   anim.speed(id, mul)            - set playback speed (1.0 = normal)
//   anim.pause(id)  / anim.play(id)
//
// Built on top of EntityMeshRenderer._animators (the per-entity animator
// map populated by the rigged draw path). An entity must have been drawn
// at least once for its animator to exist.

export function installAnimConsole(env) {
    const { ecs, ecsTypes, entityMeshRenderer, router, world } = env;

    // Round 53 - per-entity event subscriber lists. Animator only has a
    // single onEvent slot; we install a dispatcher there and maintain
    // our own list so multiple gameplay systems can subscribe to the
    // same entity's animation events independently.
    const eventListeners = new Map();    // entityId -> Array<{name, fn}>

    function ensureDispatcher(id, animator) {
        if (animator._animConsoleDispatched) return;
        animator.onEvent = (eventName, ctx) => {
            const list = eventListeners.get(id);
            if (!list) return;
            for (const sub of list) {
                if (sub.name && sub.name !== eventName) continue;   // name filter
                try {
                    sub.fn(eventName, ctx);
                } catch (e) {
                    console.warn(`[anim.onEvent ${id}] handler failed:`, e);
                }
            }
        };
        animator._animConsoleDispatched = true;
    }

    function getRender(id) {
        if (!ecs || !ecsTypes) return null;
        return ecs.getComponent(id, ecsTypes.Render);
    }

    function getAnimator(id) {
        return entityMeshRenderer?._animators?.get?.(id) ?? null;
    }

    function findRiggedEntities() {
        const out = [];
        if (!entityMeshRenderer?._animators) return out;
        for (const [id, animator] of entityMeshRenderer._animators) {
            out.push({
                id,
                clips: animator.animations.length,
                activeClip: animator.animations[animator.activeClipIdx]?.name ?? "?",
                t: animator.timeSeconds.toFixed(2),
                speed: animator.timeScale,
            });
        }
        return out;
    }

    const api = {
        list() {
            const ents = findRiggedEntities();
            if (ents.length === 0) {
                console.log("[anim] no rigged entities visible. Spawn a kaiju or wait for a mesh to load.");
                return [];
            }
            console.table(ents);
            return ents;
        },

        clips(id) {
            const animator = getAnimator(id);
            if (!animator) {
                console.log(`[anim] no animator for entity ${id}. Try anim.list() first.`);
                return [];
            }
            const out = animator.animations.map((c, i) => ({
                idx: i,
                name: c.name,
                duration: c.duration?.toFixed(2),
                channels: c.channels.length,
                active: i === animator.activeClipIdx,
            }));
            console.table(out);
            return out;
        },

        setClip(id, name, blendDur = 0.2) {
            const animator = getAnimator(id);
            if (!animator) {
                console.log(`[anim] no animator for entity ${id}`);
                return false;
            }
            const idxBefore = animator.activeClipIdx;
            animator.setClipByName(name, blendDur);
            if (animator.activeClipIdx === idxBefore) {
                // Round 171 (v666) — disambiguate "clip not found" from
                // "clip is already active". setClipByName + setClip's
                // early-out both leave activeClipIdx unchanged when the
                // requested clip is the one already playing, so the old
                // check spuriously flagged that as "not found" (the user's
                // walk-default-after-spawn case fired this every multiLeg
                // call). Use the animator's own clip-name resolver to tell
                // the difference.
                const idx = animator._findClipIndex ? animator._findClipIndex(name) : -1;
                if (idx < 0) {
                    console.log(`[anim] clip "${name}" not found on entity ${id}. Try anim.clips(${id}).`);
                    return false;
                }
                // Clip found and already active — no-op success.
                return true;
            }
            // Also update the ECS Render.animClip so the renderer's "did
            // animClip change?" check doesn't blow this away next frame.
            const render = getRender(id);
            if (render) {
                render.animClip = name;
            }
            // Bypass the renderer's e.animClip-triggered setClipByName too,
            // by setting _lastClipName so it sees no change next frame.
            animator._lastClipName = name;
            console.log(`[anim] entity ${id}: switched to "${name}" (blend ${blendDur}s)`);
            return true;
        },

        info(id) {
            const animator = getAnimator(id);
            if (!animator) {
                console.log(`[anim] no animator for entity ${id}`);
                return null;
            }
            const clip = animator.animations[animator.activeClipIdx];
            const info = {
                id,
                activeClipIdx: animator.activeClipIdx,
                activeClipName: clip?.name ?? "?",
                clipDuration: clip?.duration?.toFixed(2),
                t: animator.timeSeconds.toFixed(3),
                timeScale: animator.timeScale,
                loopMode: animator.loopMode,
                jointCount: animator.skin?.joints?.length ?? 0,
                clipCount: animator.animations.length,
                blending: animator._blendFrom != null,
                blendT: animator._blendT.toFixed(3),
                blendDur: animator._blendDur.toFixed(3),
            };
            console.table(info);
            return info;
        },

        speed(id, mul) {
            const animator = getAnimator(id);
            if (!animator) {
                console.log(`[anim] no animator for entity ${id}`);
                return false;
            }
            animator.timeScale = +mul;
            console.log(`[anim] entity ${id}: speed -> ${mul}x`);
            return true;
        },

        pause(id) { return this.speed(id, 0); },
        play(id)  { return this.speed(id, 1); },

        // Convenience - apply a clip to ALL rigged entities at once.
        // Handy for testing: anim.allClip("walk").
        allClip(name, blendDur = 0.2) {
            const ents = findRiggedEntities();
            let hit = 0;
            for (const e of ents) {
                if (this.setClip(e.id, name, blendDur)) hit++;
            }
            console.log(`[anim] applied "${name}" to ${hit}/${ents.length} entities`);
            return hit;
        },

        // Round 53 - subscribe to animation events fired by the entity's
        // active clip. fn signature: (eventName, ctx) where ctx is
        // { time, clipName, data }. Pass eventNameFilter to match only
        // a specific event ("strike_apex", etc.) or omit to receive all.
        // Returns the subscription record for later anim.offEvent(...).
        onEvent(id, fn, eventNameFilter = null) {
            const animator = getAnimator(id);
            if (!animator) {
                console.log(`[anim.onEvent] no animator for entity ${id}`);
                return null;
            }
            ensureDispatcher(id, animator);
            const sub = { fn, name: eventNameFilter };
            if (!eventListeners.has(id)) eventListeners.set(id, []);
            eventListeners.get(id).push(sub);
            console.log(`[anim.onEvent] entity ${id}: subscribed${eventNameFilter ? ` to "${eventNameFilter}"` : " to all events"}`);
            return sub;
        },

        // Remove a specific subscription returned by anim.onEvent().
        // Passing only id removes ALL subscriptions for that entity.
        offEvent(id, sub) {
            const list = eventListeners.get(id);
            if (!list) return false;
            if (!sub) {
                eventListeners.delete(id);
                console.log(`[anim.offEvent] entity ${id}: removed all subscriptions`);
                return true;
            }
            const idx = list.indexOf(sub);
            if (idx < 0) return false;
            list.splice(idx, 1);
            if (list.length === 0) eventListeners.delete(id);
            console.log(`[anim.offEvent] entity ${id}: removed one subscription (${list.length} remaining)`);
            return true;
        },

        // List event names defined on the entity's active clip + show
        // how many subscribers each entity has. Useful sanity check.
        events(id) {
            if (id != null) {
                const animator = getAnimator(id);
                if (!animator) {
                    console.log(`[anim.events] no animator for entity ${id}`);
                    return null;
                }
                const clip = animator.animations[animator.activeClipIdx];
                const events = clip?.events ?? [];
                const subscribers = eventListeners.get(id)?.length ?? 0;
                console.log(`[anim.events] entity ${id}, clip "${clip?.name}", ${subscribers} subscriber(s)`);
                console.table(events.map(e => ({ time: e.time, name: e.name, data: JSON.stringify(e.data ?? null) })));
                return { clip: clip?.name, subscribers, events };
            }
            const out = [];
            for (const [eid, subs] of eventListeners) {
                out.push({ id: eid, subscribers: subs.length });
            }
            console.table(out);
            return out;
        },

        // Round 52 - spawn the procedural test rig at given coordinates.
        // Returns entity id. The rig has clips: idle/walk/attack/death/
        // damaged/fire. After spawn, drive it via anim.setClip(id, ...).
        // Round 56 - assetId is overridable so this works with any rigged
        // asset (e.g., anim.spawn(0, 0, 1.5, "godzilla")).
        // Round 89.2 - was calling world.getHeightAt which doesn't exist
        // on VoxelWorld, so y always fell back to 8 — buried in any terrain
        // higher than that. Now scans voxels directly: from y=80 down to
        // first solid voxel (skipping air=0, water=10, lava=11).
        // v673 — clearance was a flat +12 (sized for RobotExpressive at scale=6).
        // For normal-scale 1-2x rigs that pushed creatures 12u above the floor
        // and out of view at default camera pitch. Now clearance = max(2, 2*scale)
        // so scale-1 creatures land barely above the floor (visible at eye level)
        // while large rigs still clear properly.
        // v674 — explicitY (5th arg) bypasses the floor scan entirely.
        // Used by RIG LAB so creatures land at the camera's eye level and
        // are immediately visible. The walker/swimmer system adjusts Y
        // after spawn anyway for ground-walking and swim-layer creatures.
        spawn(x = 0, z = 0, scale = 1.5, assetId = "test_rig", explicitY = null) {
            if (!env.router) {
                console.warn("[anim.spawn] no router available");
                return null;
            }
            let y = 8;
            if (explicitY != null && Number.isFinite(explicitY)) {
                y = explicitY;
            } else {
                const clearance = Math.max(2, Math.round(2 * scale));
                try {
                    const world = env.world || window.world;
                    if (world?.getVoxel) {
                        const xi = Math.floor(x), zi = Math.floor(z);
                        let scanned = null;
                        for (let yScan = 80; yScan > 0; yScan--) {
                            const v = world.getVoxel(xi, yScan, zi);
                            if (v != null && v !== 0 && v !== 10 && v !== 11) {
                                scanned = yScan + 1;
                                break;
                            }
                        }
                        if (scanned != null) {
                            y = scanned + clearance;
                        } else {
                            const cam = window.camera?.position;
                            y = cam ? cam.y : 30;
                            console.log(`[anim.spawn] terrain not loaded at (${x},${z}) — spawning at y=${y.toFixed(1)} (camera level)`);
                        }
                    } else if (world?.getHeightAt) {
                        y = world.getHeightAt(x, z) + clearance;
                    }
                } catch (e) {
                    console.warn("[anim.spawn] surface scan failed, using y=8 fallback:", e);
                }
            }
            const r = env.router.exec({
                type: "entity:spawnMesh",
                assetId,
                kind: assetId,
                x, y, z,
                scale,
                animClip: "idle",
            });
            console.log(`[anim] spawned ${assetId} id=${r?.id} at (${x}, ${y.toFixed(1)}, ${z})`);
            return r?.id ?? null;
        },

        // Round 56 - bind a custom asset to a kaiju kind. Lets the user
        // drop a GLB into GPU_Assets/ and have it used by spawned kaiju
        // without modifying kaijuKinds.js. Effect persists across reloads
        // (localStorage). Pass null/empty assetName to clear the override.
        //
        //   anim.bindAsset("sky", "godzilla")     // sky kaiju use godzilla.glb
        //   anim.bindAsset("hell", null)          // clear hell override
        //   anim.bindAsset()                       // list current overrides
        async bindAsset(kind, assetName) {
            try {
                const m = await import("../gpu/assetOverrides.js");
                if (kind == null) {
                    // List all current overrides
                    const all = m.getAllOverrides?.() ?? {};
                    console.table(all);
                    return all;
                }
                const defaultId = `kaiju_${kind}`;
                m.setOverride(defaultId, assetName || null);
                if (assetName) {
                    console.log(`[anim.bindAsset] kaiju_${kind} -> "${assetName}". Spawn a kaiju to see it.`);
                } else {
                    console.log(`[anim.bindAsset] cleared override for kaiju_${kind}.`);
                }
                return true;
            } catch (e) {
                console.warn("[anim.bindAsset] failed:", e.message);
                return false;
            }
        },
    };

    window.anim = api;
    console.log("[anim] window.anim ready: list(), clips(id), setClip(id, name, blend?), info(id), speed(id, mul), pause(id), play(id), allClip(name), onEvent(id, fn, name?), offEvent(id, sub?), events(id?), spawn(x, z, scale, assetId?), bindAsset(kind, assetName)");
    return api;
}
