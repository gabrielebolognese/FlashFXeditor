// GLSL ES 3.00 for the WebGL2 backend (Batch 48): line-for-line ports of the WGSL in `shaders.ts`, so
// both backends draw the same pixels. The layer uniforms are the same 31 vec4 that `packLayer` writes
// (`u_layer[0..30]`: matrix columns, uv, color, params, color2, shape, uv2, mapA, mapB, mapT, sides,
// then the Batch 58 style: stroke, stroke params, dash, shadow, shadow params, radii, fill params, fill center, 8 stops, their positions),
// the view the same 3 vec4 (`u_view`). Quads and full-screen triangles are made from gl_VertexID (no
// vertex buffers). Fragment outputs are premultiplied; the layer draws blend with (one,
// one-minus-src-alpha).
// Orientation: textures hold their top row at row 0 (uploads, and framebuffers drawn with the view's
// y turned so target px row 0 lands on row 0). The full-screen passes (scale, blur) only draw into
// framebuffers, so their uv and gl_FragCoord rows count from that top row as WGSL's do.

/** `u_layer` entries (see layerUniforms.ts). */
const LAYER = /* glsl */ `
uniform vec4 u_layer[32];
#define L_C0 u_layer[0]
#define L_C1 u_layer[1]
#define L_C2 u_layer[2]
#define L_UV u_layer[3]
#define L_COLOR u_layer[4]
#define L_PARAMS u_layer[5]
#define L_COLOR2 u_layer[6]
#define L_SHAPE u_layer[7]
#define L_UV2 u_layer[8]
#define L_MAPA u_layer[9]
#define L_MAPB u_layer[10]
#define L_MAPT u_layer[11]
#define L_SIDES u_layer[12]
#define L_STROKE u_layer[13]
#define L_STROKEP u_layer[14]
#define L_DASH u_layer[15]
#define L_SHADOW u_layer[16]
#define L_SHADOWP u_layer[17]
#define L_RADII u_layer[18]
#define L_FILLP u_layer[19]
#define L_FILLC u_layer[20]
#define L_TFX u_layer[31]
// stop colors u_layer[21..28], stop positions u_layer[29..30]
`;

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/** The unit quad of the layer, through its matrix (to target px) and the view (to clip space). */
const QUAD = /* glsl */ `
uniform vec4 u_view[3];

vec2 quadCorner() {
  // Triangle strip over the unit quad: (0, 0), (1, 0), (0, 1), (1, 1).
  return vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
}

vec4 quadPosition(vec2 corner) {
  mat3 model = mat3(L_C0.xyz, L_C1.xyz, L_C2.xyz);
  mat3 toClip = mat3(u_view[0].xyz, u_view[1].xyz, u_view[2].xyz);
  vec3 position = toClip * model * vec3(corner, 1.0);
  // w: a 2.5D layer's projective matrix (spec §21.15); varyings interpolate perspective-correctly.
  return vec4(position.xy, 0.0, position.z);
}
`;

/** The vertex stage of textured layers and solids. */
export const LAYER_VERTEX = /* glsl */ `${HEADER}${LAYER}${QUAD}
out vec2 v_uv;
out vec2 v_local;

void main() {
  vec2 corner = quadCorner();
  v_local = corner;
  vec2 t = corner;
  if (L_PARAMS.y > 0.5) { t.x = 1.0 - t.x; }
  if (L_PARAMS.z > 0.5) { t.y = 1.0 - t.y; }
  v_uv = mix(L_UV.xy, L_UV.zw, t);
  gl_Position = quadPosition(corner);
}
`;


