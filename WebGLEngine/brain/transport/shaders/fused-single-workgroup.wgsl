// FUSED single-pass compaction (filter + scan + scatter) for ONE workgroup, N <= 1024, with a BIT-PACKED wheel.
// Everything lives in workgroup shared memory (SRAM) -- no global survived_flags/offsets round-trip. Deterministic:
// one workgroup means the global base offset is always 0, so NO atomic is needed (that is what made the multi-
// workgroup version drift). For N > 1024 do NOT scale this with an atomicAdd; use the two-level block scan (see
// README) so each block's base is an exclusive scan over block counts, not a scheduling-order claim.
//
// v4208 -- WORKGROUP SIZE 1024 -> 256, the third of the three shaders v4207's validator found asking for four
// times WebGPU's default maxComputeInvocationsPerWorkgroup. Restructured rather than renumbered: see
// scan.wgsl for why the number alone would have been worse than the bug.
//
// *** THE FILTER RESULT HAS TO BE REMEMBERED PER ELEMENT, NOT PER THREAD, AND THAT IS THE SUBTLE PART HERE. ***
// The old body computed one `passed` flag and used it again at the scatter. With four elements per thread
// there are four verdicts to carry from the filter, past two scan barriers, to the scatter -- so `passed` and
// `myState` are array<u32, 4>. Recomputing the filter at the scatter instead would read the wheel twice and,
// worse, make the scatter depend on a second evaluation of a predicate rather than on the one the scan
// counted: any disagreement between them would write a survivor to a slot the scan never reserved.
const N:  u32 = 1024u;
const WG: u32 = 256u;
const PER: u32 = 4u;

struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct HistoryTuple { steps: array<u32, 4>, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, wheel_len: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates:        array<Candidate>;
@group(0) @binding(1) var<storage, read>       wheel_bits:              array<u32>;        // bit-packed, 32 routes/word
@group(0) @binding(2) var<storage, read>       active_tuplets:          array<HistoryTuple>;
@group(0) @binding(3) var<uniform>             uniforms:                TransportUniforms;
@group(0) @binding(4) var<storage, read_write> surviving_continuations: array<u32>;

var<workgroup> shared_scan: array<u32, 1024>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let thid = lid.x;
    let n = arrayLength(&prime_candidates);
    var passed:  array<u32, 4>;
    var myState: array<u32, 4>;

    // --- filter (bit-packed), flag into shared memory ---
    var k = 0u;
    for (var i = thid; i < N; i += WG) {
        var p2 = 0u;
        var sid = 0u;
        if (i < n) {
            let c = prime_candidates[i];
            sid = c.state_id;
            let p = c.parent_tuple_index;
            if (p < arrayLength(&active_tuplets)) {
                let last_valid = active_tuplets[p].steps[3];
                let fi = last_valid * uniforms.num_states + c.state_id;
                if (fi < uniforms.wheel_len) {
                    let allowed = ((wheel_bits[fi >> 5u] >> (fi & 31u)) & 1u) == 1u;
                    if (allowed && c.score > uniforms.minimum_score_threshold) { p2 = 1u; }
                }
            }
        }
        passed[k] = p2;
        myState[k] = sid;
        shared_scan[i] = p2;
        k += 1u;
    }

    // --- Hillis-Steele inclusive scan in shared memory (deterministic data-flow) ---
    // `mine` holds this thread's reads across the barrier, for the same reason the one-element version held
    // a single `t`: without it an invocation can read a slot another has already advanced.
    var mine: array<u32, 4>;
    for (var offset = 1u; offset < N; offset <<= 1u) {
        workgroupBarrier();
        var j = 0u;
        for (var i = thid; i < N; i += WG) {
            var t = 0u;
            if (i >= offset) { t = shared_scan[i - offset]; }
            mine[j] = t;
            j += 1u;
        }
        workgroupBarrier();
        j = 0u;
        for (var i = thid; i < N; i += WG) {
            shared_scan[i] += mine[j];
            j += 1u;
        }
    }
    workgroupBarrier();

    // --- scatter to the survivor's fixed slot (inclusive - self = exclusive offset); base is 0 for one workgroup ---
    k = 0u;
    for (var i = thid; i < N; i += WG) {
        if (passed[k] == 1u) {
            let slot = shared_scan[i] - 1u;
            if (slot < uniforms.max_survivors) { surviving_continuations[slot] = myState[k]; }
        }
        k += 1u;
    }
}
