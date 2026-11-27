# 0003 Design direction: the drawing sheet

Date: 2026-11-21. Status: accepted.

- **Vernacular:** an engineering drawing. The map sits in a sheet frame with zone letters and
  numbers; a title block carries the live node count, as-of date and source count; the detail
  panel reports the focused node's sheet zone. Inner pages use spec-sheet definition lists.
- **Palette:** cool drafting-film paper `#f6f8f9`, graphite ink `#17202b`, redline `#c8202b`
  used only for focus and selection (the markup color on a drawing). Avoided: cream and
  terracotta, blueprint blue backgrounds, dark mode with an acid accent.
- **Data colors:** seven domains on the reference categorical palette, validated with the
  dataviz validator in light (on `#f6f8f9`) and dark (on `#131a21`); both pass adjacent CVD
  and normal-vision floors. The red slot was dropped so red can mean "focus". Three light
  slots are under 3:1 contrast, so identity is never color alone: legend, labels on hover
  and focus, text in the detail panel, and full tables.
- **Type:** B612 (Airbus cockpit face) for everything, B612 Mono only for extensions and ids.
- **Charts:** single-hue bars and columns with 4px rounded data ends, one axis, hover
  tooltips, a table view for every chart.
