// Mip chains for static image textures (spec §9.3): WebGPU does not generate them, so each level is
// rendered from the previous one with a linear sample (a 2x2 box filter). Runs once per upload.

/** Levels of a full chain down to 1 x 1. */
export function mipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(1, width, height))) + 1;
}

/** Bytes of an rgba8 texture with `levels` mip levels. */
export function textureBytes(width: number, height: number, levels: number): number {
  let bytes = 0;
  for (let level = 0; level < levels; level += 1) {
    bytes += Math.max(1, width >> level) * Math.max(1, height >> level) * 4;
  }
  return bytes;
}

export interface MipGenerator {
  pipeline: GPURenderPipeline;
  layout: GPUBindGroupLayout;
  sampler: GPUSampler;
}

export function generateMipmaps(device: GPUDevice, generator: MipGenerator, texture: GPUTexture): void {
  const encoder = device.createCommandEncoder({ label: "mipmaps" });
  for (let level = 1; level < texture.mipLevelCount; level += 1) {
    const bindGroup = device.createBindGroup({
      layout: generator.layout,
      entries: [
        { binding: 0, resource: generator.sampler },
        { binding: 1, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }],
    });
    pass.setPipeline(generator.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}
