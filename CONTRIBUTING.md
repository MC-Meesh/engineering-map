# Contributing

Thanks for helping. The map is only as good as its facts, so most of this guide is about
data. If you are fixing site code, the last section is for you.

## Three ways to help

1. **Report a problem.** Every record page has a "report a problem" link. It opens an issue
   with the record filled in. Tell us what is wrong and, if you can, link a source.
2. **Edit a record.** The "Edit this record" link opens the record's YAML file in GitHub's
   editor. Make the change, add or update the source, set `as_of` to today, and propose the
   change. GitHub forks the repository and opens the pull request for you.
3. **Add a record.** Copy an existing file of the same type (for example
   `data/tools/abaqus.yaml`), rename it to the new id, and fill it in. Open an issue first if
   you are unsure whether something belongs.

Good first contributions: anything listed in the weekly "Maintenance report" issue (dead
source links and records not re-checked in a year), and the open items in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Data rules

The build enforces some of these. Reviewers check the rest.

### Sources
- Every record has `sources` (a list of URLs with a short `label`), `as_of` (the date you
  checked them, `YYYY-MM-DD`) and `confidence`.
- Prefer primary sources: the vendor's own documentation, press releases, investor filings,
  release notes, standards bodies. Wikipedia is fine as a second source, not as the only one.
- Marketing comparisons, review aggregators and forum posts do not count as sources.
- If a fact is only in one place, say so in `notes`.

### Confidence
- `high`: you checked the record against its first source on the `as_of` date.
- `medium`: compiled from the cited pages and the public record.
- `low`: not yet confirmed. Explain why in `notes`. The site shows low records as "not yet
  confirmed" (decision 0011).

### Ownership
- On a tool, `vendor` is who sells it today under its current brand, and `origin` is who first
  developed it.
- On a vendor, `parent` is the company that owns it now. Ownership chains come from `parent`.
- Acquisitions are their own files in `data/acquisitions/`, named
  `<acquirer>--<target>--<year>.yaml` and dated by completion, not announcement.

### Writing
- Summaries are short and in your own words. Never paste text from a source.
- `plain` explains the product to someone outside the field. `workflow` says where its data
  comes from and where it goes.
- No em dashes or en dashes (the build fails). Use commas, colons, parentheses or a new
  sentence.
- Formats: list major documented formats only, as `formats.reads` and `formats.writes`.

### Ids
- Lowercase with hyphens (`ansys-fluent`), unique across tools, vendors and formats, and equal
  to the file name.

### Neutrality and vendor contributions
Vendor employees are welcome to correct facts about their own products. Please say so in the
pull request. Corrections need a public source. Summaries describe what a product does, not
how good it is: no rankings, superlatives or positioning claims.

## Example files

Example files under `public/examples/` need a license that allows redistribution, a size and
a sha256 in their manifest (`data/examples/`), and the build checks all three. Never add a file
by hand: generated files come from `scripts/gen_examples.py` and third-party files from
`scripts/fetch_examples.py`. The policy is in decision 0005.

## Checking your change

```sh
npm ci
npm run data     # schema, references, ids, dashes: fast
npm run dev      # see it on http://localhost:3480
```

CI runs the same validation, a full build and a browser check on every pull request. If CI
fails, the log names the file and the field.

## Review

- A maintainer reviews every pull request. Data changes are checked against the cited sources.
- Merging to `main` deploys the site. Nothing reaches the site without review.
- Small, focused pull requests are reviewed fastest: one product, one deal, one fix.

## Site code

The site is Astro with a sigma.js map (`src/scripts/map.ts`). Before a structural or visual
change, read [`docs/decisions/`](docs/decisions/): the visual language (0008), the hierarchy
on the map (0009) and the 7-colour domain palette (do not add an 8th) are deliberate. For a
larger change, open an issue first so we can agree on the direction.

By contributing you agree that your code is licensed under MIT and your data changes under
CC BY-SA 4.0, as described in the README. Please follow the [code of conduct](CODE_OF_CONDUCT.md).
