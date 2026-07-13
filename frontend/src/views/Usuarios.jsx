import React, { useEffect, useState } from 'react';
import { Download, Edit3, Trash2, UserPlus } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';
import { Modal } from '../components/Modal';
import { downloadFile } from '../services/api';
import { formatDateTime } from '../utils/helpers';

export function Usuarios({ request, token }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: '', usuario: '', password: '', rol: 'usuario' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => request('/usuarios').then((data) => setItems(data.usuarios));

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editing) {
        await request(`/usuarios/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...form, estado: form.estado })
        });
        setMessage('Usuario actualizado correctamente');
      } else {
        await request('/usuarios', { method: 'POST', body: JSON.stringify(form) });
        setMessage('Usuario creado correctamente');
      }
      resetUserForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function editUser(user) {
    setEditing(user);
    setForm({ nombre: user.nombre || '', usuario: user.usuario || '', password: '', rol: user.rol || 'usuario', estado: Boolean(user.estado) });
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  function resetUserForm() {
    setEditing(null);
    setForm({ nombre: '', usuario: '', password: '', rol: 'usuario', estado: true });
    setModalOpen(false);
  }

  async function deleteUser(user) {
    setMessage('');
    setError('');
    try {
      await request(`/usuarios/${user.id}`, { method: 'DELETE' });
      setMessage('Usuario desactivado correctamente');
      setDeleteTarget(null);
      if (editing?.id === user.id) resetUserForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('');
    setError('');
    try {
      const body = new FormData();
      body.append('archivo', file);
      const data = await request('/usuarios/import', { method: 'POST', body });
      const info = data.importacion;
      setMessage(`Importados ${info.procesados}: ${info.insertados} nuevos, ${info.actualizados} actualizados, ${info.omitidos} omitidos.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  async function downloadTemplate() {
    setMessage('');
    setError('');
    try {
      await downloadFile(token, '/usuarios/plantilla');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-page">
      <div className="admin-page-heading">
        <div />
        <div className="product-heading-actions">
          <button className="outline-action product-import-btn" type="button" onClick={downloadTemplate}>
            <Download size={16} />
            Plantilla
          </button>
          <label className="outline-action product-import-btn">
            <Download size={16} />
            Importar Excel
            <input type="file" accept=".xlsx,.csv" onChange={importFile} />
          </label>
          <button className="primary admin-create-btn" type="button" onClick={() => { resetUserForm(); setModalOpen(true); }}>
            <UserPlus size={16} />
            Crear usuario
          </button>
        </div>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      <section className="panel users-card">
        <h3>Usuarios registrados</h3>
        <div className="table-wrap">
          <table className="admin-table users-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre}</td>
                  <td>{item.usuario}</td>
                  <td>{item.rol}</td>
                  <td>
                    <span className={`status-badge ${item.estado ? 'active' : 'inactive'}`}>
                      {item.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{formatDateTime(item.fecha_creacion)}</td>
                  <td>
                    <div className="text-actions">
                      <button className="edit-text-btn" type="button" onClick={() => editUser(item)}>
                        <Edit3 size={15} />
                        Editar
                      </button>
                      {item.rol !== 'admin' ? (
                        <button className="delete-text-btn" type="button" onClick={() => setDeleteTarget(item)}>
                          <Trash2 size={15} />
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {modalOpen ? (
        <Modal title={editing ? 'Editar usuario' : 'Crear usuario'} onClose={resetUserForm}>
          <form className="modal-form user-modal-form" onSubmit={submit}>
            <label>
              Nombre
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label>
              Usuario
              <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
            </label>
            <label>
              {editing ? 'Clave nueva' : 'Contrasena'}
              <input
                type="password"
                placeholder={editing ? 'Dejar vacio para no cambiar' : ''}
                minLength={editing ? 0 : 8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <div className={editing ? 'modal-two-cols' : ''}>
              <label>
                Rol
                <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="reportes">Reportes</option>
                  <option value="usuario">Usuario</option>
                </select>
              </label>
              {editing ? (
                <label>
                  Estado
                  <select value={form.estado ? '1' : '0'} onChange={(e) => setForm({ ...form, estado: e.target.value === '1' })}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </label>
              ) : null}
            </div>
            <footer className="modal-actions">
              <button className="outline-action" type="button" onClick={resetUserForm}>Cancelar</button>
              <button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Crear'}</button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {deleteTarget ? (
        <Modal title="Eliminar usuario" onClose={() => setDeleteTarget(null)} size="sm">
          <div className="confirm-body">
            Desea eliminar/desactivar el usuario <strong>{deleteTarget.nombre}</strong>?
          </div>
          <footer className="modal-actions">
            <button className="outline-action" type="button" onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button className="danger-solid" type="button" onClick={() => deleteUser(deleteTarget)}>Si, eliminar</button>
          </footer>
        </Modal>
      ) : null}
    </div>
  );
}
