import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus, LayoutGrid, AlertCircle } from "lucide-react";

const RATING_META = {
  Excellent:         { color: "#10B981", bg: "rgba(16, 185, 129, 0.12)", ring: "#10B981" },
  Good:              { color: "#F59E0B", bg: "rgba(245, 158, 11, 0.12)", ring: "#F59E0B" },
  "Needs Attention": { color: "#F97316", bg: "rgba(249, 115, 22, 0.12)", ring: "#F97316" },
  Critical:          { color: "#EF4444", bg: "rgba(239, 68, 68, 0.12)",  ring: "#EF4444" },
};

function ScoreRing({ percentage, rating, size = 72 }) {
  const meta = RATING_META[rating] || RATING_META.Critical;
  const r    = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (percentage / 100);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={meta.ring} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fill={meta.color} fontSize={size * 0.2} fontWeight="700" fontFamily="Outfit, sans-serif">
        {percentage}%
      </text>
    </svg>
  );
}

function StatChip({ label, value, highlight, large }) {
  return (
    <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center",
      padding: large ? "0.6rem 0.4rem" : "0.45rem 0.3rem", borderRadius:8, background:"rgba(0,0,0,0.035)" }}>
      <span style={{ fontSize: large ? "1.1rem" : "0.95rem", fontWeight:700, color: highlight || "var(--text-primary)",
        lineHeight:1, marginBottom:"0.2rem" }}>{value ?? "—"}</span>
      <span style={{ fontSize: large ? "0.68rem" : "0.62rem", color:"var(--text-muted)", textAlign:"center",
        lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", width:"100%" }}>
        {label}
      </span>
    </div>
  );
}

