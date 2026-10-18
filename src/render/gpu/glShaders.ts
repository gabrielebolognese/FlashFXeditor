// GLSL ES 3.00 for the WebGL2 backend (Batch 48): line-for-line ports of the WGSL in `shaders.ts`, so
// both backends draw the same pixels. The layer uniforms are the same 13 vec4 that `packLayer` writes
// (`u_layer[0..12]`: matrix columns, uv, color, params, color2, shape, uv2, mapA, mapB, mapT, sides),
// the view the same 3 vec4 (`u_view`). Quads and full-screen triangles are made from gl_VertexID (no
// vertex buffers). Fragment outputs are premultiplied; the layer draws blend with (one,
// one-minus-src-alpha).
// Orientation: textures hold their top row at row 0 (uploads, and framebuffers drawn with the view's
// y turned so target px row 0 lands on row 0). The full-screen passes (scale, blur) only draw into
// framebuffers, so their uv and gl_FragCoord rows count from that top row as WGSL's do.

/** `u_layer` entries (see layerUniforms.ts). */
const LAYER = /* glsl */ `
uniform vec4 u_layer[13];
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
  return vec4(position.xy, 0.0, 1.0);
}
`;

/** The vertex stage of textured layers and solids. */
export const LAYER_VERTEX = /* glsl */ `${HEADER}${LAYER}${QUAD}
out vec2 v_uv;

void main() {
  vec2 corner = quadCorner();
  vec2 t = corner;
  if (L_PARAMS.y > 0.5) { t.x = 1.0 - t.x; }
  if (L_PARAMS.z > 0.5) { t.y = 1.0 - t.y; }
  v_uv = mix(L_UV.xy, L_UV.zw, t);
  gl_Position = quadPosition(corner);
}
`;

/** See FOOTPRINT_TAPS in shaders.ts. */
const FOOTPRINT_TAPS = /* glsl */ `
float footprintRamp(vec2 dx, vec2 dy, vec2 size, bool mipmapped) {
  float footprint = max(length(dx * size), length(dy * size));
  return mipmapped ? 0.0 : clamp(footprint - 1.0, 0.0, 1.0);
}
`;

export const TEXTURED_FRAGMENT = /* glsl */ `${HEADER}${LAYER}${FOOTPRINT_TAPS}
uniform sampler2D u_source;
// 1 when the texture has mips (images, text): WGSL's textureNumLevels(source) > 1.
uniform float u_mipmapped;
in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  // 3 x 3 taps a third of the footprint apart; one sample when nothing is minified.
  float spread = footprintRamp(dx, dy, vec2(textureSize(u_source, 0)), u_mipmapped > 0.5) / 3.0;
  if (spread <= 0.0) {
    outColor = textureGrad(u_source, v_uv, dx, dy) * L_PARAMS.x;
    return;
  }
  vec4 sum = vec4(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      sum += textureGrad(u_source, v_uv + dx * (float(i) * spread) + dy * (float(j) * spread), dx, dy);
    }
  }
  outColor = sum * (L_PARAMS.x / 9.0);
}
`;

/** See SOLID_WGSL in shaders.ts. */
export const SOLID_FRAGMENT = /* glsl */ `${HEADER}${LAYER}
in vec2 v_uv;
out vec4 outColor;

vec4 premultiplied(vec4 c) {
  return vec4(c.rgb * c.a, c.a);
}

void main() {
  vec4 color = mix(premultiplied(L_COLOR), premultiplied(L_COLOR2), clamp(v_uv.y, 0.0, 1.0));
  vec2 halfSize = max(0.5 * L_SHAPE.xy, vec2(1e-4));
  vec2 p = v_uv * L_SHAPE.xy - halfSize;
  float r = clamp(L_SHAPE.z, 0.0, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + vec2(r);
  float boxDist = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
  vec2 e = p / halfSize;
  float k = length(e);
  float ellipseDist = k > 1e-4 ? (k - 1.0) * k / max(length(e / halfSize), 1e-9) : -min(halfSize.x, halfSize.y);
  float d = L_SHAPE.w > 1.5 ? ellipseDist : boxDist;
  float coverage = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  outColor = color * ((L_SHAPE.w > 0.5 ? coverage : 1.0) * L_PARAMS.x);
}
`;

/** See DISSOLVE_WGSL in shaders.ts. */
export const DISSOLVE_VERTEX = /* glsl */ `${HEADER}${LAYER}${QUAD}
out vec2 v_a;
out vec2 v_b;

void main() {
  vec2 c = quadCorner();
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
out vec4 outColor;

float inside(vec2 t) {
  return all(greaterThanEqual(t, vec2(0.0))) && all(lessThanEqual(t, vec2(1.0))) ? 1.0 : 0.0;
}

void main() {
  vec4 a = texture(u_from, mix(L_UV.xy, L_UV.zw, v_a)) * (L_SIDES.x * inside(v_a));
  vec4 b = texture(u_to, mix(L_UV2.xy, L_UV2.zw, v_b)) * (L_SIDES.y * inside(v_b));
  outColor = mix(a, b, L_PARAMS.w) * L_PARAMS.x;
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
export const SCALE_FRAGMENT = /* glsl */ `${HEADER}${FOOTPRINT_TAPS}
uniform sampler2D u_source;
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
  outColor = vec4(sum.rgb * 0.25, 1.0);
}
`;

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
