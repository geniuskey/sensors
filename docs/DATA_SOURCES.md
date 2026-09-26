# Data sources

The bootstrap catalog was assembled from multiple source families. Agents must keep source-specific collectors separate because fields and reliability differ.

| Source | Purpose | Preferred fields | Notes |
|---|---|---|---|
| Sony Semiconductor | Official sensor specs | model, resolution, pixel pitch, optical format, technology | highest priority for Sony specs |
| Samsung Semiconductor / ISOCELL | Official Samsung specs | marketing name, resolution, pixel pitch, optical format, features | canonical Samsung display name source |
| OmniVision | Official specs/press releases | model and core specs | use product/press pages |
| SmartSens | Official catalog | smartphone CIS lineup/specs | CS/HS/XS families |
| SK hynix newsroom/product material | Official/primary | Black Pearl lineup/specs | useful for Hi-* series |
| SP information | Broad mobile-CIS catalog | model list, specs, phone adoption | excellent discovery source; verify critical fields |
| Helpix image-sensor index | Historical/adoption mapping | sensor-to-phone mapping, role, year | useful for old sensors and Main/UW/Tele roles |
| DXOMARK smartphones | Phone benchmark | camera/photo/video/etc scores and protocol | phone-level only; protocol version required |
| OEM product pages | Phone specs | SoC, launch metadata, cameras where disclosed | primary source for phone identity |

## Current bootstrap URLs

The CSV retains source URLs in `Source_URL`, `Additional_Source_URL`, `Mapping_Source_URL`, `SoC_Source_URL`, and `DXOMARK_Source_URL`. Importers register these URLs in the `sources` table.

`exports/verified-role-updates-2026-09-26.csv` sets camera roles (and SoC when the same page states it) on existing phone-sensor mappings. Each row cites a Helpix page that explicitly ties the sensor to a camera module: the sensor page (`/isensor/<sensor>/`, role column) or the phone spec page (camera list naming the sensor). The importer rejects rows whose phone/sensor pair does not already exist, and only fills SoC when it is empty. Region-qualified Helpix entries, name aliases and sensor-variant/family pages are recorded as `Medium` confidence.

## Source priority

For **sensor specifications**: official manufacturer > OEM technical publication > trusted specialist database > community/listing site.

For **phone adoption**: OEM teardown/official disclosure > trusted technical database > specialist catalog > forum/community report.

If sources disagree, do not erase the conflict. Keep the canonical value backed by the strongest source and record the conflicting value in an issue/manual override note.
