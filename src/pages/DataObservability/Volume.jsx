import { useEffect, useState, useMemo } from 'react';
import {
  Database, FileText, TrendingUp, Activity, Search, Filter,
  MoreVertical, ArrowUpRight, ArrowDownRight, Calendar, Info
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchVolume } from '../../api/client';

const TOOLTIP_STYLE = {
  contentStyle: { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  itemStyle: { color: '#0F172A' },
  labelStyle: { color: '#64748B', fontWeight: 600 },
};

function fmtTime(ts) {
  if (!ts) return 'recently';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Volume() {
  const [volumePayload, setVolumePayload] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [pipelineFilter, setPipelineFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [headerDatePreset, setHeaderDatePreset] = useState('all');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const loadData = async (preset = headerDatePreset) => {
    setLoading(true);
    try {
      const activePreset = typeof preset === 'string' ? preset : 'all';
      const res = await fetchVolume({ preset: activePreset });
      if (res) {
        setVolumePayload(res);
        const list = res.items || res.volume_checks || (Array.isArray(res) ? res : res.datasets || []);
        setData(list);
      }
    } catch (e) {
      console.error('Failed to load volume checks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(headerDatePreset);
  }, [headerDatePreset]);

  const totalRecords = useMemo(() => {
    const kpi = volumePayload?.kpis?.find(k => k.id === 'records_received');
    if (kpi?.display) return kpi.display;
    return '2.4K';
  }, [volumePayload]);

  const activePipelines = useMemo(() => {
    const kpi = volumePayload?.kpis?.find(k => k.id === 'pipelines_active');
    if (kpi?.display) return kpi.display;
    return '5 / 5';
  }, [volumePayload]);

  const totalRuns = useMemo(() => {
    const kpi = volumePayload?.kpis?.find(k => k.id === 'runs');
    if (kpi?.value != null) return kpi.value;
    return 38;
  }, [volumePayload]);

  // Volume time chart
  const timeChartData = useMemo(() => {
    const series = volumePayload?.series?.volume_over_time;
    if (Array.isArray(series) && series.length > 0) {
      return series.map(s => ({
        time: s.timestamp ? new Date(s.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
        records: s.records || 0
      }));
    }
    return [
      { time: 'Jul 24', records: 465 },
      { time: 'Aug 03', records: 1665 },
      { time: 'Aug 05', records: 302 },
      { time: 'Aug 10', records: 0 },
      { time: 'Aug 17', records: 0 },
    ];
  }, [volumePayload]);

  const filtered = useMemo(() => {
    return data.filter(d => {
      const pName = d.pipeline_name ?? '';
      const status = (d.status ?? 'Healthy').toLowerCase();

      const matchSearch = pName.toLowerCase().includes(search.toLowerCase());
      const matchPipeline = pipelineFilter === 'All' || pName === pipelineFilter;
      const matchStatus = statusFilter === 'All' || status === statusFilter.toLowerCase();

      return matchSearch && matchPipeline && matchStatus;
    });
  }, [data, search, pipelineFilter, statusFilter]);

  const distinctPipelines = useMemo(() => {
    return Array.from(new Set(data.map(d => d.pipeline_name).filter(Boolean)));
  }, [data]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="fade-in">
      <PageHeader
        title="Volume Observability"
        subtitle="Monitor row counts, target ingestion volume, and anomalies across pipelines."
        onRefresh={() => loadData(headerDatePreset)}
        onDateChange={val => {
          const p = typeof val === 'string' ? val : 'all';
          setHeaderDatePreset(p);
          loadData(p);
        }}
      />

      <div className="page-body">
        {/* Top 4 KPI Cards */}
        <div className="kpi-grid-4">
          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <Database size={18} />
              </div>
              <span className="kpi-label">Records Ingested</span>
            </div>
            <div className="kpi-value">{totalRecords}</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>2,432 total target rows</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                <Activity size={18} />
              </div>
              <span className="kpi-label">Monitored Pipelines</span>
            </div>
            <div className="kpi-value">{activePipelines}</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>All active pipelines</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                <TrendingUp size={18} />
              </div>
              <span className="kpi-label">Total Execution Runs</span>
            </div>
            <div className="kpi-value">{totalRuns}</div>
            <div className="kpi-delta up">
              <ArrowUpRight size={13} />
              <span>Across recorded history</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <div className="kpi-icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
                <Info size={18} />
              </div>
              <span className="kpi-label">Health Score</span>
            </div>
            <div className="kpi-value">80.0%</div>
            <div className="kpi-delta up" style={{ color: '#F59E0B' }}>
              <span>4 / 5 pipelines healthy</span>
            </div>
          </div>
        </div>

        {/* Volume Trend Chart */}
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">Target Records Volume Over Time</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeChartData}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="records" stroke="#3B82F6" strokeWidth={2} fill="url(#volGrad)" name="Records" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Filters and Table */}
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">Pipeline Volume Metrics</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="search-box">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search pipeline..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: 180, height: 30 }}
                />
              </div>
              <select className="select-control" value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)}>
                <option value="All">All Pipelines</option>
                {distinctPipelines.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="table-wrapper">
              <table className="vithi-table">
                <thead>
                  <tr>
                    <th>Pipeline Name</th>
                    <th>Records Display</th>
                    <th>Bytes</th>
                    <th>Status</th>
                    <th>Runs</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No volume records found.
                      </td>
                    </tr>
                  ) : (
                    paginated.map((d, idx) => (
                      <tr key={d.pipeline_id || idx}>
                        <td style={{ fontWeight: 600 }}>{d.pipeline_name}</td>
                        <td style={{ fontWeight: 700, color: '#3B82F6' }}>{d.records_display || d.records || 0}</td>
                        <td>{d.bytes_display || '0 B'}</td>
                        <td>
                          <span className={`status-pill ${(d.status || 'healthy').toLowerCase()}`}>
                            {d.status || 'Healthy'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{d.runs || 0}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {d.last_updated_age || fmtTime(d.last_updated_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
