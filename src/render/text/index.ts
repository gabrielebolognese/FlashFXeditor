// Text layout and rasterization to textures, glyph/line atlas cache (Batch 28).
// TODO(batch 28): above 100% the preview renders at `PreviewView.stats.detail.render` px per project px
// (spec §7.1 detail on zoom): text layers re-rasterize at that scale, and a visible text layer raises
// the source detail to the zoom (see render/preview/detail.ts).
