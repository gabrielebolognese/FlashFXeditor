// WGSL for the layer pipelines (spec §9.4). One vertex stage for every layer kind: the unit quad goes
// through the layer matrix (unit quad -> target px: the layer's transform with its pane's viewport
// applied on the CPU) and the view matrix (target px -> clip space).
// Fragment outputs are premultiplied; the pipelines blend with (one, one-minus-src-alpha).

/** Per-layer uniforms: 6 vec4 (96 bytes), at a 256-byte dynamic offset. Packed by `layerUniforms.ts`. */
const COMMON = /* wgsl */ `
struct View {
  c0: vec4f,
  c1: vec4f,
  c2: vec4f,
};

struct Layer {
  c0: vec4f,
  c1: vec4f,
  c2: vec4f,
  // u0, v0, u1, v1
  uv: vec4f,
  // solid color, straight alpha
  color: vec4f,
  // opacity, flipX, flipY, mix
  params: vec4f,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<uniform> layer: Layer;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  // Triangle strip over the unit quad.
  var corners = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
  let corner = corners[index];
  let model = mat3x3f(layer.c0.xyz, layer.c1.xyz, layer.c2.xyz);
  let toClip = mat3x3f(view.c0.xyz, view.c1.xyz, view.c2.xyz);
  let position = toClip * model * vec3f(corner, 1.0);
  var t = corner;
  if (layer.params.y > 0.5) { t.x = 1.0 - t.x; }
  if (layer.params.z > 0.5) { t.y = 1.0 - t.y; }
  var out: VertexOut;
  out.position = vec4f(position.xy, 0.0, 1.0);
  out.uv = mix(layer.uv.xy, layer.uv.zw, t);
  return out;
}
`;

export const TEXTURED_WGSL = /* wgsl */ `${COMMON}
@group(1) @binding(0) var sourceSampler: sampler;
@group(1) @binding(1) var source: texture_2d<f32>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  return textureSample(source, sourceSampler, in.uv) * layer.params.x;
}
`;

export const DISSOLVE_WGSL = /* wgsl */ `${COMMON}
@group(1) @binding(0) var fromSampler: sampler;
@group(1) @binding(1) var fromTexture: texture_2d<f32>;
@group(2) @binding(0) var toSampler: sampler;
@group(2) @binding(1) var toTexture: texture_2d<f32>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let a = textureSample(fromTexture, fromSampler, in.uv);
  let b = textureSample(toTexture, toSampler, in.uv);
  return mix(a, b, layer.params.w) * layer.params.x;
}
`;

export const SOLID_WGSL = /* wgsl */ `${COMMON}
@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let alpha = layer.color.a * layer.params.x;
  return vec4f(layer.color.rgb * alpha, alpha);
}
`;

/** A video frame drawn into a smaller texture (sampled as decoded: no full-size copy first). */
export const SCALE_WGSL = /* wgsl */ `
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var source: texture_external;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  var points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = points[index];
  var out: VertexOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  return vec4f(textureSampleBaseClampToEdge(source, sourceSampler, in.uv).rgb, 1.0);
}
`;

/**
 * One pass of a separable Gaussian blur (spec §10.4 blurIn): each target px sums the source texels
 * along `dir` within `radius`, weighted by `sigma`. The source region starts `pad` target px in, and
 * texels outside it count as transparent, so the blur spreads into the padding. Premultiplied in and out.
 */
export const BLUR_WGSL = /* wgsl */ `
struct Blur {
  // origin x, y and size w, h of the source region, in texels
  region: vec4f,
  // dirX, dirY, sigma, radius
  params: vec4f,
  // padding x, y in target px before the region
  pad: vec4f,
};

@group(0) @binding(0) var<uniform> blur: Blur;
@group(1) @binding(0) var sourceSampler: sampler;
@group(1) @binding(1) var source: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(points[index], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = floor(position.xy) - blur.pad.xy;
  let sigma = max(blur.params.z, 0.0001);
  let radius = i32(blur.params.w);
  var sum = vec4f(0.0);
  var total = 0.0;
  for (var k = -radius; k <= radius; k++) {
    let weight = exp(-f32(k * k) / (2.0 * sigma * sigma));
    total += weight;
    let q = p + f32(k) * blur.params.xy;
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < blur.region.z && q.y < blur.region.w) {
      sum += weight * textureLoad(source, vec2i(blur.region.xy + q), 0);
    }
  }
  return sum / total;
}
`;

/** Mip generation: a full-screen triangle sampling the previous level with linear filtering. */
export const MIPMAP_WGSL = /* wgsl */ `
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var source: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  var points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = points[index];
  var out: VertexOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  return textureSample(source, sourceSampler, in.uv);
}
`;
