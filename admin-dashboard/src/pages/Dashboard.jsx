import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { fetchDashboardSummary, fetchDashboardTrend, fetchRecentActivity } from '../api/dashboardApi';

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [activity, setActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([fetchDashboardSummary(), fetchDashboardTrend(), fetchRecentActivity()])
      .then(([summaryRes, trendRes, activityRes]) => {
        setSummary(summaryRes.data.data);
        setTrend(trendRes.data.data);
        setActivity(activityRes.data.data);
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Unable to load dashboard data.'))
      .finally(() => setIsLoading(false));
  }, []);

  const maxTrendValue = Math.max(1, ...trend.map((d) => d.settled + d.unsettled));

  return (
    <DashboardLayout title="Dashboard">
      <h1 className="page-heading">Dashboard Overview</h1>
      <p className="page-subheading">Welcome back, Admin. Here's what's happening today.</p>

      {isLoading ? (
        <div className="card" style={{ padding: 24 }}>Loading…</div>
      ) : loadError ? (
        <div className="card error-text" style={{ padding: 24 }}>{loadError}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            <StatCard icon="👥" value={summary.totalDrivers} label="Total Drivers" bg="#E7F0FE" />
            <StatCard icon="🛡️" value={summary.totalEnforcers} label="Total Enforcers" bg="#DCFCE7" />
            <StatCard icon="📄" value={summary.totalViolations} label="Total Violations" bg="#F3E8FD" />
            <StatCard icon="⚠️" value={summary.unsettledViolations} label="Unsettled Violations" bg="#FEF3C7" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Violations Trend (Last 7 Days)</h3>
              <TrendChart trend={trend} maxValue={maxTrendValue} />
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Recent Activity</h3>
              {activity.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No recent activity.</p>
              ) : (
                activity.map((a, i) => (
                  <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{timeAgo(a.timestamp)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function StatCard({ icon, value, label, bg }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        {icon}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

/** Minimal dependency-free SVG line chart — avoids pulling in a full charting
 * library for one simple 7-point trend line. Responsive, with gridlines,
 * dots, hover tooltips and an empty state when there is nothing to plot. */
function TrendChart({ trend, maxValue }) {
  const width = 560;
  const height = 200;
  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 26;
  const [hover, setHover] = useState(null);

  const hasData = trend.length > 0 && maxValue > 0 && trend.some((d) => d.settled + d.unsettled > 0);

  function xFor(i) {
    if (trend.length <= 1) return paddingLeft + (width - paddingLeft - paddingRight) / 2;
    return paddingLeft + (i / (trend.length - 1)) * (width - paddingLeft - paddingRight);
  }
  function yFor(v) {
    return height - paddingBottom - (v / Math.max(1, maxValue)) * (height - paddingTop - paddingBottom);
  }
  function pointsFor(key) {
    return trend.map((d, i) => `${xFor(i)},${yFor(d[key])}`).join(' ');
  }

  if (!hasData) {
    return (
      <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>No violation activity yet</div>
        <div style={{ fontSize: 12 }}>New citations will appear here once enforcers issue them.</div>
      </div>
    );
  }

  const ticks = [0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f));

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block' }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={paddingLeft} x2={width - paddingRight} y1={yFor(t)} y2={yFor(t)} stroke="#E5E7EB" strokeWidth="1" />
            <text x={paddingLeft - 6} y={yFor(t) + 3} fontSize="9" fill="var(--text-secondary)" textAnchor="end">{t}</text>
          </g>
        ))}
        <polyline points={pointsFor('settled')} fill="none" stroke="#16A34A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={pointsFor('unsettled')} fill="none" stroke="#D97706" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {trend.map((d, i) => (
          <g key={d.date}>
            <circle cx={xFor(i)} cy={yFor(d.settled)} r="3.5" fill="#16A34A" stroke="#fff" strokeWidth="1.5" />
            <circle cx={xFor(i)} cy={yFor(d.unsettled)} r="3.5" fill="#D97706" stroke="#fff" strokeWidth="1.5" />
            <rect
              x={xFor(i) - (trend.length > 1 ? (width / trend.length / 2) : 30)} y={paddingTop}
              width={trend.length > 1 ? width / trend.length : 60} height={height - paddingTop - paddingBottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            <text x={xFor(i)} y={height - 8} fontSize="9" fill="var(--text-secondary)" textAnchor="middle">
              {new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}
            </text>
          </g>
        ))}
        <g transform={`translate(${width - 150}, 8)`}>
          <circle cx="0" cy="0" r="4" fill="#16A34A" />
          <text x="8" y="4" fontSize="11">Settled</text>
          <circle cx="70" cy="0" r="4" fill="#D97706" />
          <text x="78" y="4" fontSize="11">Unsettled</text>
        </g>
      </svg>
      {hover != null && trend[hover] && (
        <div style={{
          position: 'absolute', left: `min(max(${xFor(hover) / width * 100}%, 70px), calc(100% - 150px))`,
          top: 30, background: '#111827', color: '#fff', fontSize: 12,
          borderRadius: 8, padding: '8px 10px', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 700 }}>{new Date(trend[hover].date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          <div>🟢 Settled: {trend[hover].settled}</div>
          <div>🟠 Unsettled: {trend[hover].unsettled}</div>
        </div>
      )}
    </div>
  );
}
