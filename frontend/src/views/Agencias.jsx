import React, { useEffect, useState } from 'react';
import { Building2, Edit3, Trash2 } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/helpers';

export function Agencias({ request }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: '', estado: true });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => request('/agencias').then((data) => setItems(data.agencias));

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editing) {
        await request(`/agencias/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        setMessage('Agencia actualizada correctamente');
      } else {
        await request('/agencias', { method: 'POST', body: JSON.stringify({ nombre: form.nombre }) });
        setMessage('Agencia guardada correctamente');
      }
      resetAgencyForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function editAgency(agency) {
    setEditing(agency);
    setForm({ nombre: agency.nombre || '', estado: Boolean(agency.estado) });
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  function resetAgencyForm() {
    setEditing(null);
    setForm({ nombre: '', estado: true });
    setModalOpen(false);
  }

  async function setAgencyStatus(agency, estado) {
    setMessage('');
    setError('');
    try {
      await request(`/agencias/${agency.id}`, { method: 'PATCH', body: JSON.stringify({ nombre: agency.nombre, estado }) });
      setMessage(estado ? 'Agencia activada correctamente' : 'Agencia desactivada correctamente');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteAgency(agency) {
    setMessage('');
    setError('');
    try {
      await request(`/agencias/${agency.id}`, { method: 'DELETE' });
      setMessage('Agencia desactivada correctamente');
      if (editing?.id === agency.id) resetAgencyForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-page">
      <div className="admin-page-heading">
        <div />
        <button className="primary admin-create-btn" type="button" onClick={() => { resetAgencyForm(); setModalOpen(true); }}>
          <Building2 size={16} />
          Crear agencia
        </button>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      <section className="panel users-card">
        <h3>Agencias registradas</h3>
        <div className="table-wrap">
          <table className="admin-table users-table agencies-table">
            <thead>
              <tr>
                <th>Agencia</th>
                <th>Estado</th>
                <th>Creacion</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre}</td>
                  <td>
                    <span className={`status-badge ${item.estado ? 'active' : 'inactive'}`}>
                      {item.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{formatDateTime(item.fecha_creacion)}</td>
                  <td>
                    <div className="text-actions">
                      <button className="edit-text-btn" type="button" onClick={() => editAgency(item)}>
                        <Edit3 size={15} />
                        Editar
                      </button>
                      <button className="toggle-text-btn" type="button" onClick={() => setAgencyStatus(item, !item.estado)}>
                        {item.estado ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="delete-text-btn" type="button" onClick={() => deleteAgency(item)}>
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {modalOpen ? (
        <Modal title={editing ? 'Editar agencia' : 'Crear agencia'} onClose={resetAgencyForm}>
          <form className="modal-form user-modal-form" onSubmit={submit}>
            <label>
              {editing ? 'Nombre' : 'Nombre de agencia'}
              <input
                placeholder={editing ? '' : 'PORTOVIEJO 01'}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>
            {editing ? (
              <label>
                Estado
                <select value={form.estado ? '1' : '0'} onChange={(e) => setForm({ ...form, estado: e.target.value === '1' })}>
                  <option value="1">Activa</option>
                  <option value="0">Inactiva</option>
                </select>
              </label>
            ) : null}
            <footer className="modal-actions">
              <button className="outline-action" type="button" onClick={resetAgencyForm}>Cancelar</button>
              <button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Crear'}</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
