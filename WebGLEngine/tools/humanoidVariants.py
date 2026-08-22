#!/usr/bin/env python3
"""humanoidVariants.py — derive the family of default boxy avatars from the
proven RobotWoman.glb rig (7 joints: root/torso/head/L-arm/R-arm/L-leg/R-leg,
idle+wave+dance animations).

We DON'T author a skeleton from scratch (easy to get one byte wrong). Instead we
load the working rig and only touch the MESH primitive: reshape the leg verts,
and append new boxes (hands, feet) / a ring (enclosed skirt) weighted RIGIDLY to
existing bones. The skin (inverseBindMatrices) and the animation channels target
the bone NODES, not the mesh, so they stay valid no matter what we do to the
geometry. New accessors are appended and the primitive is repointed; the old
mesh accessors are simply orphaned (valid glTF).

Outputs (GPU_Assets/):
  RobotMan.glb       box legs, no hands/feet      (the original stick man)
  RobotManHF.glb     box legs + hands + feet      (new)
  RobotWomanHF.glb   slim legs + enclosed skirt + hands + feet  (new)
  RobotWoman.glb     left as-is (classic half-cone skirt)
"""
import sys, math
import numpy as np
import pygltflib
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SRC  = HERE / "GPU_Assets" / "RobotWoman.glb"

ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963

# Bone indices in the rig (verified above)
B_ROOT, B_TORSO, B_HEAD, B_LARM, B_RARM, B_LLEG, B_RLEG = range(7)

