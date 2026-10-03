# Maintenance

## Weekly

1. Check official Sony, Samsung ISOCELL, OmniVision, SmartSens and SK hynix pages for newly announced mobile sensors.
2. Check SP information and Helpix for new aliases/adoption mappings.
3. Check DXOMARK for newly tested phones already present in `phones` (to add test-page links only).
4. Run collectors into a dated raw snapshot folder; never write scraped output directly to production.
5. When a DXOMARK ranking HTML snapshot is available at `data/raw/dxomark smartphones.html`, run `python scripts/import_dxomark.py` before rebuilding data so each matched phone gets its device-page link. Scores, prices and dates are not copied.
6. Normalize, validate and open a PR. A human or review agent inspects unusual diffs before merge.

## Monthly

- Re-check low-confidence records.
- Resolve duplicate aliases and phone-name collisions.
- Run integrity checks for orphan mappings, impossible years, malformed URLs and duplicate canonical IDs.
- Publish refreshed CSV/JSON export and update dataset statistics.

## Release workflow

`raw snapshot -> normalize -> local SQLite -> validate -> generated seed/exports -> PR -> merge -> D1 migration/seed -> Pages deploy`

Never let a crawler write directly to production D1.

## Mac Studio role

The Mac Studio is the preferred ETL/agent worker. It can run browser automation, local LLM verification and scheduled collection, but the public site should remain on Cloudflare. A scheduled local job may create a branch/PR; it should not auto-merge high-impact changes.
