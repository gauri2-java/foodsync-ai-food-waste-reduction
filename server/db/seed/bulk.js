// Chunked multi-row INSERT for seeding large volumes quickly.
async function insertMany(client, table, columns, rows, { returning = null, chunk = 500 } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const tuples = part.map((row) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`);
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}${returning ? ` RETURNING ${returning}` : ''}`;
    const res = await client.query(sql, params);
    out.push(...res.rows);
  }
  return out;
}

module.exports = { insertMany };
