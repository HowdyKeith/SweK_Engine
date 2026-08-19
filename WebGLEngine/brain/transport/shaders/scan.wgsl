// Pass 2 of 3 -- EXCLUSIVE PREFIX SUM (Blelloch work-efficient scan), single workgroup, N <= 1024.
// offsets[i] = number of survivors strictly before i. Result is a pure function of the flags -> order-independent.
// LIMIT (rig-only to lift): this scans ONE workgroup of up to 1024 elements. For more candidates, dispatch a
// multi-block scan with per-block carries; the CPU twin's exclusiveScan() has no such limit and is the reference.
@group(0) @binding(0) var<storage, read_write> survived_flags: array<u32>;
@group(0) @binding(1) var<storage, read_write> offsets:        array<u32>;

var<workgroup> shared_data: array<u32, 1024>;

@compute @workgroup_size(1024)
fn main(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(global_invocation_id) gid: vec3<u32>) {
    let thid = lid.x;
    let n = arrayLength(&survived_flags);
    if (gid.x < n) { shared_data[thid] = survived_flags[gid.x]; } else { shared_data[thid] = 0u; }

    // up-sweep (reduce)
    var offset = 1u;
    for (var d = 1024u >> 1u; d > 0u; d >>= 1u) {
        workgroupBarrier();
        if (thid < d) {
            let ai = offset * (2u * thid + 1u) - 1u;
            let bi = offset * (2u * thid + 2u) - 1u;
            shared_data[bi] += shared_data[ai];
        }
        offset *= 2u;
    }

    workgroupBarrier();
    if (thid == 0u) { shared_data[1023] = 0u; }   // clear root for EXCLUSIVE scan

    // down-sweep
    for (var d = 1u; d < 1024u; d *= 2u) {
        offset >>= 1u;
        workgroupBarrier();
        if (thid < d) {
            let ai = offset * (2u * thid + 1u) - 1u;
            let bi = offset * (2u * thid + 2u) - 1u;
            let t = shared_data[ai];
            shared_data[ai] = shared_data[bi];
            shared_data[bi] += t;
        }
    }
    workgroupBarrier();
    if (gid.x < n) { offsets[gid.x] = shared_data[thid]; }
}
