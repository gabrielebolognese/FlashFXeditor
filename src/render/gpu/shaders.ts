// WGSL for the layer pipelines (spec §9.4). One vertex stage for every layer kind: the unit quad goes
// through the layer matrix (unit quad -> target px: the layer's transform with its pane's viewport
// applied on the CPU) and the view matrix (target px -> clip space).
// Fragment outputs are premultiplied; the pipelines blend with (one, one-minus-src-alpha).

/** Per-layer uniforms: 13 vec4 (208 bytes), at a 256-byte dynamic offset. Packed by `layerUniforms.ts`. */
const DECLARATIONS = /* wgsl */ `
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
  // solids: the gradient's bottom color, straight alpha (the top one is color)
  color2: vec4f,
  // solids: width, height (px of the layer's own space), corner radius, shape (0 quad, 1 box, 2 ellipse)
  shape: vec4f,
  // dissolves: the second picture's crop (u0, v0, u1, v1)
  uv2: vec4f,
  // dissolves: the unit quad -> each picture's unit quad (a, b, c, d of each; tx, ty of both in mapT)
  mapA: vec4f,
  mapB: vec4f,
  mapT: vec4f,
  // dissolves: each picture's own opacity
  sides: vec4f,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<uniform> layer: Layer;
`;

const COMMON = /* wgsl */ `${DECLARATIONS}
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

/**
 * Batch 46 (the Batch 21 follow-up): a texture with no mips (a video frame) drawn smaller than it is
 * aliased fine detail. A grid of taps over the pixel's footprint, spread as far as the texture is
 * minified: nothing at 1:1 or larger (exports and zooms of 100% and more take the one sample they took
 * before), full spread from 2x. Mipmapped textures (images, text) keep their trilinear sample. Measured
 * on one-pixel lines drawn 2.6x smaller: the moiré's standard deviation 62 -> 17 (3 x 3 taps).
 */
const FOOTPRINT_TAPS = /* wgsl */ `
fn footprintRamp(dx: vec2f, dy: vec2f, size: vec2f, mipmapped: bool) -> f32 {
  let footprint = max(length(dx * size), length(dy * size));
  return select(clamp(footprint - 1.0, 0.0, 1.0), 0.0, mipmapped);
}
`;

export const TEXTURED_WGSL = /* wgsl */ `${COMMON}${FOOTPRINT_TAPS}
@group(1) @binding(0) var sourceSampler: sampler;
@group(1) @binding(1) var source: texture_2d<f32>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let dx = dpdx(in.uv);
  let dy = dpdy(in.uv);
  // 3 x 3 taps a third of the footprint apart; one sample when nothing is minified.
  let spread = footprintRamp(dx, dy, vec2f(textureDimensions(source)), textureNumLevels(source) > 1u) / 3.0;
  if (spread <= 0.0) {
    return textureSampleGrad(source, sourceSampler, in.uv, dx, dy) * layer.params.x;
  }
  var sum = vec4f(0.0);
  for (var i = -1; i <= 1; i++) {
    for (var j = -1; j <= 1; j++) {
      sum += textureSampleGrad(source, sourceSampler, in.uv + dx * (f32(i) * spread) + dy * (f32(j) * spread), dx, dy);
    }
  }
  return sum * (layer.params.x / 9.0);
}
`;

/**
 * The cross dissolve (spec §9.4, Batch 36): one quad over the frame; each picture is sampled where its
 * own quad covers the point (its map takes the point onto its unit quad, then its crop) and counts
 * nothing outside it, so the two mix as each would draw alone: from x (1 - mix) + to x mix.
 */
export const DISSOLVE_WGSL = /* wgsl */ `${DECLARATIONS}
@group(1) @binding(0) var fromSampler: sampler;
@group(1) @binding(1) var fromTexture: texture_2d<f32>;
@group(2) @binding(0) var toSampler: sampler;
@group(2) @binding(1) var toTexture: texture_2d<f32>;

