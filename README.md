# Shorts Editor

Browser-based editor for short-form vertical video. Desktop Chrome or Edge only (WebGPU, WebCodecs,
File System Access).

- Specification: `docs/EDITOR_SPEC.md`
- Build plan and progress: `docs/BATCHES.md`, `docs/PROGRESS.md`
- Design system: `DESIGN_SYSTEM.md`

## Setup

Requires Node 22.12 or newer.

```bash
npm install
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Type check without emitting |
| `npm run lint` | ESLint (including the color-literal rule) and the CSS color check |
| `npm test` | Run Vitest once |
| `npm run check` | typecheck + lint + test + build |
