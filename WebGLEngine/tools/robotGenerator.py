"""
robotGenerator.py — procedural generator for our tiny rigged robot avatars.

The original robot model at GPU_Assets/RobotExpressive.glb was generated
by an earlier round of this same kind of script (asset.generator field
records "Engine v660 robot stub"). That generator code wasn't kept, so
this is v712's reconstruction with one extra capability: a `--dress`
mode that reshapes the leg vertices into a tapered skirt cone, producing
RobotWoman.glb.

Save this file. Re-run any time you want to tweak proportions, add
animation clips, switch materials, or experiment with new variants.

Approach: rather than build an entire glTF from scratch (skeleton + skin
weights + bind matrices + animations — easy to get one byte wrong), we
LOAD the existing RobotExpressive.glb as a template, identify the leg
vertices via their JOINTS_0 bone assignment (bones 5 and 6 in the skin),
and reshape only those 16 vertices into a skirt. Everything else stays
identical, including the "idle" animation.

Dependencies:  pygltflib >= 1.16, numpy >= 1.20
Run:           python tools/robotGenerator.py
Output:        GPU_Assets/RobotWoman.glb (overwrites if present)

CLI flags:
  --src   PATH    Source template GLB (default: GPU_Assets/RobotExpressive.glb)
  --out   PATH    Output path (default: GPU_Assets/RobotWoman.glb)
  --hem   FLOAT   Skirt hem width in world units (default 0.55).
                  Bigger = wider flare at the bottom.
  --waist FLOAT   Skirt top width (default 0.20). Where the dress meets the torso.
  --bottom FLOAT  Y-coord of skirt hem (default 0.05). Lower = longer dress.
  --top    FLOAT  Y-coord of skirt waist (default 0.90).

Limitations (honest gap list as of v712):
  * Source GLB has only ONE animation: "idle". The full three.js
    RobotExpressive sample (1.3 MB, not what we have) has Walking,
    Dance, Wave, Death, Jump etc. Our stub is 14 KB. To add wave/
    dance/etc procedurally, we'd extend this script with additional
    animation channels (keyframes per bone over time). Tracked as a
    follow-up.
  * The mesh is welded into one primitive with cube-ish leg geometry.
    Reshaping into a cone keeps the same 8 vertices per leg, so the
    skirt looks like 2 half-cones (one per leg) rather than one
    unified skirt. Visually fine from most angles — slight seam
    visible from directly in front or back. Could be unified in a
    future round by collapsing inner faces.
  * No texture, just the existing flat-grey PBR material.
"""

import argparse
import struct
import sys
import os
from pathlib import Path

try:
    import pygltflib
    import numpy as np
except ImportError as e:
    print(f"FATAL: missing dependency: {e}", file=sys.stderr)
    print("Install with:  pip install pygltflib numpy", file=sys.stderr)
    sys.exit(1)


# Bone IDs in the source skin's joint list (verified against
# RobotExpressive.glb at v712):
LEFT_LEG_BONE  = 5
RIGHT_LEG_BONE = 6
# Other joints kept for reference:
#   0 = root  · 1 = torso · 2 = head · 3 = leftArm · 4 = rightArm


