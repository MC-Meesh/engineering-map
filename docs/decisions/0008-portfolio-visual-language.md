# 0008: Visual language shared with mchaseallen.com

Date: 2026-11-22. Status: accepted. Supersedes the look in 0003 (drafting sheet) and the type
choices in 0004; the data colours in 0003 stand.

## Context
Chase asked for the map to read as part of his portfolio (mchaseallen.com, a Next.js site),
not as a separate product with its own identity. The portfolio's language: IBM Plex Mono for
everything; pure black ground with white type and grey (#888) for secondary text; square
hairline borders that brighten on hover; uppercase, tracked nav links underlined when current;
a bold page title with a short thick bar under it; "/" before section headings; outline
buttons that invert on hover; small bordered tags; motion only in answer to an action, eased
with cubic-bezier(0.16, 1, 0.3, 1).

## Decision
- One family: IBM Plex Mono (400 to 700, Fontsource, self-hosted). Atkinson Hyperlegible Next,
  B612 and B612 Mono are removed. The drafting-sheet furniture (zone letters, double frame,
  title block, "Zone E4" in the panel) goes with them; a plain figures box stays.
- Tokens in `src/styles/global.css`. Dark is the portfolio's own look (#000 / #fff / #8f8f8f,
  rules #2e2e2e); light is the same system inverted (#fff / #000 / #5e5e5e). The page follows
  the system setting; the header switch stores a choice per browser (`localStorage.theme`,
  `data-theme` on `<html>`). Canvas and WebGL views redraw on a `themechange` event.
- Selection is the foreground itself: a focused node gets an inverted label block (the
  portfolio's white quote block), the current lineage crumb and lens button are inverted, and
  `--red` now aliases the foreground. Red no longer means anything.
- Colour is kept for data only: the seven domain colours and the three edge inks of 0003.
- Phones keep 16px gutters; the nav collapses behind a menu button.

## Consequences
The OG card (`scripts/og.mjs`) is redrawn in the same language. Pages that set their own
styles were moved to the shared tokens and button classes (`.btn`, `.btn-2`, `.card`).
