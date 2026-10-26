// Text layout and rasterization to textures, glyph/line atlas cache (spec §10.1, Batch 28):
// - layout.ts / layoutCache.ts: lines, boxes, glyph bounds and the raster rect of a text clip (cached).
// - raster.ts: the Canvas2D rasterizer (stroke, shadow, background boxes) and the per-word atlas
//   (atlas.ts packs it).
// - TextRasterCache.ts: rasters as GPU textures by content + style + scale bucket, with a byte budget.
// - FontLibrary.ts / bundledFonts.ts / localFonts.ts: bundled, project and system fonts.
// The compositor evaluates text layers (render/compositor), the preview resolves them to rasters
// (render/preview/LayerTextures.ts).
