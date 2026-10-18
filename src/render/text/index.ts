// Text layout and rasterization to textures, glyph/line atlas cache (spec §10.1, Batch 28):
// - layout.ts / layoutCache.ts: lines, boxes, glyph bounds and the raster rect of a text clip (cached).
// - raster.ts: the Canvas2D rasterizer (stroke, shadow, background boxes) and the per-word atlas
//   (atlas.ts packs it).
// - TextRasterCache.ts: rasters as GPU textures by content + style + scale bucket, with a byte budget.
// - FontLibrary.ts / FontLoadQueue.ts / bundledFonts.ts / localFonts.ts: the font library (core and
//   catalog families, loaded on demand), My fonts, project and system fonts (Batch 28, Batch 51).
// - presetThumbnails.ts / PresetThumbService.ts: preset thumbnails as bitmaps, made in idle time and
//   cached (the preset bar and the Presets tab, Batch 52).
// The compositor evaluates text layers (render/compositor), the preview resolves them to rasters
// (render/preview/LayerTextures.ts).