struct DissolveOut {
  @builtin(position) position: vec4f,
  @location(0) a: vec2f,
  @location(1) b: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> DissolveOut {
  var corners = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
  let corner = corners[index];
  let model = mat3x3f(layer.c0.xyz, layer.c1.xyz, layer.c2.xyz);
  let toClip = mat3x3f(view.c0.xyz, view.c1.xyz, view.c2.xyz);
  let position = toClip * model * vec3f(corner, 1.0);
  var out: DissolveOut;
  out.position = vec4f(position.xy, 0.0, 1.0);
  out.a = vec2f(layer.mapA.x * corner.x + layer.mapA.z * corner.y + layer.mapT.x, layer.mapA.y * corner.x + layer.mapA.w * corner.y + layer.mapT.y);
  out.b = vec2f(layer.mapB.x * corner.x + layer.mapB.z * corner.y + layer.mapT.z, layer.mapB.y * corner.x + layer.mapB.w * corner.y + layer.mapT.w);
  return out;
}

fn inside(t: vec2f) -> f32 {
  return select(0.0, 1.0, all(t >= vec2f(0.0)) && all(t <= vec2f(1.0)));
}

@fragment
fn fs(in: DissolveOut) -> @location(0) vec4f {
  let a = textureSample(fromTexture, fromSampler, mix(layer.uv.xy, layer.uv.zw, in.a)) * (layer.sides.x * inside(in.a));
  let b = textureSample(toTexture, toSampler, mix(layer.uv2.xy, layer.uv2.zw, in.b)) * (layer.sides.y * inside(in.b));
  return mix(a, b, layer.params.w) * layer.params.x;
}
`;

/**
 * Solids (spec §5.2, Batch 34): a vertical gradient from `color` (top) to `color2` (bottom; the same
 * color for a flat fill), mixed premultiplied as canvas gradients are. Shaped solids are cut to their
 * shape by its signed distance in the layer's own px (a box with rounded corners, or an ellipse by the
 * first-order distance f / |grad f|), anti-aliased over one screen px (`fwidth`); the renderer grows
 * their quad so the edge's outer half is drawn. A plain quad (shape 0) is drawn as it is.
 */
export const SOLID_WGSL = /* wgsl */ `${COMMON}
fn premultiplied(c: vec4f) -> vec4f {
  return vec4f(c.rgb * c.a, c.a);
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let color = mix(premultiplied(layer.color), premultiplied(layer.color2), clamp(in.uv.y, 0.0, 1.0));
  let halfSize = max(0.5 * layer.shape.xy, vec2f(1e-4));
  let p = in.uv * layer.shape.xy - halfSize;
  let r = clamp(layer.shape.z, 0.0, min(halfSize.x, halfSize.y));
  let q = abs(p) - halfSize + vec2f(r);
  let boxDist = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
  let e = p / halfSize;
  let k = length(e);
  let ellipseDist = select(-min(halfSize.x, halfSize.y), (k - 1.0) * k / max(length(e / halfSize), 1e-9), k > 1e-4);
  let d = select(boxDist, ellipseDist, layer.shape.w > 1.5);
  let coverage = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  return color * (select(1.0, coverage, layer.shape.w > 0.5) * layer.params.x);
}
`;

/**
 * A video frame drawn into a smaller texture (sampled as decoded: no full-size copy first), with the
 * layers' footprint taps: a 4K frame scaled to a 1080 x 1920 project's size no longer aliases.
 */
export const SCALE_WGSL = /* wgsl */ `${FOOTPRINT_TAPS}
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
  let dx = dpdx(in.uv);
  let dy = dpdy(in.uv);
  // 2 x 2 taps (each converts the decoded picture to RGB): a 4 x 4 texel box at the usual 2x (4K to 1080p).
  let spread = footprintRamp(dx, dy, vec2f(textureDimensions(source)), false) / 4.0;
  let ox = dx * spread;
  let oy = dy * spread;
  let sum = textureSampleBaseClampToEdge(source, sourceSampler, in.uv - ox - oy)
    + textureSampleBaseClampToEdge(source, sourceSampler, in.uv + ox - oy)
    + textureSampleBaseClampToEdge(source, sourceSampler, in.uv - ox + oy)
    + textureSampleBaseClampToEdge(source, sourceSampler, in.uv + ox + oy);
  return vec4f(sum.rgb * 0.25, 1.0);
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
