import React, { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Search
} from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';
import { Modal } from '../components/Modal';
import { truncateText } from '../utils/helpers';

export function Productos({ request }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState('codigo');
  const [direction, setDirection] = useState('asc');
  const [form, setForm] = useState({ codigo: '', descripcion: '' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importMessage, setImportMessage] = useState('');

  const load = (overrides = {}) => {
    const nextPage = overrides.page ?? page;
    const nextSort = overrides.sort ?? sort;
    const nextDirection = overrides.direction ?? direction;
    return request(`/productos?q=${encodeURIComponent(q)}&page=${nextPage}&perPage=30&sort=${nextSort}&direction=${nextDirection}`).then((data) => {
      setItems(data.productos);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || nextPage));
      setTotalPages(Number(data.totalPages || 1));
      setSort(data.sort || nextSort);
      setDirection(data.direction || nextDirection);
    });
  };

  useEffect(() => {
    load({ page: 1, sort: 'codigo', direction: 'asc' });
  }, []);

  function searchProducts() {
    load({ page: 1 });
  }

  function sortProducts(column) {
    const nextDirection = sort === column && direction === 'asc' ? 'desc' : 'asc';
    load({ page: 1, sort: column, direction: nextDirection });
  }

  function goToPage(nextPage) {
    load({ page: Math.max(1, Math.min(nextPage, totalPages)) });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editing) {
        await request(`/productos/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ ...form, estado: editing.estado }) });
        setMessage('Producto actualizado correctamente');
      } else {
        await request('/productos', { method: 'POST', body: JSON.stringify(form) });
        setMessage('Producto guardado correctamente');
      }
      resetProductForm();
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
      const data = await request('/productos/import', { method: 'POST', body });
      const info = data.importacion;
      const text = `Importados ${info.procesados}: ${info.insertados} nuevos, ${info.actualizados} actualizados, ${info.omitidos} omitidos.`;
      setImportMessage(text);
      setMessage(text);
      load({ page: 1, sort: 'codigo', direction: 'asc' });
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  function editProduct(product) {
    setEditing(product);
    setForm({ codigo: product.codigo || '', descripcion: product.descripcion || '' });
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  function resetProductForm() {
    setEditing(null);
    setForm({ codigo: '', descripcion: '' });
    setModalOpen(false);
  }

  async function deleteProduct(product) {
    setMessage('');
    setError('');
    try {
      await request(`/productos/${product.id}`, { method: 'DELETE' });
      setMessage('Producto eliminado correctamente');
      if (editing?.id === product.id) resetProductForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-page products-page">
      <div className="admin-page-heading">
        <div>
          <p>CATALOGO</p>
          <h2>Productos</h2>
        </div>
        <div className="product-heading-actions">
          <label className="outline-action product-import-btn">
            <Download size={16} />
            Importar Excel
            <input type="file" accept=".xlsx,.csv" onChange={importFile} />
          </label>
          <button className="primary admin-create-btn" type="button" onClick={() => { resetProductForm(); setModalOpen(true); }}>
            <Plus size={16} />
            Agregar
          </button>
        </div>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      <section className="panel product-search-card">
        <label>
          Buscar producto
          <div className="product-search-row">
            <input
              placeholder="Codigo o descripcion"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
            />
            <button className="primary" type="button" onClick={searchProducts}>
              <Search size={18} />
              Buscar
            </button>
          </div>
        </label>
      </section>
      <section className="panel users-card product-table-card">
        <div className="product-table-title">
          <h3>Inventario</h3>
          <span>{total} productos</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table users-table products-table">
            <thead>
              <tr>
                <th>
                  <button className="sort-header" type="button" onClick={() => sortProducts('codigo')}>
                    Codigo
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>
                  <button className="sort-header" type="button" onClick={() => sortProducts('descripcion')}>
                    Descripcion
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.codigo}</td>
                  <td className="product-description" title={item.descripcion}>{truncateText(item.descripcion, 110)}</td>
                  <td>
                    <div className="text-actions">
                      <button className="edit-text-btn" type="button" onClick={() => editProduct(item)}>
                        <Edit3 size={15} />
                        Editar
                      </button>
                      <button className="delete-text-btn" type="button" onClick={() => deleteProduct(item)}>
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="3">No hay productos para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="pagination-bar">
          <strong>Pagina {page} de {totalPages}</strong>
          <div>
            <button className="outline-action compact" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft size={15} />
              Anterior
            </button>
            <button className="outline-action compact" type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Siguiente
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
        {importMessage ? <p className="muted product-import-summary">{importMessage}</p> : null}
      </section>
      {modalOpen ? (
        <Modal title={editing ? 'Editar producto' : 'Crear producto'} onClose={resetProductForm}>
          <form className="modal-form user-modal-form" onSubmit={submit}>
            <label>
              Codigo
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </label>
            <label>
              Descripcion
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </label>
            <footer className="modal-actions">
              <button className="outline-action" type="button" onClick={resetProductForm}>Cancelar</button>
              <button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Crear'}</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