/** See STYLE in shaders.ts. */
const STYLE = /* glsl */ `
vec4 premultiplied(vec4 c) {
  return vec4(c.rgb * c.a, c.a);
}

float cornerOf(vec2 p, vec4 radii) {
  if (p.x < 0.0) { return p.y < 0.0 ? radii.x : radii.w; }
  return p.y < 0.0 ? radii.y : radii.z;
}

float boxDistance(vec2 p, vec2 halfSize, vec4 radii) {
  float r = clamp(cornerOf(p, radii), 0.0, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + vec2(r);
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

float ellipseDistance(vec2 p, vec2 halfSize) {
  vec2 e = p / halfSize;
  float k = length(e);
  return k > 1e-4 ? (k - 1.0) * k / max(length(e / halfSize), 1e-9) : -min(halfSize.x, halfSize.y);
}

float shapeDistance(vec2 p, vec2 halfSize, vec4 radii, bool ellipse) {
  return ellipse ? ellipseDistance(p, halfSize) : boxDistance(p, halfSize, radii);
}

float outlinePosition(vec2 p, vec2 h, vec4 rr, bool ellipse, float total) {
  if (ellipse) {
    float theta = atan(p.x / h.x, -p.y / h.y);
    return (theta < 0.0 ? theta + 6.2831853 : theta) / 6.2831853 * total;
  }
  float hp = 1.5707963;
  float lim = min(h.x, h.y);
  float tl = clamp(rr.x, 0.0, lim);
  float tr = clamp(rr.y, 0.0, lim);
  float br = clamp(rr.z, 0.0, lim);
  float bl = clamp(rr.w, 0.0, lim);
  float top1 = max(h.x - tr, 0.0);
  float right = max(2.0 * h.y - tr - br, 0.0);
  float bottom = max(2.0 * h.x - br - bl, 0.0);
  float left = max(2.0 * h.y - bl - tl, 0.0);
  float top2 = max(h.x - tl, 0.0);
  float oTr = top1;
  float oRight = oTr + hp * tr;
  float oBr = oRight + right;
  float oBottom = oBr + hp * br;
  float oBl = oBottom + bottom;
  float oLeft = oBl + hp * bl;
  float oTl = oLeft + left;
  float oTop2 = oTl + hp * tl;
  float r = clamp(cornerOf(p, rr), 0.0, lim);
  vec2 q = abs(p) - h + vec2(r);
  if (q.x > 0.0 && q.y > 0.0) {
    float phi = atan(q.y, q.x);
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

float stopAtOf(int i) {
  vec4 v = u_layer[29 + i / 4];
  int k = i - (i / 4) * 4;
  return k == 0 ? v.x : (k == 1 ? v.y : (k == 2 ? v.z : v.w));
}

vec4 gradientColor(float t, int count) {
  vec4 result = premultiplied(u_layer[21]);
  if (t <= stopAtOf(0)) { return result; }
  for (int i = 1; i < 8; i++) {
    if (i >= count) { break; }
    float a = stopAtOf(i - 1);
    float b = stopAtOf(i);
    vec4 ca = premultiplied(u_layer[21 + i - 1]);
    vec4 cb = premultiplied(u_layer[21 + i]);
    if (t <= b) { return mix(ca, cb, clamp((t - a) / max(b - a, 1e-6), 0.0, 1.0)); }
    result = cb;
  }
  return result;
}
`;

/** See FOOTPRINT_TAPS in shaders.ts. */
const FOOTPRINT_TAPS = /* glsl */ `
float footprintRamp(vec2 dx, vec2 dy, vec2 size, bool mipmapped) {
  float footprint = max(length(dx * size), length(dy * size));
  return mipmapped ? 0.0 : clamp(footprint - 1.0, 0.0, 1.0);
}
`;

export const TEXTURED_FRAGMENT = /* glsl */ `${HEADER}${LAYER}${STYLE}${FOOTPRINT_TAPS}
uniform sampler2D u_source;
// 1 when the texture has mips (images, text): WGSL's textureNumLevels(source) > 1.
uniform float u_mipmapped;
in vec2 v_uv;
in vec2 v_local;
out vec4 outColor;

void main() {
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  // A picture with rounded corners (Batch 58): cut to the box, anti-aliased over one screen px.
  bool framed = L_SHAPE.w > 0.5;
  vec2 halfSize = max(0.5 * L_SHAPE.xy, vec2(1e-4));
  float dist = boxDistance(v_local * L_SHAPE.xy - halfSize, halfSize, L_RADII);
  float cut = framed ? clamp(0.5 - dist / max(fwidth(dist), 1e-4), 0.0, 1.0) : 1.0;
  // 3 x 3 taps a third of the footprint apart; one sample when nothing is minified.
  float spread = footprintRamp(dx, dy, vec2(textureSize(u_source, 0)), u_mipmapped > 0.5) / 3.0;
  if (spread <= 0.0) {
    outColor = textureGrad(u_source, v_uv, dx, dy) * (L_PARAMS.x * cut);
    return;
  }
  vec4 sum = vec4(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      sum += textureGrad(u_source, v_uv + dx * (float(i) * spread) + dy * (float(j) * spread), dx, dy);
    }
  }
  outColor = sum * (L_PARAMS.x * cut / 9.0);
}
`;

