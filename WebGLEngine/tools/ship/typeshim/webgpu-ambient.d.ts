// WebGLEngine/tools/ship/typeshim/webgpu-ambient.d.ts -- v4123
//
// THE NARROW WebGPU SURFACE THE TYPE-CHECKED FILES ACTUALLY TOUCH, DECLARED LOCALLY RATHER THAN PULLED IN.
//
// @webgpu/types exists on npm and was test-installed to confirm it resolves (0.1.44 at pin time), but taking
// it as a dependency for a handful of symbols is the same shape of risk this tree already priced once this
// session, on webrtx: an external package this tree does not control, versioned on its own schedule, pulled
// in for type-checking a browser tab. What is declared below is exactly what ui/voxtralBrowser.js,
// ui/webrtxBrowser.js and ui/domToTexture.js reference -- checked against their source, not guessed from the
// spec -- so it can be extended the same way if a later file needs more of the surface.
//
// Deliberately loose (many `any`s): the goal is letting real logic errors surface -- a typo'd property, a
// function called with the wrong argument count -- not modelling WebGPU's full type graph. `skipLibCheck` in
// tsconfig.json means this file's own looseness cannot leak into stricter checking of a DIFFERENT lib.

interface GPUAdapterInfo {
    vendor?: string;
    architecture?: string;
    description?: string;
}

interface GPUSupportedLimits {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
    [k: string]: unknown;
}

interface GPUDeviceDescriptor {
    requiredFeatures?: string[];
    requiredLimits?: Record<string, number>;
    [k: string]: unknown;
}

interface GPUQueue {
    writeBuffer(buffer: unknown, offset: number, data: unknown): void;
    submit(commandBuffers: unknown[]): void;
}

interface GPUDevice {
    readonly limits: GPUSupportedLimits;
    readonly features: Iterable<string>;
    readonly queue: GPUQueue;
    createBuffer(desc: { size: number; usage: number; [k: string]: unknown }): unknown;
    createCommandEncoder(desc?: unknown): { [k: string]: any };
    createShaderModule(desc: { code: string }): unknown;
    createRayTracingAccelerationContainer?(desc: unknown): unknown;
    [k: string]: any;
}

interface GPUAdapter {
    readonly info?: GPUAdapterInfo;
    readonly limits: GPUSupportedLimits;
    readonly features: Iterable<string>;
    readonly isFallbackAdapter?: boolean;
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPU {
    requestAdapter(options?: { powerPreference?: string }): Promise<GPUAdapter | null>;
}

interface Navigator {
    readonly gpu?: GPU;
}

// GPUBufferUsage / GPUShaderStage etc. are runtime enum-like objects supplied by the real WebGPU
// implementation, not TS types -- declared as `any` globals so a reference to them type-checks without
// modelling every flag value.
declare const GPUBufferUsage: any;
declare const GPUShaderStage: any;
declare const GPUMapMode: any;
declare const GPUTextureUsage: any;

// A minimal wasm-bindgen module shape: enough for `mod.default()` / named exports to type-check without
// pulling in the real generated .d.ts, which does not exist until a consumer actually builds the engine.
declare module "*.wasm" {}
