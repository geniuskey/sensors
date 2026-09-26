"""Helpix image-sensor index (https://helpix.ru/isensor/).

Listing: one table per announcement year with sensor, resolution, optical format, pixel size.
Detail pages (limited by --max-pages, newest first): announce date, pixel dimensions and
the phones that use the sensor with the camera role (Russian labels kept raw).
"""
from __future__ import annotations

import re
import sys
import urllib.parse

from common import (TableRowParser, clean_text, parse_optical_format, parse_pixel_um,
                    parse_resolution_mp, run_collector)

SOURCE = 'helpix'
SOURCE_URL = 'https://helpix.ru/isensor/'
SOURCE_TIER = 'secondary'
DEFAULT_MAX_PAGES = 30

MANUFACTURER_PREFIXES = ['Light&Shadow', 'SK hynix', 'Hynix', 'Sony', 'Samsung', 'OmniVision', 'GalaxyCore',
                         'SmartSens', 'SuperPix', 'MetaSilicon', 'Panasonic', 'BYD', 'onsemi', 'FLIR',
                         'InfiRay', 'ThermoVue', 'Honor', 'Vivo']


def split_manufacturer(title: str) -> tuple[str, str]:
    for prefix in MANUFACTURER_PREFIXES:
        if title.lower().startswith(prefix.lower() + ' '):
            return prefix, title[len(prefix):].strip()
    return '', title


def parse_index(page: str) -> list[dict]:
    parser = TableRowParser()
    parser.feed(page)
    records = []
    for row in parser.rows:
        cells = row['cells']
        if 'b-tabchip' not in row['table_class'] or len(cells) < 4 or cells[0]['tag'] != 'td':
            continue
        href = cells[0]['href'] or ''
        if not href.startswith('/isensor/'):
            continue
        title = cells[0]['text']
        manufacturer, model = split_manufacturer(title)
        year = row['context'].get('h3', '')
        records.append({
            'title': title,
            'manufacturer': manufacturer,
            'model': model,
            'slug': href.strip('/').split('/')[-1],
            'url': urllib.parse.urljoin(SOURCE_URL, href),
            'year': int(year) if year.isdigit() else None,
            'resolution_raw': cells[1]['text'],
            'optical_format_raw': cells[2]['text'],
            'pixel_size_raw': cells[3]['text'],
            'resolution_mp': parse_resolution_mp(cells[1]['text']),
            'optical_format': parse_optical_format(cells[2]['text']),
            'pixel_size_um': parse_pixel_um(cells[3]['text']),
        })
    return records


def parse_detail(page: str, url: str) -> dict:
    parser = TableRowParser()
    parser.feed(page)
    specs, phones = {}, []
    for row in parser.rows:
        cells = row['cells']
        if row['table_class'] == 'reviewTable' and len(cells) == 2:
            specs[cells[0]['text']] = cells[1]['text']
        elif 'b-tabchip' in row['table_class'] and len(cells) == 2 and cells[0]['href']:
            group = re.sub(r'\s*\(\d+\)\s*$', '', row['context'].get('h2', ''))
            year = row['context'].get('h3', '')
            phones.append({
                'name': cells[0]['text'],
                'url': urllib.parse.urljoin(url, cells[0]['href']),
                'role_raw': cells[1]['text'],
                'year': int(year) if year.isdigit() else None,
                'device_group': group,
            })
    announce = re.search(r'Анонс:\s*([^<]+)<', page)
    return {
        'announced_raw': clean_text(announce.group(1)) if announce else None,
        'detail_specs': specs,
        'pixel_dimensions_raw': specs.get('Пикселей'),
        'phones': phones,
        'detail_fetched': True,
    }


def collect(fetcher, max_pages: int = DEFAULT_MAX_PAGES):
    records = parse_index(fetcher.get(SOURCE_URL))
    if not records:
        raise RuntimeError('Helpix index parsed 0 rows; page structure may have changed')
    fetched, errors = 0, []
    for rec in records:
        if fetched >= max_pages:
            break
        try:
            rec.update(parse_detail(fetcher.get(rec['url']), rec['url']))
        except Exception as e:  # keep the listing even if one detail page fails
            errors.append({'url': rec['url'], 'error': repr(e)})
        fetched += 1
    meta = {'source_tier': SOURCE_TIER, 'detail_pages_fetched': fetched, 'errors': errors,
            'note': 'Index covers all sensors; phone lists only for the first --max-pages sensors (newest first).'}
    return records, meta


if __name__ == '__main__':
    run_collector(sys.modules[__name__])
