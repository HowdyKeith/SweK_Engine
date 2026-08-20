// MULTI-BLOCK Pass B of 3 -- exclusive scan over block_counts -> block_bases. Deterministic: block b's base is the
// sum of counts of blocks 0..b-1, a pure function of the counts, NOT of workgroup scheduling. Single workgroup,
// up to 1024 blocks (i.e. up to ~262144 candidates at block size 256). For more, recurse this pass.
@group(0) @binding(0) var<storage, read>       block_counts: array<u32>;
@group(0) @binding(1) var<storage, read_write> block_bases:  array<u32>;

var<workgroup> s: array<u32, 1024>;

@compute @workgroup_size(1024)
fn main(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(global_invocation_id) gid: vec3<u32>) {
    let thid = lid.x;
    let n = arrayLength(&block_counts);
    var v = 0u;
    if (gid.x < n) { v = block_counts[gid.x]; }
    s[thid] = v;
    workgroupBarrier();
    for (var off = 1u; off < 1024u; off <<= 1u) {
        var t = 0u;
        if (thid >= off) { t = s[thid - off]; }
        workgroupBarrier();
        s[thid] += t;
        workgroupBarrier();
    }
    if (gid.x < n) { block_bases[gid.x] = s[thid] - v; }   // exclusive scan
}
