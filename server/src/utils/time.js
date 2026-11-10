function nowIso() {
  return new Date().toISOString();
}

function isoDaysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString();
}

function isExpired(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function ageInDays(dateString) {
  if (!dateString) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / (24 * 60 * 60 * 1000)));
}

module.exports = { nowIso, isoDaysAgo, isExpired, ageInDays };
