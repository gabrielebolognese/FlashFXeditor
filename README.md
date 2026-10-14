# ts-project

Blank TypeScript project (Node, ESM, strict).

## Setup

```bash
npm install
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run `src/index.ts` with tsx, watching for changes |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled output |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Run vitest once |
| `npm run test:watch` | Run vitest in watch mode |

## Notes

- ESM only (`"type": "module"`), so relative imports need the `.js` extension even in `.ts` files.
- `tsconfig.json` is strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Loosen those first if a dependency fights you.
