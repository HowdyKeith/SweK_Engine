// FUSED single-pass compaction (filter + scan + scatter) for ONE workgroup, N <= 1024, with a BIT-PACKED wheel.
// Everything lives in workgroup shared memory (SRAM) -- no global survived_flags/offsets round-trip. Deterministic:
// one workgroup means the global base offset is always 0, so NO atomic is needed (that is what made the multi-
// workgroup version drift). For N > 1024 do NOT scale this with an atomicAdd; use the two-level block scan (see
// README) so each block's base is an exclusive scan over block counts, not a scheduling-order claim.
struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct HistoryTuple { steps: array<u32, 4>, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, wheel_len: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates:        array<Candidate>;
@group(0) @binding(1) var<storage, read>       wheel_bits:              array<u32>;        // bit-packed, 32 routes/word
@group(0) @binding(2) var<storage, read>       active_tuplets:          array<HistoryTuple>;
@group(0) @binding(3) var<uniform>             uniforms:                TransportUniforms;
@group(0) @binding(4) var<storage, read_write> surviving_continuations: array<u32>;

var<workgroup> shared_scan: array<u32, 1024>;

@compute @workgroup_size(1024)
fn main(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(global_invocation_id) gid: vec3<u32>) {
    let thid = lid.x;
    let n = arrayLength(&prime_candidates);

    // --- filter (bit-packed), flag into shared memory ---
    var passed = 0u;
    if (gid.x < n) {
        let c = prime_candidates[gid.x];
        let p = c.parent_tuple_index;
        if (p < arrayLength(&active_tuplets)) {
            let last_valid = active_tuplets[p].steps[3];
            let fi = last_valid * uniforms.num_states + c.state_id;
            if (fi < uniforms.wheel_len) {
                let allowed = ((wheel_bits[fi >> 5u] >> (fi & 31u)) & 1u) == 1u;
                if (allowed && c.score > uniforms.minimum_score_threshold) { passed = 1u; }
            }
        }
    }
    shared_scan[thid] = passed;
    workgroupBarrier();

    // --- Hillis-Steele inclusive scan in shared memory (deterministic data-flow) ---
    for (var offset = 1u; offset < 1024u; offset <<= 1u) {
        var t = 0u;
        if (thid >= offset) { t = shared_scan[thid - offset]; }
        workgroupBarrier();
        shared_scan[thid] += t;
        workgroupBarrier();
    }

    // --- scatter to the survivor's fixed slot (inclusive - self = exclusive offset); base is 0 for one workgroup ---
    if (passed == 1u) {
        let slot = shared_scan[thid] - 1u;
        if (slot < uniforms.max_survivors) { surviving_continuations[slot] = prime_candidates[gid.x].state_id; }
    }
}
