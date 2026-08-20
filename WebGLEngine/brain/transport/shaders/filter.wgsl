// Pass 1 of 3 -- FILTER & FLAG. Mirrors filterFlag() in primeTransport.js exactly.
// Each candidate writes a 0/1 survival flag at its OWN index (stable position), guarded on every array access.
struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct HistoryTuple { steps: array<u32, 4>, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, pad: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates:    array<Candidate>;
@group(0) @binding(1) var<storage, read>       wheel_filter_matrix: array<u32>;
@group(0) @binding(2) var<storage, read>       active_tuplets:      array<HistoryTuple>;
@group(0) @binding(3) var<uniform>             uniforms:            TransportUniforms;
@group(0) @binding(4) var<storage, read_write> survived_flags:      array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let index = gid.x;
    if (index >= arrayLength(&prime_candidates)) { return; }
    let c = prime_candidates[index];
    let p = c.parent_tuple_index;
    if (p >= arrayLength(&active_tuplets)) { survived_flags[index] = 0u; return; }   // BUG-1 FIX: bound against tuplets, not candidates
    let last_valid = active_tuplets[p].steps[3];
    let fi = last_valid * uniforms.num_states + c.state_id;                           // num_states from uniform, no sqrt
    if (fi >= arrayLength(&wheel_filter_matrix)) { survived_flags[index] = 0u; return; }
    let allowed = wheel_filter_matrix[fi] == 1u;
    if (allowed && c.score > uniforms.minimum_score_threshold) { survived_flags[index] = 1u; }
    else { survived_flags[index] = 0u; }
}
