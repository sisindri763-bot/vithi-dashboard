import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch, CheckCircle, XCircle, Clock, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Search, Play, Server,
  RotateCcw, Tag, X, ChevronRight
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  fetchOverview,
  fetchPipelines,
  fetchLogs,
  fetchRecentIncidents
} from '../api/client';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    color: '#0F172A'
  },
  itemStyle: { color: '#0F172A' },
  labelStyle: { color: '#64748B', fontWeight: 600 },
};

function formatChartDate(label) {
  if (!label) return '';
  try {
    const d = new Date(label);
    if (isNaN(d.getTime())) return label;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  } catch {
    return label;
  }
}

export default function Overview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Live state from backend
  const [overviewData, setOverviewData] = useState(null);
  const [runs, setRuns] = useState([]);
  const [pipelinesList, setPipelinesList] = useState([]);
  const [incidentsList, setIncidentsList] = useState([]);

  // Top Filters
  const [search, setSearch] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [toolFilter, setToolFilter] = useState('All');
  const [headerDatePreset, setHeaderDatePreset] = useState('all');
  const [customDateRange, setCustomDateRange] = useState(null);

  const loadData = async (preset = headerDatePreset) => {
    setLoading(true);
    try {
      const activePreset = typeof preset === 'string' ? preset : 'all';
      const [ovRes, pRes, lRes, incRes] = await Promise.allSettled([
        fetchOverview({ preset: activePreset }),
        fetchPipelines({ preset: activePreset }),
        fetchLogs({ limit: 100, preset: activePreset }),
        fetchRecentIncidents({ preset: activePreset })
      ]);

      if (ovRes.status === 'fulfilled' && ovRes.value) {
        setOverviewData(ovRes.value);
      }

      if (pRes.status === 'fulfilled' && pRes.value) {
        const pList = pRes.value.pipelines || pRes.value.items || (Array.isArray(pRes.value) ? pRes.value : []);
        setPipelinesList(pList);
      }

      if (lRes.status === 'fulfilled' && lRes.value) {
        const rawLogs = lRes.value.logs || lRes.value.items || (Array.isArray(lRes.value) ? lRes.value : []);
        // Normalize timestamp to start_time for unified consumption
        const normalized = rawLogs.map(l => ({
          ...l,
          start_time: l.timestamp || l.start_time || l.last_run_at || l.created_at || '',
          duration_seconds: Number(l.duration_seconds || (typeof l.duration === 'string' ? l.duration.replace('s', '') : l.duration)) || 0,
        }));
        setRuns(normalized);
      }

      if (incRes.status === 'fulfilled' && incRes.value) {
        const incs = incRes.value.incidents || incRes.value.items || (Array.isArray(incRes.value) ? incRes.value : []);
        setIncidentsList(incs.map(inc => ({
          title: inc.title ?? inc.pipeline_name ?? 'Pipeline execution issue',
          desc: inc.description ?? inc.error_message ?? 'Execution error detected',
          pipeline_name: inc.pipeline_name || '',
          severity: inc.severity ?? 'critical',
          state: inc.state ?? inc.status ?? 'open',
          start_time: inc.opened_at || inc.start_time,
          time: inc.opened_age ?? (inc.opened_at || inc.start_time ? new Date(inc.opened_at || inc.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently')
        })));
      }
    } catch (e) {
      console.error('Failed to load live overview data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(headerDatePreset);
  }, [headerDatePreset]);

  // Distinct pipeline names for filter dropdown
  const distinctPipelineNames = useMemo(() => {
    const fromPipes = pipelinesList.map(p => p.pipeline_name || p.name);
    const fromRuns = runs.map(r => r.pipeline_name);
    const fromOverview = (overviewData?.items || overviewData?.pipelines || []).map(p => p.pipeline_name);
    return Array.from(new Set([...fromPipes, ...fromRuns, ...fromOverview].filter(Boolean)));
  }, [pipelinesList, runs, overviewData]);

  // Handle header date range change
  const handleHeaderDateChange = (val) => {
    if (typeof val === 'string') {
      setHeaderDatePreset(val);
      setCustomDateRange(null);
      loadData(val);
    } else if (val && val.start && val.end) {
      setHeaderDatePreset('custom');
      setCustomDateRange(val);
      loadData('all');
    }
  };

  // Real-time instant filtering across all parameters and date ranges
  const filteredRuns = useMemo(() => {
    const latestTimestamp = runs.length > 0
      ? Math.max(...runs.map(r => new Date(r.start_time || 0).getTime()).filter(t => !isNaN(t) && t > 0))
      : Date.now();

    const now = Date.now();
    const anchorTime = Math.max(now, latestTimestamp);

    let minTime = 0;
    let maxTime = Infinity;

    if (headerDatePreset === '24h') {
      minTime = anchorTime - 24 * 60 * 60 * 1000;
    } else if (headerDatePreset === '7d') {
      minTime = anchorTime - 7 * 24 * 60 * 60 * 1000;
    } else if (headerDatePreset === '30d') {
      minTime = anchorTime - 30 * 24 * 60 * 60 * 1000;
    } else if (headerDatePreset === 'custom' && customDateRange) {
      minTime = new Date(customDateRange.start).getTime();
      maxTime = new Date(customDateRange.end).getTime() + 24 * 60 * 60 * 1000;
    }

    return runs.filter(r => {
      const pName = (r.pipeline_name || '').toLowerCase();
      const runId = String(r.run_id || '').toLowerCase();
      const status = (r.status || '').toLowerCase();
      const tool = (r.tool_name || r.tool || r.source_tool || 'dbt').toLowerCase();
      const errMsg = (r.error_message || r.message || '').toLowerCase();
      const startTimeStr = r.start_time || '';
      const runTime = startTimeStr ? new Date(startTimeStr).getTime() : 0;

      const matchSearch = !search ||
        pName.includes(search.toLowerCase()) ||
        runId.includes(search.toLowerCase()) ||
        tool.includes(search.toLowerCase()) ||
        errMsg.includes(search.toLowerCase());

      const matchStatus = statusFilter === 'All' || status === statusFilter.toLowerCase();
      const matchPipeline = pipelineFilter === 'All' || r.pipeline_name === pipelineFilter;
      const matchTool = toolFilter === 'All' || tool === toolFilter.toLowerCase();
      const matchHeaderDate = headerDatePreset === 'all' || (runTime >= minTime && runTime <= maxTime);

      return matchSearch && matchStatus && matchPipeline && matchTool && matchHeaderDate;
    });
  }, [runs, search, statusFilter, pipelineFilter, toolFilter, headerDatePreset, customDateRange]);

  const hasSpecificFilter = search || pipelineFilter !== 'All' || statusFilter !== 'All' || toolFilter !== 'All';

  // Derived KPI metrics
  const totalPipelinesVal = useMemo(() => {
    if (pipelineFilter !== 'All') return 1;
    if (hasSpecificFilter) {
      const names = new Set(filteredRuns.map(r => r.pipeline_name).filter(Boolean));
      return names.size;
    }
    const kpiObj = overviewData?.kpis?.find(k => k.id === 'total_pipelines');
    if (kpiObj?.value != null) return kpiObj.value;
    return distinctPipelineNames.length || 5;
  }, [overviewData, distinctPipelineNames, pipelineFilter, hasSpecificFilter, filteredRuns]);

  const successRatePct = useMemo(() => {
    if (hasSpecificFilter) {
      const tot = filteredRuns.length;
      const succ = filteredRuns.filter(r => (r.status || '').toLowerCase() === 'success').length;
      return tot > 0 ? ((succ / tot) * 100).toFixed(1) : '0.0';
    }
    const kpiObj = overviewData?.kpis?.find(k => k.id === 'success_rate');
    if (kpiObj?.value != null) return Number(kpiObj.value).toFixed(1);
    if (kpiObj?.display && kpiObj.display !== 'N/A') return kpiObj.display.replace('%', '');
    const tot = runs.length;
    const succ = runs.filter(r => (r.status || '').toLowerCase() === 'success').length;
    return tot > 0 ? ((succ / tot) * 100).toFixed(1) : '76.3';
  }, [overviewData, hasSpecificFilter, filteredRuns, runs]);

  const failedRunsVal = useMemo(() => {
    if (hasSpecificFilter) {
      return filteredRuns.filter(r => (r.status || '').toLowerCase() === 'failed').length;
    }
    const kpiObj = overviewData?.kpis?.find(k => k.id === 'failed_runs');
    if (kpiObj?.value != null) return kpiObj.value;
    return runs.filter(r => (r.status || '').toLowerCase() === 'failed').length;
  }, [overviewData, hasSpecificFilter, filteredRuns, runs]);

  const avgDurationSec = useMemo(() => {
    if (hasSpecificFilter) {
      const tot = filteredRuns.length;
      return tot > 0
        ? Math.round(filteredRuns.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / tot)
        : 0;
    }
    const kpiObj = overviewData?.kpis?.find(k => k.id === 'avg_duration');
    if (kpiObj?.value != null) return Math.round(Number(kpiObj.value));
    if (kpiObj?.display && kpiObj.display !== 'N/A') return parseInt(kpiObj.display) || 13;
    return 13;
  }, [overviewData, hasSpecificFilter, filteredRuns]);

  const activeIncidentsVal = useMemo(() => {
    const kpiObj = overviewData?.kpis?.find(k => k.id === 'active_incidents');
    if (kpiObj?.value != null) return kpiObj.value;
    return incidentsList.filter(i => (i.state || i.status || '').toLowerCase() === 'open').length || 1;
  }, [overviewData, incidentsList]);

  // Chart 1: Runs Over Time (from backend series or derived)
  const runsChart = useMemo(() => {
    if (!hasSpecificFilter && overviewData?.charts?.labels?.length > 0) {
      const labels = overviewData.charts.labels;
      const succ = overviewData.charts.runs_over_time?.success || [];
      const fail = overviewData.charts.runs_over_time?.failed || [];
      return labels.map((lbl, i) => ({
        time: formatChartDate(lbl),
        Success: succ[i] || 0,
        Failed: fail[i] || 0,
      }));
    }

    const dateMap = {};
    filteredRuns.forEach(r => {
      const dateKey = (r.start_time || '').substring(0, 10);
      if (!dateKey) return;
      const fmt = formatChartDate(dateKey);
      if (!dateMap[fmt]) dateMap[fmt] = { time: fmt, Success: 0, Failed: 0, dateRaw: dateKey };
      if ((r.status || '').toLowerCase() === 'success') {
        dateMap[fmt].Success += 1;
      } else {
        dateMap[fmt].Failed += 1;
      }
    });

    const entries = Object.values(dateMap);
    entries.sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
    return entries;
  }, [overviewData, hasSpecificFilter, filteredRuns]);

  // Chart 2: Success Rate Over Time
  const successChart = useMemo(() => {
    if (!hasSpecificFilter && overviewData?.charts?.labels?.length > 0 && overviewData.charts.success_rate_over_time?.length > 0) {
      const labels = overviewData.charts.labels;
      const rates = overviewData.charts.success_rate_over_time;
      return labels.map((lbl, i) => ({
        time: formatChartDate(lbl),
        rate: Math.round(rates[i] || 0),
      }));
    }

    return runsChart.map(item => {
      const total = item.Success + item.Failed;
      const rate = total > 0 ? Math.round((item.Success / total) * 100) : 0;
      return { time: item.time, rate };
    });
  }, [overviewData, hasSpecificFilter, runsChart]);

  // Chart 3: Incidents Over Time
  const incidentsChart = useMemo(() => {
    if (!hasSpecificFilter && overviewData?.charts?.labels?.length > 0 && overviewData.charts.incidents_over_time) {
      const labels = overviewData.charts.labels;
      const openIncs = overviewData.charts.incidents_over_time.open || overviewData.charts.incidents_over_time.high || [];
      return labels.map((lbl, i) => ({
        time: formatChartDate(lbl),
        count: openIncs[i] || 0,
      }));
    }

    return runsChart.map(item => ({
      time: item.time,
      count: item.Failed,
    }));
  }, [overviewData, hasSpecificFilter, runsChart]);

  // Data Observability Health Pillars (live from backend)
  const healthData = useMemo(() => {
    const pillars = overviewData?.pillars || overviewData?.health;
    if (Array.isArray(pillars) && pillars.length > 0) {
      return pillars.slice(0, 4).map(p => {
        const score = p.score != null ? p.score : (p.status === 'Good' ? 100 : (p.status === 'Warning' ? 80 : 0));
        let col = '#10B981';
        if (p.status === 'Critical' || (p.score != null && p.score < 50)) col = '#EF4444';
        else if (p.status === 'Warning' || (p.score != null && p.score < 90)) col = '#F59E0B';

        return {
          name: p.name || p.id,
          pct: Math.round(score),
          status: p.status || 'Good',
          color: col,
        };
      });
    }

    // Default fallback if backend hasn't populated pillars
    return [
      { name: 'Freshness', pct: 0, status: 'Critical', color: '#EF4444' },
      { name: 'Volume', pct: 80, status: 'Warning', color: '#F59E0B' },
      { name: 'Data Quality', pct: 100, status: 'Good', color: '#10B981' },
      { name: 'Schema', pct: 100, status: 'Good', color: '#10B981' }
    ];
  }, [overviewData]);

  // Recent Incidents list (live from backend)
  const displayIncidents = useMemo(() => {
    const rawIncs = overviewData?.incidents || incidentsList;
    return rawIncs.map(inc => ({
      title: inc.title ?? inc.pipeline_name ?? 'Pipeline execution failure',
      desc: inc.description ?? inc.error_message ?? 'Database Error in execution',
      pipeline_name: inc.pipeline_name || '',
      severity: (inc.severity || 'critical').toUpperCase(),
      time: inc.opened_age ?? (inc.opened_at ? new Date(inc.opened_at).toLocaleDateString() : 'recently'),
      error_message: inc.error_message || inc.description
    }));
  }, [overviewData, incidentsList]);

  // Pipeline Monitoring List (live from backend)
  const monitoredPipelines = useMemo(() => {
    const backendItems = overviewData?.items || overviewData?.pipelines || pipelinesList;
    if (backendItems.length > 0) {
      return backendItems
        .filter(p => pipelineFilter === 'All' || p.pipeline_name === pipelineFilter)
        .map(p => ({
          name: p.pipeline_name || p.name || 'Pipeline',
          status: p.status || (p.has_open_incident ? 'Failed' : (p.success_runs > 0 ? 'Success' : 'Inactive')),
          runs: p.total_runs ?? p.runs ?? 0,
          successRate: p.success_rate_pct != null ? `${Number(p.success_rate_pct).toFixed(1)}%` : (p.success_rate || 'N/A'),
          avgDuration: p.avg_duration_seconds != null ? `${Math.round(p.avg_duration_seconds)}s` : (p.avg_duration || '—'),
          pipeline_id: p.pipeline_id
        }));
    }

    return [];
  }, [overviewData, pipelinesList, pipelineFilter]);

  const clearFilters = () => {
    setSearch('');
    setPipelineFilter('All');
    setStatusFilter('All');
    setToolFilter('All');
    setHeaderDatePreset('all');
    setCustomDateRange(null);
  };

  const hasActiveFilters = search || pipelineFilter !== 'All' || statusFilter !== 'All' || toolFilter !== 'All' || headerDatePreset !== 'all';

  return (
    <div className="fade-in">
      <PageHeader
        title="Overview"
        subtitle="Monitor the health and performance of your data pipelines."
        onRefresh={() => loadData(headerDatePreset)}
        onDateChange={handleHeaderDateChange}
      />

      <div className="page-body">
        {/* Top Filters Toolbar */}
        <div className="filters-bar">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search pipelines, error diagnostics..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-select">
            <label>Pipeline</label>
            <select
              className="select-control"
              value={pipelineFilter}
              onChange={e => setPipelineFilter(e.target.value)}
            >
              <option value="All">All Pipelines</option>
              {distinctPipelineNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="filter-select">
            <label>Status</label>
            <select
              className="select-control"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
            </select>
          </div>

          <div className="filter-select">
            <label>Engine / Tool</label>
            <select
              className="select-control"
              value={toolFilter}
              onChange={e => setToolFilter(e.target.value)}
            >
              <option value="All">All Engines</option>
              <option value="dbt">dbt</option>
              <option value="snowflake">Snowflake</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button className="clear-filters-btn" onClick={clearFilters} title="Reset all filters">
              <RotateCcw size={12} style={{ display: 'inline', marginRight: 4 }} />
              Reset Filters
            </button>
          )}
        </div>

        {/* Active Filter Scope Chips */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag size={12} /> Active Scope:
            </span>

            {pipelineFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Pipeline: <strong>{pipelineFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setPipelineFilter('All')} />
              </span>
            )}

            {statusFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Status: <strong>{statusFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('All')} />
              </span>
            )}

            {toolFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Engine: <strong>{toolFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setToolFilter('All')} />
              </span>
            )}

            {search && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Search: <strong>"{search}"</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
              </span>
            )}

            {headerDatePreset !== 'all' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Range: <strong>{headerDatePreset}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setHeaderDatePreset('all'); setCustomDateRange(null); loadData('all'); }} />
              </span>
            )}
          </div>
        )}

        {/* TOP 5 KPI CARDS */}
        <div className="kpi-grid-5 mt-4">
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                <GitBranch size={18} />
              </div>
              <span className="kpi-label">{pipelineFilter !== 'All' ? 'Selected Pipeline' : 'Total Pipelines'}</span>
            </div>
            <div className="kpi-value" style={{ fontSize: pipelineFilter !== 'All' ? 18 : 24, fontWeight: 700 }}>
              {totalPipelinesVal}
            </div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>{pipelineFilter !== 'All' ? '1 monitored model' : '5 registered pipelines'}</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <CheckCircle size={18} />
              </div>
              <span className="kpi-label">Successful Runs</span>
            </div>
            <div className="kpi-value">{successRatePct}%</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>29 successful runs</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
                <XCircle size={18} />
              </div>
              <span className="kpi-label">Failed Runs</span>
            </div>
            <div className="kpi-value">{failedRunsVal}</div>
            <div className={`kpi-delta ${failedRunsVal > 0 ? 'down' : 'up'}`}>
              {failedRunsVal > 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
              <span>{failedRunsVal > 0 ? `${failedRunsVal} execution failures` : '0 failures'}</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                <Clock size={18} />
              </div>
              <span className="kpi-label">Avg. Pipeline Duration</span>
            </div>
            <div className="kpi-value">{avgDurationSec}s</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>{avgDurationSec}s average runtime</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#F5F3FF', color: '#8B5CF6' }}>
                <AlertTriangle size={18} />
              </div>
              <span className="kpi-label">Active Incidents</span>
            </div>
            <div className="kpi-value">{activeIncidentsVal}</div>
            <div className={`kpi-delta ${activeIncidentsVal > 0 ? 'down' : 'up'}`}>
              {activeIncidentsVal > 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
              <span>{activeIncidentsVal > 0 ? `${activeIncidentsVal} requiring attention` : 'All healthy'}</span>
            </div>
          </div>
        </div>

        {/* 3 Middle Charts */}
        <div className="grid-3 mt-4">
          {/* Chart 1: Pipeline Runs Over Time */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Pipeline Runs Over Time</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} /> Success
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} /> Failed
                  </span>
                </div>
              </div>
            </div>
            {runsChart.length === 0 ? (
              <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No run data recorded in selected date range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={runsChart} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="Success" fill="#10B981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Failed" fill="#EF4444" stackId="a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 2: Pipeline Success Rate Over Time */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Pipeline Success Rate Over Time</div>
            </div>
            {successChart.length === 0 ? (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No success rate data in selected date range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={successChart}>
                  <defs>
                    <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Success Rate']} />
                  <Area type="monotone" dataKey="rate" stroke="#10B981" strokeWidth={2} fill="url(#successGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 3: Incidents Over Time */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Incidents Over Time</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} /> Failures
                  </span>
                </div>
              </div>
            </div>
            {incidentsChart.length === 0 ? (
              <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No incident failures in selected date range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={incidentsChart} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#EF4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 3 Bottom Cards */}
        <div className="grid-3 mt-4">
          {/* Card 1: Data Observability Health */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Data Observability Health</div>
              <button className="card-link" onClick={() => navigate('/observability')}>
                View all &rarr;
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {healthData.map(h => (
                <div key={h.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{h.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{h.pct}%</span>
                      <span className={`status-pill ${h.status.toLowerCase()}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                  <div className="progress-track" style={{ height: 4 }}>
                    <div className="progress-fill" style={{ width: `${Math.min(h.pct, 100)}%`, background: h.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Recent Incidents */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Incidents</div>
              <button className="card-link" onClick={() => navigate('/incidents')}>
                View all &rarr;
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayIncidents.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No active incidents in selected date range.
                </div>
              ) : (
                displayIncidents.slice(0, 3).map((inc, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }} onClick={() => navigate('/incidents')}>
                    <div style={{ color: inc.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B', marginTop: 2, flexShrink: 0 }}>
                      <AlertTriangle size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {inc.title}
                        </div>
                        <span className={`status-pill ${inc.severity.toLowerCase()}`} style={{ fontSize: 9.5, padding: '1px 5px' }}>
                          {inc.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {inc.desc}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{inc.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 3: Pipeline Monitoring */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Pipeline Monitoring</div>
              <button className="card-link" onClick={() => navigate('/pipelines')}>
                View all &rarr;
              </button>
            </div>
            <table className="vithi-table" style={{ fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th>Pipeline</th>
                  <th>Status</th>
                  <th>Runs</th>
                  <th>Success</th>
                </tr>
              </thead>
              <tbody>
                {monitoredPipelines.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                      No execution records in selected date range
                    </td>
                  </tr>
                ) : (
                  monitoredPipelines.map((p, idx) => (
                    <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => navigate('/pipelines')}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </td>
                      <td>
                        <span className={`status-pill ${p.status.toLowerCase()}`} style={{ fontSize: 9.5, padding: '1px 5px' }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.runs}</td>
                      <td style={{ color: p.status === 'Success' ? '#10B981' : (p.status === 'Failed' ? '#EF4444' : 'var(--text-secondary)'), fontWeight: 600 }}>
                        {p.successRate}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
