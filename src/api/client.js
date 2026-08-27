import axios from 'axios';

export const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('API_BASE_URL');
    if (saved && !saved.includes('vithi-observability') && !saved.includes('mc-dashboard')) {
      return saved;
    }
    // Clean up stale or legacy URL from localStorage
    localStorage.setItem('API_BASE_URL', 'https://etl-pipeline-lemon.vercel.app');
  }
  return import.meta.env.VITE_API_BASE_URL || 'https://etl-pipeline-lemon.vercel.app';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl();
  return config;
});

// Helper for resilient GET requests (tries primary path then fallback path if 404)
const safeGet = async (path, fallbackPath, params = {}) => {
  try {
    const res = await api.get(path, { params });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 404 && fallbackPath) {
      const resFallback = await api.get(fallbackPath, { params });
      return resFallback.data;
    }
    throw err;
  }
};

// ── Health & Filters ──────────────────────────────────────────────────────────
export const fetchApiHealth = () => safeGet('/api/v1/health', '/health');
export const fetchFilters = (params = {}) => safeGet('/api/v1/filters', null, params);

// ── Overview ────────────────────────────────────────────────────────────────
export const fetchOverview = (params = {}) =>
  safeGet('/api/v1/overview', '/api/overview', params);

export const fetchOverviewKPIs = (params = {}) =>
  safeGet('/api/v1/overview/kpis', '/api/overview/kpis', params);

export const fetchOverviewCharts = (params = {}) =>
  safeGet('/api/v1/overview/charts', '/api/overview/charts', params);

export const fetchOverviewHealth = (params = {}) =>
  safeGet('/api/v1/overview/health', '/api/overview/health', params);

export const fetchRecentIncidents = (params = {}) =>
  safeGet('/api/v1/overview/recent-incidents', '/api/overview/recent-incidents', params);

export const fetchPipelineMonitoring = (params = {}) =>
  safeGet('/api/v1/overview/pipelines', '/api/overview/pipeline-monitoring', params);

// ── Pipelines ────────────────────────────────────────────────────────────────
export const fetchPipelines = (params = {}) =>
  safeGet('/api/v1/pipelines', '/api/pipelines', params);

export const fetchPipelinesCatalog = (params = {}) =>
  safeGet('/api/v1/pipelines/catalog', null, params);

export const fetchPipelineDetail = (pid) =>
  safeGet(`/api/v1/pipelines/${pid}`);

export const fetchPipelineRuns = (pid, params = {}) =>
  safeGet(`/api/v1/pipelines/${pid}/runs`, `/api/pipelines/${pid}/runs`, params);

export const fetchPipelineTemplates = () =>
  safeGet('/v1/pipelines/templates');

export const createPipeline = (body) =>
  api.post('/v1/pipelines', body).then((res) => res.data);

export const triggerSync = (body = {}) =>
  api.post('/v1/sync', body).then((res) => res.data);

// ── Data Observability ───────────────────────────────────────────────────────
export const fetchFreshness = (params = {}) =>
  safeGet('/api/v1/observability/freshness', '/api/observability/freshness', params);

export const fetchVolume = (params = {}) =>
  safeGet('/api/v1/observability/volume', '/api/observability/volume', params);

export const fetchSchema = (params = {}) =>
  safeGet('/api/v1/observability/schema', '/api/observability/schema', params);

export const fetchDataQuality = (params = {}) =>
  safeGet('/api/v1/observability/quality', '/api/observability/data-quality', params);

export const fetchMetrics = (params = {}) =>
  safeGet('/api/v1/metrics', '/api/observability/metrics', params);

// ── Lineage ──────────────────────────────────────────────────────────────────
export const fetchLineage = (params = {}) =>
  safeGet('/api/v1/lineage', '/api/lineage', params);

export const fetchLineageDetail = (pid) =>
  safeGet(`/api/v1/lineage/${pid}`);

// ── Incidents ────────────────────────────────────────────────────────────────
export const fetchIncidents = (params = {}) =>
  safeGet('/api/v1/incidents', '/api/incidents', params);

export const fetchIncidentDetail = (incidentId) =>
  safeGet(`/api/v1/incidents/${incidentId}`);

// ── Logs ─────────────────────────────────────────────────────────────────────
export const fetchLogs = (params = {}) =>
  safeGet('/api/v1/logs', '/api/logs', params);

export const fetchRunDetail = (runId) =>
  safeGet(`/api/v1/runs/${runId}`, `/api/runs/${runId}`);

// ── Alerts ───────────────────────────────────────────────────────────────────
export const fetchAlerts = (params = {}) =>
  safeGet('/api/v1/alerts', '/api/alerts', params).catch(() => ({ items: [] }));

// ── Convenience aliases ───────────────────────────────────────────────────────
export const fetchHealth = fetchOverviewHealth;

export default api;
