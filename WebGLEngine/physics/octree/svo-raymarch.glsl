#version 300 es
// physics/octree/svo-raymarch.glsl -- WebGL2 fragment shader raymarching the packed SVO.
//
// RIG-ONLY: shaders cannot run in the sandbox. What IS verified is the BUFFER ADDRESSING -- the node read and the
// bitCount child-offset below are byte-for-byte the same logic as svoAt() in svoGenerator.js, which the gate
// round-trips against the source octree. The RAY STEPPING (AABB entry, octant descent, empty-space skip) is the
// part to validate on Galaxina against the CPU reader: for a set of rays, the voxel hit here must equal what a CPU
// march through svoAt reports.
//
// Node layout (matches svoGenerator.js): texel = uvec2( childMask | leafMask<<8 , childPtr ), fetched from an
// RG32UI texture. Children of a node are contiguous at childPtr; octant j's child is at childPtr + bitCount(childMask below j).
precision highp float;
precision highp int;

uniform usampler2D u_svo;      // RG32UI: R = masks, G = childPtr/color
uniform int u_texWidth;
uniform vec3 u_camPos;         // camera in the [0,1] cube
uniform vec3 u_camDir;         // normalized forward
uniform vec2 u_res;
out vec4 fragColor;

uvec2 fetchNode(uint slot) {
    int i = int(slot);
    ivec2 tc = ivec2(i % u_texWidth, i / u_texWidth);
    uvec4 t = texelFetch(u_svo, tc, 0);
    return uvec2(t.r, t.g);
}

// EXACTLY svoAt()'s descent: returns 1u and writes `color` if (p) lands in a solid voxel leaf, else 0u.
uint svoSample(vec3 p, out uint color) {
    color = 0u;
    if (any(lessThan(p, vec3(0.0))) || any(greaterThanEqual(p, vec3(1.0)))) return 0u;
    uint slot = 0u;
    vec3 o = vec3(0.0);
    float s = 1.0;
    for (int guard = 0; guard < 32; ++guard) {
        uvec2 node = fetchNode(slot);
        uint childMask = node.x & 0xFFu;
        uint leafMask = (node.x >> 8) & 0xFFu;
        uint childPtr = node.y;
        float h = s * 0.5;
        uint cx = p.x >= o.x + h ? 1u : 0u;
        uint cy = p.y >= o.y + h ? 1u : 0u;
        uint cz = p.z >= o.z + h ? 1u : 0u;
        uint octant = cx + cy * 2u + cz * 4u;
        if (((childMask >> octant) & 1u) == 0u) return 0u;                 // empty octant
        uint offset = uint(bitCount(int(childMask & ((1u << octant) - 1u))));
        uint childSlot = childPtr + offset;
        if (((leafMask >> octant) & 1u) == 1u) { color = fetchNode(childSlot).y; return 1u; }   // voxel hit
        o += vec3(float(cx), float(cy), float(cz)) * h;
        s = h;
        slot = childSlot;
    }
    return 0u;
}

void main() {
    // build a ray for this fragment (simple pinhole; multiply by your view basis as needed)
    vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
    vec3 fwd = normalize(u_camDir);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);
    vec3 rd = normalize(fwd + uv.x * right + uv.y * up);
    vec3 ro = u_camPos;

    // ray vs the [0,1] cube
    vec3 inv = 1.0 / rd;
    vec3 t0 = (vec3(0.0) - ro) * inv, t1 = (vec3(1.0) - ro) * inv;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
    float tExit = min(min(tmax.x, tmax.y), tmax.z);
    if (tEnter > tExit) { fragColor = vec4(0.02, 0.03, 0.05, 1.0); return; }  // miss -> background

    // march: sample the SVO, stepping by a fraction of the smallest voxel. (Empty-node skip via octant AABB is the
    // Laine-Karras optimization to add on the rig; this fixed-step march is the correct-but-slower reference.)
    float t = tEnter + 1e-4;
    for (int i = 0; i < 512; ++i) {
        if (t > tExit) break;
        uint color;
        if (svoSample(ro + rd * t, color) == 1u) {
            vec3 c = vec3(float((color >> 16) & 0xFFu), float((color >> 8) & 0xFFu), float(color & 0xFFu)) / 255.0;
            fragColor = vec4(c, 1.0);
            return;
        }
        t += 1.0 / 512.0;
    }
    fragColor = vec4(0.02, 0.03, 0.05, 1.0);
}
