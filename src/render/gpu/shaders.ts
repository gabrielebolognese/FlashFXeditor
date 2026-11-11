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

// An adjustment clip (spec §21.20, Batch 76): its effect picture (pictureTex, target px) over the picture below
// (backdropTex, the target before it), mixed by its opacity times its masks' coverage. No blending.
@fragment
fn fsAdjust(in: VertexOut) -> @location(0) vec4f {
  let p = vec2i(in.position.xy);
  let b = textureLoad(backdropTex, p, 0);
  let s = textureLoad(pictureTex, p, 0);
  var k = layer.params.x;
  if (layer.stopColor[6].x > 0.5) { k = k * coverage(maskTex, layer.stopColor[0], layer.stopColor[1], layer.stopColor[2], in.position.xy); }
  return mix(b, s, clamp(k, 0.0, 1.0));
}
`;

/**
 * The coverage of a clip's masks (spec §21.18, Batch 73): one full-target triangle strip over its coverage
 * texture; each texel evaluates the packed block (core/masks/maskCoverage.ts `maskStackCoverage`, line
 * for line) at its center in content px. `dataTex` (rgba32float, MASK_DATA_WIDTH texels a row) holds the
 * lead texel (content px per texel) and then the block.
 * Ported from FlashFX-v2 src/engine/maskWgsl.ts (MASK_WGSL) @ a91c675, adapted.
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

/**
 * The effect passes (spec §21.19, Batch 74): one full-target triangle per pass over a stage picture, the
 * program picked by `fx.size.z` (render/effects/registry.ts FX_PROGRAM, planned by effectPlan.ts). `src` is
 * the picture the pass reads, `orig` the effect's input (or the clip's mask coverage); both are pooled
 * textures at least the stage's size, read by stage px (pixel centers at k + 0.5): bilinear inside the stage,
 * transparent past it, or clamped to the content box when `fx.size.w` (repeat edges) is set. Premultiplied
 * in and out; no blending.
 * Ported from FlashFX-v2 src/engine/renderer.ts (BLUR_EFFECT_SHADER fs_gauss_h / fs_gauss_v / fs_directional,
 * GLOW_SHADER, SHADOW_SHADER) @ a91c675, adapted: one module for every program, the glow extracted from the
 * picture's unpremultiplied luminance and screened over it, the shadow's offset applied while extracting.
 * Programs 10..16 (Batch 75) are the per-pixel effects: color adjustment, vignette, sharpen, grain, chroma and
 * luma keys, and the LUT (orig is then the LUT atlas, read texel by texel).
 */
export const EFFECT_WGSL = /* wgsl */ `
struct Fx {
  // stage width, height (px), program, repeat edges
  size: vec4f,
  // blurs: dirX, dirY, sigma, taps; directional: x, y (px), samples; outline: width (px), rings
  a: vec4f,
  // shadow offset x, y (px); glow intensity, threshold
  b: vec4f,
  // straight rgba
  color: vec4f,
  // the content box x0, y0, x1, y1 (stage px)
  rect: vec4f,
  // glow mode (0 outer, 1 inner), tap gap (px)
  c: vec4f,
};

@group(0) @binding(0) var<uniform> fx: Fx;
@group(1) @binding(0) var srcSampler: sampler;
@group(1) @binding(1) var src: texture_2d<f32>;
@group(2) @binding(0) var origSampler: sampler;
@group(2) @binding(1) var orig: texture_2d<f32>;

const TAU = 6.283185307;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(points[index], 0.0, 1.0);
}

fn tapSrc(p: vec2f) -> vec4f {
  let dims = vec2f(textureDimensions(src));
  if (fx.size.w > 0.5) {
    let q = clamp(p, fx.rect.xy + vec2f(0.5), max(fx.rect.zw - vec2f(0.5), fx.rect.xy + vec2f(0.5)));
    return textureSampleLevel(src, srcSampler, q / dims, 0.0);
  }
  let size = fx.size.xy;
  let q = clamp(p, vec2f(0.5), size - vec2f(0.5));
  let w = clamp(p + vec2f(0.5), vec2f(0.0), vec2f(1.0)) * clamp(size + vec2f(0.5) - p, vec2f(0.0), vec2f(1.0));
  return textureSampleLevel(src, srcSampler, q / dims, 0.0) * (w.x * w.y);
}

fn tapOrig(p: vec2f) -> vec4f {
  let dims = vec2f(textureDimensions(orig));
  let size = fx.size.xy;
  let q = clamp(p, vec2f(0.5), size - vec2f(0.5));
  let w = clamp(p + vec2f(0.5), vec2f(0.0), vec2f(1.0)) * clamp(size + vec2f(0.5) - p, vec2f(0.0), vec2f(1.0));
  return textureSampleLevel(orig, origSampler, q / dims, 0.0) * (w.x * w.y);
}

