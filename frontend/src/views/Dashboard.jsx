import React, { useEffect, useState } from 'react';
import { Box, FileText, PlusCircle } from 'lucide-react';
import { formatDateTime, formatPeriodDate } from '../utils/helpers';

export function Dashboard({ request, setRoute }) {
  const [metrics, setMetrics] = useState(null);
  const [latest, setLatest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    request('/dashboard')
      .then((data) => {
        if (!active) return;
        setMetrics(data.metrics || null);
        setLatest(data.latest_tomas || []);
        setError('');
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'No se pudo cargar el dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  const cards = [
    ['Productos', metrics?.productos || 0],
    ['Tomas abiertas', metrics?.tomas_abiertas || 0],
    ['Conteos finalizados', metrics?.conteos_finalizados || 0],
    ['Usuarios activos', metrics?.usuarios || 0]
  ];
  const tomasTotal = Math.max(1, (metrics?.tomas_abiertas || 0) + (metrics?.tomas_finalizadas || 0));
  const conteosTotal = Math.max(1, (metrics?.conteos_finalizados || 0) + (metrics?.conteos_borrador || 0));
  const tomasPercent = Math.round(((metrics?.tomas_finalizadas || 0) / tomasTotal) * 100);
  const conteosPercent = Math.round(((metrics?.conteos_finalizados || 0) / conteosTotal) * 100);

  return (
    <div className="dashboard-view compact-dashboard">
      <section className="grid metrics">
        {cards.map(([label, value]) => (
          <article className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="dashboard-widgets">
        <DonutCard
          title="Estado de tomas"
          percent={tomasPercent}
          color="#15803d"
          rows={[
            ['Finalizadas', metrics?.tomas_finalizadas || 0, '#15803d'],
            ['Abiertas', metrics?.tomas_abiertas || 0, '#eab308']
          ]}
        />
        <DonutCard
          title="Avance de conteos"
          percent={conteosPercent}
          color="#2563a7"
          rows={[
            ['Finalizados', metrics?.conteos_finalizados || 0, '#15803d'],
            ['Borradores', metrics?.conteos_borrador || 0, '#eab308']
          ]}
        />
        <article className="widget trend-widget">
          <h3>Tendencia de conteos</h3>
          <div className="trend-bars">
            <strong>{metrics?.conteos_finalizados || 0}</strong>
            <div className="trend-bar" style={{ height: `${Math.max(34, (metrics?.conteos_finalizados || 1) * 10)}px` }} />
            <span>{new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' })}</span>
          </div>
        </article>
      </section>

      <div className="quick-actions dashboard-tabs">
        <button className="primary" type="button" onClick={() => setRoute?.('conteo_borradores')}>
          <PlusCircle size={16} />
          Crear toma
        </button>
        <button className="outline-action" type="button" onClick={() => setRoute?.('productos')}>
          <Box size={16} />
          Productos
        </button>
        <button className="link-action" type="button" onClick={() => setRoute?.('conteos')}>
          <FileText size={16} />
          Reportes
        </button>
      </div>

      <section className="panel latest-panel dashboard-latest-panel">
        <h3>Ultimas tomas fisicas</h3>
        {error ? <p className="dashboard-error">{error}</p> : null}
        {loading ? (
          <p className="dashboard-empty">Cargando tomas...</p>
        ) : (
          <div className="table-wrap dashboard-table-wrap">
            <table className="dashboard-tomas-table">
              <thead>
                <tr>
                  <th>Toma fisica</th>
                  <th>Usuarios</th>
                  <th>Estado</th>
                  <th>Creacion</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                {latest.length ? (
                  latest.map((toma) => (
                    <tr key={toma.id || toma.numero_toma}>
                      <td>
                        <TomaSummary toma={toma} />
                      </td>
                      <td>{`${Number(toma.usuarios_finalizados || 0)} / ${Number(toma.usuarios_asignados || 0)}`}</td>
                      <td>
                        <span className={`dashboard-status ${toma.estado === 'finalizada' ? 'done' : 'open'}`}>
                          {toma.estado === 'finalizada' ? 'finalizada' : 'abierta'}
                        </span>
                      </td>
                      <td>{formatDateTime(toma.fecha_creacion)}</td>
                      <td>{formatDateTime(toma.fecha_finalizacion)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="dashboard-empty-cell" colSpan="5">
                      No hay tomas fisicas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DonutCard({ title, percent, color, rows }) {
  return (
    <article className="widget donut-card">
      <h3>{title}</h3>
      <div className="donut-layout">
        <div className="donut" style={{ '--percent': `${percent}%`, '--donut-color': color }}>
          <span>{percent}%</span>
        </div>
        <div className="legend-list">
          {rows.map(([label, value, dot]) => (
            <div className="legend-row" key={label}>
              <i style={{ background: dot }} />
              <strong>
                {label}: {value}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function TomaSummary({ toma }) {
  const title = String(toma.nombre_toma || '').split(/\r?\n/)[0] || `TOMA FISICA # ${toma.numero_toma || ''}`;
  return (
    <div className="dashboard-toma-summary">
      <strong>{title.toUpperCase()}</strong>
      <span>AGENCIA: {String(toma.agencia || '').toUpperCase() || '-'}</span>
      <span>HABILITACION: {formatPeriodDate(toma.fecha_habilitacion, toma.hora_inicio)}</span>
      <span>FINALIZACION: {formatPeriodDate(toma.fecha_cierre, toma.hora_fin)}</span>
    </div>
  );
}
