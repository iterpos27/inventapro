import React, { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { downloadFile } from '../services/api';
import {
  formatDateTime,
  formatDateOnly,
  defaultReportRange,
  isWithinRange,
  buildDailyReport,
  buildTomaReport
} from '../utils/helpers';

export function Conteos({ request, token }) {
  const [items, setItems] = useState([]);
  const [from, setFrom] = useState(defaultReportRange().from);
  const [to, setTo] = useState(defaultReportRange().to);

  useEffect(() => {
    request('/conteos').then((data) => setItems(data.conteos));
  }, [request]);

  const filtered = useMemo(() => items.filter((item) => isWithinRange(item.fecha_inicio || item.fecha_finalizacion, from, to)), [items, from, to]);
  const dailyRows = useMemo(() => buildDailyReport(filtered), [filtered]);
  const tomaRows = useMemo(() => buildTomaReport(items), [items]);

  return (
    <div className="users-page reports-page">
      <div className="admin-page-heading">
        <div>
          <p>AUDITORIA</p>
          <h2>Reportes</h2>
        </div>
      </div>

      <section className="panel users-card report-card">
        <h3>Reporte por rango de fechas</h3>
        <div className="report-filter">
          <label>
            Desde
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="primary" type="button">
            <Search size={18} />
            Consultar
          </button>
        </div>
        <div className="table-wrap">
          <table className="admin-table users-table report-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Conteos</th>
                <th>Borradores</th>
                <th>Finalizados</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length ? dailyRows.map((row) => (
                <tr key={row.day}>
                  <td>{formatDateOnly(row.day)}</td>
                  <td>{row.total}</td>
                  <td>{row.drafts}</td>
                  <td>{row.finished}</td>
                </tr>
              )) : (
                <tr>
                  <td className="empty-table" colSpan="4">Sin movimientos para el rango seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel users-card report-card">
        <h3>Exportaciones por toma fisica</h3>
        <div className="table-wrap">
          <table className="admin-table users-table report-table export-table">
            <thead>
              <tr>
                <th>Toma fisica</th>
                <th>Estado</th>
                <th>Usuarios</th>
                <th>Finalizados</th>
                <th>Fin</th>
                <th>Excel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tomaRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>TOMA FISICA # {row.numero_toma || '-'}</strong>
                    <span>AGENCIA: {row.agencia || ''}</span>
                    <span>{row.nombre_toma}</span>
                  </td>
                  <td><span className={`report-status ${row.status}`}>{row.statusLabel}</span></td>
                  <td>{row.total}</td>
                  <td>{row.finished}</td>
                  <td>{formatDateTime(row.finishedAt)}</td>
                  <td>
                    {row.excelId ? (
                      <button className="link-action compact" type="button" onClick={() => downloadFile(token, `/conteos/${row.excelId}/excel`)}>Excel</button>
                    ) : 'Pendiente'}
                  </td>
                  <td>
                    <button
                      className="outline-action compact"
                      type="button"
                      disabled={!row.excelId}
                      onClick={() => row.excelId && downloadFile(token, `/conteos/${row.excelId}/excel`)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {tomaRows.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="7">No hay tomas fisicas para exportar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
