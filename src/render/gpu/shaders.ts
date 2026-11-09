// WGSL for the layer pipelines (spec §9.4). One vertex stage for every layer kind: the unit quad goes
// through the layer matrix (unit quad -> target px: the layer's transform with its pane's viewport
// applied on the CPU) and the view matrix (target px -> clip space).
// Fragment outputs are premultiplied; the pipelines blend with (one, one-minus-src-alpha).
import { MASK_DATA_WIDTH, MASK_HEADER_TEXELS, MASK_KIND_CODE, MASK_MODE_CODE, MASK_TEXELS, MIN_FEATHER } from "../../core/masks/maskCoverage.js";
import { MASK_DATA_LEAD } from "./maskTargets.js";

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
  // dissolves: each picture's own opacity, then the transition center (cx, cy; Batch 71)
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
  // dissolves (Batch 71): the transition's direction x, y, softness and kind code (0 = the plain mix)
  tfx: vec4f,
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
  // w: a 2.5D layer's projective matrix (spec §21.15); varyings interpolate perspective-correctly.
  out.position = vec4f(position.xy, 0.0, position.z);
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
 * Transitions v2 (spec §21.16, Batch 71): `tfx.w` picks a kind; every kind samples the two pictures
 * at the frame point `c` (0..1 over the frame) moved as the kind asks, so each picture keeps its own
 * geometry. Kind 0 is the plain mix on the interpolated picture coordinates (as before Batch 71).
 * Codes: 1 slide, 2 push, 3 wipe, 4 iris, 5 zoom in, 6 zoom out, 7 whip, 8 blur dissolve, 9 glitch, 10 flash.
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
  @location(2) c: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> DissolveOut {
  var corners = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
  let corner = corners[index];
  let model = mat3x3f(layer.c0.xyz, layer.c1.xyz, layer.c2.xyz);
  let toClip = mat3x3f(view.c0.xyz, view.c1.xyz, view.c2.xyz);
  let position = toClip * model * vec3f(corner, 1.0);
  var out: DissolveOut;
  out.position = vec4f(position.xy, 0.0, position.z);
  out.a = vec2f(layer.mapA.x * corner.x + layer.mapA.z * corner.y + layer.mapT.x, layer.mapA.y * corner.x + layer.mapA.w * corner.y + layer.mapT.y);
  out.b = vec2f(layer.mapB.x * corner.x + layer.mapB.z * corner.y + layer.mapT.z, layer.mapB.y * corner.x + layer.mapB.w * corner.y + layer.mapT.w);
  out.c = corner;
  return out;
}

fn inside(t: vec2f) -> f32 {
  return select(0.0, 1.0, all(t >= vec2f(0.0)) && all(t <= vec2f(1.0)));
}

fn pa(c: vec2f) -> vec2f {
  return vec2f(layer.mapA.x * c.x + layer.mapA.z * c.y + layer.mapT.x, layer.mapA.y * c.x + layer.mapA.w * c.y + layer.mapT.y);
}

fn pb(c: vec2f) -> vec2f {
  return vec2f(layer.mapB.x * c.x + layer.mapB.z * c.y + layer.mapT.z, layer.mapB.y * c.x + layer.mapB.w * c.y + layer.mapT.w);
}

fn fromAt(p: vec2f) -> vec4f {
  return textureSample(fromTexture, fromSampler, mix(layer.uv.xy, layer.uv.zw, p)) * (layer.sides.x * inside(p));
}

fn toAt(p: vec2f) -> vec4f {
  return textureSample(toTexture, toSampler, mix(layer.uv2.xy, layer.uv2.zw, p)) * (layer.sides.y * inside(p));
}

fn overPix(top: vec4f, under: vec4f) -> vec4f {
  return top + under * (1.0 - top.a);
}

fn zoomAbout(c: vec2f, s: f32) -> vec2f {
  return (c - vec2f(0.5)) / s + vec2f(0.5);
}