/** See SOLID_WGSL in shaders.ts. */
export const SOLID_FRAGMENT = /* glsl */ `${HEADER}${LAYER}${STYLE}
in vec2 v_uv;
out vec4 outColor;

float intervalCoverage(float pos, float a, float b, float fw) {
  return clamp((pos - a) / fw + 0.5, 0.0, 1.0) * clamp((b - pos) / fw + 0.5, 0.0, 1.0);
}

float dashCoverage(float s, float fw) {
  vec4 d = L_DASH;
  float period = d.x + d.y + d.z + d.w;
  if (period <= 0.0) { return 1.0; }
  float scale = max(L_STROKEP.w, 1e-4);
  vec4 ds = d * scale;
  float total = period * scale;
  float pos = mod(s - L_STROKEP.z, total);
  float best = 0.0;
  for (int k = 0; k < 2; k++) {
    float at = pos - float(k) * total;
    best = max(best, intervalCoverage(at, 0.0, ds.x, fw) + intervalCoverage(at, ds.x + ds.y, ds.x + ds.y + ds.z, fw));
  }
  return min(best, 1.0);
}

void main() {
  vec2 size = L_SHAPE.xy;
  vec2 halfSize = max(0.5 * size, vec2(1e-4));
  vec2 p = v_uv * size - halfSize;
  bool ellipse = L_SHAPE.w > 1.5;
  float d = shapeDistance(p, halfSize, L_RADII, ellipse);
  float fwd = max(fwidth(d), 1e-4);
  float total = max(L_FILLC.w, 1e-4);
  float s = outlinePosition(p, halfSize, L_RADII, ellipse, total);
  float rawStep = fwidth(s);
  float fws = max(min(rawStep, abs(total - rawStep)), 1e-4);
  float opacity = L_PARAMS.x;
  float part = L_FILLC.z;

  vec4 fill = mix(premultiplied(L_COLOR), premultiplied(L_COLOR2), clamp(v_uv.y, 0.0, 1.0));
  float kind = L_FILLP.x;
  if (kind > 0.5) {
    float t = 0.0;
    if (kind < 1.5) {
      vec2 dir = vec2(-sin(L_FILLP.y), cos(L_FILLP.y));
      float extent = max(abs(dir.x) * size.x + abs(dir.y) * size.y, 1e-4);
      t = 0.5 + dot(p, dir) / extent;
    } else {
      vec2 center = L_FILLC.xy * size - halfSize;
      t = length(p - center) / max(L_FILLP.z * 0.5 * length(size), 1e-4);
    }
    fill = gradientColor(t, int(L_FILLP.w));
  }
  if (L_SHAPE.w < 0.5) { outColor = fill * opacity; return; }

  float cover = clamp(0.5 - d / fwd, 0.0, 1.0);
  bool hasShadow = L_SHADOW.a > 0.0;
  float sigma = L_SHADOWP.z * 0.5;
  float dsh = shapeDistance(p - L_SHADOWP.xy, halfSize, L_RADII, ellipse) - L_SHADOWP.w;
  float fwdShadow = max(fwidth(dsh), 1e-4);
  float hard = clamp(0.5 - dsh / fwdShadow, 0.0, 1.0);
  float soft = 1.0 / (1.0 + exp(clamp(1.702 * dsh / max(sigma, 1e-4), -30.0, 30.0)));
  float shadowCover = (sigma > 1e-3 ? soft : hard) * (hasShadow ? 1.0 : 0.0) * (1.0 - cover);
  vec4 shadow = premultiplied(L_SHADOW) * shadowCover;

  float width = L_STROKEP.x;
  float center = L_STROKEP.y * width * 0.5;
  float band = abs(d - center) - width * 0.5;
  float strokeCover = clamp(0.5 - band / fwd, 0.0, 1.0) * (width > 0.0 ? 1.0 : 0.0);
  strokeCover = strokeCover * dashCoverage(s, fws);
  vec4 stroke = premultiplied(L_STROKE) * strokeCover;

  vec4 res = fill * cover;
  if (part > 0.5 && part < 1.5) { res = shadow; }
  else if (part > 1.5) { res = vec4(0.0); }
  else { res = res + shadow * (1.0 - res.a); }
  if (part < 0.5 || part > 1.5) { res = stroke + res * (1.0 - stroke.a); }
  outColor = res * opacity;
}
`;

