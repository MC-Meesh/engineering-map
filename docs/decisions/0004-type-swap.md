# 0004: Text face swap, B612 kept for sheet furniture

Date: 2026-11-21. Status: accepted.

## Problem
B612 draws round brackets with flat, nearly straight sides. At text sizes they read as square
brackets, and the data is full of them: "STEP (ISO 10303)", "OpenFOAM (openfoam.org)",
"Ceetron SDKs (HOOPS Envision)". A reference site cannot make readers wonder whether a
character is ( or [.

## Options
1. Keep B612 everywhere and accept it. Rejected: the ambiguity is in the data, not the chrome.
2. A unicode-range face that borrows parentheses from another font. Rejected: two fonts
   inside one word, fragile, and the bracket shapes would not match the rest of the glyphs.
3. Swap the text face to a legibility-first sans with unambiguous brackets, keep B612 where
   the drawing-sheet character lives. Chosen.

## Decision
- Text (body, tables, controls, map labels): Atkinson Hyperlegible Next (Braille Institute,
  SIL OFL 1.1, via @fontsource). Like B612 it was designed for legibility under stress, so
  the tone stays technical; its brackets are clearly curved and its zero is slashed, which
  suits part numbers and dates.
- B612 700 stays for the wordmark and the title block name; B612 Mono stays for zone letters,
  extensions and other monospaced figures. These carry the drafting-sheet look and contain
  no brackets.
- The 400 weight of B612 is no longer loaded.

## Consequences
- Map labels use the same face (canvas font loaded before the first draw).
- One more font family (two weights) in the bundle, one fewer B612 weight.