def reshape_legs_to_skirt(positions, joints, hem=0.55, waist=0.20,
                          y_bottom=0.05, y_top=0.90):
    """Reshape the leg cube vertices into a tapered skirt cone.

    For each vertex weighted primarily to leftLeg or rightLeg:
      * Project the vertex's height onto a [0, 1] range where 0 = waist,
        1 = hem (clamped).
      * Compute the desired X distance from centerline:
        width = waist + (hem - waist) * height_t
      * For the leg side (sign of original X), nudge X to ±width/2.
      * Keep Z proportionally narrower so the skirt is oval, not round
        (matches the robot's flat-cube aesthetic).
      * Preserve the bone-to-vertex assignment so animations still work.
    """
    out = positions.copy()
    for i, vertex_bones in enumerate(joints):
        # The vertex's primary bone (first weight slot is dominant)
        primary = int(vertex_bones[0])
        if primary not in (LEFT_LEG_BONE, RIGHT_LEG_BONE):
            continue
        px, py, pz = positions[i]
        # Height ratio: 0 at the top of the skirt, 1 at the hem
        # Original leg vertices span roughly y=0.05..0.90 in this rig.
        denom = (y_top - y_bottom) if (y_top - y_bottom) > 1e-6 else 1.0
        h = max(0.0, min(1.0, (y_top - py) / denom))
        # Width at this height (linear taper). Halve for ±sign.
        half_w = (waist + (hem - waist) * h) * 0.5
        # X side based on which leg this is + original sign
        side = -1.0 if primary == LEFT_LEG_BONE else 1.0
        # Keep the original X sign within the same leg so the cube's
        # inner + outer faces stay on the right sides
        side_x = 1.0 if px >= 0 else -1.0
        out[i, 0] = side * half_w * abs(side_x if primary == LEFT_LEG_BONE else side_x)
        # Z gets a slight taper too (oval skirt, narrower front-to-back
        # than side-to-side). 60% of X width.
        z_sign = 1.0 if pz >= 0 else -1.0
        out[i, 2] = z_sign * half_w * 0.60
        # Y stays the same — the model's vertical span is preserved
    return out


def write_back_positions(gltf, new_positions):
    """Splice modified positions back into the binary buffer."""
    prim = gltf.meshes[0].primitives[0]
    pos_acc = gltf.accessors[prim.POSITION] if hasattr(prim, "POSITION") else gltf.accessors[prim.attributes.POSITION]
    pos_bv = gltf.bufferViews[pos_acc.bufferView]
    offset = pos_bv.byteOffset + (pos_acc.byteOffset or 0)
    count = pos_acc.count
    # Get the raw blob, splice in new bytes, set it back
    blob = bytearray(gltf.binary_blob())
    new_bytes = new_positions.astype(np.float32).tobytes()
    assert len(new_bytes) == count * 12, f"expected {count*12} bytes, got {len(new_bytes)}"
    blob[offset:offset + count*12] = new_bytes
    gltf.set_binary_blob(bytes(blob))
    # Update accessor min/max so glTF validation is happy
    pos_acc.min = new_positions.min(axis=0).tolist()
    pos_acc.max = new_positions.max(axis=0).tolist()


# ----------------------------------------------------------------------
# v713 — procedural animations (wave + dance)
# ----------------------------------------------------------------------

def quat_axis_angle(axis, angle_rad):
    """Build a glTF quaternion (x, y, z, w) from an axis vector + angle.

    glTF stores rotations as unit quaternions in XYZW order, applied as
    v' = q * v * q^-1 where q = (sin(θ/2)*axis, cos(θ/2)).
    """
    ax = np.asarray(axis, dtype=np.float64)
    n = np.linalg.norm(ax)
    if n < 1e-9:
        return np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float32)
    ax = ax / n
    s = np.sin(angle_rad / 2.0)
    return np.array([ax[0]*s, ax[1]*s, ax[2]*s, np.cos(angle_rad/2.0)],
                    dtype=np.float32)


def append_to_buffer(blob, data, gltf):
    """Pad blob to 4-byte alignment, append raw bytes, register a new
    BufferView pointing at the appended region. Returns the new view index.
    """
    pad = (-len(blob)) & 3
    if pad:
        blob.extend(b"\x00" * pad)
    offset = len(blob)
    blob.extend(data)
    bv = pygltflib.BufferView(
        buffer=0, byteOffset=offset, byteLength=len(data),
    )
    gltf.bufferViews.append(bv)
    return len(gltf.bufferViews) - 1


