// Pass 2 of 3 -- EXCLUSIVE PREFIX SUM (Blelloch work-efficient scan), single workgroup, N <= 1024.
// offsets[i] = number of survivors strictly before i. Result is a pure function of the flags -> order-independent.
// LIMIT (rig-only to lift): this scans ONE workgroup of up to 1024 elements. For more candidates, dispatch a
// multi-block scan with per-block carries; the CPU twin's exclusiveScan() has no such limit and is the reference.
//
// v4208 -- WORKGROUP SIZE 1024 -> 256, WITH THE LOOPS RESTRUCTURED, AND THE SECOND HALF IS THE POINT.
// v4207's WGSL validator found this shader asking for @workgroup_size(1024): four times WebGPU's default
// maxComputeInvocationsPerWorkgroup of 256, on a tree whose 27 requestDevice() calls never pass
// requiredLimits. createComputePipeline rejects it, so the shader "compiles" and the error lands elsewhere.
//
// *** CHANGING ONLY THE NUMBER WOULD HAVE BEEN WORSE THAN THE BUG. *** The old body wrote `if (thid < d)`,
// which silently needs as many invocations as the widest level of the tree -- 512 for a 1024-element scan.
// MEASURED in brain/transport/scanTwin.mjs: the original form at 256 threads gets 507 of 1024 offsets WRONG,
// the first at index 512. A pipeline that will not build is visible; a scan that quietly returns wrong
// offsets is not.
//
// The fix is the strided loop `for (var i = thid; i < d; i += WG)`: every invocation takes its share of each
// level whatever WG is, and it reduces to the original when WG >= d. Verified against primeTransport.js's
// serial exclusiveScan() at workgroup sizes 1, 2, 4, 16, 64, 128, 256, 512 and 1024 -- 40 random flag arrays
// each, all matching.
const N:  u32 = 1024u;                                 // elements scanned; must match shared_data's length
const WG: u32 = 256u;                                  // invocations; must match @workgroup_size below

@group(0) @binding(0) var<storage, read_write> survived_flags: array<u32>;
@group(0) @binding(1) var<storage, read_write> offsets:        array<u32>;

var<workgroup> shared_data: array<u32, 1024>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let thid = lid.x;
    let n = arrayLength(&survived_flags);

    // Load, padding to N with zeros. One workgroup means the global index IS the element index.
    for (var i = thid; i < N; i += WG) {
        if (i < n) { shared_data[i] = survived_flags[i]; } else { shared_data[i] = 0u; }
    }

    // up-sweep (reduce)
    var offset = 1u;
    for (var d = N >> 1u; d > 0u; d >>= 1u) {
        workgroupBarrier();
        for (var i = thid; i < d; i += WG) {
            let ai = offset * (2u * i + 1u) - 1u;
            let bi = offset * (2u * i + 2u) - 1u;
            shared_data[bi] += shared_data[ai];
        }
        offset *= 2u;
    }

    workgroupBarrier();
    if (thid == 0u) { shared_data[N - 1u] = 0u; }      // clear root for EXCLUSIVE scan

    // down-sweep
    for (var d = 1u; d < N; d *= 2u) {
        offset >>= 1u;
        workgroupBarrier();
        for (var i = thid; i < d; i += WG) {
            let ai = offset * (2u * i + 1u) - 1u;
            let bi = offset * (2u * i + 2u) - 1u;
            let t = shared_data[ai];
            shared_data[ai] = shared_data[bi];
            shared_data[bi] += t;
        }
    }
    workgroupBarrier();
    for (var i = thid; i < N; i += WG) {
        if (i < n) { offsets[i] = shared_data[i]; }
    }
}
