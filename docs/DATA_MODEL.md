# Data model

## Principles

1. A physical sensor is one `sensors` row regardless of aliases.
2. Samsung canonical display names use `ISOCELL <code>`; `S5K<code>` is retained in `internal_code`/`sensor_aliases`.
3. Phones and sensors are many-to-many through `phone_cameras`; camera role belongs to the mapping, not to the sensor.
4. DXOMARK belongs to a phone/test protocol, never to the sensor itself.
5. Every externally researched fact should be traceable to a source URL and confidence level.

## Core tables

- `manufacturers`: Sony, Samsung, OmniVision, SmartSens, GalaxyCore, SK hynix, etc.
- `sensors`: canonical sensor specification.
- `sensor_aliases`: marketing names, internal part numbers, OEM aliases.
- `phones`: canonicalized smartphone identity.
- `phone_cameras`: `(phone, sensor, role)` relationship.
- `dxomark_results`: phone-level benchmark metadata. Store `camera_protocol`; V5/V6 must not be treated as directly comparable without normalization.
- `sources`: URL registry and source type.
- `sensor_sources`, `camera_sources`: provenance edges.

## Canonical IDs

Use stable, human-readable IDs such as `SONY:IMX989`, `SAMSUNG:GN3`, `OMNIVISION:OV50H`. IDs should not change when a marketing label changes.
