async (a) => {
  const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
  const T = await import("/vendor/three-webgpu/three.tsl.js");
  const B = await import("/render/brainTsl.mjs");
  const S = await import("/render/tslSource.mjs");
  const out = { gen: [], shipped: [] };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    const dev = await adapter.requestDevice();
    const SHIPPED = (await import("/brain/mlp.js")).MLP_LAYER_WGSL;   // v4470 -- the module exports its kernel; no regex over its source
    const ACT = { none: 0, relu: 1, sigmoid: 2 };
    const runRaw = async (code, entry, c, bindU) => {
      const mod = dev.createShaderModule({ code });
      const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: entry } });
      const mkB = (arr, extra = 0) => { const b = dev.createBuffer({ size: Math.max(16, arr.length*4), usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST });
        dev.queue.writeBuffer(b, 0, Float32Array.from(arr)); return b; };
      const bX = mkB(c.x), bW = mkB(c.W), bB = mkB(c.b), bY = mkB(new Array(c.batch*c.nOut).fill(0));
      const entries = bindU
        ? [{binding:0,resource:{buffer:(()=>{const u=dev.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});dev.queue.writeBuffer(u,0,new Uint32Array([c.batch,c.nIn,c.nOut,ACT[c.act]]));return u;})()}},
           {binding:1,resource:{buffer:bX}},{binding:2,resource:{buffer:bW}},{binding:3,resource:{buffer:bB}},{binding:4,resource:{buffer:bY}}]
        : [{binding:0,resource:{buffer:bX}},{binding:1,resource:{buffer:bW}},{binding:2,resource:{buffer:bB}},{binding:3,resource:{buffer:bY}}];
      const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
      const stage = dev.createBuffer({ size: Math.max(16, c.batch*c.nOut*4), usage: GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ });
      const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
      p.setPipeline(pipe); p.setBindGroup(0, bg);
      if (bindU) p.dispatchWorkgroups(Math.ceil(c.nOut/8), Math.ceil(c.batch/8));
      else p.dispatchWorkgroups(Math.ceil(c.batch*c.nOut/64));
      p.end(); enc.copyBufferToBuffer(bY, 0, stage, 0, Math.max(16, c.batch*c.nOut*4));
      dev.queue.submit([enc.finish()]);
      await stage.mapAsync(GPUMapMode.READ);
      const v = Array.from(new Float32Array(stage.getMappedRange().slice(0, c.batch*c.nOut*4))); stage.unmap();
      return v;
    };
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
    for (const c of a.cases) {
      const g = B.makeMlpLayerTsl(T, { batch: c.batch, nIn: c.nIn, nOut: c.nOut, act: c.act });
      await renderer.computeAsync(g.node);
      const emitted = renderer._nodes.getForCompute(g.node).computeShader;
      const gen = S.transplantCompute(emitted, S.computeShell(B.MLP_SHELL));
      out.gen.push(await runRaw(gen.wgsl, "main", c, false));
      out.shipped.push(await runRaw(SHIPPED, "k_layer", c, true));
    }
  } catch (e) { out.error = String(e && e.stack || e).slice(0, 900); }
  return out;
}