def add_animation(gltf, blob, name, channels_spec, duration_s):
    """Add a new Animation. channels_spec is a list of dicts:
        {target_node: <node-index>, path: "rotation"|"translation"|"scale",
         keyframes: np.ndarray of shape (N, components)}
    All channels share one time accessor with N evenly-spaced keyframes
    from 0 to duration_s.
    """
    n_kf = channels_spec[0]["keyframes"].shape[0]
    # Validate every channel has the same N
    for c in channels_spec:
        assert c["keyframes"].shape[0] == n_kf, "all channels must share keyframe count"
    times = np.linspace(0.0, duration_s, n_kf, dtype=np.float32)
    # Time bufferView + accessor
    times_bv = append_to_buffer(blob, times.tobytes(), gltf)
    times_acc_i = len(gltf.accessors)
    gltf.accessors.append(pygltflib.Accessor(
        bufferView=times_bv, byteOffset=0,
        componentType=pygltflib.FLOAT, count=n_kf,
        type=pygltflib.SCALAR,
        min=[float(times.min())], max=[float(times.max())],
    ))
    samplers = []
    anim_channels = []
    PATH_TYPE = {"rotation": pygltflib.VEC4, "translation": pygltflib.VEC3, "scale": pygltflib.VEC3}
    for spec in channels_spec:
        values = spec["keyframes"].astype(np.float32)
        type_str = PATH_TYPE[spec["path"]]
        values_bv = append_to_buffer(blob, values.tobytes(), gltf)
        values_acc_i = len(gltf.accessors)
        gltf.accessors.append(pygltflib.Accessor(
            bufferView=values_bv, byteOffset=0,
            componentType=pygltflib.FLOAT, count=n_kf,
            type=type_str,
        ))
        sampler_idx = len(samplers)
        samplers.append(pygltflib.AnimationSampler(
            input=times_acc_i, output=values_acc_i, interpolation="LINEAR",
        ))
        anim_channels.append(pygltflib.AnimationChannel(
            sampler=sampler_idx,
            target=pygltflib.AnimationChannelTarget(
                node=spec["target_node"], path=spec["path"],
            ),
        ))
    gltf.animations.append(pygltflib.Animation(
        name=name, channels=anim_channels, samplers=samplers,
    ))


def build_wave_keyframes():
    """Wave animation: only the right arm moves. 2 seconds, 7 keyframes:
       0.0  arm down (identity)
       0.33 arm up (rotated 130° around the bone's Z axis — points up-and-out)
       0.66 wave one direction (slight +X rotation)
       1.00 wave other direction (slight -X rotation)
       1.33 wave one direction again
       1.66 arm up steady
       2.0  arm down
    """
    # Right arm = node index 4 in the source rig
    base_up    = quat_axis_angle([0, 0, 1], np.radians(130))
    wave_l     = quat_axis_angle([1, 0, 1], np.radians(135))     # slight tilt
    wave_r     = quat_axis_angle([-1, 0, 1], np.radians(135))
    rest       = quat_axis_angle([0, 0, 0], 0.0)
    frames = np.array([rest, base_up, wave_l, wave_r, wave_l, base_up, rest],
                      dtype=np.float32)
    return [{"target_node": 4, "path": "rotation", "keyframes": frames}]


def build_dance_keyframes():
    """Dance animation: torso sways, head bobs, arms swing alternately,
    legs sway opposite to torso. 1.6s loop, 9 keyframes — a smooth left-
    right-left-right cycle.
    """
    # 9 evenly spaced keyframes through one full sway cycle that loops
    # cleanly back to the start.
    n = 9
    t = np.linspace(0, 2*np.pi, n, dtype=np.float64)
    sway_amp = np.radians(18)       # torso sway side-to-side
    nod_amp  = np.radians(8)        # head bob front-back
    arm_amp  = np.radians(35)       # arm swing
    leg_amp  = np.radians(10)       # leg sway

    def per_frame_quats(per_t):
        return np.array([per_t(ti) for ti in t], dtype=np.float32)

    # Torso (node 1): sways around Z axis (side-to-side)
    torso = per_frame_quats(lambda ti: quat_axis_angle([0, 0, 1], sway_amp * np.sin(ti)))
    # Head (node 2): bobs around X axis (nod) PLUS slight counter-sway on Z
    head = per_frame_quats(lambda ti: quat_axis_angle(
        [np.cos(ti)*0.7, 0, -0.5*np.sin(ti)],
        nod_amp * abs(np.sin(2*ti))))
    # Left arm (node 3): swings around X (forward/back)
    left_arm = per_frame_quats(lambda ti: quat_axis_angle([1, 0, 0], arm_amp * np.sin(ti)))
    # Right arm (node 4): swings opposite phase
    right_arm = per_frame_quats(lambda ti: quat_axis_angle([1, 0, 0], -arm_amp * np.sin(ti)))
    # Left leg / skirt left (node 5): sways with torso (same direction)
    left_leg = per_frame_quats(lambda ti: quat_axis_angle([0, 0, 1], -leg_amp * np.sin(ti)))
    # Right leg / skirt right (node 6): same direction (skirt moves as one)
    right_leg = per_frame_quats(lambda ti: quat_axis_angle([0, 0, 1], -leg_amp * np.sin(ti)))

    return [
        {"target_node": 1, "path": "rotation", "keyframes": torso},
        {"target_node": 2, "path": "rotation", "keyframes": head},
        {"target_node": 3, "path": "rotation", "keyframes": left_arm},
        {"target_node": 4, "path": "rotation", "keyframes": right_arm},
        {"target_node": 5, "path": "rotation", "keyframes": left_leg},
        {"target_node": 6, "path": "rotation", "keyframes": right_leg},
    ]


