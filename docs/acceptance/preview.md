# shadcn preview acceptance

Status: technically validated; awaiting visual approval before starting `preview-02`.

## Reference

- Source: `https://ui.shadcn.com/preview/base/preview?preset=b1FS9AzhY&item=preview&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true`
- Source selector: `div.relative.bg-background > div.overflow-x-auto.overflow-y-hidden > div.flex.w-full > div.grid.grid-cols-7`
- Pencil document: `examples.pen`
- Pencil root: `shadcn · preview · Pencil Capture final (#hPWri)`
- Source dimensions: `3000 × 1698`
- Pencil dimensions: `3000 × 1698`
- Reproduced normalized RMSE: `0.0925344`

## Reproduction

With `examples.pen` open in Pencil:

```sh
bun run capture:source -- \
  'https://ui.shadcn.com/preview/base/preview?preset=b1FS9AzhY&item=preview&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true' \
  'div.relative.bg-background > div.overflow-x-auto.overflow-y-hidden > div.flex.w-full > div.grid.grid-cols-7' \
  artifacts/preview/source/source.png
```

Export `#hPWri` at scale `1` with Pencil MCP to `artifacts/preview/pencil/hPWri.png`, then run:

```sh
bun run compare:visual -- \
  artifacts/preview/source/source.png \
  artifacts/preview/pencil/hPWri.png \
  artifacts/preview/comparison-final \
  --require-same-size \
  --max-rmse 0.10
```

## Verified gates

- All `31` visible source blocks are represented.
- DOM ancestry is preserved as nested editable groups and painted frames.
- SVG charts remain editable vector paths.
- `<img>`, CSS background images and canvas content use project-local image fills.
- No image fill uses a `data:` URL.
- Every captured layer follows `Name (#ID)` using its actual Pencil ID.
- Pencil `snapshot_layout` reports no problems for `#hPWri`.
- The rendered source and Pencil export have identical dimensions.
- Normalized RMSE is below the provisional `0.10` gate.
- `bun run verify` passes `20/20` tests and builds the extension.

## Documented residual differences

- Text antialiasing and glyph metrics differ slightly between Chromium and Pencil's renderer.
- Fractional DOM coordinates are rounded by Pencil; four chart paths were constrained by `0.25 px` to prevent clipping.
- CSS filters that Pencil cannot express natively are rasterized into local image assets. The filtered visual is preserved, but the filter parameters are not editable independently.
- Canvas content is rasterized after being composited over its nearest opaque background; the canvas pixels are faithful but not decomposed into editable primitives.
- Browser-native form controls are reconstructed as editable shapes and text, so minute platform-specific control rendering differences remain.
- Pseudo-elements, masks and automatic component recognition are not yet modeled as first-class Pencil structures.

These residuals account for the remaining pixel delta and do not currently produce collapsed, clipped or missing content.
