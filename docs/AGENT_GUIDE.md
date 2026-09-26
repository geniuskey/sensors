# Agent Guide

You are maintaining an open mobile image-sensor knowledge base. Optimize for correctness, provenance and reproducibility, not row count.

## Before editing

1. Read `DATA_MODEL.md`, `DATA_SOURCES.md`, `MAINTENANCE.md`.
2. Inspect the latest schema migration and the importer.
3. Never invent specifications to fill blanks.
4. Treat model/alias identity resolution as a first-class task.

## Samsung naming rule

Canonical display name: `ISOCELL <code>`.
Internal/part code: `S5K<code>`.
Examples: `ISOCELL GN3` + `S5KGN3`; `ISOCELL 3H2` + `S5K3H2`.
Use canonical ID `SAMSUNG:<code>`. Do not create separate sensor rows for ISOCELL and S5K aliases.

## Collection workflow

1. Save acquired material or structured extraction under a dated `data/raw/<source>/<date>/` path when possible.
2. Capture source URL and check date.
3. Parse source-specific data without canonicalizing in the collector.
4. Normalize names in a separate step.
5. Match aliases to existing sensors/phones using exact identifiers first, then conservative fuzzy matching.
6. Create new entities only when identity is sufficiently clear.
7. Import into a local staging DB.
8. Run `npm run db:validate`.
9. Inspect generated diffs and summarize additions/changes/conflicts in the PR.

## Confidence

Suggested labels: `official`, `high`, `medium`, `low`, `unverified`.
- `official`: manufacturer/OEM primary source.
- `high`: multiple independent reputable sources agree.
- `medium`: one specialist database or indirect strong evidence.
- `low`: weak/ambiguous secondary source.
- `unverified`: discovered but not suitable for public factual claims.

## Phone matching

Normalize case, whitespace, punctuation and common OEM prefixes, but preserve variants such as region/SoC edition when they materially differ. Do not automatically collapse `Pro`, `Ultra`, `Plus`, `FE`, regional or chipset variants.

## DXOMARK

DXOMARK is phone-level. Store protocol version. Do not imply V5 and V6 scores are directly comparable. Use the exact tested device variant where available.

## Pull request checklist

- [ ] No duplicate canonical sensor IDs.
- [ ] Samsung aliases merged correctly.
- [ ] New facts have source URLs.
- [ ] No invented specs.
- [ ] Phone mappings have plausible release years/roles.
- [ ] DXOMARK protocol retained.
- [ ] `npm run data:build` passes.
- [ ] `npm run build` passes.
- [ ] Generated exports updated.

## Tasks for future agents

1. Build robust source collectors for each official manufacturer.
2. Expand Helpix/SP information phone-role mappings to all eligible sensors.
3. Expand DXOMARK matching beyond the initial verified subset.
4. Add phone SoC/release metadata from OEM pages.
5. Add automated change detection and issue creation for source disagreements.
6. Add analytics pages: adoption by year, sensor maker share, Main/UW/Tele migration, pixel pitch/format trends, DXOMARK analysis segmented by protocol.