def add_wave_and_dance(gltf):
    """Append wave + dance animations to the gltf. Modifies the binary blob
    in place by appending new data and registering buffer views/accessors.
    Bones are referenced by hard-coded indices that match the source
    RobotExpressive rig (root=0, torso=1, head=2, leftArm=3, rightArm=4,
    leftLeg=5, rightLeg=6).
    """
    # Get the current blob as a mutable bytearray
    blob = bytearray(gltf.binary_blob())
    add_animation(gltf, blob, "wave", build_wave_keyframes(), duration_s=2.0)
    add_animation(gltf, blob, "dance", build_dance_keyframes(), duration_s=1.6)
    gltf.set_binary_blob(bytes(blob))


# v987 — hands + feet. The base rig has none. Append four rigid blocks (2 hands
# on the arm bones, 2 feet on the leg bones) as a SECOND primitive, so existing
# geometry + animations are never touched. No new bones and no fingers — each
# block is skinned 100% to the arm/leg bone it hangs off, so it moves with
# wave/dance for free. Box placements were measured from the stub rig's limb
# bounding boxes (arms end low at y~0.95; legs bottom at y~0.05).
HF_BONES = {"leftArm": 3, "rightArm": 4, "leftLeg": 5, "rightLeg": 6}

def _box(center, half, bone):
    cx, cy, cz = center; hx, hy, hz = half
    faces = [
        ((+1,0,0), [(+hx,-hy,+hz),(+hx,-hy,-hz),(+hx,+hy,-hz),(+hx,+hy,+hz)]),
        ((-1,0,0), [(-hx,-hy,-hz),(-hx,-hy,+hz),(-hx,+hy,+hz),(-hx,+hy,-hz)]),
        ((0,+1,0), [(-hx,+hy,+hz),(+hx,+hy,+hz),(+hx,+hy,-hz),(-hx,+hy,-hz)]),
        ((0,-1,0), [(-hx,-hy,-hz),(+hx,-hy,-hz),(+hx,-hy,+hz),(-hx,-hy,+hz)]),
        ((0,0,+1), [(-hx,-hy,+hz),(+hx,-hy,+hz),(+hx,+hy,+hz),(-hx,+hy,+hz)]),
        ((0,0,-1), [(+hx,-hy,-hz),(-hx,-hy,-hz),(-hx,+hy,-hz),(+hx,+hy,-hz)]),
    ]
    P=[]; N=[]; I=[]
    for nrm, corners in faces:
        nrm=np.array(nrm,float); base=len(P)
        vs=[np.array([cx+ox,cy+oy,cz+oz]) for ox,oy,oz in corners]
        # emit triangles wound so the geometric normal faces outward
        c=np.cross(vs[1]-vs[0], vs[2]-vs[0])
        order=[0,1,2,0,2,3] if np.dot(c,nrm)>=0 else [0,2,1,0,3,2]
        for v in vs: P.append(v); N.append(nrm)
        for k in order: I.append(base+k)
    n=len(P)
    return (np.array(P,np.float32), np.array(N,np.float32), np.array(I,np.uint16),
            np.array([[bone,0,0,0]]*n,np.uint8), np.array([[1,0,0,0]]*n,np.float32))