// What a blur pass sums at q: the picture, the glow source (bright pixels alpha, or the inverse alpha
// inside for an inner glow) or the shadow source (the alpha moved by the offset).
fn source(program: i32, q: vec2f) -> vec4f {
  if (program == 3) {
    let s = tapSrc(q);
    if (fx.c.x > 0.5) { return vec4f(1.0 - s.a); }
    let rgb = s.rgb / max(s.a, 0.00001);
    let lum = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
    return vec4f(s.a * smoothstep(fx.b.w - 0.1, fx.b.w, lum));
  }
  if (program == 5) { return vec4f(tapSrc(q - fx.b.xy).a); }
  return tapSrc(q);
}

// Wide blurs space their taps out; each tap then reads two bilinear samples (a box about the gap wide).
fn spaced(program: i32, q: vec2f, dir: vec2f, gap: f32) -> vec4f {
  if (gap <= 1.5) { return source(program, q); }
  let off = dir * (gap * 0.25);
  return 0.5 * (source(program, q - off) + source(program, q + off));
}

fn gauss(program: i32, p: vec2f) -> vec4f {
  let dir = fx.a.xy;
  let sigma = max(fx.a.z, 0.0001);
  let taps = i32(fx.a.w + 0.5);
  let gap = max(fx.c.y, 0.0001);
  var sum = spaced(program, p, dir, gap);
  var total = 1.0;
  for (var k = 1; k <= taps; k++) {
    let d = f32(k) * gap;
    let weight = exp(-(d * d) / (2.0 * sigma * sigma));
    sum += weight * (spaced(program, p + dir * d, dir, gap) + spaced(program, p - dir * d, dir, gap));
    total += 2.0 * weight;
  }
  return sum / total;
}

fn directional(p: vec2f) -> vec4f {
  let n = i32(fx.a.z + 0.5);
  if (n <= 1) { return tapSrc(p); }
  var sum = vec4f(0.0);
  for (var i = 0; i < n; i++) {
    let t = f32(i) / f32(n - 1) * 2.0 - 1.0;
    sum += tapSrc(p + fx.a.xy * t);
  }
  return sum / f32(n);
}

// The largest alpha of the picture within a disk of radius fx.a.x (rings of samples about 1.5 px apart). An
// outline chains several (a disk dilated by a disk is the disk of the summed radii): small steps keep it round.
fn dilate(p: vec2f) -> f32 {
  let rings = i32(fx.a.y + 0.5);
  var d = tapSrc(p).a;
  for (var j = 1; j <= rings; j++) {
    let r = fx.a.x * f32(j) / f32(rings);
    let n = i32(clamp(ceil(TAU * r / 1.5), 6.0, 48.0));
    let turn = 0.5 * f32(j & 1) / f32(n);
    for (var i = 0; i < n; i++) {
      let angle = TAU * (f32(i) / f32(n) + turn);
      d = max(d, tapSrc(p + r * vec2f(cos(angle), sin(angle))).a);
    }
  }
  return d;
}

// The last step of an outline: the dilated alpha tinted, under the effect's input.
fn outline(p: vec2f) -> vec4f {
  let o = tapOrig(p);
  let a = dilate(p) * fx.color.a;
  return o + vec4f(fx.color.rgb * a, a) * (1.0 - o.a);
}

