import React, { useEffect, useState } from 'react';
import { FeedbackToast } from '../components/FeedbackToast';
import { defaultReportRange, formatDateTime } from '../utils/helpers';

export function Auditoria({ request }) {
  const [from, setFrom] = useState(defaultReportRange().from);
  const [to, setTo] = useState(defaultReportRange().to);
  const [kind, setKind] = useState('todos');
  const [events, setEvents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError('');
    try {
      const query = new URLSearchParams({ from, to, kind }).toString();
      const data = await request(`/sistema/eventos?${query}`);
      setEvents(data.events || []);
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-page reports-page">
      <FeedbackToast error={error} onClose={() => setError('')} />

      <section className="panel users-card report-card">
        <h3>Auditoria operativa</h3>
        <div className="report-filter">
          <label>
            Desde
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label>
            Tipo
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="todos">Todos</option>
              <option value="audit">Auditoria</option>
              <option value="app">Aplicacion</option>
            </select>
          </label>
          <button className="primary" type="button" onClick={load}>Consultar</button>
        </div>
        <div className="table-wrap">
          <table className="admin-table users-table report-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Evento</th>
                <th>Usuario</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {events.map((item) => (
                <tr key={`${item.source}-${item.id}`}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td><span className={`report-status ${item.source === 'audit' ? 'done' : 'open'}`}>{item.source}</span></td>
                  <td>
                    <strong>{item.event}</strong>
                    <span>{item.action || item.message}</span>
                  </td>
                  <td>{item.usuario_nombre || '-'}</td>
                  <td>
                    <span>{item.entity ? `${item.entity}${item.entity_id ? ` #${item.entity_id}` : ''}` : item.message}</span>
                    <small>{item.context ? JSON.stringify(item.context) : '-'}</small>
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="5">No hay eventos para el rango seleccionado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel users-card report-card">
        <h3>Sesiones moviles activas</h3>
        <div className="table-wrap">
          <table className="admin-table users-table report-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Sesiones</th>
                <th>Expira ultima</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.usuario}>
                  <td>
                    <strong>{item.nombre}</strong>
                    <span>{item.usuario}</span>
                  </td>
                  <td>{item.sesiones_activas}</td>
                  <td>{formatDateTime(item.expira_ultima)}</td>
                </tr>
              ))}
              {sessions.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="3">No hay sesiones moviles activas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
