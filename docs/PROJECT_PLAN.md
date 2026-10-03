# Project plan

## Phase 0 — bootstrap (implemented)

- Normalized SQLite/D1 schema.
- Import current all-in-one CSV.
- Samsung ISOCELL/S5K canonicalization.
- Static JSON/CSV exports.
- Cloudflare Pages UI with search/filter.
- Read-only Pages Functions APIs.
- D1 migration and seed generation.
- CI validation and deployment workflow templates.
- Provenance/maintenance/agent documentation.

## Phase 1 — production deployment

- Create GitHub repository.
- Create Cloudflare D1 `sensors-db`.
- Configure `wrangler.toml` from the template.
- Add GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`.
- Create/deploy Pages project `sensors-euiyun`.
- Add custom domain `sensors.euiyun.com`.
- Replace the generic GitHub link in `src/main.js` with the final repository URL.

## Phase 2 — collectors

Implement reviewed collectors one at a time, starting with official manufacturer sources. Each collector creates immutable dated raw snapshots. Add SP information/Helpix/DXOMARK only after official-source collectors are stable.

## Phase 3 — normalization & review automation

- Alias resolver with confidence scoring.
- Phone canonicalizer with regional/SoC variants.
- Conflict report (`official != secondary`).
- Automatic PR body summarizing additions/deletions/changed specifications.
- Manual override application after normalization and before export.

## Phase 4 — product experience

- Sensor detail routes and shareable URLs.
- Phone detail pages with camera stack.
- Compare sensors.
- Adoption charts by year / role / manufacturer.
- Source/confidence badges.
- Full-text search using D1 FTS5 if dataset/search needs justify it.

## Phase 5 — sustainable operations

- Weekly Mac Studio collection task creates a PR.
- Monthly low-confidence audit.
- Release tags and downloadable snapshots.
- Backup/export production D1 periodically.
- Optional contributor submission flow; all submissions enter review, never direct production writes.
