// MULTI-BLOCK Pass A of 3 -- per-workgroup: filter (bit-packed), in-block exclusive scan, and emit the block's total.
// Writes flags[i] and the in-block exclusive offset local_offsets[i] for every candidate, and block_counts[wg] for
// each workgroup. No atomics -- every value is a fixed function of the input, so the result is schedule-independent.
struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct HistoryTuple { steps: array<u32, 4>, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, wheel_len: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates: array<Candidate>;
@group(0) @binding(1) var<storage, read>       wheel_bits:       array<u32>;
@group(0) @binding(2) var<storage, read>       active_tuplets:   array<HistoryTuple>;
@group(0) @binding(3) var<uniform>             uniforms:         TransportUniforms;
@group(0) @binding(4) var<storage, read_write> local_offsets:    array<u32>;   // out: exclusive offset within block
@group(0) @binding(5) var<storage, read_write> flags:            array<u32>;   // out: 0/1 survival
@group(0) @binding(6) var<storage, read_write> block_counts:     array<u32>;   // out: survivors per workgroup

const BS : u32 = 256u;   // block size == workgroup size (must match mb-scatter)
var<workgroup> s: array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(global_invocation_id) gid: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>) {
    let thid = lid.x;
    let i = gid.x;
    let n = arrayLength(&prime_candidates);
    var passed = 0u;
    if (i < n) {
        let c = prime_candidates[i];
        let p = c.parent_tuple_index;
        if (p < arrayLength(&active_tuplets)) {
            let last_valid = active_tuplets[p].steps[3];
            let fi = last_valid * uniforms.num_states + c.state_id;
            if (fi < uniforms.wheel_len) {
                let allowed = ((wheel_bits[fi >> 5u] >> (fi & 31u)) & 1u) == 1u;
                if (allowed && c.score > uniforms.minimum_score_threshold) { passed = 1u; }
            }
        }
        flags[i] = passed;
    }
    s[thid] = passed;
    workgroupBarrier();
    // Hillis-Steele inclusive scan over the block
    for (var off = 1u; off < BS; off <<= 1u) {
        var t = 0u;
        if (thid >= off) { t = s[thid - off]; }
        workgroupBarrier();
        s[thid] += t;
        workgroupBarrier();
    }
    if (i < n) { local_offsets[i] = s[thid] - passed; }        // inclusive - self = exclusive
    if (thid == BS - 1u) { block_counts[wid.x] = s[BS - 1u]; } // block total (padding threads contributed 0)
}