/** See DISSOLVE_WGSL in shaders.ts. */
export const DISSOLVE_VERTEX = /* glsl */ `${HEADER}${LAYER}${QUAD}
out vec2 v_a;
out vec2 v_b;
out vec2 v_c;

void main() {
  vec2 c = quadCorner();
  v_c = c;
  v_a = vec2(L_MAPA.x * c.x + L_MAPA.z * c.y + L_MAPT.x, L_MAPA.y * c.x + L_MAPA.w * c.y + L_MAPT.y);
  v_b = vec2(L_MAPB.x * c.x + L_MAPB.z * c.y + L_MAPT.z, L_MAPB.y * c.x + L_MAPB.w * c.y + L_MAPT.w);
  gl_Position = quadPosition(c);
}
`;

export const DISSOLVE_FRAGMENT = /* glsl */ `${HEADER}${LAYER}
uniform sampler2D u_from;
uniform sampler2D u_to;
in vec2 v_a;
in vec2 v_b;
in vec2 v_c;
out vec4 outColor;

float inside(vec2 t) {
  return all(greaterThanEqual(t, vec2(0.0))) && all(lessThanEqual(t, vec2(1.0))) ? 1.0 : 0.0;
}

vec2 pa(vec2 c) {
  return vec2(L_MAPA.x * c.x + L_MAPA.z * c.y + L_MAPT.x, L_MAPA.y * c.x + L_MAPA.w * c.y + L_MAPT.y);
}

vec2 pb(vec2 c) {
  return vec2(L_MAPB.x * c.x + L_MAPB.z * c.y + L_MAPT.z, L_MAPB.y * c.x + L_MAPB.w * c.y + L_MAPT.w);
}

vec4 fromAt(vec2 p) {
  return texture(u_from, mix(L_UV.xy, L_UV.zw, p)) * (L_SIDES.x * inside(p));
}

vec4 toAt(vec2 p) {
  return texture(u_to, mix(L_UV2.xy, L_UV2.zw, p)) * (L_SIDES.y * inside(p));
}

vec4 overPix(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

vec2 zoomAbout(vec2 c, float s) {
  return (c - vec2(0.5)) / s + vec2(0.5);
}

// Twins of hash21 and moshOffset of core/effects/glitchGpu.ts (ported from FlashFX-v2 @ a91c675).
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Datamosh block displacement: xy = offset (uv units, at most 0.15), z = gate (1 for the corrupted blocks).
vec3 moshOffset(vec2 cell, float seed, float amount) {
  float amt = clamp(amount, 0.0, 1.0);
  float h1 = hash21(cell + vec2(seed));
  float h2 = hash21(cell + vec2(seed + 19.0));
  float hg = hash21(cell + vec2(seed + 3.0));
  float ang = h1 * 6.28318;
  float mag = amt * 0.15 * h2;
  return vec3(cos(ang) * mag, sin(ang) * mag, step(1.0 - amt, hg));
}

// See DISSOLVE_WGSL in shaders.ts (Batch 71: the transition kinds, selected by L_TFX.w).
void main() {
  int code = int(L_TFX.w + 0.5);
  float t = L_PARAMS.w;
  if (code == 0) {
    outColor = mix(fromAt(v_a), toAt(v_b), t) * L_PARAMS.x;
    return;
  }
  vec2 c = v_c;
  vec2 size = max(L_SHAPE.xy, vec2(1.0));
  vec2 dir = L_TFX.xy;
  float soft = L_TFX.z;
  vec4 from = fromAt(pa(c));
  vec4 to = toAt(pb(c));
  vec4 res = vec4(0.0);
  if (code == 1) {
    res = overPix(toAt(pb(c + dir * (1.0 - t))), from);
  } else if (code == 2) {
    res = overPix(toAt(pb(c + dir * (1.0 - t))), fromAt(pa(c - dir * t)));
  } else if (code == 3) {
    vec2 q = (c - vec2(0.5)) * size;
    float ext = max(0.5 * (abs(dir.x) * size.x + abs(dir.y) * size.y), 1e-4);
    float s = dot(q, dir) / ext;
    float h = soft * 0.5;
    float e = mix(-1.0 - h, 1.0 + h, t);
    float w = clamp((e - s) / (2.0 * h + 1e-4) + 0.5, 0.0, 1.0);
    res = mix(from, to, w);
  } else if (code == 4) {
    vec2 center = vec2(L_SIDES.z, L_SIDES.w);
    float d = length((c - center) * size);
    float far = length(max(center, vec2(1.0) - center) * size);
    float h = soft * far * 0.5;
    float radius = mix(-h, far + h, t);
    float w = clamp((radius - d) / (2.0 * h + 1e-3) + 0.5, 0.0, 1.0);
    res = mix(from, to, w);
  } else if (code == 5) {
    res = mix(fromAt(pa(zoomAbout(c, 1.0 + t))), toAt(pb(zoomAbout(c, 0.5 + 0.5 * t))), t);
  } else if (code == 6) {
    res = mix(fromAt(pa(zoomAbout(c, 1.0 - 0.5 * t))), toAt(pb(zoomAbout(c, 2.0 - t))), t);
  } else if (code == 7) {
    float spread = sin(3.14159265 * t) * 0.08;
    vec4 sum = vec4(0.0);
    for (int k = -4; k <= 4; k++) {
      vec2 shift = dir * (float(k) * spread * 0.25);
      sum += overPix(toAt(pb(c + dir * (1.0 - t) + shift)), fromAt(pa(c - dir * t + shift)));
    }
    res = sum / 9.0;
  } else if (code == 8) {
    float r = sin(3.14159265 * t) * 0.04;
    vec2 scale = vec2(size.y / size.x, 1.0) * r;
    vec4 sum = mix(from, to, t);
    for (int k = 0; k < 8; k++) {
      float angle = float(k) * 0.78539816;
      vec2 o = vec2(cos(angle), sin(angle)) * scale;
      sum += mix(fromAt(pa(c + o)), toAt(pb(c + o)), t);
    }
    res = sum / 9.0;
  } else if (code == 9) {
    // Datamosh blocks (FlashFX-v2 moshOffset); see DISSOLVE_WGSL.
    vec2 cell = floor(c * vec2(12.0, 24.0));
    float bucket = floor(t * 12.0);
    float amount = sin(3.14159265 * t);
    vec3 mosh = moshOffset(cell, bucket, amount);
    vec2 off = mosh.xy * mosh.z;
    vec2 split = vec2(0.012 * amount * mosh.z, 0.0);
    float pick = t + (hash21(cell + vec2(bucket)) - 0.5) * 0.3 * amount > 0.5 ? 1.0 : 0.0;
    vec4 ar = fromAt(pa(c + off + split));
    vec4 ag = fromAt(pa(c + off));
    vec4 ab = fromAt(pa(c + off - split));
    vec4 br = toAt(pb(c + off + split));
    vec4 bg = toAt(pb(c + off));
    vec4 bb = toAt(pb(c + off - split));
    res = mix(vec4(ar.r, ag.g, ab.b, ag.a), vec4(br.r, bg.g, bb.b, bg.a), pick);
  } else {
    vec4 base = mix(from, to, t >= 0.5 ? 1.0 : 0.0);
    res = mix(base, vec4(1.0), 1.0 - abs(2.0 * t - 1.0));
  }
  outColor = res * L_PARAMS.x;
}
`;