# unit-cube corners + 12-triangle index template (no backface culling in the
# avatar shader, so winding is forgiving)
_CUBE = np.array([(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                  (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)], dtype=np.float32)
_CUBE_IDX = np.array([0,2,1, 0,3,2,  4,5,6, 4,6,7,  0,4,7, 0,7,3,
                      1,2,6, 1,6,5,  0,1,5, 0,5,4,  3,7,6, 3,6,2], dtype=np.uint32)

def box(cx, cy, cz, hx, hy, hz, bone):
    """8-vert cuboid centred at (cx,cy,cz), half-extents (hx,hy,hz), rigidly
    weighted to `bone`. Returns (pos, nrm, joints, weights, idx)."""
    pos = _CUBE * np.array([hx, hy, hz], np.float32) + np.array([cx, cy, cz], np.float32)
    nrm = _CUBE / np.linalg.norm(_CUBE, axis=1, keepdims=True)   # rounded-cube normals
    j = np.zeros((8, 4), np.uint8);   j[:, 0] = bone
    w = np.zeros((8, 4), np.float32); w[:, 0] = 1.0
    return pos.astype(np.float32), nrm.astype(np.float32), j, w, _CUBE_IDX.copy()

def skirt_ring(y_top, r_top, y_bot, r_bot, n=14, bone=B_ROOT, z_squash=0.72):
    """An enclosed oval skirt frustum (waist ring → hem ring), weighted to the
    hips so it sways with the body."""
    pos, nrm = [], []
    for k in range(n):
        a = 2 * math.pi * k / n
        ca, sa = math.cos(a), math.sin(a)
        pos.append((r_top * ca, y_top, r_top * sa * z_squash))
        nrm.append((ca, 0.25, sa * z_squash))
        pos.append((r_bot * ca, y_bot, r_bot * sa * z_squash))
        nrm.append((ca, -0.15, sa * z_squash))
    pos = np.array(pos, np.float32); nrm = np.array(nrm, np.float32)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    idx = []
    for k in range(n):
        wt, hm = 2 * k, 2 * k + 1
        wt2, hm2 = 2 * ((k + 1) % n), 2 * ((k + 1) % n) + 1
        idx += [wt, hm, hm2,  wt, hm2, wt2]
    j = np.zeros((len(pos), 4), np.uint8);   j[:, 0] = bone
    w = np.zeros((len(pos), 4), np.float32); w[:, 0] = 1.0
    return pos, nrm, j, w, np.array(idx, np.uint32)

def _read(g, blob, acc_i, dt, comp):
    a = g.accessors[acc_i]; bv = g.bufferViews[a.bufferView]
    off = bv.byteOffset + (a.byteOffset or 0)
    arr = np.frombuffer(blob, dtype=dt, count=a.count * comp, offset=off)
    return arr.reshape(-1, comp).copy() if comp > 1 else arr.copy()

def build(out_name, *, box_legs=False, hands=False, feet=False, enclosed_skirt=False):
    g = pygltflib.GLTF2().load(str(SRC))
    blob = g.binary_blob()
    prim = g.meshes[0].primitives[0]
    pos = _read(g, blob, prim.attributes.POSITION, np.float32, 3)
    nrm = _read(g, blob, prim.attributes.NORMAL,   np.float32, 3)
    jt  = _read(g, blob, prim.attributes.JOINTS_0, np.uint8,   4)
    wt  = _read(g, blob, prim.attributes.WEIGHTS_0, np.float32, 4)
    ia  = g.accessors[prim.indices]
    idx = _read(g, blob, prim.indices, np.uint16 if ia.componentType == 5123 else np.uint32, 1).astype(np.uint32)

    # ---- reshape legs (bones 5,6) into straight boxes for the "man" ----
    if box_legs:
        for bone, cx in ((B_LLEG, -0.18), (B_RLEG, 0.18)):
            m = jt[:, 0] == bone
            ys = pos[m][:, 1]
            y0, y1 = ys.min(), ys.max()
            bp, bn, _, _, _ = box(cx, (y0 + y1) / 2, 0.0, 0.085, (y1 - y0) / 2, 0.10, bone)
            pos[m] = bp; nrm[m] = bn

    parts = []   # (pos,nrm,joints,weights,idx)
    # ---- hands: a chunky block at each arm's lower end ----
    if hands:
        parts.append(box(-0.45, 0.92, 0.0, 0.105, 0.085, 0.095, B_LARM))
        parts.append(box( 0.45, 0.92, 0.0, 0.105, 0.085, 0.095, B_RARM))
    # ---- feet: a forward-pointing block at each leg bottom ----
    if feet:
        parts.append(box(-0.18, 0.03, 0.07, 0.095, 0.045, 0.16, B_LLEG))
        parts.append(box( 0.18, 0.03, 0.07, 0.095, 0.045, 0.16, B_RLEG))
    # ---- enclosed skirt: oval frustum over slimmed legs ----
    if enclosed_skirt:
        # slim the (cone) legs into thin pillars inside the skirt
        for bone, cx in ((B_LLEG, -0.10), (B_RLEG, 0.10)):
            m = jt[:, 0] == bone
            bp, bn, _, _, _ = box(cx, 0.42, 0.0, 0.055, 0.40, 0.06, bone)
            pos[m] = bp; nrm[m] = bn
        parts.append(skirt_ring(y_top=0.92, r_top=0.22, y_bot=0.10, r_bot=0.40, n=14, bone=B_ROOT))

    # ---- combine ----
    base_n = len(pos)
    all_pos, all_nrm, all_jt, all_wt, all_idx = [pos], [nrm], [jt], [wt], [idx]
    off = base_n
    for (p, n, j, w, ix) in parts:
        all_pos.append(p); all_nrm.append(n); all_jt.append(j); all_wt.append(w)
        all_idx.append(ix + off); off += len(p)
    P = np.concatenate(all_pos).astype(np.float32)
    N = np.concatenate(all_nrm).astype(np.float32)
    J = np.concatenate(all_jt).astype(np.uint8)
    W = np.concatenate(all_wt).astype(np.float32)
    I = np.concatenate(all_idx).astype(np.uint32 if off > 65535 else np.uint16)

    # ---- append new accessors, repoint primitive (old ones orphaned) ----
    buf = bytearray(g.binary_blob())
    def add(arr, comp_type, type_str, target, is_pos=False):
        while len(buf) % 4: buf.append(0)
        o = len(buf); data = arr.tobytes(); buf.extend(data)
        g.bufferViews.append(pygltflib.BufferView(buffer=0, byteOffset=o, byteLength=len(data), target=target))
        bvi = len(g.bufferViews) - 1
        a = pygltflib.Accessor(bufferView=bvi, componentType=comp_type, count=len(arr), type=type_str)
        if is_pos:
            a.min = arr.min(axis=0).tolist(); a.max = arr.max(axis=0).tolist()
        g.accessors.append(a); return len(g.accessors) - 1

    prim.attributes.POSITION = add(P, 5126, "VEC3", ARRAY_BUFFER, is_pos=True)
    prim.attributes.NORMAL   = add(N, 5126, "VEC3", ARRAY_BUFFER)
    prim.attributes.JOINTS_0 = add(J, 5121, "VEC4", ARRAY_BUFFER)
    prim.attributes.WEIGHTS_0 = add(W, 5126, "VEC4", ARRAY_BUFFER)
    prim.indices = add(I, 5123 if I.dtype == np.uint16 else 5125, "SCALAR", ELEMENT_ARRAY_BUFFER)

    g.set_binary_blob(bytes(buf))
    g.buffers[0].byteLength = len(buf)
    g.asset.generator = f"humanoidVariants.py ({out_name})"
    out = HERE / "GPU_Assets" / out_name
    g.save_binary(str(out))
    return out, len(P), len(I)

def main():
    if not SRC.exists():
        print("FATAL: need GPU_Assets/RobotWoman.glb as the base rig", file=sys.stderr); sys.exit(1)
    jobs = [
        ("RobotMan.glb",     dict(box_legs=True)),
        ("RobotManHF.glb",   dict(box_legs=True, hands=True, feet=True)),
        ("RobotWomanHF.glb", dict(enclosed_skirt=True, hands=True, feet=True)),
    ]
    for name, opts in jobs:
        out, nv, ni = build(name, **opts)
        print(f"wrote {out.name:18s} verts={nv:4d} indices={ni:5d}  ({out.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
