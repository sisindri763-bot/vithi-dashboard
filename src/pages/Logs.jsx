import React, { useEffect, useState, useMemo } from 'react';
import {
  FileText, XCircle, CheckCircle, Clock, Search, Filter,
  Download, MoreVertical, Database, ArrowUpRight, ArrowDownRight,
  Columns, ChevronRight, ChevronDown, RefreshCw
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SparkLine from '../components/SparkLine';
import LoadingSpinner from '../components/LoadingSpinner';
import { fetchLogs } from '../api/client';

export default function Logs() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState(null);

  // Filters
  const [pipelineFilter, setPipelineFilter] = useState('All Pipelines');
  const [toolFilter, setToolFilter] = useState('All Tools');
  const [levelFilter, setLevelFilter] = useState('All Levels');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetchLogs({ preset: 'all', limit: 100 });
      if (res) {
        const list = res.items || res.logs || (Array.isArray(res) ? res : []);
        setLogs(list);
        setTotalCount(res.pagination?.total || list.length);
      }
    } catch (e) {
      console.error('Error fetching live logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Aggregated live KPIs
  const failedCount = useMemo(() => logs.filter(l => (l.status || '').toLowerCase() === 'failed').length, [logs]);
  const successCount = useMemo(() => logs.filter(l => (l.status || '').toLowerCase() === 'success').length, [logs]);
  const avgDuration = useMemo(() => {
    if (!logs.length) return '0s';
    const sum = logs.reduce((acc, l) => acc + (Number(l.duration_seconds) || 0), 0);
    return `${(sum / logs.length).toFixed(1)}s`;
  }, [logs]);

  // Distinct pipelines & tools for dropdowns
  const distinctPipelines = useMemo(() => Array.from(new Set(logs.map(l => l.pipeline_name).filter(Boolean))), [logs]);
  const distinctTools = useMemo(() => Array.from(new Set(logs.map(l => l.tool_name || l.source_tool).filter(Boolean))), [logs]);

  // Filtered log items
  const filtered = useMemo(() => {
    return logs.filter(l => {
      const pName = l.pipeline_name || '';
      const tool = l.tool_name || l.source_tool || '';
      const status = (l.status || '').toUpperCase();
      const msg = l.error_message || l.message || l.sql_query || '';

      const matchSearch = pName.toLowerCase().includes(search.toLowerCase()) ||
                          tool.toLowerCase().includes(search.toLowerCase()) ||
                          msg.toLowerCase().includes(search.toLowerCase()) ||
                          (l.run_id || '').toLowerCase().includes(search.toLowerCase());

      const matchPipeline = pipelineFilter === 'All Pipelines' || pName === pipelineFilter;
      const matchTool = toolFilter === 'All Tools' || tool.toLowerCase() === toolFilter.toLowerCase();
      const matchLevel = levelFilter === 'All Levels' || (levelFilter === 'ERROR' && status === 'FAILED') || (levelFilter === 'SUCCESS' && status === 'SUCCESS');

      return matchSearch && matchPipeline && matchTool && matchLevel;
    });
  }, [logs, search, pipelineFilter, toolFilter, levelFilter]);

  const paginated = useMemo(() => {
    return filtered.slice((page - 1) * perPage, page * perPage);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;

  const [headerDatePreset, setHeaderDatePreset] = useState('30d');
  const [customDateRange, setCustomDateRange] = useState(null);

  const handleHeaderDateChange = (val) => {
    if (typeof val === 'string') {
      setHeaderDatePreset(val);
      setCustomDateRange(null);
    } else if (val && val.start && val.end) {
      setHeaderDatePreset('custom');
      setCustomDateRange(val);
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Logs"
        subtitle="Searchable live execution logs and query traces from all pipeline runs."
        onRefresh={loadLogs}
        onDateChange={handleHeaderDateChange}
      />

      {loading && !logs.length ? (
        <LoadingSpinner />
      ) : (
        <div className="page-body">
          {/* 4 KPI Cards Directly From Live Data */}
          <div className="kpi-grid-4">
            <div className="kpi-card">
              <div className="kpi-card-header">
                <div className="kpi-icon" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                  <FileText size={18} />
                </div>
                <span className="kpi-label">Total Execution Logs</span>
              </div>
              <div className="kpi-value">{totalCount}</div>
              <div className="kpi-delta up">
                <ArrowUpRight size={12} />
                <span>Live backend logs</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <div className="kpi-icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
                  <XCircle size={18} />
                </div>
                <span className="kpi-label">Failed Logs</span>
              </div>
              <div className="kpi-value">{failedCount}</div>
              <div className="kpi-delta down">
                <ArrowUpRight size={12} />
                <span>Errors flagged</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <div className="kpi-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
                  <CheckCircle size={18} />
                </div>
                <span className="kpi-label">Success Logs</span>
              </div>
              <div className="kpi-value">{successCount}</div>
              <div className="kpi-delta up">
                <ArrowUpRight size={12} />
                <span>Healthy runs</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <div className="kpi-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                  <Clock size={18} />
                </div>
                <span className="kpi-label">Average Runtime</span>
              </div>
              <div className="kpi-value">{avgDuration}</div>
              <div className="kpi-delta up">
                <ArrowDownRight size={12} />
                <span>Across executions</span>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="filters-bar mt-4">
            <div className="filter-select">
              <label>Pipelines</label>
              <select className="select-control" value={pipelineFilter} onChange={e => { setPipelineFilter(e.target.value); setPage(1); }}>
                <option value="All Pipelines">All Pipelines</option>
                {distinctPipelines.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="filter-select">
              <label>Tool</label>
              <select className="select-control" value={toolFilter} onChange={e => { setToolFilter(e.target.value); setPage(1); }}>
                <option value="All Tools">All Tools</option>
                {distinctTools.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="filter-select">
              <label>Log Status</label>
              <select className="select-control" value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(1); }}>
                <option value="All Levels">All Levels</option>
                <option value="ERROR">Failed / Error</option>
                <option value="SUCCESS">Success</option>
              </select>
            </div>

            <div className="search-box" style={{ flex: 1, maxWidth: 300 }}>
              <Search size={13} />
              <input
                type="text"
                placeholder="Search pipeline, Run ID, or SQL query..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ width: '100%' }}
              />
            </div>

            <button className="clear-filters-btn" style={{ marginLeft: 'auto' }} onClick={() => {
              setPipelineFilter('All Pipelines');
              setToolFilter('All Tools');
              setLevelFilter('All Levels');
              setSearch('');
              setPage(1);
            }}>
              Reset
            </button>
          </div>

          {/* Logs Table Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Live Execution Logs ({filtered.length})</span>
              <button className="header-btn" style={{ height: 30, fontSize: 11 }} onClick={() => window.print()}>
                <Download size={12} /> Download Logs
              </button>
            </div>

            <div className="table-wrapper">
              <table className="vithi-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Timestamp</th>
                    <th>Pipeline Name</th>
                    <th>Run ID</th>
                    <th>Status</th>
                    <th>Tool</th>
                    <th>Message / SQL Details</th>
                    <th>Duration</th>
                    <th style={{ textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(l => {
                    const isExpanded = expandedLogId === l.run_id;
                    const status = (l.status || 'success').toLowerCase();
                    const isFailed = status === 'failed';

                    return (
                      <React.Fragment key={l.run_id || Math.random()}>
                        <tr
                          style={{ cursor: 'pointer', background: isExpanded ? 'rgba(16, 185, 129, 0.04)' : undefined }}
                          onClick={() => setExpandedLogId(isExpanded ? null : l.run_id)}
                        >
                          <td style={{ width: 24, paddingLeft: 10 }}>
                            {isExpanded ? <ChevronDown size={14} color="#10B981" /> : <ChevronRight size={14} color="#94A3B8" />}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {l.start_time ? new Date(l.start_time).toLocaleString() : 'Aug 17, 2026'}
                          </td>
                          <td style={{ fontWeight: 600 }}>{l.pipeline_name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366F1' }}>
                            {l.run_id ? `run_${l.run_id}` : 'run_auto'}
                          </td>
                          <td>
                            <span className={`status-pill ${isFailed ? 'failed' : 'success'}`}>
                              {l.status}
                            </span>
                          </td>
                          <td>
                            <div className="tool-badge">
                              <Database size={13} color="#10B981" />
                              <span>{l.tool_name || l.source_tool || 'dbt'}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.error_message || l.sql_query || (isFailed ? 'Task execution failed' : 'Pipeline executed successfully')}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {l.duration_seconds != null ? `${l.duration_seconds}s` : '0s'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="icon-btn" style={{ width: 28, height: 28 }}>
                              <MoreVertical size={13} />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={9} style={{ background: '#F8FAFC', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                                <div><strong>Run ID:</strong> {l.run_id}</div>
                                {l.error_message && (
                                  <div style={{ color: '#EF4444' }}>
                                    <strong>Error Trace:</strong> {l.error_message}
                                  </div>
                                )}
                                {l.sql_query && (
                                  <pre style={{ background: '#0F172A', color: '#38BDF8', padding: 10, borderRadius: 6, fontSize: 11, overflowX: 'auto' }}>
                                    {l.sql_query}
                                  </pre>
                                )}
                                {l.rows_affected != null && (
                                  <div><strong>Rows Affected:</strong> {l.rows_affected}</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <span>Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filtered.length)} of {filtered.length} logs</span>
              <div className="pagination-pages">
                <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                  <button
                    key={pNum}
                    className={`pagination-btn ${page === pNum ? 'active' : ''}`}
                    onClick={() => setPage(pNum)}
                  >
                    {pNum}
                  </button>
                ))}
                <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