// The clip mask coverage over the content box (texels read bilinearly, clamped at its edges).
fn coverage(p: vec2f) -> f32 {
  let size = vec2i(textureDimensions(orig));
  let box = max(fx.rect.zw - fx.rect.xy, vec2f(0.0001));
  let t = (p - fx.rect.xy) / box * vec2f(size) - vec2f(0.5);
  let f = floor(t);
  let w = t - f;
  let hi = size - vec2i(1);
  let i0 = clamp(vec2i(f), vec2i(0), hi);
  let i1 = clamp(vec2i(f) + vec2i(1), vec2i(0), hi);
  let a = textureLoad(orig, i0, 0).r;
  let b = textureLoad(orig, vec2i(i1.x, i0.y), 0).r;
  let c = textureLoad(orig, vec2i(i0.x, i1.y), 0).r;
  let d = textureLoad(orig, i1, 0).r;
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// Batch 75: the per-pixel effects (the CPU twin is core/effects/colorMath.ts and core/effects/lut.ts). Colors
// are unpremultiplied for the math and premultiplied again. Smoothstep with a hard step for an empty window.
fn sstep(e0: f32, e1: f32, x: f32) -> f32 {
  if (e1 <= e0) { return select(1.0, 0.0, x < e0); }
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

fn luma709(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

fn hueChannel(p: f32, q: f32, t: f32) -> f32 {
  let tt = fract(t);
  if (tt < 1.0 / 6.0) { return p + (q - p) * 6.0 * tt; }
  if (tt < 0.5) { return q; }
  if (tt < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - tt) * 6.0; }
  return p;
}

// HSL hue rotation by turns (FlashFX-v2 hsl.ts rgbToHsl / hslToRgb).
fn hueRotate(c: vec3f, turns: f32) -> vec3f {
  let mx = max(c.r, max(c.g, c.b));
  let mn = min(c.r, min(c.g, c.b));
  if (mx == mn) { return c; }
  let l = (mx + mn) * 0.5;
  let d = mx - mn;
  let s = select(d / (mx + mn), d / (2.0 - mx - mn), l > 0.5);
  var h: f32;
  if (mx == c.r) { h = (c.g - c.b) / d + select(0.0, 6.0, c.g < c.b); }
  else if (mx == c.g) { h = (c.b - c.r) / d + 2.0; }
  else { h = (c.r - c.g) / d + 4.0; }
  h = fract(h / 6.0 + turns);
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3f(hueChannel(p, q, h + 1.0 / 3.0), hueChannel(p, q, h), hueChannel(p, q, h - 1.0 / 3.0));
}

// a = brightness, contrast, saturation (%), exposure (stops); b = temperature, tint (%), hue (degrees), vibrance (%).
fn colorAdjust(cIn: vec3f) -> vec3f {
  var c = cIn * exp2(fx.a.w);
  let t = fx.b.x / 100.0;
  c = c + vec3f(t * 0.2, 0.0, -t * 0.2);
  let k = fx.b.y / 100.0;
  c = c + vec3f(k * 0.1, -k * 0.2, k * 0.1);
  c = (c + vec3f(fx.a.x / 100.0 * 0.5 - 0.5)) * (1.0 + fx.a.y / 100.0) + vec3f(0.5);
  var y = luma709(c);
  c = vec3f(y) + (c - vec3f(y)) * (1.0 + fx.a.z / 100.0);
  let chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  let vib = 1.0 + fx.b.w / 100.0 * (1.0 - clamp(chroma, 0.0, 1.0));
  y = luma709(c);
  c = clamp(vec3f(y) + (c - vec3f(y)) * vib, vec3f(0.0), vec3f(1.0));
  if (fx.b.z != 0.0) { c = hueRotate(c, fx.b.z / 360.0); }
  return clamp(c, vec3f(0.0), vec3f(1.0));
}

fn grainHash(x: u32, y: u32, f: u32) -> f32 {
  var h = (x * 0x8da6b343u) ^ (y * 0xd8163841u) ^ (f * 0xcb1ab31fu);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return f32(h >> 8u) / 16777215.0;
}

// Value noise over cells fx.a.y stage px wide (the content box's corner at a cell corner), -0.5..0.5.
fn grainNoise(p: vec2f) -> f32 {
  let q = (p - fx.rect.xy) / max(fx.a.y, 0.0001);
  let fl = floor(q);
  let fr = q - fl;
  let w = fr * fr * (3.0 - 2.0 * fr);
  let i = vec2u(vec2i(fl) + vec2i(65536));
  let f = u32(max(fx.a.z, 0.0) + 0.5);
  let a = grainHash(i.x, i.y, f);
  let b = grainHash(i.x + 1u, i.y, f);
  let c = grainHash(i.x, i.y + 1u, f);
  let d = grainHash(i.x + 1u, i.y + 1u, f);
  return a + (b - a) * w.x + (c - a) * w.y + (a - b - c + d) * w.x * w.y - 0.5;
}

fn cbcr(c: vec3f) -> vec2f {
  return vec2f(dot(c, vec3f(-0.168736, -0.331264, 0.5)), dot(c, vec3f(0.5, -0.418688, -0.081312)));
}

// color = the key; a = tolerance, softness, spill, the key's dominant channel (0 r, 1 g, 2 b).
fn chromaKey(s: vec4f) -> vec4f {
  if (s.a <= 0.0) { return vec4f(0.0); }
  var c = s.rgb / s.a;
  let keep = sstep(fx.a.x, fx.a.x + max(fx.a.y, 0.0), length(cbcr(c) - cbcr(fx.color.rgb)));
  let ch = i32(fx.a.w + 0.5);
  if (ch == 0) {
    let lim = max(c.g, c.b);
    if (c.r > lim) { c.r = c.r - fx.a.z * (c.r - lim); }
  } else if (ch == 2) {
    let lim = max(c.r, c.g);
    if (c.b > lim) { c.b = c.b - fx.a.z * (c.b - lim); }
  } else {
    let lim = max(c.r, c.b);
    if (c.g > lim) { c.g = c.g - fx.a.z * (c.g - lim); }
  }
  let a = s.a * keep;
  return vec4f(c * a, a);
}

fn lutTexel(r: i32, g: i32, b: i32, n: i32) -> vec3f { return textureLoad(orig, vec2i(r + b * n, g), 0).rgb; }

// The LUT atlas (orig): a = intensity, grid size; b.xyz = domain min; color.xyz = domain max. Trilinear over exact texels.
fn applyLut(c: vec3f) -> vec3f {
  let n = i32(fx.a.y + 0.5);
  let f = clamp((c - fx.b.xyz) / max(fx.color.xyz - fx.b.xyz, vec3f(0.000001)), vec3f(0.0), vec3f(1.0)) * f32(n - 1);
  let i0 = vec3i(floor(f));
  let i1 = min(i0 + vec3i(1), vec3i(n - 1));
  let t = f - floor(f);
  let x00 = mix(lutTexel(i0.x, i0.y, i0.z, n), lutTexel(i1.x, i0.y, i0.z, n), t.x);
  let x10 = mix(lutTexel(i0.x, i1.y, i0.z, n), lutTexel(i1.x, i1.y, i0.z, n), t.x);
  let x01 = mix(lutTexel(i0.x, i0.y, i1.z, n), lutTexel(i1.x, i0.y, i1.z, n), t.x);
  let x11 = mix(lutTexel(i0.x, i1.y, i1.z, n), lutTexel(i1.x, i1.y, i1.z, n), t.x);
  return mix(mix(x00, x10, t.y), mix(x01, x11, t.y), t.z);
}

fn pixelEffect(program: i32, p: vec2f) -> vec4f {
  let s = tapSrc(p);
  switch program {
    case 10: {
      if (s.a <= 0.0) { return vec4f(0.0); }
      return vec4f(colorAdjust(s.rgb / s.a) * s.a, s.a);
    }
    case 11: {
      let uv = (p - fx.rect.xy) / max(fx.rect.zw - fx.rect.xy, vec2f(0.0001));
      let r = clamp(fx.a.y, 0.0, 1.5);
      let f = 1.0 - sstep(r - clamp(fx.a.z, 0.0, 1.0), r, length((uv - vec2f(0.5)) * 2.0));
      return vec4f(s.rgb * (1.0 - clamp(fx.a.x, 0.0, 1.0) * (1.0 - f)), s.a);
    }
    case 12: {
      // Unsharp mask over a 3 x 3 tent fx.a.y px wide; the alpha is kept.
      let r = fx.a.y;
      let e = tapSrc(p + vec2f(r, 0.0)) + tapSrc(p - vec2f(r, 0.0)) + tapSrc(p + vec2f(0.0, r)) + tapSrc(p - vec2f(0.0, r));
      let d = tapSrc(p + vec2f(r, r)) + tapSrc(p + vec2f(-r, r)) + tapSrc(p + vec2f(r, -r)) + tapSrc(p - vec2f(r, r));
      let blur = (4.0 * s + 2.0 * e + d) / 16.0;
      return vec4f(clamp(s.rgb + (s.rgb - blur.rgb) * fx.a.x, vec3f(0.0), vec3f(s.a)), s.a);
    }
    case 13: {
      if (s.a <= 0.0) { return vec4f(0.0); }
      let rgb = clamp(s.rgb / s.a + vec3f(grainNoise(p) * fx.a.x), vec3f(0.0), vec3f(1.0));
      return vec4f(rgb * s.a, s.a);
    }
    case 14: { return chromaKey(s); }
    case 15: {
      if (s.a <= 0.0) { return vec4f(0.0); }
      var k = sstep(fx.a.x, fx.a.x + max(fx.a.y, 0.0), luma709(s.rgb / s.a));
      if (fx.a.z > 0.5) { k = 1.0 - k; }
      return s * k;
    }
    case 16: {
      if (s.a <= 0.0) { return vec4f(0.0); }
      let c = s.rgb / s.a;
      return vec4f(mix(c, applyLut(c), clamp(fx.a.x, 0.0, 1.0)) * s.a, s.a);
    }
    default: { return s; }
  }
}

// Batch 76: RGB split, pixelate, mirror, wave, glitch, posterize and invert (core/effects/stylize.ts, line for
// line). Reads past the stage are transparent (tapSrc); rounding is floor(x + 0.5) on both backends.
fn glitchShift(p: vec2f) -> f32 {
  let row = u32(i32(floor((p.y - fx.rect.y) / max(fx.a.y, 0.0001))) + 65536);
  let key = u32(fx.b.x + 0.5) * 7919u + u32(fx.b.y + 0.5);
  if (grainHash(row, key, 1u) >= fx.a.x) { return 0.0; }
  return (grainHash(row, key, 2u) * 2.0 - 1.0) * fx.a.z;
}

fn stylize(program: i32, p: vec2f) -> vec4f {
  switch program {
    case 17: {
      let r = tapSrc(p + fx.a.xy);
      let g = tapSrc(p);
      let b = tapSrc(p - fx.a.xy);
      return vec4f(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
    }
    case 18: {
      let cell = max(fx.a.x, 0.0001);
      return tapSrc(fx.rect.xy + (floor((p - fx.rect.xy) / cell) + vec2f(0.5)) * cell);
    }
    case 19: {
      let side = i32(fx.a.x + 0.5);
      var q = p;
      if (side < 2) {
        let axisAt = fx.rect.x + fx.a.y * (fx.rect.z - fx.rect.x);
        if (select((p.x < axisAt), (p.x > axisAt), side == 0)) { q.x = 2.0 * axisAt - p.x; }
      } else {
        let axisAt = fx.rect.y + fx.a.y * (fx.rect.w - fx.rect.y);
        if (select((p.y < axisAt), (p.y > axisAt), side == 2)) { q.y = 2.0 * axisAt - p.y; }
      }
      return tapSrc(q);
    }
    case 20: {
      let len = max(fx.a.y, 0.0001);
      var q = p;
      if (fx.a.z < 0.5) { q.x = p.x + fx.a.x * sin(TAU * (p.y - fx.rect.y) / len - TAU * fx.a.w); }
      else { q.y = p.y + fx.a.x * sin(TAU * (p.x - fx.rect.x) / len - TAU * fx.a.w); }
      return tapSrc(q);
    }
    case 21: {
      let du = glitchShift(p);
      if (du == 0.0) { return tapSrc(p); }
      let r = tapSrc(p + vec2f(du + fx.a.w, 0.0));
      let g = tapSrc(p + vec2f(du, 0.0));
      let b = tapSrc(p + vec2f(du - fx.a.w, 0.0));
      return vec4f(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
    }
    case 22: {
      let s = tapSrc(p);
      if (s.a <= 0.0) { return vec4f(0.0); }
      let n = max(floor(fx.a.x + 0.5), 2.0) - 1.0;
      return vec4f(floor(clamp(s.rgb / s.a, vec3f(0.0), vec3f(1.0)) * n + vec3f(0.5)) / n * s.a, s.a);
    }
    case 23: {
      let s = tapSrc(p);
      if (s.a <= 0.0) { return vec4f(0.0); }
      let c = s.rgb / s.a;
      return vec4f((c + (vec3f(1.0) - 2.0 * c) * clamp(fx.a.x, 0.0, 1.0)) * s.a, s.a);
    }
    default: { return tapSrc(p); }
  }
}

// v1.3: denoise (core/effects/denoisePlan.ts). Colors stay premultiplied; brightness (luma) and color (chroma:
// blue and red minus luma) are filtered apart, each with its own threshold. a = step (px), luma threshold,
// chroma threshold, shadows (how much the thresholds rise in the dark).
fn dnChroma(c: vec4f) -> vec2f {
  let y = luma709(c.rgb);
  return vec2f(c.b - y, c.r - y);
}

// The luma of the luma-weighted mean with the chroma of the chroma-weighted mean.
fn dnCompose(l: vec4f, c: vec4f) -> vec4f {
  let y = luma709(l.rgb);
  let k = dnChroma(c);
  let r = y + k.y;
  let b = y + k.x;
  let g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return vec4f(clamp(vec3f(r, g, b), vec3f(0.0), vec3f(l.a)), l.a);
}

fn dnBoost(y: f32) -> f32 {
  let d = 1.0 - clamp(y, 0.0, 1.0);
  return 1.0 + 2.0 * fx.a.w * d * d;
}

// exp(-d2 / h^2); nothing passes a threshold of 0.
fn dnWeight(d2: f32, h: f32) -> f32 {
  if (h <= 0.0) { return 0.0; }
  return exp(-d2 / (h * h));
}

// A pixel no neighbor resembles (the weights besides its own sum to under a half) is a speck of noise, not
// detail: an edge or a line always has neighbors like it. It takes the plain mean u of its surroundings.
// Only on the finest pass (taps up to 1.5 px apart: specks are single pixels) and away from the picture's edge.
fn dnLone(l: vec4f, u: vec4f, wl: f32, hl: f32) -> vec4f {
  if (hl <= 0.0 || fx.a.x > 1.5 || abs(u.a - l.a) > 0.01) { return l; }
  return mix(u, l, clamp((wl - 1.0) * 2.0, 0.0, 1.0));
}

// The B3 spline weight of a tap i steps from the middle (1, 2/3, 1/6).
fn dnSpline(i: i32) -> f32 {
  if (i == 0) { return 1.0; }
  if (abs(i) == 1) { return 2.0 / 3.0; }
  return 1.0 / 6.0;
}

// One edge-avoiding a-trous level: a 5 x 5 B3 spline whose taps are fx.a.x px apart.
fn dnAtrous(p: vec2f) -> vec4f {
  let s = tapSrc(p);
  let y0 = luma709(s.rgb);
  let c0 = dnChroma(s);
  let boost = dnBoost(y0);
  let hl = fx.a.y * boost;
  let hc = fx.a.z * boost;
  let he = max(hl, hc) * 1.5;
  var sumL = s;
  var wl = 1.0;
  var sumC = s;
  var wc = 1.0;
  var sumU = s;
  var wu = 1.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      if (i == 0 && j == 0) { continue; }
      let q = tapSrc(p + vec2f(f32(i), f32(j)) * fx.a.x);
      let k = dnSpline(i) * dnSpline(j);
      let dy = luma709(q.rgb) - y0;
      let da = q.a - s.a;
      let d2 = dy * dy + da * da;
      let dc = dnChroma(q) - c0;
      let a = k * dnWeight(d2, hl);
      let b = k * dnWeight(d2, he) * dnWeight(dot(dc, dc), hc);
      sumL += q * a;
      wl += a;
      sumC += q * b;
      wc += b;
      sumU += q * k;
      wu += k;
    }
  }
  return dnCompose(dnLone(sumL / wl, sumU / wu, wl, hl), sumC / wc);
}

// A joint bilateral filter: 7 x 7 taps fx.a.x px apart, a Gaussian in space times one in color distance.
fn dnBilateral(p: vec2f) -> vec4f {
  let s = tapSrc(p);
  let y0 = luma709(s.rgb);
  let c0 = dnChroma(s);
  let boost = dnBoost(y0);
  let hl = fx.a.y * boost;
  let hc = fx.a.z * boost;
  var sumL = s;
  var wl = 1.0;
  var sumC = s;
  var wc = 1.0;
  var sumU = s;
  var wu = 1.0;
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      if (i == 0 && j == 0) { continue; }
      let q = tapSrc(p + vec2f(f32(i), f32(j)) * fx.a.x);
      let k = exp(-f32(i * i + j * j) / 6.48);
      let dy = luma709(q.rgb) - y0;
      let da = q.a - s.a;
      let dc = dnChroma(q) - c0;
      let d2 = dy * dy + da * da + dot(dc, dc);
      let a = k * dnWeight(d2, hl);
      let b = k * dnWeight(d2, hc);
      sumL += q * a;
      wl += a;
      sumC += q * b;
      wc += b;
      sumU += q * k;
      wu += k;
    }
  }
  return dnCompose(dnLone(sumL / wl, sumU / wu, wl, hl), sumC / wc);
}

