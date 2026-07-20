# Capture IR

`pencil-capture-ir` version 1 is transported as a flat DOM snapshot. The converter rebuilds that flat transport into the original parent/child hierarchy using `path` and `parentPath`, with every child positioned relative to its reconstructed parent.

Required document fields are `format`, `version`, `label`, `rootPath` and ordered `nodes`. Each node contains `path`, `parentPath`, tag and namespace, direct text, a rectangle relative to the root, selected computed styles and relevant HTML/SVG attributes. SVG paint-server definitions retain their `id`, gradient coordinates, stop offsets, computed stop colors and stop opacity so `url(#...)` fills can remain editable.

The converter emits semantic nested frames, direct text and visible form values as fixed-size text, SVG paths and common SVG primitives as editable geometry, and image fills for `<img>`, CSS `url(...)` backgrounds and canvas snapshots. Remote assets are inlined as data URLs when CORS permits and retain their absolute URL as a fallback. Linear CSS and SVG paint-server gradients become Pencil gradients. Sharp repeating-linear patterns are materialized as clipped editable vector strokes because a long native-gradient stop list does not repeat uniformly in Pencil.

Unsupported content must remain explicit in validation rather than being silently discarded. Raster fallback is reserved for intrinsically pixel-based content such as canvas and must be identified as such in the layer name.
