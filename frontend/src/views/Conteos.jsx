import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, Download, Edit3, FileDown, Power, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';
import { LiveConteoModal } from '../components/LiveConteoModal';
import { Modal } from '../components/Modal';
import { downloadFile } from '../services/api';
import {
  formatDateTime,
  formatDateOnly,
  formatPeriodDate,
  defaultReportRange,
  isWithinRange,
  buildDailyReport
} from '../utils/helpers';
import { TomaForm, defaultTomaForm } from './Tomas';

export function Conteos({ request, token, user }) {
  const [items, setItems] = useState([]);
  const [tomas, setTomas] = useState([]);
  const [summary, setSummary] = useState({ agencias: [], usuarios: [] });
  const [users, setUsers] = useState([]);
  const [agencias, setAgencias] = useState([]);
  const [from, setFrom] = useState(defaultReportRange().from);
  const [to, setTo] = useState(defaultReportRange().to);
  const [status, setStatus] = useState('todos');
  const [selected, setSelected] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [form, setForm] = useState(defaultTomaForm());
  const [modalOpen, setModalOpen] = useState(false);
  const [liveTarget, setLiveTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isAdmin = user?.rol === 'admin';

  useEffect(() => {
    refreshReports();
    if (isAdmin) {
      request('/usuarios').then((data) => setUsers(data.usuarios.filter((item) => ['usuario', 'operador'].includes(item.rol) && item.estado))).catch(() => {});
      request('/agencias').then((data) => setAgencias((data.agencias || []).filter((a) => a.estado))).catch(() => {});
    }
  }, [isAdmin]);

  const filtered = useMemo(() => items.filter((item) => {
    const inRange = item.toma_estado === 'abierta'
      || isWithinRange(item.fecha_inicio || item.fecha_finalizacion, from, to);
    const statusMatch = status === 'todos'
      || (status === 'finalizada' ? item.estado === 'finalizado' : item.estado !== 'finalizado');
    return inRange && statusMatch;
  }), [from, items, status, to]);
  const dailyRows = useMemo(() => buildDailyReport(filtered), [filtered]);
  const tomaRows = useMemo(() => tomas.filter((item) => {
    const date = item.fecha_finalizacion || item.fecha_cierre || item.fecha_creacion;
    const inRange = item.estado === 'abierta' || isWithinRange(date, from, to);
    return inRange && (status === 'todos' || item.estado === status);
  }), [from, tomas, status, to]);

  async function refreshReports() {
    const [conteosData, tomasData, summaryData] = await Promise.all([
      request('/conteos'),
      request('/tomas'),
      request(`/reportes/resumen?${new URLSearchParams({ from, to }).toString()}`)
    ]);
    setItems(conteosData.conteos || []);
    setTomas(tomasData.tomas || []);
    setSummary({
      agencias: summaryData.agencias || [],
      usuarios: summaryData.usuarios || []
    });
  }

  async function openDetail(id) {
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${id}`);
      setSelected(data.toma);
      setParticipants(data.participantes || []);
      setResumen(data.resumen || null);
      setForm({
        agencia: data.toma.agencia || '',
        fecha_habilitacion: String(data.toma.fecha_habilitacion || data.toma.fecha_toma || '').slice(0, 10),
        fecha_cierre: String(data.toma.fecha_cierre || '').slice(0, 10),
        hora_inicio: String(data.toma.hora_inicio || '').slice(0, 5),
        hora_fin: String(data.toma.hora_fin || '').slice(0, 5),
        usuarios: []
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function closeDetail() {
    setSelected(null);
    setParticipants([]);
    setResumen(null);
    setForm(defaultTomaForm());
    setModalOpen(false);
    setError('');
  }

  async function updateToma(event) {
    event.preventDefault();
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setMessage(data.message || 'Toma actualizada');
      setModalOpen(false);
      await refreshReports();
      await openDetail(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(accion) {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/estado`, { method: 'POST', body: JSON.stringify({ accion }) });
      setMessage(data.message);
      await refreshReports();
      await openDetail(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function reuseToma() {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/reutilizar`, { method: 'POST', body: JSON.stringify(form) });
      setMessage(data.message);
      await refreshReports();
      await openDetail(data.toma.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function enableUser(usuarioId) {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/usuarios/${usuarioId}/habilitar`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(data.message);
      await refreshReports();
      await openDetail(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteToma() {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      await request(`/tomas/${selected.id}`, { method: 'DELETE' });
      closeDetail();
      setMessage('Toma eliminada correctamente');
      await refreshReports();
    } catch (err) {
      setError(err.message);
    }
  }

  async function consolidado(toma) {
    setMessage('');
    setError('');
    try {
      await request(`/tomas/${toma.id}/consolidado`, { method: 'POST', body: JSON.stringify({}) });
      await downloadFile(token, `/tomas/${toma.id}/consolidado`);
      setMessage('Consolidado descargado correctamente');
    } catch (err) {
      setError(err.message);
    }
  }

  if (selected) {
    const canDelete = Number(resumen?.lineas || 0) === 0;
    return (
      <div className="users-page reports-page toma-detail-page">
        <div className="admin-page-heading toma-detail-heading">
          <div>
            <p>TOMA FISICA</p>
            <h2>Detalle de toma</h2>
          </div>
          <div className="toma-detail-toolbar">
            <button className="outline-action compact" type="button" onClick={closeDetail}>
              <ChevronLeft size={14} />
              Volver
            </button>
            {isAdmin ? <button className="edit-text-btn" type="button" onClick={() => setModalOpen(true)}>
              <Edit3 size={14} />
              Editar
            </button> : null}
            {isAdmin ? <button className="outline-action compact" type="button" onClick={reuseToma}>
              <RefreshCcw size={14} />
              Reutilizar
            </button> : null}
            {isAdmin ? <button className={selected.estado === 'abierta' ? 'delete-text-btn' : 'toggle-text-btn'} type="button" onClick={() => changeStatus(selected.estado === 'abierta' ? 'cerrar' : 'reabrir')}>
              <Power size={14} />
              {selected.estado === 'abierta' ? 'Cerrar toma' : 'Reabrir toma'}
            </button> : null}
            <button className="edit-text-btn success" type="button" onClick={() => consolidado(selected)} disabled={Number(resumen?.finalizados || 0) === 0}>
              <Download size={14} />
              Consolidado
            </button>
            {isAdmin ? <button className="delete-text-btn" type="button" onClick={deleteToma} disabled={!canDelete} title={canDelete ? 'Eliminar toma' : 'No se puede eliminar una toma con conteos'}>
              <Trash2 size={14} />
              Eliminar
            </button> : null}
          </div>
        </div>
        <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />

        <section className="panel toma-summary-card">
          <div>
            <span className={`report-status ${selected.estado === 'finalizada' ? 'done' : 'open'}`}>{selected.estado}</span>
            <p>TOMA FISICA # {selected.numero_toma}</p>
            <p>AGENCIA: {selected.agencia || ''}</p>
            <p>HABILITACION: {formatPeriodDate(selected.fecha_habilitacion, selected.hora_inicio)}</p>
            <p>FINALIZACION: {formatPeriodDate(selected.fecha_cierre, selected.hora_fin)}</p>
          </div>
          <aside>
            <strong>Creada por {selected.creado_por_nombre || 'Administrador'}</strong>
            <span>{formatDateTime(selected.fecha_creacion)}</span>
          </aside>
        </section>

        {resumen ? (
          <section className="toma-metrics-grid">
            <article className="metric"><span>Participantes</span><strong>{resumen.asignados}</strong></article>
            <article className="metric warning"><span>En proceso</span><strong>{resumen.en_proceso}</strong></article>
            <article className="metric success"><span>Finalizados</span><strong>{resumen.finalizados}</strong></article>
            <article className="metric"><span>Pendientes</span><strong>{resumen.pendientes}</strong></article>
            <article className="metric"><span>Lineas</span><strong>{resumen.lineas}</strong></article>
            <article className="metric"><span>Unidades</span><strong>{Number(resumen.unidades || 0).toFixed(2)}</strong></article>
          </section>
        ) : null}

        {isAdmin && selected.estado !== 'abierta' ? (
          <div className="inline-alert">Para agregar usuarios nuevos, primero reabra la toma.</div>
        ) : null}

        <section className="panel users-card toma-participants-card">
          <h3>Participantes</h3>
          <div className="table-wrap">
            <table className="admin-table users-table toma-participants-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Asignacion</th>
                  <th>Conteo</th>
                  <th>Lineas</th>
                  <th>Unidades</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.usuario_id}>
                    <td>
                      <strong>{participant.nombre}</strong>
                      <span>{participant.usuario}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${participant.asignacion_estado === 'finalizado' ? 'active' : 'inactive'}`}>
                        {participant.asignacion_estado}
                      </span>
                    </td>
                    <td>{participant.conteo_estado || 'sin iniciar'}</td>
                    <td>{participant.lineas || 0}</td>
                    <td>{Number(participant.unidades || 0).toFixed(2)}</td>
                    <td>{formatDateTime(participant.fecha_inicio)}</td>
                    <td>{formatDateTime(participant.fecha_finalizacion)}</td>
                    <td>
                      <div className="text-actions">
                        {participant.conteo_id ? (
                          <>
                            <button
                              className="outline-action compact"
                              type="button"
                              onClick={() => setLiveTarget(participant)}
                            >
                              Ver en vivo
                            </button>
                            {participant.conteo_estado === 'finalizado' ? (
                              <>
                                <button
                                  className="edit-text-btn success"
                                  type="button"
                                  onClick={() => downloadFile(token, `/conteos/${participant.conteo_id}/excel`).catch((err) => setError(err.message))}
                                >
                                  <FileDown size={14} />
                                  Descargar
                                </button>
                                {isAdmin ? <button className="toggle-text-btn" type="button" onClick={() => enableUser(participant.usuario_id)}>
                                  <RefreshCcw size={14} />
                                  Habilitar
                                </button> : null}
                              </>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted">Pendiente</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-table">No hay participantes asignados.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {isAdmin && modalOpen ? (
          <Modal title="Editar toma" onClose={() => setModalOpen(false)}>
            <TomaForm form={form} setForm={setForm} users={users} agencias={agencias} onSubmit={updateToma} submitLabel="Guardar cambios" />
          </Modal>
        ) : null}
        {isAdmin && liveTarget?.conteo_id ? (
          <LiveConteoModal
            request={request}
            tomaId={selected.id}
            conteoId={liveTarget.conteo_id}
            participant={liveTarget}
            onClose={async () => {
              setLiveTarget(null);
              await openDetail(selected.id);
              await refreshReports();
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="users-page reports-page">
      <div className="admin-page-heading">
        <div />
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
          <label>
            Estado
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="todos">Todos</option>
              <option value="abierta">Abiertas</option>
              <option value="finalizada">Finalizadas</option>
            </select>
          </label>
          <button className="primary" type="button" onClick={refreshReports}>
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
        <h3>Tomas</h3>
        <div className="table-wrap">
          <table className="admin-table users-table report-table export-table">
            <thead>
              <tr>
                <th>Toma</th>
                <th>Estado</th>
                <th>Usuarios</th>
                <th>Finalizados</th>
                <th>Fin</th>
                <th>Consolidado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tomaRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>TOMA FISICA # {row.numero_toma || '-'}</strong>
                    <span>AGENCIA: {row.agencia || ''}</span>
                    <span>HABILITACION: {formatPeriodDate(row.fecha_habilitacion, row.hora_inicio)}</span>
                    <span>FINALIZACION: {formatPeriodDate(row.fecha_cierre, row.hora_fin)}</span>
                  </td>
                  <td><span className={`report-status ${row.estado === 'finalizada' ? 'done' : 'open'}`}>{row.estado}</span></td>
                  <td>{row.usuarios_asignados || 0}</td>
                  <td>{row.usuarios_finalizados || 0}</td>
                  <td>{formatDateTime(row.fecha_finalizacion || row.fecha_cierre)}</td>
                  <td>
                    {Number(row.usuarios_finalizados || 0) > 0 ? (
                      <button className="edit-text-btn success" type="button" onClick={() => consolidado(row)}>
                        <Download size={14} />
                        Descargar
                      </button>
                    ) : 'Pendiente'}
                  </td>
                  <td>
                    <button
                      className="outline-action compact"
                      type="button"
                      disabled={!row.id}
                      onClick={() => row.id && openDetail(row.id)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {tomaRows.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="7">No hay tomas para el rango seleccionado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel users-card report-card">
        <h3>Avance por agencia</h3>
        <div className="table-wrap">
          <table className="admin-table users-table report-table">
            <thead>
              <tr>
                <th>Agencia</th>
                <th>Tomas</th>
                <th>Abiertas</th>
                <th>Finalizadas</th>
                <th>Asignados</th>
                <th>Finalizados</th>
                <th>Pendientes</th>
                <th>Unidades</th>
              </tr>
            </thead>
            <tbody>
              {summary.agencias.map((row) => (
                <tr key={row.agencia}>
                  <td><strong>{row.agencia}</strong></td>
                  <td>{row.tomas}</td>
                  <td>{row.abiertas}</td>
                  <td>{row.finalizadas}</td>
                  <td>{row.asignados}</td>
                  <td>{row.finalizados_usuarios}</td>
                  <td>{row.pendientes}</td>
                  <td>{Number(row.unidades || 0).toFixed(2)}</td>
                </tr>
              ))}
              {summary.agencias.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="8">No hay datos por agencia para el rango seleccionado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel users-card report-card">
        <h3>Productividad por usuario</h3>
        <div className="table-wrap">
          <table className="admin-table users-table report-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Tomas asignadas</th>
                <th>Finalizadas</th>
                <th>Pendientes</th>
                <th>Conteos</th>
                <th>Lineas</th>
                <th>Unidades</th>
              </tr>
            </thead>
            <tbody>
              {summary.usuarios.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.nombre && row.nombre.trim() ? row.nombre : row.usuario}</strong>
                    {row.nombre && row.nombre.trim() && row.nombre !== row.usuario ? (
                      <span>{row.usuario}</span>
                    ) : null}
                  </td>
                  <td>{row.tomas_asignadas}</td>
                  <td>{row.tomas_finalizadas}</td>
                  <td>{row.tomas_pendientes}</td>
                  <td>{row.conteos_creados}</td>
                  <td>{row.lineas}</td>
                  <td>{Number(row.unidades || 0).toFixed(2)}</td>
                </tr>
              ))}
              {summary.usuarios.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="7">No hay datos por usuario para el rango seleccionado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