/** A triangle over the whole framebuffer; uv (0, 0) at its row 0 (the top). */
export const FULLSCREEN_VERTEX = /* glsl */ `${HEADER}
out vec2 v_uv;

void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = (p + 1.0) * 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

/** See SCALE_WGSL in shaders.ts: the frame (uploaded whole into a scratch texture) drawn smaller. */
function scaleFragment(alpha: boolean): string {
  return /* glsl */ `${HEADER}${FOOTPRINT_TAPS}
uniform sampler2D u_source;
${alpha ? "uniform sampler2D u_alpha;" : ""}
in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  // 2 x 2 taps: a 4 x 4 texel box at the usual 2x (4K to 1080p).
  float spread = footprintRamp(dx, dy, vec2(textureSize(u_source, 0)), false) / 4.0;
  vec2 ox = dx * spread;
  vec2 oy = dy * spread;
  vec4 sum = texture(u_source, v_uv - ox - oy)
    + texture(u_source, v_uv + ox - oy)
    + texture(u_source, v_uv - ox + oy)
    + texture(u_source, v_uv + ox + oy);
${
  alpha
    ? `  // The alpha channel of a WebM with alpha (Batch 64): an R8 texture on unit 1, the same taps; the color is premultiplied by it.
  float a = (texture(u_alpha, v_uv - ox - oy).r
    + texture(u_alpha, v_uv + ox - oy).r
    + texture(u_alpha, v_uv - ox + oy).r
    + texture(u_alpha, v_uv + ox + oy).r) * 0.25;
  outColor = vec4(sum.rgb * 0.25 * a, a);`
    : "  outColor = vec4(sum.rgb * 0.25, 1.0);"
}
}
`;
}

export const SCALE_FRAGMENT = scaleFragment(false);
/** SCALE_FRAGMENT with the alpha plane of a video with alpha multiplied in (sampler u_alpha, unit 1). */
export const SCALE_ALPHA_FRAGMENT = scaleFragment(true);

/** See BLUR_WGSL in shaders.ts: one pass of the separable Gaussian. */
export const BLUR_FRAGMENT = /* glsl */ `${HEADER}
// region (x, y, w, h in texels), params (dirX, dirY, sigma, radius), pad (x, y target px)
uniform vec4 u_blur[3];
uniform sampler2D u_source;
out vec4 outColor;

