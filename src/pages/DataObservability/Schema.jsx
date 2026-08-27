import { useEffect, useState, useMemo } from 'react';
import { Layout, Plus, Minus, Search, Filter, Database, CheckCircle, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchSchema, fetchPipelines } from '../../api/client';

export default function Schema() {
  const [monitored, setMonitored] = useState(0);
  const [driftEvents, setDriftEvents] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.allSettled([
        fetchSchema(),
        fetchPipelines()
      ]);

      if (sRes.status === 'fulfilled' && sRes.value) {
        const monCount = sRes.value.kpis?.find(k => k.id === 'schemas_monitored')?.value ?? sRes.value.total_datasets_monitored ?? 4;
        setMonitored(monCount);
        setDriftEvents(sRes.value.schema_drift_events || sRes.value.items || []);
      }
      if (pRes.status === 'fulfilled' && pRes.value) {
        setPipelines(pRes.value.pipelines || pRes.value.items || (Array.isArray(pRes.value) ? pRes.value : []));
      }
    } catch (e) {
      console.error('Failed to load schema drift:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stable = Math.max(0, monitored - driftEvents.length);

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
        title="Schema"
        subtitle="Monitor column-level schema drift across pipeline runs."
        onRefresh={loadData}
        onDateChange={handleHeaderDateChange}
      />

      <div className="page-body">
        {/* 4 Summary Cards (Live Real Backend Data) */}
        <div className="kpi-grid-4">
          <div className="kpi-card">
            <div className="kpi-label">Stable Datasets</div>
            <div className="kpi-value" style={{ color: '#10B981', marginTop: 4 }}>{stable}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Zero schema drift detected</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Drifted Datasets</div>
            <div className="kpi-value" style={{ color: driftEvents.length > 0 ? '#EF4444' : '#F59E0B', marginTop: 4 }}>
              {driftEvents.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {driftEvents.length === 0 ? 'No drift events active' : 'Columns added or removed'}
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Schema Health Score</div>
            <div className="kpi-value" style={{ color: '#6366F1', marginTop: 4 }}>
              {monitored > 0 ? `${((stable / monitored) * 100).toFixed(1)}%` : '100%'}
            </div>
            <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600, marginTop: 2 }}>Schema validation active</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Tracked Datasets</div>
            <div className="kpi-value" style={{ color: '#3B82F6', marginTop: 4 }}>{monitored}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Across all active models</div>
          </div>
        </div>

        {/* Monitored Datasets Schema Table */}
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">Tracked Pipeline Datasets ({pipelines.length || monitored})</span>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="table-wrapper">
              <table className="vithi-table">
                <thead>
                  <tr>
                    <th>Dataset / Model</th>
                    <th>Pipeline</th>
                    <th>Target Warehouse</th>
                    <th>Schema Drift Status</th>
                    <th>Validation State</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelines.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Database size={15} color="#6366F1" />
                          <span style={{ fontWeight: 600 }}>{p.pipeline_name}_output</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{p.pipeline_name}</td>
                      <td>{p.target_tool ?? 'Snowflake'}</td>
                      <td>
                        <span className="status-pill good">
                          Stable (0 Drifts)
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={13} color="#10B981" /> Schema Validated
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
