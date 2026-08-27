import { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle, Clock, AlertTriangle, Search,
  Database, Info, RotateCcw, Tag, X, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchFreshness, fetchLogs } from '../../api/client';

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtLag(mins) {
  if (mins == null || mins === 0) return '0 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = Math.round(mins % 60);
  if (hrs < 24) return `${hrs}h ${remainingMins}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function getPipelineForAsset(item, runMap) {
  if (item.pipeline_name) return item.pipeline_name;
  if (item.run_id && runMap.has(String(item.run_id))) {
    return runMap.get(String(item.run_id));
  }
  const id = (item.dataset_id || item.object_name || '').toUpperCase();
  if (id.includes('ECOMMERCE') || id.includes('CLEAN_DATA') || id.includes('ORDER') || id.includes('CUSTOMER')) return 'ecommerce_etl';
  if (id.includes('HR_ANALYTICS') || id.includes('EMPLOYEE')) return 'hr_etl';
  if (id.includes('STOCK') || id.includes('ANALYTICS_DB')) return 'stock_etl';
  if (id.includes('METADATA') || id.includes('OBS_')) return 'metadata_etl';
  return 'data_pipeline';
}

export default function Freshness() {
  const [data, setData] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Top Filters
  const [search, setSearch] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState('All');
  const [datasetFilter, setDatasetFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [headerDatePreset, setHeaderDatePreset] = useState('all');
  const [customDateRange, setCustomDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fRes, lRes] = await Promise.allSettled([
        fetchFreshness({ preset: 'all' }),
        fetchLogs({ limit: 100 })
      ]);

      if (fRes.status === 'fulfilled' && fRes.value) {
        const list = fRes.value.items || fRes.value.freshness_checks || (Array.isArray(fRes.value) ? fRes.value : fRes.value.datasets || []);
        setData(list);
      }

      if (lRes.status === 'fulfilled' && lRes.value) {
        const logs = lRes.value.logs || lRes.value.items || (Array.isArray(lRes.value) ? lRes.value : []);
        setRuns(logs);
      }
    } catch (e) {
      console.error('Failed to load freshness data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map run_id to pipeline_name
  const runMap = useMemo(() => {
    const map = new Map();
    runs.forEach(r => {
      if (r.run_id && r.pipeline_name) {
        map.set(String(r.run_id), r.pipeline_name);
      }
    });
    return map;
  }, [runs]);

  // Enriched data with accurate pipeline names
  const enrichedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      computedPipeline: getPipelineForAsset(item, runMap)
    }));
  }, [data, runMap]);

  // Distinct pipelines (ONLY real pipeline names)
  const distinctPipelines = useMemo(() => {
    return Array.from(new Set(enrichedData.map(d => d.computedPipeline).filter(Boolean)));
  }, [enrichedData]);

  // Distinct datasets for dataset filter dropdown
  const distinctDatasets = useMemo(() => {
    return Array.from(new Set(enrichedData.map(d => d.dataset_id || d.object_name).filter(Boolean)));
  }, [enrichedData]);

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

  // Real-time filtering across search, pipeline, dataset, status, and date range
  const filtered = useMemo(() => {
    const latestTimestamp = enrichedData.length > 0
      ? Math.max(...enrichedData.map(d => new Date(d.observed_at || d.last_updated_at || d.last_updated || 0).getTime()).filter(t => !isNaN(t) && t > 0))
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

    return enrichedData.filter(d => {
      const dName = (d.dataset_id || d.object_name || '').toLowerCase();
      const pName = d.computedPipeline;
      const status = (d.sla_status || d.status || d.freshness_status || 'Stale').toLowerCase();
      const observedTime = d.observed_at || d.last_updated_at || d.last_updated;
      const t = observedTime ? new Date(observedTime).getTime() : 0;

      const matchSearch = !search || dName.includes(search.toLowerCase()) || pName.toLowerCase().includes(search.toLowerCase());
      const matchPipeline = pipelineFilter === 'All' || pName === pipelineFilter;
      const matchDataset = datasetFilter === 'All' || (d.dataset_id || d.object_name) === datasetFilter;
      const matchStatus = statusFilter === 'All' || status === statusFilter.toLowerCase();
      const matchHeaderDate = headerDatePreset === 'all' || !t || (t >= minTime && t <= maxTime);

      return matchSearch && matchPipeline && matchDataset && matchStatus && matchHeaderDate;
    });
  }, [enrichedData, search, pipelineFilter, datasetFilter, statusFilter, headerDatePreset, customDateRange]);

  // Recalculate KPIs based on filtered dataset
  const total = filtered.length;
  const fresh = filtered.filter(d => (d.sla_status || d.status || d.freshness_status || '').toLowerCase() === 'fresh').length;
  const delayed = filtered.filter(d => (d.sla_status || d.status || d.freshness_status || '').toLowerCase() === 'delayed').length;
  const stale = filtered.filter(d => (d.sla_status || d.status || d.freshness_status || '').toLowerCase() === 'stale').length || (total - fresh - delayed);

  const freshPct = total > 0 ? Math.round((fresh / total) * 100) : 0;
  const delayedPct = total > 0 ? Math.round((delayed / total) * 100) : 0;
  const stalePct = total > 0 ? Math.round((stale / total) * 100) : (total > 0 ? 100 : 0);

  const avgLagMins = total > 0 ? Math.round(filtered.reduce((s, d) => s + (Number(d.lag_minutes) || 0), 0) / total) : 0;

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const clearFilters = () => {
    setSearch('');
    setPipelineFilter('All');
    setDatasetFilter('All');
    setStatusFilter('All');
    setHeaderDatePreset('all');
    setCustomDateRange(null);
    setPage(1);
  };

  const hasActiveFilters = search || pipelineFilter !== 'All' || datasetFilter !== 'All' || statusFilter !== 'All' || headerDatePreset !== 'all';

  return (
    <div className="fade-in">
      <PageHeader
        title="Data Freshness"
        subtitle="Monitor how up-to-date your data is across all pipelines."
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
              placeholder="Search datasets, models..."
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
              {distinctPipelines.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="filter-select">
            <label>Dataset / Model</label>
            <select
              className="select-control"
              value={datasetFilter}
              onChange={e => { setDatasetFilter(e.target.value); setPage(1); }}
              style={{ maxWidth: 200 }}
            >
              <option value="All">All Datasets</option>
              {distinctDatasets.map(name => (
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
              <option value="Fresh">Fresh</option>
              <option value="Delayed">Delayed</option>
              <option value="Stale">Stale</option>
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

            {datasetFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Dataset: <strong>{datasetFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setDatasetFilter('All'); setPage(1); }} />
              </span>
            )}

            {statusFilter !== 'All' && (
              <span className="tool-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                Status: <strong>{statusFilter}</strong>
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setStatusFilter('All'); setPage(1); }} />
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

        {/* 2. DYNAMIC TOP 4 KPI CARDS (Placed directly below filters, 100% reactive) */}
        <div className="kpi-grid-4 mt-4">
          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                  <CheckCircle size={15} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Fresh</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>{freshPct}%</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{fresh}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Within SLA threshold</div>
            <div className="progress-track" style={{ marginTop: 10, height: 4 }}>
              <div className="progress-fill green" style={{ width: `${freshPct}%` }} />
            </div>
          </div>

          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
                  <Clock size={15} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Delayed</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>{delayedPct}%</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{delayed}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Approaching SLA limit</div>
            <div className="progress-track" style={{ marginTop: 10, height: 4 }}>
              <div className="progress-fill orange" style={{ width: `${delayedPct}%` }} />
            </div>
          </div>

          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                  <AlertTriangle size={15} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Stale</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>{stalePct}%</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{stale}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Outside SLA threshold</div>
            <div className="progress-track" style={{ marginTop: 10, height: 4 }}>
              <div className="progress-fill red" style={{ width: `${stalePct}%` }} />
            </div>
          </div>

          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}>
                  <Clock size={15} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Avg Lag</span>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{fmtLag(avgLagMins)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Across {total} matching assets</div>
            <div className="progress-track" style={{ marginTop: 10, height: 4 }}>
              <div className="progress-fill blue" style={{ width: `${Math.min(100, (freshPct + delayedPct))}%` }} />
            </div>
          </div>
        </div>

        {/* 3. TABLE OF DATASETS WITH FULL WORKING PAGINATION */}
        <div className="card mt-4">
          {loading && !data.length ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="card-header" style={{ marginBottom: 14 }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={16} color="#10B981" />
                  <span>Monitored Datasets Freshness</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} matching datasets
                </span>
              </div>

              <div className="table-wrapper">
                <table className="vithi-table">
                  <thead>
                    <tr>
                      <th>Dataset / Model</th>
                      <th>Pipeline</th>
                      <th>Status</th>
                      <th>Last Updated</th>
                      <th>Freshness Lag</th>
                      <th>SLA Target</th>
                      <th>Engine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                          No datasets match the active filter criteria.
                        </td>
                      </tr>
                    ) : (
                      paginated.map((item, idx) => {
                        const status = (item.sla_status || item.status || item.freshness_status || 'Stale').toLowerCase();
                        return (
                          <tr key={item.asset_id || item.id || item.dataset_id || idx}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  width: 24, height: 24, borderRadius: 6,
                                  background: 'var(--bg-card-subtle)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: status === 'fresh' ? '#10B981' : status === 'delayed' ? '#F59E0B' : '#EF4444',
                                  border: '1px solid var(--border)'
                                }}>
                                  <Database size={12} />
                                </div>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {item.pipeline_name || item.dataset_id || item.object_name || 'dataset'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
                                {item.pipeline_name || item.computedPipeline}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill ${status}`}>
                                {item.status || item.sla_status || 'Stale'}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>{item.last_updated_age || fmtTime(item.last_updated_at || item.last_updated)}</td>
                            <td style={{ fontSize: 12, fontWeight: 600, color: status === 'fresh' ? '#10B981' : status === 'delayed' ? '#F59E0B' : '#EF4444' }}>
                              {item.current_lag_display || (item.current_lag_hours ? `${Math.round(item.current_lag_hours)}h` : fmtLag(item.lag_minutes))}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {item.sla_hours ? `< ${item.sla_hours} hrs` : (item.sla_minutes ? `< ${item.sla_minutes} mins` : '< 24 hrs')}
                            </td>
                            <td>
                              <span className="tool-badge">
                                {item.etl_tool || item.source_tool || item.engine || 'dbt'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Full Working Pagination Bar (1, 2, 3, 4...) */}
              <div className="pagination-bar">
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1} to {Math.min(page * perPage, filtered.length)} of {filtered.length} datasets
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
      </div>
    </div>
  );
}
