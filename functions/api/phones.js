import { json } from '../_types.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const manufacturer = (url.searchParams.get('manufacturer') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 500);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const filters = [];
  const bindings = [];

  if (manufacturer) {
    filters.push("LOWER(COALESCE(NULLIF(TRIM(p.oem), ''), 'Unknown')) = LOWER(?)");
    bindings.push(manufacturer);
  }
  if (query) {
    filters.push(`(
      p.model LIKE ? OR COALESCE(p.oem, '') LIKE ? OR COALESCE(p.soc, '') LIKE ? OR
      EXISTS (
        SELECT 1 FROM phone_cameras pcq JOIN sensors sq ON sq.id = pcq.sensor_id
        WHERE pcq.phone_id = p.id AND (sq.canonical_name LIKE ? OR sq.canonical_id LIKE ?)
      )
    )`);
    for (let i = 0; i < 5; i += 1) bindings.push(`%${query}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const results = await env.DB.prepare(`
    WITH selected_phones AS (
      SELECT p.id
      FROM phones p
      ${where}
      ORDER BY p.release_year DESC, p.model
      LIMIT ? OFFSET ?
    )
    SELECT
      p.id, p.canonical_id, p.oem, p.model, p.release_year, p.soc,
      d.camera_score, d.photo_score, d.video_score, d.selfie_score,
      d.display_score, d.battery_score, d.camera_protocol,
      dxos.url AS dxomark_source_url,
      pc.id AS camera_id, pc.camera_role AS role, pc.mapping_confidence AS confidence,
      s.canonical_id AS sensor_id, s.canonical_name AS sensor,
      sm.name AS sensor_manufacturer, s.resolution_mp, s.sensor_size, s.pixel_size_um,
      (SELECT src.url FROM camera_sources cs JOIN sources src ON src.id = cs.source_id
        WHERE cs.camera_id = pc.id
        ORDER BY CASE src.source_type WHEN 'official' THEN 0 ELSE 1 END, src.id LIMIT 1) AS source_url
    FROM selected_phones chosen
    JOIN phones p ON p.id = chosen.id
    LEFT JOIN dxomark_results d ON d.phone_id = p.id
    LEFT JOIN sources dxos ON dxos.id = d.source_id
    LEFT JOIN phone_cameras pc ON pc.phone_id = p.id
    LEFT JOIN sensors s ON s.id = pc.sensor_id
    LEFT JOIN manufacturers sm ON sm.id = s.manufacturer_id
    ORDER BY p.release_year DESC, p.model, pc.camera_role, s.canonical_name
  `).bind(...bindings, limit, offset).all();

  const byId = new Map();
  for (const row of results.results || []) {
    let phone = byId.get(row.id);
    if (!phone) {
      phone = {
        id: row.id,
        canonical_id: row.canonical_id,
        oem: row.oem || 'Unknown',
        model: row.model,
        release_year: row.release_year,
        soc: row.soc,
        camera_score: row.camera_score,
        photo_score: row.photo_score,
        video_score: row.video_score,
        selfie_score: row.selfie_score,
        display_score: row.display_score,
        battery_score: row.battery_score,
        camera_protocol: row.camera_protocol,
        dxomark_source_url: row.dxomark_source_url,
        cameras: [],
      };
      byId.set(row.id, phone);
    }
    if (row.camera_id != null) {
      phone.cameras.push({
        camera_id: row.camera_id,
        role: row.role,
        confidence: row.confidence,
        sensor_id: row.sensor_id,
        sensor: row.sensor,
        sensor_manufacturer: row.sensor_manufacturer,
        resolution_mp: row.resolution_mp,
        sensor_size: row.sensor_size,
        pixel_size_um: row.pixel_size_um,
        source_url: row.source_url,
      });
    }
  }

  const items = Array.from(byId.values()).map((phone) => ({
    ...phone,
    camera_count: phone.cameras.length,
    sensors: Array.from(new Set(phone.cameras.map((camera) => camera.sensor).filter(Boolean))).join(', '),
  }));
  return json({ items, total: items.length, offset, limit });
}
