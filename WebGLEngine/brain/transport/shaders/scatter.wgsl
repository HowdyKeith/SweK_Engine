// Pass 3 of 3 -- SCATTER. Mirrors scatter() in primeTransport.js. Every survivor writes to its PREDETERMINED slot
// offsets[i], so the output is byte-identical regardless of thread order. Guarded against the output buffer size.
struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, pad: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates:        array<Candidate>;
@group(0) @binding(1) var<storage, read>       survived_flags:          array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:                 array<u32>;
@group(0) @binding(3) var<uniform>             uniforms:                TransportUniforms;
@group(0) @binding(4) var<storage, read_write> surviving_continuations: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let index = gid.x;
    if (index >= arrayLength(&prime_candidates)) { return; }
    if (survived_flags[index] == 1u) {
        // v4472 -- this was `let target`, and `target` is a RESERVED WORD in WGSL: every compiler refused the module,
        // so the three-pass route's scatter never ran on a device. Found the round the census learned to read .wgsl
        // files and both real backends were asked to compile this one. `slot` is the twin's own name for it.
        let slot = offsets[index];
        if (slot < uniforms.max_survivors) {                                          // BUG-2b FIX: guard the output write
            surviving_continuations[slot] = prime_candidates[index].state_id;
        }
    }
}