// What a non-local means patch compares: luma, and the alpha so a transparent neighbor never matches.
fn dnValue(c: vec4f) -> f32 { return luma709(c.rgb) + 0.5 * c.a; }

// Non-local means: each pixel of a 5 x 5 window (fx.a.x px apart) weighted by how alike the 3 x 3 patches
// around it and around p are; p itself weighs as much as its best match.
fn dnNlm(p: vec2f) -> vec4f {
  let gap = fx.a.x;
  let s = tapSrc(p);
  var around: array<f32, 9>;
  for (var n = 0; n < 9; n++) {
    around[n] = dnValue(tapSrc(p + vec2f(f32(n % 3 - 1), f32(n / 3 - 1)) * gap));
  }
  let c0 = dnChroma(s);
  let boost = dnBoost(luma709(s.rgb));
  let hl = fx.a.y * boost;
  let hc = fx.a.z * boost;
  let he = max(hl, hc) * 1.5;
  var sumL = vec4f(0.0);
  var wl = 0.0;
  var bestL = 0.0;
  var sumC = vec4f(0.0);
  var wc = 0.0;
  var bestC = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      if (i == 0 && j == 0) { continue; }
      let at = p + vec2f(f32(i), f32(j)) * gap;
      var q = vec4f(0.0);
      var d2 = 0.0;
      for (var n = 0; n < 9; n++) {
        let t = tapSrc(at + vec2f(f32(n % 3 - 1), f32(n / 3 - 1)) * gap);
        if (n == 4) { q = t; }
        let e = dnValue(t) - around[n];
        d2 += e * e;
      }
      d2 = d2 / 9.0;
      let dc = dnChroma(q) - c0;
      let a = dnWeight(d2, hl);
      let b = dnWeight(d2, he) * dnWeight(dot(dc, dc), hc);
      sumL += q * a;
      wl += a;
      bestL = max(bestL, a);
      sumC += q * b;
      wc += b;
      bestC = max(bestC, b);
    }
  }
  bestL = max(bestL, 0.0001);
  bestC = max(bestC, 0.0001);
  return dnCompose((sumL + s * bestL) / (wl + bestL), (sumC + s * bestC) / (wc + bestC));
}

