// WGSL for the layer pipelines (spec §9.4). One vertex stage for every layer kind: the unit quad goes
// through the layer matrix (unit quad -> target px: the layer's transform with its pane's viewport
// applied on the CPU) and the view matrix (target px -> clip space).
// Fragment outputs are premultiplied; the pipelines blend with (one, one-minus-src-alpha).

/** Per-layer uniforms: 31 vec4 (496 bytes), at a 512-byte dynamic offset. Packed by `layerUniforms.ts`. */
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
  // solids (Batch 58): stroke color (straight alpha), then width, align (-1 inside, 0 center, 1 outside), dash offset, dash scale
  strokeColor: vec4f,
  strokeParams: vec4f,
  // solids: dash and gap lengths (on, off, on, off), layer px; all 0 = a solid line
  dash: vec4f,
  // solids: shadow color (straight alpha), then x, y, blur, spread
  shadowColor: vec4f,
  shadowParams: vec4f,
  // solids and pictures: corner radii tl, tr, br, bl (layer px)
  radii: vec4f,
  // solids: fill kind (0 color or vertical two-stop, 1 linear, 2 radial), angle (radians), radius, stop count
  fillParams: vec4f,
  // solids: radial center (fractions), part (0 all, 1 shadow only, 2 stroke only), perimeter (layer px)
  fillCenter: vec4f,
  stopColor: array<vec4f, 8>,
  stopAt: array<vec4f, 2>,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<uniform> layer: Layer;
`;

const COMMON = /* wgsl */ `${DECLARATIONS}
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) local: vec2f,
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
  out.local = corner;
  return out;
}
`;

/**
 * The shape of a solid or a framed picture (Batch 58): signed distances (negative inside, layer px) of
 * a box with four corner radii and of an ellipse, the position along the outline (for dashes) and the
 * gradient of a fill. Pure functions of the layer uniforms: no derivatives in here (WGSL uniformity).
 */
const STYLE = /* wgsl */ `
fn premultiplied(c: vec4f) -> vec4f {
  return vec4f(c.rgb * c.a, c.a);
}

fn cornerOf(p: vec2f, radii: vec4f) -> f32 {
  if (p.x < 0.0) { return select(radii.w, radii.x, p.y < 0.0); }
  return select(radii.z, radii.y, p.y < 0.0);
}

