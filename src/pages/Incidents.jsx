import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info, Search, Filter, MoreVertical, ArrowUpRight, X, Terminal, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { fetchIncidents } from '../api/client';

function fmtTime(ts) {
  if (!ts) return 'recently';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [openCount, setOpenCount] = useState(1);
  const [resolvedCount, setResolvedCount] = useState(1);
  const [criticalCount, setCriticalCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);

  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [headerDatePreset, setHeaderDatePreset] = useState('all');

  const loadData = async (preset = headerDatePreset) => {
    setLoading(true);
    try {
      const activePreset = typeof preset === 'string' ? preset : 'all';
      const res = await fetchIncidents({ preset: activePreset });
      if (res) {
        const incList = res.items || res.incidents || (Array.isArray(res) ? res : []);
        setIncidents(incList);
        
        const openKpi = res.kpis?.find(k => k.id === 'open')?.value;
        const resKpi = res.kpis?.find(k => k.id === 'resolved')?.value;
        const critKpi = res.kpis?.find(k => k.id === 'critical')?.value;

        setOpenCount(openKpi ?? incList.filter(i => (i.state || i.status || '').toLowerCase() === 'open').length);
        setResolvedCount(resKpi ?? incList.filter(i => (i.state || i.status || '').toLowerCase() === 'resolved').length);
        setCriticalCount(critKpi ?? incList.filter(i => (i.severity || '').toLowerCase() === 'critical').length);
      }
    } catch (e) {
      console.error('Failed to load incidents:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(headerDatePreset);
  }, [headerDatePreset]);

  const filtered = useMemo(() => {
    return incidents.filter(inc => {
      const title = inc.title ?? inc.pipeline_name ?? '';
      const desc = inc.description ?? inc.error_message ?? '';
      const pName = inc.pipeline_name ?? '';
      const sev = inc.severity ?? 'Critical';
      const status = inc.status ?? inc.state ?? 'open';

      const matchSearch = title.toLowerCase().includes(search.toLowerCase()) ||
                          desc.toLowerCase().includes(search.toLowerCase()) ||
                          pName.toLowerCase().includes(search.toLowerCase());
      const matchSev = sevFilter === 'All' || sev.toLowerCase() === sevFilter.toLowerCase();
      const matchStatus = statusFilter === 'All' || status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchSev && matchStatus;
    });
  }, [incidents, search, sevFilter, statusFilter]);

  const handleHeaderDateChange = (val) => {
    if (typeof val === 'string') {
      setHeaderDatePreset(val);
      loadData(val);
    } else {
      setHeaderDatePreset('all');
      loadData('all');
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Incidents"
        subtitle="Track and triage all data pipeline execution failures and compilation issues."
        onRefresh={() => loadData(headerDatePreset)}
        onDateChange={handleHeaderDateChange}
      />

      <div className="page-body">
        {/* Top 4 KPI Cards */}
        <div className="kpi-grid-4">
          <div className="kpi-card">
            <div className="kpi-label">Active Open Incidents</div>
            <div className="kpi-value" style={{ color: '#EF4444', marginTop: 4 }}>{openCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Requiring immediate triage</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Critical Severity</div>
            <div className="kpi-value" style={{ color: '#EF4444', marginTop: 4 }}>{criticalCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Pipeline runtime aborts</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Resolved Incidents</div>
            <div className="kpi-value" style={{ color: '#10B981', marginTop: 4 }}>{resolvedCount}</div>
            <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600, marginTop: 2 }}>Successfully recovered</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Monitored Incidents</div>
            <div className="kpi-value" style={{ color: '#6366F1', marginTop: 4 }}>{incidents.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Across all historical runs</div>
          </div>
        </div>

        {/* Incidents Table Card */}
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">Live Pipeline Incidents ({filtered.length})</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="search-box">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search error or pipeline..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: 220, height: 30 }}
                />
              </div>
              <select className="select-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="All">All Status</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
              <select className="select-control" value={sevFilter} onChange={e => setSevFilter(e.target.value)}>
                <option value="All">All Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
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
                    <th>Incident</th>
                    <th>Pipeline</th>
                    <th>Failed Node / Error Diagnostics</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Opened / Resolved</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                        No incidents match your filter scope.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((inc, idx) => {
                      const isResolved = (inc.status || inc.state || '').toLowerCase() === 'resolved';
                      return (
                        <tr key={inc.incident_id || inc.id || idx}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isResolved ? (
                                <CheckCircle2 size={15} color="#10B981" />
                              ) : (
                                <AlertTriangle size={15} color="#EF4444" />
                              )}
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {inc.title ?? `${inc.pipeline_name} failure`}
                              </span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{inc.pipeline_name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inc.failed_node ? `${inc.failed_node}: ` : ''}{inc.error_message || inc.description || 'Database execution failure'}
                          </td>
                          <td>
                            <span className={`status-pill ${(inc.severity || 'critical').toLowerCase()}`}>
                              {(inc.severity || 'Critical').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill ${isResolved ? 'good' : 'bad'}`}>
                              {isResolved ? 'Resolved' : 'Open'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {inc.opened_age || fmtTime(inc.opened_at || inc.start_time)}
                          </td>
                          <td>
                            <button
                              className="export-btn"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => setSelectedIncident(inc)}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Incident Detail Modal */}
        {selectedIncident && (
          <div className="modal-backdrop" onClick={() => setSelectedIncident(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} color="#EF4444" />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedIncident.title}</span>
                </div>
                <button className="icon-btn" onClick={() => setSelectedIncident(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="grid-2">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pipeline</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedIncident.pipeline_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Severity / Status</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <span className={`status-pill ${(selectedIncident.severity || 'critical').toLowerCase()}`}>{selectedIncident.severity}</span>
                      <span className={`status-pill ${(selectedIncident.status || 'open').toLowerCase() === 'resolved' ? 'good' : 'bad'}`}>{selectedIncident.status}</span>
                    </div>
                  </div>
                </div>

                {selectedIncident.failed_node && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>Failed dbt Node</div>
                    <code style={{ background: 'var(--bg-card-subtle)', padding: '3px 8px', borderRadius: 4, fontSize: 12 }}>
                      {selectedIncident.failed_node}
                    </code>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Error Trace & Stack</div>
                  <pre style={{
                    background: '#0F172A',
                    color: '#F87171',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 11.5,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace'
                  }}>
                    {selectedIncident.error_message || selectedIncident.description}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
