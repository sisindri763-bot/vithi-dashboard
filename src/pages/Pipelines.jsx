import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch, CheckCircle, AlertCircle, Clock,
  ArrowUpRight, ArrowDownRight, Search, Play, Eye,
  Server, ChevronLeft, ChevronRight, X, Terminal, AlertTriangle,
  RotateCcw, Tag
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SparkLine from '../components/SparkLine';
import LoadingSpinner from '../components/LoadingSpinner';
import { fetchPipelines, fetchLogs } from '../api/client';

const fmtDuration = (sec) => {
  if (!sec && sec !== 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
};

const fmtDate = (str) => {
  if (!str) return 'recently';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return str;
  }
};

export default function Pipelines() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [pipelinesList, setPipelinesList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected run for detail modal
  const [selectedRun, setSelectedRun] = useState(null);

  // Real-time Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [pipelineFilter, setPipelineFilter] = useState('All');
  const [toolFilter, setToolFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');
  const [headerDatePreset, setHeaderDatePreset] = useState('all');
  const [customDateRange, setCustomDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const loadData = async (preset = headerDatePreset) => {
    setLoading(true);
    try {
      const activePreset = typeof preset === 'string' ? preset : 'all';
      const [pRes, lRes] = await Promise.allSettled([
        fetchPipelines({ preset: activePreset }),
        fetchLogs({ limit: 100, preset: activePreset }),
      ]);

      if (pRes.status === 'fulfilled' && pRes.value) {
        const list = pRes.value.pipelines || pRes.value.items || (Array.isArray(pRes.value) ? pRes.value : []);
        setPipelinesList(list);
      }

      if (lRes.status === 'fulfilled' && lRes.value) {
        const rawLogs = lRes.value.logs || lRes.value.items || (Array.isArray(lRes.value) ? lRes.value : []);
        const normalized = rawLogs.map(l => ({
          ...l,
          start_time: l.timestamp || l.start_time || l.last_run_at || l.created_at || '',
          duration_seconds: Number(l.duration_seconds || (typeof l.duration === 'string' ? l.duration.replace('s', '') : l.duration)) || 0,
          tool_name: l.tool || l.tool_name || l.source_tool || 'dbt',
        }));
        setRuns(normalized);
      }
    } catch (e) {
      console.error('Failed to load pipelines & runs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(headerDatePreset);
  }, [headerDatePreset]);

  // Distinct pipeline names for filter dropdown
  const distinctPipelineNames = useMemo(() => {
    return Array.from(new Set([
      ...pipelinesList.map(p => p.pipeline_name || p.name),
      ...runs.map(r => r.pipeline_name)
    ].filter(Boolean)));
  }, [pipelinesList, runs]);

  // Distinct dates for filter dropdown
  const distinctDates = useMemo(() => {
    return Array.from(new Set(runs.map(r => (r.start_time || '').substring(0, 10)).filter(Boolean))).sort().reverse();
  }, [runs]);

  // Handle header date range change
  const handleHeaderDateChange = (val) => {
    if (typeof val === 'string') {
      setHeaderDatePreset(val);
      setCustomDateRange(null);
    } else if (val && val.start && val.end) {
      setHeaderDatePreset('custom');
      setCustomDateRange(val);
    }
    setPage(1);
  };

  // Real-time instant filtering across all parameters and date ranges
  const filtered = useMemo(() => {
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
      const tool = (r.tool_name || r.source_tool || 'dbt').toLowerCase();
      const errMsg = (r.error_message || '').toLowerCase();
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
      const matchDropdownDate = dateFilter === 'All' || startTimeStr.startsWith(dateFilter);
      const matchHeaderDate = headerDatePreset === 'all' || (runTime >= minTime && runTime <= maxTime);

      return matchSearch && matchStatus && matchPipeline && matchTool && matchDropdownDate && matchHeaderDate;
    });
  }, [runs, search, statusFilter, pipelineFilter, toolFilter, dateFilter, headerDatePreset, customDateRange]);

  // Distinct unique pipeline models matching active filter
  const filteredUniquePipelinesCount = useMemo(() => {
    const names = new Set(filtered.map(r => r.pipeline_name).filter(Boolean));
    return names.size;
  }, [filtered]);

  // Total unique pipeline count in system
  const totalUniquePipelinesInSystem = useMemo(() => {
    const names = new Set(runs.map(r => r.pipeline_name).filter(Boolean));
    return names.size || 3;
  }, [runs]);

  // KPI Calculations strictly derived from filtered dataset
  const totalRuns = filtered.length;
  const successfulRuns = filtered.filter(r => (r.status || '').toLowerCase() === 'success').length;
  const failedRuns = filtered.filter(r => (r.status || '').toLowerCase() === 'failed').length;
  const successRatePct = totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : '0.0';

  const avgDurationSec = totalRuns > 0
    ? Math.round(filtered.reduce((sum, r) => sum + (Number(r.duration || r.duration_seconds) || 0), 0) / totalRuns)
    : 0;

  // Sparkline data arrays for filtered subset
  const sparkSuccess = useMemo(() => filtered.map(r => ((r.status || '').toLowerCase() === 'success' ? 100 : 0)), [filtered]);
  const sparkFailed = useMemo(() => filtered.map(r => ((r.status || '').toLowerCase() === 'failed' ? 100 : 0)), [filtered]);
  const sparkDuration = useMemo(() => filtered.map(r => Number(r.duration || r.duration_seconds) || 0), [filtered]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setPipelineFilter('All');
    setToolFilter('All');
    setDateFilter('All');
    setHeaderDatePreset('all');
    setCustomDateRange(null);
    setPage(1);
  };

  const hasActiveFilters = search || statusFilter !== 'All' || pipelineFilter !== 'All' || toolFilter !== 'All' || dateFilter !== 'All' || headerDatePreset !== 'all';

  // Pagination logic
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  return (
    <div className="fade-in">
      <PageHeader
        title="Pipelines"
        subtitle="Complete live execution history, health metrics and run logs across all pipelines."
        onRefresh={loadData}
        onDateChange={handleHeaderDateChange}
      />

      <div className="page-body">
        {/* 1. TOP FILTERS TOOLBAR (Placed at the very top of the page body) */}
        <div className="filters-bar">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search run ID, pipeline name, error..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <div className="filter-select">
            <label>Pipeline</label>
            <select
              className="select-control"
              value={pipelineFilter}
              onChange={e => { setPipelineFilter(e.target.value); setPage(1); }}
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
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Statuses</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
            </select>
          </div>

          <div className="filter-select">
            <label>Execution Date</label>
            <select
              className="select-control"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Dates</option>
              {distinctDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="filter-select">
            <label>Engine / Tool</label>
            <select
              className="select-control"
              value={toolFilter}
              onChange={e => { setToolFilter(e.target.value); setPage(1); }}
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

        {/* Active Filter Chips Bar */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag size={12} /> Active Scope:
            </span>

            {pipelineFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Pipeline: <strong>{pipelineFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setPipelineFilter('All'); setPage(1); }} />
              </span>
            )}

            {statusFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Status: <strong>{statusFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setStatusFilter('All'); setPage(1); }} />
              </span>
            )}

            {dateFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Date: <strong>{dateFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setDateFilter('All'); setPage(1); }} />
              </span>
            )}

            {toolFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Engine: <strong>{toolFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setToolFilter('All'); setPage(1); }} />
              </span>
            )}

            {search && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Search: <strong>"{search}"</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setSearch(''); setPage(1); }} />
              </span>
            )}

            {headerDatePreset !== 'all' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Range: <strong>{headerDatePreset}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setHeaderDatePreset('all'); setCustomDateRange(null); setPage(1); }} />
              </span>
            )}
          </div>
        )}

        {/* 2. DYNAMIC KPI METRICS CARDS (Directly below the top filter bar, 100% reactive to filter selection) */}
        <div className="kpi-grid-5 mt-4">
          {/* Card 1: Pipeline / Scope */}
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                <GitBranch size={18} />
              </div>
              <span className="kpi-label">
                {pipelineFilter !== 'All' ? 'Selected Pipeline' : 'Unique Pipelines'}
              </span>
            </div>
            <div className="kpi-value" style={{ fontSize: pipelineFilter !== 'All' ? 18 : 24, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pipelineFilter !== 'All' ? pipelineFilter : filteredUniquePipelinesCount}
            </div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>
                {pipelineFilter !== 'All'
                  ? `1 specific pipeline in focus`
                  : (hasActiveFilters ? `${filteredUniquePipelinesCount} of ${totalUniquePipelinesInSystem} pipelines` : `${totalUniquePipelinesInSystem} unique models`)}
              </span>
            </div>
          </div>

          {/* Card 2: Success Rate */}
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <CheckCircle size={18} />
              </div>
              <span className="kpi-label">Success Rate</span>
            </div>
            <div className="kpi-value">{successRatePct}%</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>{successfulRuns}/{totalRuns} runs passed</span>
            </div>
          </div>

          {/* Card 3: Total Execution Runs */}
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                <Play size={18} />
              </div>
              <span className="kpi-label">Total Execution Runs</span>
            </div>
            <div className="kpi-value">{totalRuns}</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>
                {pipelineFilter !== 'All'
                  ? `${totalRuns} runs for ${pipelineFilter}`
                  : (hasActiveFilters ? `${totalRuns} matching active filter` : `${runs.length} all recorded runs`)}
              </span>
            </div>
          </div>

          {/* Card 4: Failed Runs */}
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
                <AlertCircle size={18} />
              </div>
              <span className="kpi-label">Failed Runs</span>
            </div>
            <div className="kpi-value">{failedRuns}</div>
            <div className={`kpi-delta ${failedRuns > 0 ? 'down' : 'up'}`}>
              {failedRuns > 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
              <span>{failedRuns > 0 ? `${failedRuns} execution failures` : '0 failures'}</span>
            </div>
          </div>

          {/* Card 5: Avg Duration */}
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
                <Clock size={18} />
              </div>
              <span className="kpi-label">Avg. Duration</span>
            </div>
            <div className="kpi-value">{fmtDuration(avgDurationSec)}</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>{totalRuns > 0 ? `${avgDurationSec}s average runtime` : 'No runs in scope'}</span>
            </div>
          </div>
        </div>

        {/* 3. UNIFIED TABLE (Directly below the KPI cards) */}
        <div className="card mt-4">
          {loading && !runs.length ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="card-header" style={{ marginBottom: 14 }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Play size={16} color="#10B981" />
                  <span>Pipeline Execution Runs History</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} matching runs ({runs.length} total)
                </span>
              </div>

              <div className="table-wrapper">
                <table className="vithi-table">
                  <thead>
                    <tr>
                      <th>Run ID</th>
                      <th>Pipeline Name</th>
                      <th>Status</th>
                      <th>Execution Timestamp</th>
                      <th>Duration</th>
                      <th>Engine / Trigger</th>
                      <th>Error Diagnostic</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                          No execution records match the active filter criteria.
                        </td>
                      </tr>
                    ) : (
                      paginated.map((r, idx) => {
                        const isFailed = (r.status || '').toLowerCase() === 'failed';

                        return (
                          <tr
                            key={r.run_id || idx}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedRun(r)}
                          >
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#3B82F6' }}>
                              #{r.run_id}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  width: 24, height: 24, borderRadius: 6,
                                  background: 'var(--bg-card-subtle)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: isFailed ? '#EF4444' : '#10B981', border: '1px solid var(--border)'
                                }}>
                                  <Server size={12} />
                                </div>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {r.pipeline_name}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={`status-pill ${isFailed ? 'failed' : 'success'}`}>
                                {isFailed ? 'Failed' : 'Success'}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{fmtDate(r.start_time)}</div>
                            </td>
                            <td style={{ fontSize: 12, fontWeight: 500 }}>
                              {r.duration ? `${r.duration}s` : `${r.duration_seconds || 12}s`}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="tool-badge">
                                  {r.tool_name || 'dbt'}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                  ({r.triggered_by || 'cloud'})
                                </span>
                              </div>
                            </td>
                            <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.error_message ? (
                                <span style={{ color: '#EF4444', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <AlertTriangle size={13} /> {r.error_message.substring(0, 50)}...
                                </span>
                              ) : (
                                <span style={{ color: '#10B981', fontSize: 11.5 }}>
                                  Completed successfully
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <button
                                className="header-btn"
                                style={{ padding: '3px 8px', fontSize: 11.5 }}
                                onClick={() => setSelectedRun(r)}
                              >
                                <Eye size={12} />
                                <span>Inspect</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Working Pagination: Pages 1, 2, 3, 4... */}
              <div className="pagination-bar">
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1} to {Math.min(page * perPage, filtered.length)} of {filtered.length} runs
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select
                    className="select-control"
                    value={perPage}
                    onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                    style={{ fontSize: 11.5, padding: '3px 8px' }}
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                  </select>

                  <div className="pagination-pages">
                    <button
                      className="pagination-btn"
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      title="Previous Page"
                    >
                      <ChevronLeft size={13} />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                      <button
                        key={pNum}
                        className={`pagination-btn ${pNum === page ? 'active' : ''}`}
                        onClick={() => setPage(pNum)}
                      >
                        {pNum}
                      </button>
                    ))}

                    <button
                      className="pagination-btn"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      title="Next Page"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal: Execution Run Details & Log Trace */}
        {selectedRun && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 20
          }} onClick={() => setSelectedRun(null)}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, width: '100%', maxWidth: 640,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)', padding: 24,
              maxHeight: '90vh', overflowY: 'auto'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Terminal size={18} color="#10B981" />
                    <span>Run Details #{selectedRun.run_id}</span>
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Pipeline: <strong>{selectedRun.pipeline_name}</strong>
                  </div>
                </div>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => setSelectedRun(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 16 }}>
                <div style={{ background: 'var(--bg-card-subtle)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Status</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`status-pill ${(selectedRun.status || 'info').toLowerCase()}`}>
                      {selectedRun.status}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card-subtle)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Duration</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                    {selectedRun.duration ? `${selectedRun.duration}s` : '12s'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card-subtle)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Execution Timestamp</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4 }}>
                    {fmtDate(selectedRun.start_time)}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card-subtle)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Triggered By</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4 }}>
                    {selectedRun.triggered_by || 'dbt-cloud'} ({selectedRun.tool_name || 'dbt'})
                  </div>
                </div>
              </div>

              {selectedRun.error_message && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={14} /> Error Diagnostic & SQL Trace
                  </div>
                  <pre style={{
                    background: '#0F172A', color: '#F87171', padding: '12px 14px',
                    borderRadius: 8, fontSize: 11.5, lineHeight: 1.4,
                    overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace'
                  }}>
                    {selectedRun.error_message}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  className="header-btn"
                  onClick={() => { setSelectedRun(null); navigate('/logs'); }}
                >
                  <Eye size={13} />
                  <span>Open Full System Logs</span>
                </button>
                <button
                  className="export-btn"
                  onClick={() => setSelectedRun(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
