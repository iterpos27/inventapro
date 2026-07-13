import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Edit3,
  UserPlus,
  Power,
  RefreshCcw,
  Download,
  Trash2,
  Plus,
  FileDown
} from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';
import { IconAction } from '../components/IconAction';
import { DataTable } from '../components/DataTable';
import { LiveConteoView } from '../components/LiveConteoView';
import { Modal } from '../components/Modal';
import { downloadFile } from '../services/api';
import {
  formatPeriodDate,
  formatShortPeriod,
  composeDateTime,
  nextTomaPreview,
  formatDateTime,
  currentDateInputValue,
  currentTimeInputValue
} from '../utils/helpers';

export function Tomas({ request, token }) {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [agencias, setAgencias] = useState([]);
  const [selected, setSelected] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultTomaForm());
  const [modalOpen, setModalOpen] = useState(false);
  const [liveTarget, setLiveTarget] = useState(null);

  const load = () => request('/tomas').then((data) => setItems(data.tomas)).catch((err) => setError(`Error al cargar tomas: ${err.message}`));
  const loadUsers = () => request('/usuarios').then((data) => setUsers(data.usuarios.filter((user) => ['usuario', 'operador'].includes(user.rol) && user.estado))).catch((err) => setError(`Error al cargar usuarios: ${err.message}`));
  const loadAgencias = () => request('/agencias').then((data) => setAgencias((data.agencias || []).filter((a) => a.estado))).catch((err) => setError(`Error al cargar agencias: ${err.message}`));

  useEffect(() => {
    load();
    loadUsers();
    loadAgencias();
  }, []);

  async function createToma(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      const data = await request('/tomas', { method: 'POST', body: JSON.stringify({ ...form, usuarios: form.usuarios.map(Number) }) });
      setMessage(data.message || 'Toma creada');
      setForm(defaultTomaForm());
      setModalOpen(false);
      await load();
      await openDetail(data.toma.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openDetail(id) {
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${id}`);
      setSelected(data.toma);
      setParticipants(data.participantes);
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
      await load();
      await openDetail(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignUsers() {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/asignaciones`, { method: 'POST', body: JSON.stringify({ usuarios: form.usuarios.map(Number) }) });
      setMessage(data.message || 'Usuarios asignados');
      setForm((current) => ({ ...current, usuarios: [] }));
      await openDetail(selected.id);
      await load();
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
      await openDetail(selected.id);
      await load();
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
      await load();
      await openDetail(data.toma.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function enableUser(usuarioId) {
    if (!selected) return;
    try {
      const data = await request(`/tomas/${selected.id}/usuarios/${usuarioId}/habilitar`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(data.message);
      await openDetail(selected.id);
      await load();
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
      setSelected(null);
      setParticipants([]);
      setResumen(null);
      setForm(defaultTomaForm());
      setModalOpen(false);
      setMessage('Toma eliminada correctamente');
      await load();
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
    if (liveTarget?.conteo_id) {
      return (
        <div className="users-page tomas-page toma-detail-page">
          <LiveConteoView
            request={request}
            tomaId={selected.id}
            conteoId={liveTarget.conteo_id}
            participant={liveTarget}
            onBack={async () => {
              setLiveTarget(null);
              await openDetail(selected.id);
              await load();
            }}
            onSaved={async () => {
              await openDetail(selected.id);
              await load();
            }}
          />
        </div>
      );
    }
    return (
      <div className="users-page tomas-page toma-detail-page">
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
            <button className="edit-text-btn" type="button" onClick={() => setModalOpen(true)}>
              <Edit3 size={14} />
              Editar
            </button>
            <button className="outline-action compact" type="button" onClick={reuseToma}>
              <RefreshCcw size={14} />
              Reutilizar
            </button>
            <button className="delete-text-btn" type="button" onClick={() => changeStatus(selected.estado === 'abierta' ? 'cerrar' : 'reabrir')}>
              <Power size={14} />
              {selected.estado === 'abierta' ? 'Cerrar toma' : 'Reabrir toma'}
            </button>
            <button className="edit-text-btn success" type="button" onClick={() => consolidado(selected)} disabled={Number(resumen?.finalizados || 0) === 0}>
              <Download size={14} />
              Consolidado
            </button>
            <button className="delete-text-btn" type="button" onClick={deleteToma} disabled={!canDelete} title={canDelete ? 'Eliminar toma' : 'No se puede eliminar una toma con conteos'}>
              <Trash2 size={14} />
              Eliminar
            </button>
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
                                  title="Descargar Excel"
                                  onClick={() => downloadFile(token, `/conteos/${participant.conteo_id}/excel`).catch((err) => setError(err.message))}
                                >
                                  <FileDown size={14} />
                                  Descargar
                                </button>
                                <button
                                  className="toggle-text-btn"
                                  type="button"
                                  onClick={() => enableUser(participant.usuario_id)}
                                >
                                  <RefreshCcw size={14} />
                                  Habilitar
                                </button>
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

        {modalOpen ? (
          <Modal title="Editar toma" onClose={() => setModalOpen(false)}>
            <TomaForm form={form} setForm={setForm} users={users} agencias={agencias} onSubmit={updateToma} submitLabel="Guardar cambios" />
          </Modal>
        ) : null}
      </div>
    );
  }

  return (
    <div className="users-page tomas-page">
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />

      <section className="panel toma-create-panel">
        <h3>Crear toma fisica</h3>
        <TomaForm form={form} setForm={setForm} users={users} agencias={agencias} tomas={items} onSubmit={createToma} submitLabel="Crear toma fisica" mode="inline" />
      </section>

      <section className="panel users-card toma-table-card">
        <h3>Tomas abiertas</h3>
        <div className="table-wrap">
          <table className="admin-table users-table tomas-table">
            <thead>
              <tr>
                <th>Toma fisica</th>
                <th>Asignados</th>
                <th>En proceso</th>
                <th>Finalizados</th>
                <th>Periodo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? 'selected-row' : ''}>
                  <td>
                    <strong>TOMA FISICA # {item.numero_toma}</strong>
                    <span>AGENCIA: {item.agencia || ''}</span>
                    <span>HABILITACION: {formatPeriodDate(item.fecha_habilitacion, item.hora_inicio)}</span>
                    <span>FINALIZACION: {formatPeriodDate(item.fecha_cierre, item.hora_fin)}</span>
                  </td>
                  <td>{item.usuarios_asignados || 0}</td>
                  <td>{item.usuarios_en_proceso || 0}</td>
                  <td>{item.usuarios_finalizados || 0}</td>
                  <td>{formatShortPeriod(item)}</td>
                  <td>
                    <button className="outline-action compact" type="button" onClick={() => openDetail(item.id)}>Ver detalle</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan="6">No hay tomas registradas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="panel tomas-detail">
          <div className="section-title">
            <div>
              <h2>Participantes</h2>
              <p>{selected.nombre_toma}</p>
            </div>
            <span className="version">{selected.estado}</span>
          </div>

          {/* Métricas de la toma */}
          {resumen ? (
            <div className="toma-metrics-grid">
              <div className="metric"><span>Participantes</span><strong>{resumen.asignados}</strong></div>
              <div className="metric warning"><span>En proceso</span><strong>{resumen.en_proceso}</strong></div>
              <div className="metric success"><span>Finalizados</span><strong>{resumen.finalizados}</strong></div>
              <div className="metric"><span>Pendientes</span><strong>{resumen.pendientes}</strong></div>
              <div className="metric"><span>Lineas</span><strong>{resumen.lineas}</strong></div>
              <div className="metric"><span>Unidades</span><strong>{Number(resumen.unidades || 0).toFixed(2)}</strong></div>
            </div>
          ) : null}

          <div className="action-grid toma-detail-actions">
            <IconAction label="Editar toma" icon={Edit3} variant="primary" onClick={() => setModalOpen(true)} />
            <IconAction label="Asignar usuarios" icon={UserPlus} variant="success" onClick={assignUsers} />
            <IconAction label={selected.estado === 'abierta' ? 'Cerrar toma' : 'Reabrir toma'} icon={Power} variant="primary" onClick={() => changeStatus(selected.estado === 'abierta' ? 'cerrar' : 'reabrir')} />
            <IconAction label="Reutilizar toma" icon={RefreshCcw} variant="outline" onClick={reuseToma} />
            <IconAction label="Consolidado" icon={Download} variant="outline" onClick={() => consolidado(selected)} />
            <IconAction label="Eliminar toma" icon={Trash2} variant="danger" onClick={deleteToma} />
          </div>

          {/* Tabla enriquecida de participantes */}
          <div className="table-wrap">
            <table className="admin-table users-table">
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
                      <br />
                      <span style={{ color: 'var(--fg-muted)', fontSize: '0.85em' }}>{participant.usuario}</span>
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
                        {participant.conteo_estado === 'finalizado' && participant.conteo_id ? (
                          <>
                            <button
                              className="edit-text-btn"
                              type="button"
                              title="Descargar Excel"
                              onClick={() => downloadFile(token, `/conteos/${participant.conteo_id}/excel`)}
                            >
                              <FileDown size={14} />
                              Excel
                            </button>
                            <button
                              className="toggle-text-btn"
                              type="button"
                              onClick={() => enableUser(participant.usuario_id)}
                            >
                              <RefreshCcw size={14} />
                              Habilitar
                            </button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--fg-muted)' }}>Pendiente</span>
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
      ) : null}
      {modalOpen ? (
        <Modal title="Editar toma" onClose={() => setModalOpen(false)}>
          <TomaForm form={form} setForm={setForm} users={users} agencias={agencias} onSubmit={updateToma} submitLabel="Guardar cambios" />
        </Modal>
      ) : null}
    </div>
  );
}

export function TomaForm({ form, setForm, users, agencias = [], tomas = [], onSubmit, submitLabel, mode = 'modal' }) {
  function toggleUser(id) {
    const value = String(id);
    setForm((current) => ({
      ...current,
      usuarios: current.usuarios.includes(value)
        ? current.usuarios.filter((userId) => userId !== value)
        : [...current.usuarios, value]
    }));
  }
  function selectAllUsers() {
    setForm((current) => ({ ...current, usuarios: users.map((user) => String(user.id)) }));
  }
  function clearUsers() {
    setForm((current) => ({ ...current, usuarios: [] }));
  }
  function updateDateTime(field, value) {
    const [date = '', time = ''] = value.split('T');
    setForm((current) => field === 'start'
      ? { ...current, fecha_habilitacion: date, hora_inicio: time }
      : { ...current, fecha_cierre: date, hora_fin: time });
  }
  const inline = mode === 'inline';
  const previewNumber = nextTomaPreview(form.fecha_habilitacion, tomas);

  return (
    <form className={`toma-form ${inline ? 'inline-toma-form' : ''}`} onSubmit={onSubmit}>
      {inline ? (
        <label>
          Toma fisica #
          <input value={previewNumber} readOnly />
        </label>
      ) : null}
      <label>
        Agencia
        {agencias.length > 0 ? (
          <select value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })}>
            <option value="">Sin agencia</option>
            {agencias.map((a) => (
              <option key={a.id} value={a.nombre}>{a.nombre}</option>
            ))}
          </select>
        ) : (
          <input placeholder="Sin agencia" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
        )}
      </label>
      <label>
        Habilitacion
        <input
          type={inline ? 'datetime-local' : 'date'}
          value={inline ? composeDateTime(form.fecha_habilitacion, form.hora_inicio) : form.fecha_habilitacion}
          onChange={(e) => inline ? updateDateTime('start', e.target.value) : setForm({ ...form, fecha_habilitacion: e.target.value })}
          readOnly={inline}
        />
      </label>
      <label>
        Finalizacion
        <input
          type={inline ? 'datetime-local' : 'date'}
          value={inline ? composeDateTime(form.fecha_cierre, form.hora_fin) : form.fecha_cierre}
          onChange={(e) => inline ? updateDateTime('end', e.target.value) : setForm({ ...form, fecha_cierre: e.target.value })}
        />
      </label>
      {!inline ? (
        <>
          <label>
            Hora inicio
            <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
          </label>
          <label>
            Hora fin
            <input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
          </label>
        </>
      ) : null}
      {inline ? (
        <div className="toma-preview">
          <strong>TOMA FISICA # {previewNumber}</strong>
          <span>AGENCIA: {form.agencia || ''}</span>
          <span>HABILITACION: {formatPeriodDate(form.fecha_habilitacion, form.hora_inicio)}</span>
          <span>FINALIZACION: {formatPeriodDate(form.fecha_cierre, form.hora_fin)}</span>
        </div>
      ) : null}
      <div className="user-picker-heading">
        <strong>Usuarios participantes</strong>
        <span>
          <button className="outline-action compact" type="button" onClick={selectAllUsers}>Todos</button>
          <button className="link-action compact" type="button" onClick={clearUsers}>Ninguno</button>
          <button className="primary compact-inline-submit" type="submit">
            <Plus size={15} />
            Crear toma
          </button>
        </span>
      </div>
      <div className={`user-picker ${inline ? 'wide' : ''}`}>
        {users.map((user) => (
          <label key={user.id}>
            <input type="checkbox" checked={form.usuarios.includes(String(user.id))} onChange={() => toggleUser(user.id)} />
            <span>
              <strong>{user.nombre}</strong>
              <small>{user.usuario}</small>
            </span>
          </label>
        ))}
      </div>
      {!inline ? (
        <button className="primary toma-submit" type="submit">
          <Plus size={16} />
          {submitLabel}
        </button>
      ) : null}
    </form>
  );
}

export function defaultTomaForm() {
  return {
    agencia: '',
    fecha_habilitacion: currentDateInputValue(),
    fecha_cierre: '',
    hora_inicio: currentTimeInputValue(),
    hora_fin: '',
    usuarios: []
  };
}
