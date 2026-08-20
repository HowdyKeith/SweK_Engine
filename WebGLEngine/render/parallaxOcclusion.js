// render/parallaxOcclusion.js
//
// Parallax occlusion mapping (v2784) -- the quick-win depth trick for the rasterized voxel faces. In the
// fragment shader, march the view ray through a per-material heightmap in tangent space and offset the texture
// UV to where the ray meets the height surface. Flat faces gain convincing carved/embossed depth (bricks,
// greebles, rock) with no extra geometry.
//
// Same discipline as the ray marcher: the shader function PARALLAX_GLSL and the JS mirror parallaxUVMirror
// implement the identical steep-search-plus-interpolate POM, so the mirror can be gated against a fine reference
// and the shader is proven by transitivity. Pure, browser/worker-safe.

// sampleHeight(u,v) -> 0..1 (heightmap: 1 = surface top, 0 = deepest). view is the tangent-space view direction
// (z out of the surface toward the eye). heightScale = how deep the effect cuts. numLayers = steep-search steps.
// Returns { u, v, height } -- the parallax-shifted UV and the height there.
export function parallaxUVMirror(u, v, viewX, viewY, viewZ, heightScale, sampleHeight, numLayers = 32) {
    const len = Math.hypot(viewX, viewY, viewZ) || 1;
    viewX /= len; viewY /= len; viewZ /= len;

    const az = Math.max(viewZ, 1e-4);                 // guard grazing angles
    const Px = (viewX / az) * heightScale, Py = (viewY / az) * heightScale;   // total UV shift at max depth
    const layerDepth = 1 / numLayers;
    const dUx = Px / numLayers, dUy = Py / numLayers;

    let curLayerDepth = 0, cu = u, cv = v;
    let curDepthMap = 1 - sampleHeight(cu, cv);       // "depth" = 1 - height
    let guard = 0;
    while (curLayerDepth < curDepthMap && guard++ < 1024) {
        cu -= dUx; cv -= dUy;
        curDepthMap = 1 - sampleHeight(cu, cv);
        curLayerDepth += layerDepth;
    }

    // linear interpolation between the layer that crossed and the one before it (POM, not the pricier relief search)
    const puU = cu + dUx, puV = cv + dUy;
    const afterDepth = curDepthMap - curLayerDepth;
    const beforeDepth = (1 - sampleHeight(puU, puV)) - (curLayerDepth - layerDepth);
    const denom = afterDepth - beforeDepth;
    const w = denom !== 0 ? afterDepth / denom : 0;
    const fu = puU * w + cu * (1 - w);
    const fv = puV * w + cv * (1 - w);
    return { u: fu, v: fv, height: sampleHeight(fu, fv) };
}

// GLSL fragment-shader function. Expects a `uniform sampler2D uHeightMap;` in scope (r channel = height 0..1).
export const PARALLAX_GLSL = `
// parallax occlusion mapping: shift uv to where the tangent-space view ray meets the heightmap surface.
vec2 parallaxUV(vec2 uv, vec3 viewTangent, float heightScale, int numLayers){
    float az = max(viewTangent.z, 1e-4);
    vec2 P = viewTangent.xy / az * heightScale;
    float layerDepth = 1.0 / float(numLayers);
    vec2 dUV = P / float(numLayers);
    float curLayerDepth = 0.0;
    vec2 cuv = uv;
    float curDepthMap = 1.0 - texture(uHeightMap, cuv).r;
    for(int i=0;i<256;i++){
        if(curLayerDepth >= curDepthMap) break;
        cuv -= dUV;
        curDepthMap = 1.0 - texture(uHeightMap, cuv).r;
        curLayerDepth += layerDepth;
    }
    vec2 puv = cuv + dUV;
    float afterD  = curDepthMap - curLayerDepth;
    float beforeD = (1.0 - texture(uHeightMap, puv).r) - (curLayerDepth - layerDepth);
    float w = afterD / (afterD - beforeD);
    return mix(cuv, puv, w);
}
`;