void main() {
  vec2 p = floor(gl_FragCoord.xy) - u_blur[2].xy;
  float sigma = max(u_blur[1].z, 0.0001);
  int radius = int(u_blur[1].w);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int k = -radius; k <= radius; k++) {
    float weight = exp(-float(k * k) / (2.0 * sigma * sigma));
    total += weight;
    vec2 q = p + float(k) * u_blur[1].xy;
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < u_blur[0].z && q.y < u_blur[0].w) {
      sum += weight * texelFetch(u_source, ivec2(u_blur[0].xy + q), 0);
    }
  }
  outColor = sum / total;
}
`;

/** See PATH_WGSL in shaders.ts: the stencil stage takes the triangles from attribute 0 (view-box px). */
export const PATH_STENCIL_VERTEX = /* glsl */ `${HEADER}${LAYER}
layout(location = 0) in vec2 a_position;

void main() {
  mat3 m = mat3(L_C0.xyz, L_C1.xyz, L_C2.xyz);
  vec3 q = m * vec3(a_position, 1.0);
  gl_Position = vec4(q.xy, 0.0, q.z);
}
`;

/** See PATH_WGSL in shaders.ts: the cover rectangle (L_UV, view-box px) from gl_VertexID. */
export const PATH_COVER_VERTEX = /* glsl */ `${HEADER}${LAYER}
out vec2 v_local;

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 p = mix(L_UV.xy, L_UV.zw, corner);
  mat3 m = mat3(L_C0.xyz, L_C1.xyz, L_C2.xyz);
  v_local = p;
  vec3 q = m * vec3(p, 1.0);
  gl_Position = vec4(q.xy, 0.0, q.z);
}
`;

/** The stencil stage writes no color (the color mask is off as well). */
export const PATH_STENCIL_FRAGMENT = /* glsl */ `${HEADER}
out vec4 outColor;

void main() {
  outColor = vec4(0.0);
}
`;

/** See PATH_WGSL fsCover in shaders.ts. */
export const PATH_COVER_FRAGMENT = /* glsl */ `${HEADER}${LAYER}${STYLE}
in vec2 v_local;
out vec4 outColor;

