"""Run enabled collectors, diff reports and the low-confidence audit.

Writes raw snapshots (data/raw/<source>/<date>/snapshot.json), per-source reports and
data/reports/<date>-summary.md, which the scheduled workflow uses as the PR body.
Never touches the database or production D1.
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys
import traceback

import audit_low_confidence
import diff_report
from common import REPORTS_DIR, ROOT, PoliteFetcher, latest_snapshot, today, write_snapshot

# name -> max pages for the scheduled run. Sony is intentionally absent (see README).
ENABLED = {
    'samsung': 60,
    'omnivision': 400,
    'helpix': 60,
}
PR_BODY_LIMIT = 60000


def collect(source: str, max_pages: int, date: str, fetcher: PoliteFetcher) -> dict:
    module = importlib.import_module(source)
    before = fetcher.request_count
    try:
        records, meta = module.collect(fetcher, max_pages=max_pages)
    except Exception as e:
        traceback.print_exc()
        return {'source': source, 'ok': False, 'error': repr(e), 'requests': fetcher.request_count - before}
    meta = {**meta, 'request_count': fetcher.request_count - before, 'max_pages': max_pages}
    path = write_snapshot(source, module.SOURCE_URL, records, meta, date=date)
    print(f'{source}: {len(records)} records -> {path.relative_to(ROOT).as_posix()}')
    return {'source': source, 'ok': True, 'records': len(records), 'requests': meta['request_count'],
            'snapshot': path.relative_to(ROOT).as_posix(), 'errors': len(meta.get('errors') or [])}


def render_summary(date: str, runs: list[dict], reports: list[dict], audit: dict, audit_path, full_audit: bool) -> str:
    md = [f'# Weekly source collection ({date})', '',
          'Automated by `scripts/collect/run_all.py`. This collection only adds raw snapshots and reports; '
          'it does not change `public/data`, the local SQLite DB or production D1. '
          'Apply accepted changes through the normal importer/review flow.', '',
          '## Collectors', '', '| Source | Status | Records | Requests | Page errors |', '|---|---|---|---|---|']
    for r in runs:
        status = 'ok' if r['ok'] else f"failed: `{r['error'][:120]}`"
        md.append(f"| {r['source']} | {status} | {r.get('records', '')} | {r.get('requests', '')} | {r.get('errors', '')} |")
    md.append('')
    for rep in reports:
        md += [f"## {rep['source']} ({rep['source_tier']})", '']
        md += diff_report.summary_lines(rep)
        md.append(f"- Full report: `data/reports/{rep['snapshot_date']}-{rep['source']}.md`")
        md.append('')
        conflicts = sorted(rep['spec_conflicts'], key=lambda c: not c['official_vs_secondary'])[:15]
        if conflicts:
            md += ['<details><summary>Top spec conflicts</summary>', '',
                   '| Sensor | Field | DB | Source | Official vs secondary |', '|---|---|---|---|---|']
            md += [f"| {c['canonical_id']} | {c['field']} | {c['db_value']} | {c['source_value']} | "
                   f"{'yes' if c['official_vs_secondary'] else ''} |" for c in conflicts]
            md += ['', '</details>', '']
        if rep['new_sensors']:
            names = ', '.join(n['name'] for n in rep['new_sensors'][:40])
            more = len(rep['new_sensors']) - 40
            md += [f"New sensors: {names}{f' (+{more} more)' if more > 0 else ''}", '']
    md += ['## Low-confidence audit', '']
    md += audit_low_confidence.summary_lines(audit)
    if full_audit:
        md.append(f"- Full monthly audit: `{audit_path.relative_to(ROOT).as_posix()}`")
    md += ['', '## Review checklist', '',
           '- [ ] Official-source conflicts checked against the product page',
           '- [ ] New sensors verified before adding (no invented specs)',
           '- [ ] New phone mappings checked for exact model/variant and role',
           '- [ ] Accepted changes applied via the importer, then `npm run data:build`']
    text = '\n'.join(md) + '\n'
    if len(text) > PR_BODY_LIMIT:
        text = text[:PR_BODY_LIMIT] + '\n\n_Truncated; see the per-source reports._\n'
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--sources', help=f'comma-separated subset of: {",".join(ENABLED)}')
    parser.add_argument('--max-pages', type=int, help='override max pages for every collector')
    parser.add_argument('--delay', type=float, default=2.0)
    parser.add_argument('--date', default=today())
    parser.add_argument('--skip-collect', action='store_true', help='only rebuild reports from latest snapshots')
    parser.add_argument('--full-audit', action='store_true', help='also write the full monthly audit report')
    args = parser.parse_args(argv)

    sources = [s.strip() for s in args.sources.split(',')] if args.sources else list(ENABLED)
    unknown = [s for s in sources if s not in ENABLED]
    if unknown:
        parser.error(f'unknown source(s): {unknown}')

    runs = []
    if not args.skip_collect:
        fetcher = PoliteFetcher(delay=args.delay)
        for source in sources:
            runs.append(collect(source, args.max_pages or ENABLED[source], args.date, fetcher))
    else:
        for source in sources:
            snapshot_path = latest_snapshot(source)
            if not snapshot_path:
                continue
            snapshot = json.loads(snapshot_path.read_text(encoding='utf-8'))
            runs.append({'source': source, 'ok': True, 'records': snapshot.get('record_count', len(snapshot.get('records') or [])),
                         'requests': snapshot.get('request_count', ''), 'errors': len(snapshot.get('errors') or []),
                         'snapshot': snapshot_path.relative_to(ROOT).as_posix()})

    db = diff_report.Database()
    reports = []
    for source in sources:
        if not latest_snapshot(source):
            continue
        rep = diff_report.build_report(source, db)
        diff_report.write_report(rep)
        reports.append(rep)
        print(f"{source} report: {json.dumps(rep['summary'])}")

    audit = audit_low_confidence.run_audit()
    audit['date'] = args.date
    audit_path = None
    if args.full_audit:
        audit_path, _ = audit_low_confidence.write_audit(audit)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    summary_path = REPORTS_DIR / f'{args.date}-summary.md'
    summary_path.write_text(render_summary(args.date, runs, reports, audit, audit_path, args.full_audit),
                            encoding='utf-8')
    print(f'summary -> {summary_path.relative_to(ROOT).as_posix()}')
    return 1 if runs and not any(r['ok'] for r in runs) else 0


if __name__ == '__main__':
    sys.exit(main())
