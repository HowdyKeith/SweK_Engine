// FILE: rig/forceSkin.js
// VERSION: v1 (v828 — POC of skinning previously-static meshes)
//
// Takes a mesh without skin data + a rig, generates aJoints + aWeights
// VBOs from MeshRigBinding's K=4 nearest-bone autoBind, mutates the
// mesh object to look rigged, and invalidates the engine's VAO cache
// so the next draw picks up the new attribute buffers.
//
// HONEST WARNING: this writes new WebGL state and mutates engine-owned
// mesh objects. Math + buffer layout are verified by static tests but
// the live mutation hasn't been validated in a browser. If a force-
// skinned mesh renders incorrectly, the most likely culprits are
//   (a) the existing VAO retained stale bindings — try clearing
//       entityMeshRenderer.assetVAOs.delete(assetId) and forcing a
//       redraw,
//   (b) the vertex position layout doesn't match mesh.positions —
//       inspect mesh.vbo / mesh.attributes,
//   (c) joint index type mismatch — we use UNSIGNED_SHORT to match
//       the shader's uvec4 expectations.
//
// API (window.forceSkin after install):
//   .apply(assetId, rig, opts?) — returns { ok, vertCount, boneCount } | { error }
//   .revert(assetId) — restore mesh to its pre-forceSkin state
//   .list() — return list of force-skinned assetIds
//
// Once applied, the asset is rigged: the engine's existing draw path
// will set uHasSkin=1 + upload uJointMatrices from an attached MeshRigBridge.
// Use window.entityRig.attach(entityId, rigId, clipId, {assetId}) to drive it.

import { MeshRigBinding } from "./RigSystem.js";

export class ForceSkin {
    constructor() {
        this.applied = new Map();    // assetId → { savedFlags, jbo, wbo, ibm }
    }

    /**
     * Apply skinning to a static mesh.
     * @param {string} assetId — key in entityMeshRenderer.assetVAOs
     * @param {Object} rig     — { bones: [...] }
     * @param {Object} opts    — { renderer?, mesh?, syntheticClipDuration? }
     * @returns { ok, vertCount, boneCount } | { error }
     */
    apply(assetId, rig, opts = {}) {
        const renderer = opts.renderer || window.entityMeshRenderer;
        if (!renderer) return { error: "entityMeshRenderer not on window" };
        if (!rig?.bones?.length) return { error: "rig has no bones" };

        let mesh = opts.mesh;
        let assetEntry;
        if (!mesh) {
            assetEntry = renderer.assetVAOs?.get(assetId);
            if (!assetEntry) return { error: `asset '${assetId}' not in entityMeshRenderer.assetVAOs` };
            mesh = assetEntry.mesh;
        }
        if (!mesh) return { error: "could not resolve mesh" };
        if (mesh.isRigged) return { error: "mesh is already rigged — use entityRig.attach instead" };
        if (!mesh.positions || mesh.positions.length < 3) return { error: "mesh.positions required (Float32Array, 3 per vertex)" };

        const gl = renderer.gl;
        if (!gl) return { error: "renderer has no .gl context" };
        if (this.applied.has(assetId)) return { error: `'${assetId}' already force-skinned — revert() first` };

        // Build joints + weights via MeshRigBinding
        const mrb = new MeshRigBinding(mesh, rig);
        mrb.autoBind();
        const vertCount = mrb.vertCount;
        const boneCount = mrb.boneCount;

        // Create GL buffers
        const jbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, jbo);
        gl.bufferData(gl.ARRAY_BUFFER, mrb.joints, gl.STATIC_DRAW);
        const wbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, wbo);
        gl.bufferData(gl.ARRAY_BUFFER, mrb.weights, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Mutate the mesh to look rigged. Save the previous state so we
        // can revert cleanly.
        const savedFlags = {
            isRigged: mesh.isRigged,
            skin: mesh.skin,
            animations: mesh.animations,
            jbo: mesh.jbo,
            wbo: mesh.wbo,
            jointsComponentType: mesh.jointsComponentType,
        };

        mesh.isRigged = true;
        mesh.jbo = jbo;
        mesh.wbo = wbo;
        mesh.jointsComponentType = gl.UNSIGNED_SHORT;
        // Build a synthetic skin descriptor. inverseBindMatrices match the
        // MeshRigBinding's computed inverses so the bridge can use them.
        const ibm = [];
        for (let i = 0; i < boneCount; i++) {
            ibm.push(mrb.inverseBind.slice(i * 16, i * 16 + 16));
        }
        mesh.skin = {
            joints: rig.bones.map((_, i) => i),     // bone index = joint index
            inverseBindMatrices: ibm,
            skeleton: null,
        };
        // Synthetic single-frame animation so isRigged check passes.
        // Real animation comes via entityRig.attach driving uJointMatrices.
        const dur = opts.syntheticClipDuration ?? 1.0;
        mesh.animations = [{
            name: "_forceSkin_default",
            duration: dur,
            tracks: [],          // empty — bridge overrides anyway
        }];

        // Invalidate the cached VAO so the next draw rebuilds with the
        // new jbo + wbo bindings. The engine recreates it lazily on
        // _getOrCreateAssetVAO call.
        renderer.assetVAOs?.delete(assetId);
        // Also clear any per-entity animator cached for assets of this kind,
        // so the engine builds fresh animators (or our bridge replaces them).
        // (We don't know which entityIds use this asset; safer to nuke all.)
        for (const [eid, a] of [...renderer._animators?.entries() || []]) {
            if (a?.mesh === mesh) renderer._animators.delete(eid);
        }

        this.applied.set(assetId, { savedFlags, jbo, wbo, ibm, mesh, gl });
        return { ok: true, vertCount, boneCount };
    }

    revert(assetId) {
        const entry = this.applied.get(assetId);
        if (!entry) return { error: `not force-skinned: '${assetId}'` };
        const { savedFlags, mesh, gl, jbo, wbo } = entry;
        // Restore mesh flags
        mesh.isRigged = savedFlags.isRigged;
        mesh.skin = savedFlags.skin;
        mesh.animations = savedFlags.animations;
        mesh.jbo = savedFlags.jbo;
        mesh.wbo = savedFlags.wbo;
        mesh.jointsComponentType = savedFlags.jointsComponentType;
        // Delete our GL buffers
        try { gl.deleteBuffer(jbo); } catch {}
        try { gl.deleteBuffer(wbo); } catch {}
        // Invalidate VAO cache so next draw uses the restored (static) attribs
        const renderer = window.entityMeshRenderer;
        renderer?.assetVAOs?.delete(assetId);
        this.applied.delete(assetId);
        return { ok: true };
    }

    list() {
        return [...this.applied.keys()];
    }
}

export function installForceSkinGlobal() {
    if (!window.forceSkin) window.forceSkin = new ForceSkin();
    return window.forceSkin;
}
