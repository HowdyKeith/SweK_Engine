// MULTI-BLOCK Pass B of 3 -- exclusive scan over block_counts -> block_bases. Deterministic: block b's base is the
// sum of counts of blocks 0..b-1, a pure function of the counts, NOT of workgroup scheduling. Single workgroup,
// up to 1024 blocks (i.e. up to ~262144 candidates at block size 256). For more, recurse this pass.
//
// v4208 -- WORKGROUP SIZE 1024 -> 256. Same finding and same fix as scan.wgsl: v4207's validator caught the
// shader asking for four times the default maxComputeInvocationsPerWorkgroup, and shrinking the number alone
// would have scanned only the first quarter of the blocks while looking like it worked.
//
// *** THE PER-THREAD TEMPORARY IS WHAT THE STRIDE COSTS, AND IT IS NOT OPTIONAL. *** Hillis-Steele reads
// s[i - off] and then writes s[i], with a barrier between so no invocation reads a slot another has already
// advanced. At one element per thread a single `var t` held that read across the barrier. At four elements
// per thread there are four reads to hold, so `mine` is an array<u32, 4>. Collapsing it back to one scalar
// would reintroduce exactly the read-write hazard the barrier is there to prevent.
//
// Verified in brain/transport/scanTwin.mjs against primeTransport.js's serial exclusiveScan() at workgroup
// sizes 1, 4, 64, 256 and 1024, 40 random count arrays each, all matching.
const N:  u32 = 1024u;                                 // blocks scanned; must match s's length
const WG: u32 = 256u;                                  // invocations; must match @workgroup_size below
const PER: u32 = 4u;                                   // N / WG -- the length of `mine`

@group(0) @binding(0) var<storage, read>       block_counts: array<u32>;
@group(0) @binding(1) var<storage, read_write> block_bases:  array<u32>;

var<workgroup> s: array<u32, 1024>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let thid = lid.x;
    let n = arrayLength(&block_counts);
    var mine: array<u32, 4>;

    for (var i = thid; i < N; i += WG) {
        var v = 0u;
        if (i < n) { v = block_counts[i]; }
        s[i] = v;
    }

    for (var off = 1u; off < N; off <<= 1u) {
        workgroupBarrier();
        var k = 0u;
        for (var i = thid; i < N; i += WG) {
            var t = 0u;
            if (i >= off) { t = s[i - off]; }
            mine[k] = t;
            k += 1u;
        }
        workgroupBarrier();
        k = 0u;
        for (var i = thid; i < N; i += WG) {
            s[i] += mine[k];
            k += 1u;
        }
    }

    workgroupBarrier();
    for (var i = thid; i < N; i += WG) {
        if (i < n) { block_bases[i] = s[i] - block_counts[i]; }   // inclusive - self = exclusive
    }
}
