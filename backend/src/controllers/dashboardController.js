const { success } = require('../utils/response');

// Shared Prisma data layer — src/lib/prisma.js is the single place the client
// and the error/date/number helpers come from (owned by the foundation lane).
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');

/** GET /dashboard/summary — the 4 stat cards on the admin Dashboard,
 * plus unsettledAmount used by the Settlements page's "Total Unsettled"
 * badge (a true system-wide sum, not just whatever page is on screen).
 *
 * unsettledAmount is the *remaining* balance: pending citations' fines minus
 * the penalties of rows already settled by partial payments, clamped at 0.
 * Two aggregate queries (no N+1) cover the whole system. */
async function getSummary(req, res, next) {
  try {
    const [totalDrivers, totalEnforcers, totalViolations, unsettledViolations, pendingFines, settledRows] =
      await Promise.all([
        prisma.driver.count(),
        prisma.enforcer.count(),
        prisma.citation.count(),
        prisma.citation.count({ where: { settlementStatus: 'pending' } }),
        prisma.citation.aggregate({
          where: { settlementStatus: 'pending' },
          _sum: { fineAmount: true },
        }),
        prisma.citationViolation.aggregate({
          where: {
            settlementStatus: 'settled',
            citation: { settlementStatus: 'pending' },
          },
          _sum: { penaltyAtIssuance: true },
        }),
      ]);

    const pendingTotal = toNumber(pendingFines._sum.fineAmount) || 0;
    const alreadyPaid = toNumber(settledRows._sum.penaltyAtIssuance) || 0;

    return success(res, {
      totalDrivers,
      totalEnforcers,
      totalViolations,
      unsettledViolations,
      // Prisma returns a Decimal (or null for an empty set) — the API has
      // always answered with a plain JSON number here.
      unsettledAmount: Math.max(0, pendingTotal - alreadyPaid),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/trend — Settled vs Unsettled citations issued each day
 * over the last 7 days, for the Dashboard's line chart.
 */
async function getTrend(req, res, next) {
  try {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d);
    }

    const rangeStart = new Date(days[0]);
    rangeStart.setHours(0, 0, 0, 0);

    const citations = await prisma.citation.findMany({
      where: { occurredAt: { gte: rangeStart } },
      select: { occurredAt: true, settlementStatus: true },
    });

    const trend = days.map((day) => {
      const dayKey = day.toDateString();
      const dayCitations = citations.filter((c) => new Date(c.occurredAt).toDateString() === dayKey);
      return {
        date: day.toISOString().slice(0, 10),
        settled: dayCitations.filter((c) => c.settlementStatus === 'settled').length,
        unsettled: dayCitations.filter((c) => c.settlementStatus === 'pending').length,
      };
    });

    return success(res, trend);
  } catch (err) {
    next(err);
  }
}

/** GET /dashboard/recent-activity — the activity feed on the admin Dashboard */
async function getRecentActivity(req, res, next) {
  try {
    const recentCitations = await prisma.citation.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        driver: { select: { firstName: true, lastName: true } },
        enforcer: { select: { firstName: true, lastName: true } },
      },
    });

    const activity = recentCitations.map((c) => ({
      type: c.recordType === 'warning' ? 'warning_issued' : 'citation_issued',
      description:
        c.recordType === 'warning'
          ? `Warning issued — ${c.placeOfViolation}`
          : `${c.citationNumber} by Officer ${c.enforcer?.lastName || '—'}`,
      timestamp: c.createdAt,
    }));

    return success(res, activity);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, getTrend, getRecentActivity };
