# 0002 Data model: one YAML file per node, schema-validated, edges derived

Date: 2026-11-21. Status: accepted.

- One YAML file per node under `data/<type>/<id>.yaml`; diffs stay small and reviewable.
- JSON Schema (`schema/schemas.json`) validated with Ajv on every build, plus checks the
  schema cannot express: references resolve, ids unique across types, no em dashes,
  open-source tools have a license.
- Ownership is two layers: `vendor` (current brand) and `origin` (original developer) on tools;
  `parent` on vendors; acquisitions as separate dated records with their own source. A vendor
  with a `parent` but no deal record gets a `subsidiary-of` edge.
- Confidence: high (checked against first source on `as_of`), medium (compiled from cited
  pages and the public record), low (unconfirmed, see `notes`).
- Format support is deliberately "major documented formats", recorded as `formats.reads` and
  `formats.writes`.
- The per-node files are the only source of truth; there is no generated or bulk layer
  to keep in sync.
