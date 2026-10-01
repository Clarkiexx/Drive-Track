const { Op } = require('sequelize');
const { Driver, Enforcer, Citation } = require('../models');
const { success } = require('../utils/response');

/** GET /dashboard/summary — the 4 stat cards on the admin Dashboard,
 * plus unsettledAmount used by the Settlements page's "Total Unsettled"
 * badge (a true system-wide sum, not just whatever page is on screen). */
async function getSummary(req, res, next) {
  try {
    const [totalDrivers, totalEnforcers, totalViolations, unsettledViolations, unsettledSum] = await Promise.all([
      Driver.count(),
      Enforcer.count(),
      Citation.count(),
      Citation.count({ where: { settlementStatus: 'pending' } }),
      Citation.sum('fineAmount', { where: { settlementStatus: 'pending' } }),
    ]);

    return success(res, {
      totalDrivers,
      totalEnforcers,
      totalViolations,
      unsettledViolations,
      unsettledAmount: unsettledSum || 0,
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

    const citations = await Citation.findAll({
      where: { occurredAt: { [Op.gte]: rangeStart } },
      attributes: ['occurredAt', 'settlementStatus'],
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
    const recentCitations = await Citation.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Driver, attributes: ['firstName', 'lastName'] },
        { model: Enforcer, attributes: ['firstName', 'lastName'] },
      ],
    });

    const activity = recentCitations.map((c) => ({
      type: c.recordType === 'warning' ? 'warning_issued' : 'citation_issued',
      description:
        c.recordType === 'warning'
          ? `Warning issued — ${c.placeOfViolation}`
          : `${c.citationNumber} by Officer ${c.Enforcer?.lastName || '—'}`,
      timestamp: c.createdAt,
    }));

    return success(res, activity);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, getTrend, getRecentActivity };