void main() {
  float kind = L_FILLP.x;
  if (kind < 0.5) {
    outColor = premultiplied(L_COLOR);
    return;
  }
  vec2 size = max(L_SHAPE.zw, vec2(1e-4));
  vec2 halfSize = 0.5 * size;
  vec2 p = v_local - L_SHAPE.xy - halfSize;
  float t = 0.0;
  if (kind < 1.5) {
    vec2 dir = vec2(-sin(L_FILLP.y), cos(L_FILLP.y));
    float extent = max(abs(dir.x) * size.x + abs(dir.y) * size.y, 1e-4);
    t = 0.5 + dot(p, dir) / extent;
  } else {
    vec2 center = L_FILLC.xy * size - halfSize;
    t = length(p - center) / max(L_FILLP.z * 0.5 * length(size), 1e-4);
  }
  outColor = gradientColor(t, int(L_FILLP.w));
}
`;

/** See BLEND_FUNCTIONS in shaders.ts. */
const BLEND_FUNCTIONS = /* glsl */ `
float hardLight(float cb, float cs) {
  return cs <= 0.5 ? 2.0 * cb * cs : 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs);
}

float softLight(float cb, float cs) {
  if (cs <= 0.5) { return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb); }
  float d = cb <= 0.25 ? ((16.0 * cb - 12.0) * cb + 4.0) * cb : sqrt(cb);
  return cb + (2.0 * cs - 1.0) * (d - cb);
}

float blendChannel(float cbIn, float csIn, int mode) {
  float b = clamp(cbIn, 0.0, 1.0);
  float s = clamp(csIn, 0.0, 1.0);
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
 * See COMPOSITE_WGSL in shaders.ts: `backdrop` false is `fs` (hardware modes), true `fsBackdrop`. The
 * group's textures hold target px row 0 first; `L_SHAPE.x` = 1 when the target's rows run bottom up
 * (the canvas), with `L_SHAPE.y` its height, so the texel row is found from gl_FragCoord either way.
 * The matte rule: Ported from FlashFX-v2 src/engine/renderer.ts (MATTE_SHADER) @ a91c675, adapted.
 */
function compositeFragment(backdrop: boolean): string {
  return /* glsl */ `${HEADER}${LAYER}${BLEND_FUNCTIONS}
uniform sampler2D u_picture;
uniform sampler2D u_matte;
uniform sampler2D u_backdrop;
out vec4 outColor;

ivec2 texel() {
  float y = L_SHAPE.x > 0.5 ? L_SHAPE.y - gl_FragCoord.y : gl_FragCoord.y;
  return ivec2(int(gl_FragCoord.x), int(y));
}

vec4 matted(ivec2 p) {
  vec4 s = texelFetch(u_picture, p, 0);
  int matte = int(L_TFX.x + 0.5);
  if (matte == 0) { return s; }
  vec4 m = texelFetch(u_matte, p, 0);
  float c = m.a;
  if (matte >= 3) { c = dot(m.rgb, vec3(0.2126, 0.7152, 0.0722)); }
  if (matte == 2 || matte == 4) { c = 1.0 - c; }
  return s * clamp(c, 0.0, 1.0);
}

void main() {
  ivec2 p = texel();
  vec4 s = matted(p);
${backdrop ? `  vec4 b = texelFetch(u_backdrop, p, 0);
  int mode = int(L_TFX.w + 0.5);
  vec3 cs = s.a > 0.0 ? s.rgb / max(s.a, 1e-6) : vec3(0.0);
  vec3 cb = b.a > 0.0 ? b.rgb / max(b.a, 1e-6) : vec3(0.0);
  vec3 blended = vec3(blendChannel(cb.r, cs.r, mode), blendChannel(cb.g, cs.g, mode), blendChannel(cb.b, cs.b, mode));
  vec3 rgb = s.rgb * (1.0 - b.a) + b.rgb * (1.0 - s.a) + s.a * b.a * blended;
  outColor = vec4(rgb, s.a + b.a - s.a * b.a);` : `  outColor = s;`}
}
`;
}

export const COMPOSITE_FRAGMENT = compositeFragment(false);
export const COMPOSITE_BACKDROP_FRAGMENT = compositeFragment(true);