def add_hands_and_feet(gltf):
    """Append 2 hands (arm bones) + 2 feet (leg bones) as a new primitive.
    Returns the number of vertices added."""
    parts = [
        _box((-0.45, 0.90, 0.00), (0.100, 0.100, 0.100), HF_BONES["leftArm"]),
        _box(( 0.45, 0.90, 0.00), (0.100, 0.100, 0.100), HF_BONES["rightArm"]),
        _box((-0.193,0.04, 0.06), (0.095, 0.055, 0.180), HF_BONES["leftLeg"]),
        _box(( 0.193,0.04, 0.06), (0.095, 0.055, 0.180), HF_BONES["rightLeg"]),
    ]
    P=np.concatenate([p[0] for p in parts]); N=np.concatenate([p[1] for p in parts])
    J=np.concatenate([p[3] for p in parts]); W=np.concatenate([p[4] for p in parts])
    I=[]; off=0
    for p in parts:
        I.append(p[2]+off); off+=len(p[0])
    I=np.concatenate(I).astype(np.uint16)

    blob=bytearray(gltf.binary_blob())
    ARR, ELEM = 34962, 34963   # ARRAY_BUFFER / ELEMENT_ARRAY_BUFFER
    def add(data, target):
        pad=(-len(blob))&3
        if pad: blob.extend(b"\x00"*pad)
        o=len(blob); blob.extend(data)
        gltf.bufferViews.append(pygltflib.BufferView(
            buffer=0, byteOffset=o, byteLength=len(data), target=target))
        return len(gltf.bufferViews)-1
    def acc(bv, ct, count, at, mn=None, mx=None):
        gltf.accessors.append(pygltflib.Accessor(
            bufferView=bv, byteOffset=0, componentType=ct, count=count, type=at, min=mn, max=mx))
        return len(gltf.accessors)-1
    pa=acc(add(P.tobytes(),ARR), pygltflib.FLOAT,         len(P), pygltflib.VEC3, P.min(0).tolist(), P.max(0).tolist())
    na=acc(add(N.tobytes(),ARR), pygltflib.FLOAT,         len(N), pygltflib.VEC3)
    ja=acc(add(J.tobytes(),ARR), pygltflib.UNSIGNED_BYTE, len(J), pygltflib.VEC4)
    wa=acc(add(W.tobytes(),ARR), pygltflib.FLOAT,         len(W), pygltflib.VEC4)
    ia=acc(add(I.tobytes(),ELEM),pygltflib.UNSIGNED_SHORT,len(I), pygltflib.SCALAR, [int(I.min())], [int(I.max())])
    mat=gltf.meshes[0].primitives[0].material
    gltf.meshes[0].primitives.append(pygltflib.Primitive(
        attributes=pygltflib.Attributes(POSITION=pa, NORMAL=na, JOINTS_0=ja, WEIGHTS_0=wa),
        indices=ia, material=mat))
    gltf.set_binary_blob(bytes(blob))
    gltf.buffers[0].byteLength=len(blob)
    return len(P)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    # Resolve paths relative to this script's parent (WebGLEngine/)
    here = Path(__file__).resolve().parent.parent
    parser.add_argument("--src",    default=str(here / "GPU_Assets" / "RobotExpressive.glb"))
    parser.add_argument("--out",    default=str(here / "GPU_Assets" / "RobotWoman.glb"))
    parser.add_argument("--hem",    type=float, default=0.55)
    parser.add_argument("--waist",  type=float, default=0.20)
    parser.add_argument("--bottom", type=float, default=0.05)
    parser.add_argument("--top",    type=float, default=0.90)
    # v713 — animation clips. Comma-separated list of "wave", "dance", or
    # "none" to skip adding extras (keeps only the source's idle).
    parser.add_argument("--animations", default="wave,dance",
        help='Comma-separated extra animations to add. Options: wave, dance, none. Default: wave,dance')
    parser.add_argument("--no-dress", action="store_true",
        help="Skip the skirt reshape (regenerate RobotMan with new animations only)")
    parser.add_argument("--no-hands-feet", action="store_true",
        help="Skip adding hand + foot blocks (v987 default is to add them)")
    args = parser.parse_args()

    src_path = Path(args.src)
    if not src_path.exists():
        print(f"FATAL: source not found: {src_path}", file=sys.stderr); sys.exit(1)

    print(f"reading template:  {src_path}")
    gltf = pygltflib.GLTF2().load(str(src_path))

    # Read current positions + joints
    prim = gltf.meshes[0].primitives[0]
    pos_acc = gltf.accessors[prim.attributes.POSITION]
    pos_bv = gltf.bufferViews[pos_acc.bufferView]
    pos_offset = pos_bv.byteOffset + (pos_acc.byteOffset or 0)
    blob = gltf.binary_blob()
    positions = np.frombuffer(blob, dtype=np.float32,
        count=pos_acc.count*3, offset=pos_offset).reshape(-1, 3).copy()

    j_acc = gltf.accessors[prim.attributes.JOINTS_0]
    j_bv = gltf.bufferViews[j_acc.bufferView]
    j_offset = j_bv.byteOffset + (j_acc.byteOffset or 0)
    dtype = np.uint8 if j_acc.componentType == 5121 else np.uint16
    joints = np.frombuffer(blob, dtype=dtype,
        count=j_acc.count*4, offset=j_offset).reshape(-1, 4)

    print(f"vertices: {pos_acc.count}  ({sum(1 for j in joints if j[0] in (5,6))} on legs)")

    if not args.no_dress:
        # Reshape legs into skirt
        new_positions = reshape_legs_to_skirt(positions, joints,
            hem=args.hem, waist=args.waist,
            y_bottom=args.bottom, y_top=args.top)
        n_changed = int((np.abs(new_positions - positions) > 1e-6).any(axis=1).sum())
        print(f"reshaped {n_changed} leg vertices into skirt cone")
        print(f"  skirt hem ±{args.hem/2:.3f}  waist ±{args.waist/2:.3f}")
        write_back_positions(gltf, new_positions)
    else:
        print("skipping dress reshape (--no-dress)")

    # v713 — add wave + dance animation clips (or whichever the user picks)
    want = [a.strip().lower() for a in args.animations.split(",") if a.strip()]
    want = [a for a in want if a != "none"]
    if want:
        blob = bytearray(gltf.binary_blob())
        if "wave" in want:
            add_animation(gltf, blob, "wave", build_wave_keyframes(), duration_s=2.0)
            print("added animation: wave (2.0s)")
        if "dance" in want:
            add_animation(gltf, blob, "dance", build_dance_keyframes(), duration_s=1.6)
            print("added animation: dance (1.6s)")
        gltf.set_binary_blob(bytes(blob))
        print(f"animations on output: {[a.name for a in gltf.animations]}")

    # v987 — add hand + foot blocks (skinned to arm/leg bones) unless skipped
    if not args.no_hands_feet:
        nhf = add_hands_and_feet(gltf)
        print(f"added hands + feet: +{nhf} verts (2 hands on arm bones, 2 feet on leg bones)")

    # Mark our work in the asset metadata so future inspection knows
    # what tool produced this file
    bits = []
    if not args.no_dress: bits.append("dress")
    bits.extend(want)
    if not args.no_hands_feet: bits.append("hands+feet")
    gltf.asset.generator = "robotGenerator.py v987 (" + " + ".join(bits) + ")"

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gltf.save_binary(str(out_path))
    print(f"wrote:             {out_path}  ({out_path.stat().st_size} bytes)")
    print()
    print("Done. Drop the file in WebGLEngine/GPU_Assets/, then on the")
    print("phone open localStorage:")
    print('  localStorage.setItem("voxelengine.customGlbAsset", "RobotWoman")')
    print("then cycle to avatar slot 2 (Custom rigged GLB).")


if __name__ == "__main__":
    main()