function BrandCard({ client, scoreData, loading, onView, large }) {
  const meta = scoreData ? (RATING_META[scoreData.rating] || RATING_META.Critical) : null;
  const totalJobs  = scoreData?.jobsList?.length ?? "—";
  const closedJobs = scoreData?.jobsList
    ? scoreData.jobsList.filter(j => { const s=(j.status||"").toLowerCase().trim(); return s==="closed"||s==="completed"; }).length
    : "—";
  const pendingJobs = (typeof totalJobs==="number" && typeof closedJobs==="number") ? totalJobs - closedJobs : "—";
  const onTimePct   = scoreData?.metrics?.p2?.onTimeRate != null ? `${Math.round(scoreData.metrics.p2.onTimeRate)}%` : "—";
  const attendPct   = scoreData?.metrics?.p1?.attendanceRate  != null ? `${Math.round(scoreData.metrics.p1.attendanceRate)}%`  : "—";
  const ringSize    = large ? 88 : 72;

  return (
    <div className="overview-card" onClick={onView} style={{ 
      "--card-accent": meta?.color || "#94a3b8",
      padding: large ? "1.75rem 1.5rem" : "1.25rem"
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.75rem", marginBottom: large ? "1.2rem" : "0.9rem" }}>
        <div style={{ minWidth:0 }}>
          <h3 style={{ fontSize: large ? "1.15rem" : "0.95rem", fontWeight:700, margin:0, whiteSpace:"nowrap",
            overflow:"hidden", textOverflow:"ellipsis", color:"var(--text-primary)" }}>
            {client.label}
          </h3>
          {scoreData && (
            <span style={{ display:"inline-block", marginTop:"0.35rem", fontSize: large ? "0.72rem" : "0.68rem", fontWeight:700,
              color:meta?.color, background:meta?.bg, padding:"2px 8px", borderRadius:99,
              letterSpacing:"0.04em", textTransform:"uppercase" }}>
              {scoreData.rating}
            </span>
          )}
        </div>
        {loading ? (
          <RefreshCw size={large ? 38 : 32} className="spin" style={{ color:"var(--text-muted)", flexShrink:0 }} />
        ) : scoreData ? (
          <ScoreRing percentage={scoreData.scores.percentage} rating={scoreData.rating} size={ringSize} />
        ) : (
          <div style={{ width:ringSize, height:ringSize, borderRadius:"50%", background:"rgba(0,0,0,0.05)",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <AlertCircle size={large ? 26 : 22} style={{ color:"var(--text-muted)" }} />
          </div>
        )}
      </div>

      <div style={{ height:1, background:"var(--card-border)", marginBottom: large ? "1rem" : "0.75rem" }} />

      {scoreData ? (
        <div style={{ display:"flex", gap: large ? "0.45rem" : "0.35rem" }}>
          <StatChip label="Total Jobs" value={totalJobs} large={large} />
          <StatChip label="Pending" value={pendingJobs} large={large}
            highlight={typeof pendingJobs==="number" && pendingJobs>0 ? "#F97316" : undefined} />
          <StatChip label="On-time" value={onTimePct} highlight={meta?.color} large={large} />
          <StatChip label="Attendance" value={attendPct} large={large} />
        </div>
      ) : loading ? (
        <div style={{ height: large ? 52 : 40, background:"rgba(0,0,0,0.04)", borderRadius:8 }} />
      ) : (
        <div style={{ height: large ? 52 : 40, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>Click to load score</span>
        </div>
      )}

      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3,
        borderRadius:"0 0 12px 12px", background: meta?.color || "transparent",
        opacity: scoreData ? 1 : 0, transition:"opacity 0.3s" }} />
    </div>
  );
}

export default function OverviewDashboard({ clients, loadStatus, month, year, onSelectClient, clientScores, onBatchLoad }) {
  const [loadingKeys, setLoadingKeys] = useState(new Set());
  const [hasLoaded,   setHasLoaded]   = useState(false);
  const [filterRating, setFilterRating] = useState('All');

  const triggerBatchLoad = useCallback(async () => {
    if (!clients.length) return;
    setLoadingKeys(new Set(clients.map(c => c.key)));
    setHasLoaded(false);
    await onBatchLoad(clients, (key) => {
      setLoadingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    });
    setHasLoaded(true);
  }, [clients, onBatchLoad]);

  useEffect(() => {
    if (clients.length > 0 && !hasLoaded) {
      const missing = clients.some(c => !clientScores[`${c.key}__${month}__${year}`]);
      if (missing) triggerBatchLoad();
      else setHasLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const totalBrands  = clients.length;
  const loadedScores = clients.filter(c => clientScores[`${c.key}__${month}__${year}`]);
  const excellent    = loadedScores.filter(c => clientScores[`${c.key}__${month}__${year}`]?.rating === "Excellent").length;
  const good         = loadedScores.filter(c => clientScores[`${c.key}__${month}__${year}`]?.rating === "Good").length;
  const needsAttn    = loadedScores.filter(c => clientScores[`${c.key}__${month}__${year}`]?.rating === "Needs Attention").length;
  const critical     = loadedScores.filter(c => clientScores[`${c.key}__${month}__${year}`]?.rating === "Critical").length;

  const avgScore     = loadedScores.length
    ? Math.round(loadedScores.reduce((s,c) => s + (clientScores[`${c.key}__${month}__${year}`]?.scores?.percentage || 0), 0) / loadedScores.length)
    : null;
  const isAnyLoading = loadingKeys.size > 0;

  const ratingFilters = [
    { label: "All", value: "All", bgColor: "var(--accent-primary)", count: totalBrands },
    { label: "Excellent", value: "Excellent", bgColor: "#10B981", count: excellent },
    { label: "Good", value: "Good", bgColor: "#F59E0B", count: good },
    { label: "Needs Attention", value: "Needs Attention", bgColor: "#F97316", count: needsAttn },
    { label: "Critical", value: "Critical", bgColor: "#EF4444", count: critical },
  ];

  const filteredClients = clients.filter(c => {
    if (filterRating === 'All') return true;
    const scoreEntry = clientScores[`${c.key}__${month}__${year}`];
    return scoreEntry?.rating === filterRating;
  });

  return (
    <div className="overview-dashboard">
      <div className="overview-header" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize:"1.4rem", fontWeight:800, margin:0, color:"var(--text-primary)", display:"flex", alignItems:"center", gap:"0.5rem" }}>
            <LayoutGrid size={22} style={{ color:"var(--accent-primary)" }} />
            All Brands
          </h1>
          <p style={{ margin:"0.2rem 0 0.75rem", fontSize:"0.82rem", color:"var(--text-muted)" }}>
            {clients.length} brand{clients.length!==1?"s":""} across all teams
          </p>

          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            {ratingFilters.map(f => {
              const isActive = filterRating === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilterRating(f.value)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    padding: "0.35rem 0.75rem",
                    borderRadius: 99,
                    background: isActive ? f.bgColor : "rgba(0,0,0,0.035)",
                    color: isActive ? "#ffffff" : "var(--text-secondary)",
                    border: isActive ? `1px solid ${f.bgColor}` : "1px solid var(--card-border)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span>{f.label}</span>
                  <span style={{
                    fontSize: "0.65rem",
                    background: isActive ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.06)",
                    color: isActive ? "#ffffff" : "var(--text-muted)",
                    padding: "1px 6px",
                    borderRadius: 99,
                  }}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display:"flex", gap:"0.6rem", flexWrap:"wrap", alignItems:"center" }}>
          {avgScore != null && (
            <div className="overview-pill" style={{ "--pill-color":"#3b82f6" }}>
              <Minus size={12} /> Avg {avgScore}%
            </div>
          )}
          <button className="overview-refresh-btn" onClick={triggerBatchLoad}
            disabled={isAnyLoading || loadStatus==="loading"} title="Reload all brand scores">
            <RefreshCw size={14} className={isAnyLoading ? "spin" : ""} />
            {isAnyLoading ? `Loading ${loadingKeys.size}…` : "Refresh All"}
          </button>
        </div>
      </div>

      {loadStatus === "loading" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:"1rem", padding:"3rem" }}>
          <RefreshCw size={40} className="spin" style={{ color:"var(--accent-primary)" }} />
          <p style={{ color:"var(--text-secondary)" }}>Loading brand list…</p>
        </div>
      )}

      {loadStatus === "loaded" && (() => {
        const displayClients = filteredClients;
        const isLarge = displayClients.length <= 4;
        let gridStyle = {};
        if (displayClients.length <= 2) {
          gridStyle = { gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "1.75rem" };
        } else if (displayClients.length <= 4) {
          gridStyle = { gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" };
        }

        return (
          <div className="overview-grid" style={gridStyle}>
            {displayClients.map(client => {
              const cacheKey  = `${client.key}__${month}__${year}`;
              const scoreEntry = clientScores[cacheKey];
              const isLoading  = loadingKeys.has(client.key);
              return (
                <BrandCard key={client.key} client={client}
                  scoreData={scoreEntry ? { ...scoreEntry } : null}
                  loading={isLoading}
                  onView={() => onSelectClient(client.key)}
                  large={isLarge} />
              );
            })}
          </div>
        );
      })()}

      {loadStatus === "loaded" && clients.length === 0 && (
        <div style={{ textAlign:"center", padding:"3rem", color:"var(--text-muted)" }}>
          <LayoutGrid size={48} style={{ opacity:0.3, marginBottom:"1rem" }} />
          <p>No brands configured. Add a team in Manage Teams.</p>
        </div>
      )}
    </div>
  );
}