// The 3 x 3 median of each channel (taps fx.a.x px apart), mixed in by fx.a.y (luma) and fx.a.z (chroma).
fn dnMedian(p: vec2f) -> vec4f {
  let s = tapSrc(p);
  var v: array<vec4f, 9>;
  for (var n = 0; n < 9; n++) {
    v[n] = tapSrc(p + vec2f(f32(n % 3 - 1), f32(n / 3 - 1)) * fx.a.x);
  }
  for (var i = 0; i < 5; i++) {
    for (var j = i + 1; j < 9; j++) {
      let lo = min(v[i], v[j]);
      v[j] = max(v[i], v[j]);
      v[i] = lo;
    }
  }
  let m = v[4];
  return dnCompose(mix(s, m, clamp(fx.a.y, 0.0, 1.0)), mix(s, m, clamp(fx.a.z, 0.0, 1.0)));
}

// The finish pass: src is the denoised picture, orig the input of the effect. Where the denoised picture has
// structure (a luma slope well above the noise level fx.a.y), a share fx.a.x of the luma that was removed is
// put back; flat areas get a little of it so they never look like plastic. a.z = px between the taps of the slope.
fn dnFinish(p: vec2f) -> vec4f {
  let d = tapSrc(p);
  if (fx.a.x <= 0.0) { return d; }
  let o = tapOrig(p);
  let st = fx.a.z;
  let gx = luma709(tapSrc(p + vec2f(st, 0.0)).rgb) - luma709(tapSrc(p - vec2f(st, 0.0)).rgb);
  let gy = luma709(tapSrc(p + vec2f(0.0, st)).rgb) - luma709(tapSrc(p - vec2f(0.0, st)).rgb);
  let slope = 0.5 * length(vec2f(gx, gy));
  let m = sstep(fx.a.y * 0.75, fx.a.y * 3.0, slope);
  let back = (luma709(o.rgb) - luma709(d.rgb)) * fx.a.x * (0.15 + 0.85 * m);
  return vec4f(clamp(d.rgb + vec3f(back), vec3f(0.0), vec3f(d.a)), d.a);
}

