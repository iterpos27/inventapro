import React, { useEffect, useState } from 'react';
import { Plus, Boxes, FileText } from 'lucide-react';
import { DataTable } from '../components/DataTable';

export function Dashboard({ request }) {
  const [metrics, setMetrics] = useState(null);
  const [latest, setLatest] = useState([]);

  useEffect(() => {
    request('/dashboard').then((data) => {
      setMetrics(data.metrics);
      setLatest(data.latest_tomas || []);
    });
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
    <div className="dashboard-view">
      <div className="page-kicker">INVENTARIO FISICO</div>
      <h2>Panel de control</h2>
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
            <div className="trend-bar" style={{ height: `${Math.max(34, (metrics?.conteos_finalizados || 1) * 10)}px` }} />
            <strong>{metrics?.conteos_finalizados || 0}</strong>
            <span>{new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' })}</span>
          </div>
        </article>
      </section>
      <div className="quick-actions">
        <button className="primary"><Plus size={18} />Crear toma</button>
        <button className="outline-action"><Boxes size={18} />Productos</button>
        <button className="link-action"><FileText size={18} />Reportes</button>
      </div>
      <section className="panel latest-panel">
        <h3>Ultimas tomas fisicas</h3>
        <DataTable
          columns={['numero_toma', 'usuarios_asignados', 'estado', 'fecha_creacion', 'fecha_finalizacion']}
          rows={latest.map((item, index) => ({ id: `${item.numero_toma}-${index}`, ...item }))}
        />
      </section>
    </div>
  );
}

export function DonutCard({ title, percent, color, rows }) {
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
              <strong>{label}: {value}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
