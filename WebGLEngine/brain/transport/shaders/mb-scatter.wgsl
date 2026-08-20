// MULTI-BLOCK Pass C of 3 -- scatter. Each survivor lands at block_bases[block] + local_offsets[i], both computed by
// scans, so the global order is a fixed function of the input: byte-identical run-to-run and card-to-card.
struct Candidate { state_id: u32, parent_tuple_index: u32, score: f32, };
struct TransportUniforms { num_states: u32, max_survivors: u32, minimum_score_threshold: f32, wheel_len: u32, };

@group(0) @binding(0) var<storage, read>       prime_candidates:        array<Candidate>;
@group(0) @binding(1) var<storage, read>       flags:                   array<u32>;
@group(0) @binding(2) var<storage, read>       local_offsets:           array<u32>;
@group(0) @binding(3) var<storage, read>       block_bases:             array<u32>;
@group(0) @binding(4) var<uniform>             uniforms:                TransportUniforms;
@group(0) @binding(5) var<storage, read_write> surviving_continuations: array<u32>;

const BS : u32 = 256u;   // must match mb-scan-block

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= arrayLength(&prime_candidates)) { return; }
    if (flags[i] == 1u) {
        let slot = block_bases[i / BS] + local_offsets[i];
        if (slot < uniforms.max_survivors) { surviving_continuations[slot] = prime_candidates[i].state_id; }
    }
}
