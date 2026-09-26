const db = require('../../lib/db');

const range = (latKey, lngKey, from, to) =>
  db.query('SELECT day, temp_max_c, temp_min_c, rain_mm, source FROM weather_daily WHERE lat_key=$1 AND lng_key=$2 AND day BETWEEN $3 AND $4 ORDER BY day', [latKey, lngKey, from, to]);

async function upsertMany(latKey, lngKey, rows) {
  for (const r of rows) {
    await db.query(
      `INSERT INTO weather_daily (lat_key, lng_key, day, temp_max_c, temp_min_c, rain_mm, source) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (lat_key, lng_key, day) DO UPDATE SET temp_max_c=$4, temp_min_c=$5, rain_mm=$6, source=$7`,
      [latKey, lngKey, r.day, r.tempMax, r.tempMin, r.rainMm, r.source]
    );
  }
}

module.exports = { range, upsertMany };
