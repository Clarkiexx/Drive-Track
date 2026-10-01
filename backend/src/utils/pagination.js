/** Shared pagination clamp: prevents unbounded ?limit= DoS and negative pages.
 *  Usage: const { page, limit } = getPagination(req.query, 10); */
function getPagination(query, defaultLimit) {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), 100)
    : defaultLimit;
  return { page, limit };
}

module.exports = { getPagination };