fn boxDistance(p: vec2f, halfSize: vec2f, radii: vec4f) -> f32 {
  let r = clamp(cornerOf(p, radii), 0.0, min(halfSize.x, halfSize.y));
  let q = abs(p) - halfSize + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn ellipseDistance(p: vec2f, halfSize: vec2f) -> f32 {
  let e = p / halfSize;
  let k = length(e);
  return select(-min(halfSize.x, halfSize.y), (k - 1.0) * k / max(length(e / halfSize), 1e-9), k > 1e-4);
}

fn shapeDistance(p: vec2f, halfSize: vec2f, radii: vec4f, ellipse: bool) -> f32 {
  return select(boxDistance(p, halfSize, radii), ellipseDistance(p, halfSize), ellipse);
}

// Clockwise from the top middle, layer px along the outline (y down).
fn outlinePosition(p: vec2f, h: vec2f, rr: vec4f, ellipse: bool, total: f32) -> f32 {
  if (ellipse) {
    let theta = atan2(p.x / h.x, -p.y / h.y);
    return select(theta, theta + 6.2831853, theta < 0.0) / 6.2831853 * total;
  }
  let hp = 1.5707963;
  let tl = clamp(rr.x, 0.0, min(h.x, h.y));
  let tr = clamp(rr.y, 0.0, min(h.x, h.y));
  let br = clamp(rr.z, 0.0, min(h.x, h.y));
  let bl = clamp(rr.w, 0.0, min(h.x, h.y));
  let top1 = max(h.x - tr, 0.0);
  let right = max(2.0 * h.y - tr - br, 0.0);
  let bottom = max(2.0 * h.x - br - bl, 0.0);
  let left = max(2.0 * h.y - bl - tl, 0.0);
  let top2 = max(h.x - tl, 0.0);
  let oTr = top1;
  let oRight = oTr + hp * tr;
  let oBr = oRight + right;
  let oBottom = oBr + hp * br;
  let oBl = oBottom + bottom;
  let oLeft = oBl + hp * bl;
  let oTl = oLeft + left;
  let oTop2 = oTl + hp * tl;
  let r = clamp(cornerOf(p, rr), 0.0, min(h.x, h.y));
  let q = abs(p) - h + vec2f(r);
  if (q.x > 0.0 && q.y > 0.0) {
    let phi = atan2(q.y, q.x);
    if (p.x >= 0.0 && p.y < 0.0) { return oTr + (hp - phi) * r; }
    if (p.x >= 0.0) { return oRight + right + phi * r; }
    if (p.y >= 0.0) { return oBl + (hp - phi) * r; }
    return oLeft + left + phi * r;
  }
  if (h.x - abs(p.x) < h.y - abs(p.y)) {
    if (p.x >= 0.0) { return oRight + clamp(p.y + h.y - tr, 0.0, right); }
    return oLeft + clamp(h.y - bl - p.y, 0.0, left);
  }
  if (p.y >= 0.0) { return oBottom + clamp(h.x - br - p.x, 0.0, bottom); }
  if (p.x >= 0.0) { return clamp(p.x, 0.0, top1); }
  return oTop2 + clamp(p.x + h.x - tl, 0.0, top2);
}

fn stopAtOf(i: i32) -> f32 {
  let v = layer.stopAt[i / 4];
  let k = i % 4;
  return select(select(select(v.w, v.z, k == 2), v.y, k == 1), v.x, k == 0);
}

fn gradientColor(t: f32, count: i32) -> vec4f {
  var out = premultiplied(layer.stopColor[0]);
  if (t <= stopAtOf(0)) { return out; }
  for (var i = 1; i < 8; i++) {
    if (i >= count) { break; }
    let a = stopAtOf(i - 1);
    let b = stopAtOf(i);
    let ca = premultiplied(layer.stopColor[i - 1]);
    let cb = premultiplied(layer.stopColor[i]);
    if (t <= b) { return mix(ca, cb, clamp((t - a) / max(b - a, 1e-6), 0.0, 1.0)); }
    out = cb;
  }
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

export const TEXTURED_WGSL = /* wgsl */ `${COMMON}${STYLE}${FOOTPRINT_TAPS}
@group(1) @binding(0) var sourceSampler: sampler;
@group(1) @binding(1) var source: texture_2d<f32>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let dx = dpdx(in.uv);
  let dy = dpdy(in.uv);
  // A picture with rounded corners (Batch 58): cut to the box, anti-aliased over one screen px.
  let framed = layer.shape.w > 0.5;
  let halfSize = max(0.5 * layer.shape.xy, vec2f(1e-4));
  let dist = boxDistance(in.local * layer.shape.xy - halfSize, halfSize, layer.radii);
  let cut = select(1.0, clamp(0.5 - dist / max(fwidth(dist), 1e-4), 0.0, 1.0), framed);
  // 3 x 3 taps a third of the footprint apart; one sample when nothing is minified.
  let spread = footprintRamp(dx, dy, vec2f(textureDimensions(source)), textureNumLevels(source) > 1u) / 3.0;
  if (spread <= 0.0) {
    return textureSampleGrad(source, sourceSampler, in.uv, dx, dy) * (layer.params.x * cut);
  }
  var sum = vec4f(0.0);
  for (var i = -1; i <= 1; i++) {
    for (var j = -1; j <= 1; j++) {
      sum += textureSampleGrad(source, sourceSampler, in.uv + dx * (f32(i) * spread) + dy * (f32(j) * spread), dx, dy);
    }
  }
  return sum * (layer.params.x * cut / 9.0);
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
export const SOLID_WGSL = /* wgsl */ `${COMMON}${STYLE}
fn intervalCoverage(pos: f32, a: f32, b: f32, fw: f32) -> f32 {
  return clamp((pos - a) / fw + 0.5, 0.0, 1.0) * clamp((b - pos) / fw + 0.5, 0.0, 1.0);
}

fn dashCoverage(s: f32, fw: f32) -> f32 {
  let d = layer.dash;
  let period = d.x + d.y + d.z + d.w;
  if (period <= 0.0) { return 1.0; }
  let scale = max(layer.strokeParams.w, 1e-4);
  let ds = d * scale;
  let total = period * scale;
  var pos = (s - layer.strokeParams.z) % total;
  if (pos < 0.0) { pos += total; }
  var best = 0.0;
  for (var k = 0; k < 2; k++) {
    let at = pos - f32(k) * total;
    best = max(best, intervalCoverage(at, 0.0, ds.x, fw) + intervalCoverage(at, ds.x + ds.y, ds.x + ds.y + ds.z, fw));
  }
  return min(best, 1.0);
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let size = layer.shape.xy;
  let halfSize = max(0.5 * size, vec2f(1e-4));
  let p = in.uv * size - halfSize;
  let ellipse = layer.shape.w > 1.5;
  let d = shapeDistance(p, halfSize, layer.radii, ellipse);
  let fwd = max(fwidth(d), 1e-4);
  let total = max(layer.fillCenter.w, 1e-4);
  let s = outlinePosition(p, halfSize, layer.radii, ellipse, total);
  let rawStep = fwidth(s);
  let fws = max(min(rawStep, abs(total - rawStep)), 1e-4);
  let opacity = layer.params.x;
  let part = layer.fillCenter.z;

  var fill = mix(premultiplied(layer.color), premultiplied(layer.color2), clamp(in.uv.y, 0.0, 1.0));
  let kind = layer.fillParams.x;
  if (kind > 0.5) {
    var t = 0.0;
    if (kind < 1.5) {
      let dir = vec2f(-sin(layer.fillParams.y), cos(layer.fillParams.y));
      let extent = max(abs(dir.x) * size.x + abs(dir.y) * size.y, 1e-4);
      t = 0.5 + dot(p, dir) / extent;
    } else {
      let center = layer.fillCenter.xy * size - halfSize;
      t = length(p - center) / max(layer.fillParams.z * 0.5 * length(size), 1e-4);
    }
    fill = gradientColor(t, i32(layer.fillParams.w));
  }
  if (layer.shape.w < 0.5) { return fill * opacity; }

  let cover = clamp(0.5 - d / fwd, 0.0, 1.0);
  let hasShadow = layer.shadowColor.a > 0.0;
  let sigma = layer.shadowParams.z * 0.5;
  let ds = shapeDistance(p - layer.shadowParams.xy, halfSize, layer.radii, ellipse) - layer.shadowParams.w;
  let fwdShadow = max(fwidth(ds), 1e-4);
  let hard = clamp(0.5 - ds / fwdShadow, 0.0, 1.0);
  let soft = 1.0 / (1.0 + exp(clamp(1.702 * ds / max(sigma, 1e-4), -30.0, 30.0)));
  let shadowCover = select(hard, soft, sigma > 1e-3) * select(0.0, 1.0, hasShadow) * (1.0 - cover);
  let shadow = premultiplied(layer.shadowColor) * shadowCover;

  let width = layer.strokeParams.x;
  let center = layer.strokeParams.y * width * 0.5;
  let band = abs(d - center) - width * 0.5;
  var strokeCover = clamp(0.5 - band / fwd, 0.0, 1.0) * select(0.0, 1.0, width > 0.0);
  strokeCover = strokeCover * dashCoverage(s, fws);
  let stroke = premultiplied(layer.strokeColor) * strokeCover;

  var out = fill * cover;
  if (part > 0.5 && part < 1.5) { out = shadow; }
  else if (part > 1.5) { out = vec4f(0.0); }
  else { out = out + shadow * (1.0 - out.a); }
  if (part < 0.5 || part > 1.5) { out = stroke + out * (1.0 - stroke.a); }
  return out * opacity;
}
`;

/**
 * A video frame drawn into a smaller texture (sampled as decoded: no full-size copy first), with the
 * layers' footprint taps: a 4K frame scaled to a 1080 x 1920 project's size no longer aliases.
 */
function scaleWgsl(alpha: boolean): string {
  return /* wgsl */ `${FOOTPRINT_TAPS}
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var source: texture_external;
${alpha ? "@group(0) @binding(2) var alphaPlane: texture_2d<f32>;" : ""}

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
${
  alpha
    ? `  // The alpha channel of a WebM with alpha (Batch 64): raw bytes in an r8 texture, the same taps; the color is premultiplied by it.
  let a = (textureSampleLevel(alphaPlane, sourceSampler, in.uv - ox - oy, 0.0).r
    + textureSampleLevel(alphaPlane, sourceSampler, in.uv + ox - oy, 0.0).r
    + textureSampleLevel(alphaPlane, sourceSampler, in.uv - ox + oy, 0.0).r
    + textureSampleLevel(alphaPlane, sourceSampler, in.uv + ox + oy, 0.0).r) * 0.25;
  return vec4f(sum.rgb * 0.25 * a, a);`
    : "  return vec4f(sum.rgb * 0.25, 1.0);"
}
}
`;
}

export const SCALE_WGSL = scaleWgsl(false);
/** SCALE_WGSL with the alpha plane of a video with alpha multiplied in (binding 2). */
export const SCALE_ALPHA_WGSL = scaleWgsl(true);

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

/**
 * Vector shapes (spec §21.12, Batch 65): stencil, then cover, into a 4x multisampled scratch texture.
 * Per draw the layer uniform holds the view box -> scratch clip matrix (c0..c2), the cover rectangle in
 * view-box px (uv: x0, y0, x1, y1), the paint (color, or the solid's gradient: fillParams, fillCenter,
 * stops) and the box the gradient is laid out in (shape: x, y, w, h). `vsStencil` takes the triangles
 * (view-box px) from a vertex buffer; `vsCover` makes the rectangle from the vertex index.
 */
export const PATH_WGSL = /* wgsl */ `${DECLARATIONS}${STYLE}
struct CoverOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
};