fn denoise(program: i32, p: vec2f) -> vec4f {
  switch program {
    case 25: { return dnNlm(p); }
    case 26: { return dnAtrous(p); }
    case 27: { return dnBilateral(p); }
    case 28: { return dnMedian(p); }
    default: { return dnFinish(p); }
  }
}

// v1.3: color correction (core/effects/colorCorrect.ts, line for line). orig is the input of the effect; src the
// same, or its blur when the clarity is on. a = gains, amount; b = black, 1 / range, 1 / gamma, contrast;
// color = saturation, vibrance, highlights, shadows; c = clarity, sharpen, px between the taps of the sharpen.
fn ccLuma(q: vec2f, y0: f32) -> f32 {
  let t = tapOrig(q);
  if (t.a < 0.001) { return y0; }
  return luma709(t.rgb) / t.a;
}

fn colorCorrect(p: vec2f) -> vec4f {
  let o = tapOrig(p);
  if (o.a <= 0.0) { return vec4f(0.0); }
  let c0 = o.rgb / o.a;
  var c = clamp((c0 * fx.a.xyz - vec3f(fx.b.x)) * fx.b.y, vec3f(0.0), vec3f(1.0));
  // What was nearly black keeps less of its color the more the gamma lifts it: mostly color noise lives there.
  let fade = mix(1.0, sstep(0.0, 0.1, luma709(c)), clamp((1.0 / max(fx.b.z, 0.05) - 1.0) * 1.5, 0.0, 0.85));
  c = pow(c, vec3f(fx.b.z));
  var y = luma709(c);
  c = vec3f(y) + (c - vec3f(y)) * fade;
  if (y > 0.0001) {
    let up = 1.0 - y;
    let moved = y + 1.7 * (fx.color.w * y * up * up + fx.color.z * y * y * up);
    c = clamp(c * (max(moved, 0.0) / y), vec3f(0.0), vec3f(1.0));
  }
  let k = fx.b.w;
  if (k >= 0.0) { c = c + (c * c * (vec3f(3.0) - 2.0 * c) - c) * k; }
  else { c = c + (vec3f(0.5) - c) * (-k * 0.5); }
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  // Clarity and sharpen move the brightness by what the luma of the input differs from its surroundings.
  let y0 = luma709(c0);
  var add = 0.0;
  if (fx.c.x > 0.0) {
    let b = tapSrc(p);
    let around = luma709(b.rgb) / max(b.a, 0.0001);
    y = luma709(c);
    // Large differences (a dark figure on a bright wall) are held back, so edges get no halo.
    let local = y0 - around;
    add += fx.c.x * 1.6 * (local / (1.0 + 6.0 * abs(local))) * 4.0 * y * (1.0 - y);
  }
  if (fx.c.y > 0.0) {
    let st = fx.c.z;
    let e = ccLuma(p + vec2f(st, 0.0), y0) + ccLuma(p - vec2f(st, 0.0), y0) + ccLuma(p + vec2f(0.0, st), y0) + ccLuma(p - vec2f(0.0, st), y0);
    let g = ccLuma(p + vec2f(st, st), y0) + ccLuma(p + vec2f(-st, st), y0) + ccLuma(p + vec2f(st, -st), y0) + ccLuma(p - vec2f(st, st), y0);
    let d = y0 - (4.0 * y0 + 2.0 * e + g) / 16.0;
    // Differences the size of grain are left alone.
    add += clamp(fx.c.y * 3.0 * d * sstep(0.004, 0.02, abs(d)), -0.12, 0.12);
  }
  c = clamp(c + vec3f(add), vec3f(0.0), vec3f(1.0));
  y = luma709(c);
  // A boost fades out in the deep shadows; a cut applies everywhere.
  let roll = sstep(0.02, 0.3, y);
  c = vec3f(y) + (c - vec3f(y)) * (1.0 + fx.color.x * select(1.0, roll, fx.color.x > 0.0));
  let chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  let vib = 1.0 + fx.color.y * (1.0 - clamp(chroma, 0.0, 1.0)) * select(1.0, roll, fx.color.y > 0.0);
  y = luma709(c);
  c = clamp(vec3f(y) + (c - vec3f(y)) * vib, vec3f(0.0), vec3f(1.0));
  c = mix(c0, c, clamp(fx.a.w, 0.0, 1.0));
  return vec4f(c * o.a, o.a);
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy;
  let program = i32(fx.size.z + 0.5);
  if (fx.size.w > 0.5 && (p.x < fx.rect.x || p.y < fx.rect.y || p.x > fx.rect.z || p.y > fx.rect.w)) { return vec4f(0.0); }
  switch program {
    case 1, 3, 5: { return gauss(program, p); }
    case 2: { return directional(p); }
    case 4: {
      let o = tapOrig(p);
      var k = clamp(gauss(program, p).r * fx.b.z * fx.color.a, 0.0, 1.0);
      if (fx.c.x > 0.5) { k = k * o.a; }
      let glow = vec4f(fx.color.rgb * k, k);
      return o + glow - o * glow;
    }
    case 6: {
      let o = tapOrig(p);
      let a = gauss(program, p).r * fx.color.a;
      return o + vec4f(fx.color.rgb * a, a) * (1.0 - o.a);
    }
    case 7: { return outline(p); }
    case 8: { return tapSrc(p) * coverage(p); }
    case 9: { return vec4f(dilate(p)); }
    case 10, 11, 12, 13, 14, 15, 16: { return pixelEffect(program, p); }
    case 17, 18, 19, 20, 21, 22, 23: { return stylize(program, p); }
    case 25, 26, 27, 28, 29: { return denoise(program, p); }
    case 30: { return colorCorrect(p); }
    // 24: an adjustment's input (fx.size.w set: transparent past the frame's box).
    default: { return tapSrc(p); }
  }
}
`;
