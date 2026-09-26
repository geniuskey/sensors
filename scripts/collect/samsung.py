"""Samsung Semiconductor ISOCELL mobile image sensors (official).

The public product pages render their lists/specs from two JSON endpoints used by the
site's own front-end (robots.txt allows them):
  /aemapi/semi/iaFindList?siteCode=global&iaId=329   -> products under "Mobile Image Sensor"
  /aemapi/semi/prdSpecInfo?siteCode=global&iaId=<id> -> spec list for one product
"""
from __future__ import annotations

import re
import sys
import urllib.parse

from common import (parse_optical_format, parse_pixel_um, parse_resolution_mp, run_collector,
                    sitemap_urls)

SOURCE = 'samsung'
SOURCE_URL = 'https://semiconductor.samsung.com/image-sensor/mobile-image-sensor/'
SOURCE_TIER = 'official'
DEFAULT_MAX_PAGES = 60

BASE = 'https://semiconductor.samsung.com'
MOBILE_CATEGORY_ID = '329'
LIST_API = BASE + '/aemapi/semi/iaFindList?' + urllib.parse.urlencode(
    {'siteCode': 'global', 'iaId': MOBILE_CATEGORY_ID, 'applications': ''})
SPEC_API = BASE + '/aemapi/semi/prdSpecInfo?siteCode=global&iaId={id}&prdId='
SITEMAP = BASE + '/sitemap.xml'


def product_slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def collect(fetcher, max_pages: int = DEFAULT_MAX_PAGES):
    data = fetcher.get_json(LIST_API)
    items = data['response']['resultData']['iaFinderList']
    if not items:
        raise RuntimeError('Samsung iaFindList returned no products')
    try:
        known_pages = {loc.rstrip('/') for loc, _ in sitemap_urls(fetcher.get(SITEMAP))
                       if '/image-sensor/mobile-image-sensor/' in loc}
    except Exception:
        known_pages = set()

    records, errors, fetched = [], [], 0
    for item in items:
        name = (item.get('iaEngNm') or '').strip()
        if not name or name.lower().startswith('product with'):
            continue
        guess = f'{SOURCE_URL}{product_slug(name)}'
        rec = {
            'name': name,
            'manufacturer': 'Samsung',
            'ia_id': item.get('iaId'),
            'product_url': guess + '/' if guess in known_pages else None,
            'spec_api_url': SPEC_API.format(id=item.get('iaId')),
        }
        if fetched < max_pages:
            fetched += 1
            try:
                info = (fetcher.get_json(rec['spec_api_url']) or {}).get('prdSpecInfo') or {}
                specs = {s.get('specName') or s.get('specDispName'): s.get('specValue')
                         for s in info.get('specList') or []}
                rec['specs'] = specs
                rec['status'] = specs.get('Product Status')
                rec['resolution_raw'] = specs.get('Effective Resolution')
                rec['pixel_size_raw'] = specs.get('Pixel Size')
                rec['optical_format_raw'] = specs.get('Optical Format')
                rec['resolution_mp'] = parse_resolution_mp(rec['resolution_raw'])
                rec['pixel_size_um'] = parse_pixel_um(rec['pixel_size_raw'])
                rec['optical_format'] = parse_optical_format(rec['optical_format_raw'])
            except Exception as e:
                errors.append({'url': rec['spec_api_url'], 'error': repr(e)})
        records.append(rec)
    return records, {'source_tier': SOURCE_TIER, 'list_api': LIST_API, 'errors': errors,
                     'spec_calls': fetched}


if __name__ == '__main__':
    run_collector(sys.modules[__name__])
