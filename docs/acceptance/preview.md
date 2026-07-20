# shadcn preview acceptance

Status: technically validated; awaiting visual approval before starting `preview-02`.

## Reference

- Source: `https://ui.shadcn.com/preview/base/preview?preset=b1FS9AzhY&item=preview&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true`
- Source selector: `div.relative.bg-background > div.overflow-x-auto.overflow-y-hidden > div.flex.w-full > div.grid.grid-cols-7`
- Pencil document: `examples.pen`
- Pencil root: `shadcn · preview-01 · fidelity final (#O9lYr)`
- Source dimensions: `3000 × 1698`
- Pencil dimensions: `3000 × 1698`
- Reproduced normalized RMSE: `0.0720645`

## Reproduction

With `examples.pen` open in Pencil:

```sh
bun run capture:source -- \
  'https://ui.shadcn.com/preview/base/preview?preset=b1FS9AzhY&item=preview&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true' \
  'div.relative.bg-background > div.overflow-x-auto.overflow-y-hidden > div.flex.w-full > div.grid.grid-cols-7' \
  artifacts/preview/source/source.png
```

Export `#O9lYr` at scale `1` with Pencil MCP to `artifacts/preview/pencil/O9lYr.png`, then run:

```sh
bun run compare:visual -- \
  artifacts/preview/source/source-v3.png \
  artifacts/preview/pencil/O9lYr.png \
  artifacts/preview/comparison-v6 \
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
- Seven column-by-column visual audits show no collapsed, overlapping or missing visible content in `#O9lYr`.
- The rendered source and Pencil export have identical dimensions.
- Normalized RMSE is below the provisional `0.10` gate.
- `bun run verify` passes `30/30` tests and builds the extension.

## Documented residual differences

- Text antialiasing and glyph metrics differ slightly between Chromium and Pencil's renderer.
- Fractional DOM coordinates are rounded by Pencil; four chart paths were constrained by `0.25 px` to prevent clipping.
- CSS filters that Pencil cannot express natively are rasterized into local image assets. The filtered visual is preserved, but the filter parameters are not editable independently.
- Canvas content is rasterized after being composited over its nearest opaque background; the canvas pixels are faithful but not decomposed into editable primitives.
- Browser-native form controls are reconstructed as editable shapes and text, so minute platform-specific control rendering differences remain.
- Pseudo-elements, masks and automatic component recognition are not yet modeled as first-class Pencil structures.

These residuals account for the remaining pixel delta and do not currently produce collapsed, clipped or missing content.

## Regressions corrected during visual review

- A visually hidden `legend` (`1×1`, absolute and clipped) was initially rendered over the visible field label. The converter now excludes this accessibility-only pattern while retaining the visible control.
- Intrinsically sized one-line text initially used the exact Chromium range width. Small font-metric differences made `404 - Not Found` and the search value wrap in Pencil. These nodes now use Pencil's intrinsic text sizing; multiline and constrained text retain fixed bounds.
- Shadcn card outlines are implemented as a non-transparent `1 px` shadow ring after several transparent shadows. The converter now parses the entire shadow list and maps this ring to an inner Pencil stroke.
- SVG `fill-opacity`, stroke scaling and dashed progress-circle circumference are preserved. Shapes with CSS `fill:none` receive an explicit transparent fill so Pencil does not apply its default solid fill.
- Placeholder color comes from `::placeholder`, while input and textarea placement uses their computed padding.
- Single-line form values are vertically centered from the control height and computed line height; textarea values retain their native top padding.
- Anchor underlines and destinations are preserved, including inline links and card-footer links.
- Dashed SVG progress circles are converted to open vector arc paths so Pencil does not draw the radial edges of a closed ellipse sector.
- SVG text inside expanded Recharts `<g>` wrappers is positioned against the SVG viewport, keeping donut labels centered.
- Filters inherited from image containers are materialized into local assets; the example's browser-rendered hero image is retained as a faithful local asset.