// Twins of hash21 and moshOffset of core/effects/glitchGpu.ts (ported from FlashFX-v2 @ a91c675).
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Datamosh block displacement: xy = offset (uv units, at most 0.15), z = gate (1 for the corrupted blocks).
fn moshOffset(cell: vec2f, seed: f32, amount: f32) -> vec3f {
  let amt = clamp(amount, 0.0, 1.0);
  let h1 = hash21(cell + vec2f(seed));
  let h2 = hash21(cell + vec2f(seed + 19.0));
  let hg = hash21(cell + vec2f(seed + 3.0));
  let ang = h1 * 6.28318;
  let mag = amt * 0.15 * h2;
  return vec3f(cos(ang) * mag, sin(ang) * mag, step(1.0 - amt, hg));
}

@fragment
fn fs(in: DissolveOut) -> @location(0) vec4f {
  let code = i32(layer.tfx.w + 0.5);
  let t = layer.params.w;
  if (code == 0) {
    return mix(fromAt(in.a), toAt(in.b), t) * layer.params.x;
  }
  let c = in.c;
  let size = max(layer.shape.xy, vec2f(1.0));
  let dir = layer.tfx.xy;
  let soft = layer.tfx.z;
  let picA = fromAt(pa(c));
  let picB = toAt(pb(c));
  var res = vec4f(0.0);
  if (code == 1) {
    res = overPix(toAt(pb(c + dir * (1.0 - t))), picA);
  } else if (code == 2) {
    res = overPix(toAt(pb(c + dir * (1.0 - t))), fromAt(pa(c - dir * t)));
  } else if (code == 3) {
    let q = (c - vec2f(0.5)) * size;
    let ext = max(0.5 * (abs(dir.x) * size.x + abs(dir.y) * size.y), 1e-4);
    let s = dot(q, dir) / ext;
    let h = soft * 0.5;
    let e = mix(-1.0 - h, 1.0 + h, t);
    let w = clamp((e - s) / (2.0 * h + 1e-4) + 0.5, 0.0, 1.0);
    res = mix(picA, picB, w);
  } else if (code == 4) {
    let center = vec2f(layer.sides.z, layer.sides.w);
    let d = length((c - center) * size);
    let far = length(max(center, vec2f(1.0) - center) * size);
    let h = soft * far * 0.5;
    let radius = mix(-h, far + h, t);
    let w = clamp((radius - d) / (2.0 * h + 1e-3) + 0.5, 0.0, 1.0);
    res = mix(picA, picB, w);
  } else if (code == 5) {
    res = mix(fromAt(pa(zoomAbout(c, 1.0 + t))), toAt(pb(zoomAbout(c, 0.5 + 0.5 * t))), t);
  } else if (code == 6) {
    res = mix(fromAt(pa(zoomAbout(c, 1.0 - 0.5 * t))), toAt(pb(zoomAbout(c, 2.0 - t))), t);
  } else if (code == 7) {
    // The directional blur of FlashFX-v2 (core/effects/directionalBlur.ts): 2 * 4 + 1 taps at offsets k / 4 along the direction.
    let spread = sin(3.14159265 * t) * 0.08;
    var sum = vec4f(0.0);
    for (var k = -4; k <= 4; k++) {
      let shift = dir * (f32(k) * spread * 0.25);
      sum += overPix(toAt(pb(c + dir * (1.0 - t) + shift)), fromAt(pa(c - dir * t + shift)));
    }
    res = sum / 9.0;
  } else if (code == 8) {
    let r = sin(3.14159265 * t) * 0.04;
    let scale = vec2f(size.y / size.x, 1.0) * r;
    var sum = mix(picA, picB, t);
    for (var k = 0; k < 8; k++) {
      let angle = f32(k) * 0.78539816;
      let o = vec2f(cos(angle), sin(angle)) * scale;
      sum += mix(fromAt(pa(c + o)), toAt(pb(c + o)), t);
    }
    res = sum / 9.0;
  } else if (code == 9) {
    // Datamosh blocks (FlashFX-v2 moshOffset): a block is a cell of 12 x 24 of the frame, redrawn 12 times over the
    // transition; a corrupted block moves by its own offset, splits RGB, and may already show the other picture.
    let cell = floor(c * vec2f(12.0, 24.0));
    let bucket = floor(t * 12.0);
    let amount = sin(3.14159265 * t);
    let mosh = moshOffset(cell, bucket, amount);
    let off = mosh.xy * mosh.z;
    let split = vec2f(0.012 * amount * mosh.z, 0.0);
    let pick = select(0.0, 1.0, t + (hash21(cell + vec2f(bucket)) - 0.5) * 0.3 * amount > 0.5);
    let ar = fromAt(pa(c + off + split));
    let ag = fromAt(pa(c + off));
    let ab = fromAt(pa(c + off - split));
    let br = toAt(pb(c + off + split));
    let bg = toAt(pb(c + off));
    let bb = toAt(pb(c + off - split));
    res = mix(vec4f(ar.r, ag.g, ab.b, ag.a), vec4f(br.r, bg.g, bb.b, bg.a), pick);
  } else {
    let base = mix(picA, picB, select(0.0, 1.0, t >= 0.5));
    res = mix(base, vec4f(1.0), 1.0 - abs(2.0 * t - 1.0));
  }
  return res * layer.params.x;
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
  let q = m * vec3f(p, 1.0);
  return vec4f(q.xy, 0.0, q.z);
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

/**
 * Blend modes and track mattes (spec §21.17, Batch 72): the W3C blend function of every mode, line for
 * line `blendChannel` of core/effects/blendModes.ts (codes are `BLEND_MODES` indices: 0 normal, 1 darken,
 * 2 multiply, 3 color burn, 4 lighten, 5 screen, 6 color dodge, 7 add, 8 overlay, 9 soft light, 10 hard
 * light, 11 difference, 12 exclusion).
 */
const BLEND_FUNCTIONS = /* wgsl */ `
fn hardLight(cb: f32, cs: f32) -> f32 {
  return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cs <= 0.5);
}

fn softLight(cb: f32, cs: f32) -> f32 {
  if (cs <= 0.5) { return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb); }
  let d = select(sqrt(cb), ((16.0 * cb - 12.0) * cb + 4.0) * cb, cb <= 0.25);
  return cb + (2.0 * cs - 1.0) * (d - cb);
}

fn blendChannel(cbIn: f32, csIn: f32, mode: i32) -> f32 {
  let b = clamp(cbIn, 0.0, 1.0);
  let s = clamp(csIn, 0.0, 1.0);
  if (mode == 1) { return min(b, s); }
  if (mode == 2) { return b * s; }
  if (mode == 3) {
    if (b >= 1.0) { return 1.0; }
    if (s <= 0.0) { return 0.0; }
    return 1.0 - min(1.0, (1.0 - b) / s);
  }
  if (mode == 4) { return max(b, s); }
  if (mode == 5) { return b + s - b * s; }
  if (mode == 6) {
    if (b <= 0.0) { return 0.0; }
    if (s >= 1.0) { return 1.0; }
    return min(1.0, b / (1.0 - s));
  }
  if (mode == 7) { return min(1.0, b + s); }
  if (mode == 8) { return hardLight(s, b); }
  if (mode == 9) { return softLight(b, s); }
  if (mode == 10) { return hardLight(b, s); }
  if (mode == 11) { return abs(b - s); }
  if (mode == 12) { return b + s - 2.0 * b * s; }
  return s;
}
`;

/**
 * The composite of a group (spec §21.17): one quad over the frame reads, at its own pixel, the group's
 * picture (its clip drawn alone, premultiplied) and keeps it where the matte picture is opaque or bright
 * (`tfx.x`: 0 none, 1 alpha, 2 alpha inverted, 3 luma, 4 luma inverted; `matteCoverage` of
 * core/effects/trackMatte.ts). `fs`: the hardware modes (normal, screen, add), whose blend state does the
 * rest. `fsBackdrop`: the other modes read a copy of what is below (`backdrop`) and return the W3C
 * composite (`compositeBlend`), drawn without blending. Every texture has the target's size.
 * The matte rule: Ported from FlashFX-v2 src/engine/renderer.ts (MATTE_SHADER) @ a91c675, adapted: luma
 * of the premultiplied matte pixel (see core/effects/trackMatte.ts), applied in the same pass as the blend.
 */
export const COMPOSITE_WGSL = /* wgsl */ `${COMMON}${BLEND_FUNCTIONS}
@group(1) @binding(0) var pictureTex: texture_2d<f32>;
@group(1) @binding(1) var matteTex: texture_2d<f32>;
@group(1) @binding(2) var backdropTex: texture_2d<f32>;
@group(1) @binding(3) var maskTex: texture_2d<f32>;
@group(1) @binding(4) var matteMaskTex: texture_2d<f32>;

// Masks (spec §21.18, Batch 73): a clip's coverage at target px \`p\`. The map (three rows in the stop
// colors, drawRecords MASK_MAP) takes p to its content box's unit square; the coverage texture is read
// bilinearly, clamped at its edges; behind the viewer it is 0.
fn coverage(tex: texture_2d<f32>, r0: vec4f, r1: vec4f, r2: vec4f, p: vec2f) -> f32 {
  let h = vec3f(p, 1.0);
  let q = vec3f(dot(r0.xyz, h), dot(r1.xyz, h), dot(r2.xyz, h));
  if (q.z <= 1e-6) { return 0.0; }
  let size = vec2i(textureDimensions(tex));
  let t = (q.xy / q.z) * vec2f(size) - 0.5;
  let f = floor(t);
  let w = t - f;
  let hi = size - vec2i(1);
  let i0 = clamp(vec2i(f), vec2i(0), hi);
  let i1 = clamp(vec2i(f) + vec2i(1), vec2i(0), hi);
  let a = textureLoad(tex, i0, 0).r;
  let b = textureLoad(tex, vec2i(i1.x, i0.y), 0).r;
  let c = textureLoad(tex, vec2i(i0.x, i1.y), 0).r;
  let d = textureLoad(tex, i1, 0).r;
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn matted(p: vec2i, at: vec2f) -> vec4f {
  var s = textureLoad(pictureTex, p, 0);
  // The clip's masks first, then the matte (whose clip's own masks apply to the matte picture).
  if (layer.stopColor[6].x > 0.5) { s = s * coverage(maskTex, layer.stopColor[0], layer.stopColor[1], layer.stopColor[2], at); }
  let matte = i32(layer.tfx.x + 0.5);
  if (matte == 0) { return s; }
  var m = textureLoad(matteTex, p, 0);
  if (layer.stopColor[6].y > 0.5) { m = m * coverage(matteMaskTex, layer.stopColor[3], layer.stopColor[4], layer.stopColor[5], at); }
  var c = m.a;
  if (matte >= 3) { c = dot(m.rgb, vec3f(0.2126, 0.7152, 0.0722)); }
  if (matte == 2 || matte == 4) { c = 1.0 - c; }
  return s * clamp(c, 0.0, 1.0);
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  return matted(vec2i(in.position.xy), in.position.xy);
}

@fragment
fn fsBackdrop(in: VertexOut) -> @location(0) vec4f {
  let p = vec2i(in.position.xy);
  let s = matted(p, in.position.xy);
  let b = textureLoad(backdropTex, p, 0);
  let mode = i32(layer.tfx.w + 0.5);
  let cs = select(vec3f(0.0), s.rgb / max(s.a, 1e-6), s.a > 0.0);
  let cb = select(vec3f(0.0), b.rgb / max(b.a, 1e-6), b.a > 0.0);
  let blended = vec3f(blendChannel(cb.r, cs.r, mode), blendChannel(cb.g, cs.g, mode), blendChannel(cb.b, cs.b, mode));
  let rgb = s.rgb * (1.0 - b.a) + b.rgb * (1.0 - s.a) + s.a * b.a * blended;
  return vec4f(rgb, s.a + b.a - s.a * b.a);
}
`;

/**
 * The coverage of a clip's masks (spec §21.18, Batch 73): one full-target triangle strip over its coverage
 * texture; each texel evaluates the packed block (core/masks/maskCoverage.ts `maskStackCoverage`, line
 * for line) at its center in content px. `dataTex` (rgba32float, MASK_DATA_WIDTH texels a row) holds the
 * lead texel (content px per texel) and then the block.
 * Ported from FlashFX-v2 src/engine/renderer.ts (MASK_SHADER) @ a91c675, adapted.
 */
export const MASK_WGSL = /* wgsl */ `
@group(0) @binding(0) var dataTex: texture_2d<f32>;

fn texel(i: i32) -> vec4f {
  let j = i + ${MASK_DATA_LEAD};
  return textureLoad(dataTex, vec2i(j % ${MASK_DATA_WIDTH}, j / ${MASK_DATA_WIDTH}), 0);
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  return vec4f(corners[index], 0.0, 1.0);
}

fn boxSD(p: vec2f, hs: vec2f, r: f32) -> f32 {
  let q = abs(p) - hs + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn ellipseSD(p: vec2f, ax: f32, ay: f32) -> f32 {
  let a = max(ax, 0.001);
  let b = max(ay, 0.001);
  let k1 = length(p / vec2f(a, b));
  let k2 = length(p / vec2f(a * a, b * b));
  if (k2 < 1e-9) { return -min(a, b); }
  return k1 * (k1 - 1.0) / max(k2, 0.0001);
}

fn outlineSD(first: i32, count: i32, p: vec2f) -> f32 {
  var minD = 1e30;
  var winding = 0;
  for (var k = 0; k < count; k++) {
    let s = texel(first + k);
    let a = s.xy;
    let e = s.zw - a;
    let w = p - a;
    let ee = dot(e, e);
    let t = select(0.0, clamp(dot(w, e) / ee, 0.0, 1.0), ee > 1e-12);
    minD = min(minD, length(w - e * t));
    let isLeft = e.x * w.y - e.y * w.x;
    if (a.y <= p.y) {
      if (a.y + e.y > p.y && isLeft > 0.0) { winding += 1; }
    } else if (a.y + e.y <= p.y && isLeft < 0.0) { winding -= 1; }
  }
  return select(minD, -minD, winding != 0);
}

fn maskAt(i: i32, p: vec2f) -> f32 {
  let base = ${MASK_HEADER_TEXELS} + i * ${MASK_TEXELS};
  let t0 = texel(base);
  let t1 = texel(base + 1);
  let t2 = texel(base + 2);
  let kind = i32(t0.x + 0.5);
  let feather = max(t2.y, ${MIN_FEATHER.toFixed(2)});
  let expansion = t2.z;
  var sd: f32;
  if (kind == ${MASK_KIND_CODE.path}) {
    let bounds = texel(base + 3);
    let pad = feather + 1.0 + max(expansion, 0.0);
    let outside = p.x < bounds.x - pad || p.y < bounds.y - pad || p.x > bounds.z + pad || p.y > bounds.w + pad;
    let count = i32(t1.y + 0.5);
    if (outside || count < 2) { sd = 1e30; } else { sd = outlineSD(i32(t1.x + 0.5), count, p); }
  } else if (kind == ${MASK_KIND_CODE.ellipse}) {
    sd = ellipseSD(p - t1.xy, t1.z, t1.w);
  } else {
    sd = boxSD(p - t1.xy, t1.zw, t2.x);
  }
  var a = 1.0 - smoothstep(-feather, feather, sd - expansion);
  if (t0.z > 0.5) { a = 1.0 - a; }
  return a;
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let scale = texel(-1).xy;
  let p = position.xy * scale;
  let header = texel(0);
  let count = i32(header.x + 0.5);
  if (count <= 0) { return vec4f(1.0); }
  let firstMode = i32(texel(${MASK_HEADER_TEXELS}).y + 0.5);
  var acc = select(1.0, 0.0, firstMode == ${MASK_MODE_CODE.add});
  for (var i = 0; i < count; i++) {
    let t0 = texel(${MASK_HEADER_TEXELS} + i * ${MASK_TEXELS});
    let c = maskAt(i, p);
    let op = t0.w;
    let mode = i32(t0.y + 0.5);
    if (mode == ${MASK_MODE_CODE.add}) { acc = min(1.0, acc + op * c); }
    else if (mode == ${MASK_MODE_CODE.subtract}) { acc = max(0.0, acc - op * c); }
    else { acc = acc * (1.0 - op * (1.0 - c)); }
  }
  return vec4f(acc, 0.0, 0.0, 1.0);
}
`;