fn toScratch(p: vec2f) -> vec4f {
  let m = mat3x3f(layer.c0.xyz, layer.c1.xyz, layer.c2.xyz);
  return vec4f((m * vec3f(p, 1.0)).xy, 0.0, 1.0);
}

@vertex
fn vsStencil(@location(0) position: vec2f) -> @builtin(position) vec4f {
  return toScratch(position);
}

@vertex
fn vsCover(@builtin(vertex_index) index: u32) -> CoverOut {
  var corners = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
  let p = mix(layer.uv.xy, layer.uv.zw, corners[index]);
  var out: CoverOut;
  out.position = toScratch(p);
  out.local = p;
  return out;
}

@fragment
fn fsStencil() -> @location(0) vec4f {
  return vec4f(0.0);
}

@fragment
fn fsCover(in: CoverOut) -> @location(0) vec4f {
  let kind = layer.fillParams.x;
  if (kind < 0.5) { return premultiplied(layer.color); }
  // The solid's gradient (Batch 58), laid out in the path's box.
  let size = max(layer.shape.zw, vec2f(1e-4));
  let halfSize = 0.5 * size;
  let p = in.local - layer.shape.xy - halfSize;
  var t = 0.0;
  if (kind < 1.5) {
    let dir = vec2f(-sin(layer.fillParams.y), cos(layer.fillParams.y));
    let extent = max(abs(dir.x) * size.x + abs(dir.y) * size.y, 1e-4);
    t = 0.5 + dot(p, dir) / extent;
  } else {
    let center = layer.fillCenter.xy * size - halfSize;
    t = length(p - center) / max(layer.fillParams.z * 0.5 * length(size), 1e-4);
  }
  return gradientColor(t, i32(layer.fillParams.w));
}
`;

/** Resolves the 4x scratch texture of a shape into its single-sampled texture: the mean of the samples (premultiplied). */
export const PATH_RESOLVE_WGSL = /* wgsl */ `
@group(0) @binding(0) var scratch: texture_multisampled_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(points[index], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(floor(position.xy));
  var sum = vec4f(0.0);
  for (var i = 0; i < 4; i++) { sum += textureLoad(scratch, p, i); }
  return sum * 0.25;
}
`;
