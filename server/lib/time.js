const DAY_MS = 86400000;

// Local-calendar date string (server timezone), not UTC — meals happen on local days.
function isoDate(d) {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY_MS);
const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;
const parseDate = (s) => new Date(`${s}T00:00:00`);

module.exports = { DAY_MS, isoDate, addDays, hoursBetween, parseDate };
