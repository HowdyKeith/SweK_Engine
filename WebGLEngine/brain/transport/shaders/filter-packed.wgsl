// Pass 1 VARIANT -- FILTER & FLAG with a BIT-PACKED wheel matrix (1 bit/route, ~96.9% less VRAM).
// Byte-identical results to filter.wgsl; proven equivalent in the CPU twin's gate. wheel_bits[i>>5] holds 32 routes.
struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct HistoryTuple { steps: array<u32, 4>, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, wheel_len: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates: array<Candidate>;
@group(0) @binding(1) var<storage, read>       wheel_bits:       array<u32>;          // bit-packed: 32 routes per word
@group(0) @binding(2) var<storage, read>       active_tuplets:   array<HistoryTuple>;
@group(0) @binding(3) var<uniform>             uniforms:         TransportUniforms;
@group(0) @binding(4) var<storage, read_write> survived_flags:   array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let index = gid.x;
    if (index >= arrayLength(&prime_candidates)) { return; }
    let c = prime_candidates[index];
    let p = c.parent_tuple_index;
    if (p >= arrayLength(&active_tuplets)) { survived_flags[index] = 0u; return; }
    let last_valid = active_tuplets[p].steps[3];
    let fi = last_valid * uniforms.num_states + c.state_id;
    if (fi >= uniforms.wheel_len) { survived_flags[index] = 0u; return; }               // logical bound (num_states^2)
    let allowed = ((wheel_bits[fi >> 5u] >> (fi & 31u)) & 1u) == 1u;                     // bitwise lookup, exact/deterministic
    if (allowed && c.score > uniforms.minimum_score_threshold) { survived_flags[index] = 1u; }
    else { survived_flags[index] = 0u; }
}
