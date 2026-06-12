import React, { useEffect, useState } from 'react';
import { Search, Plus, Trash2, ClipboardList, Save, CheckCircle } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';

export function MiConteo({ request }) {
  const [tomas, setTomas] = useState([]);
  const [conteo, setConteo] = useState(null);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadTomas = () => request('/mi/tomas').then((data) => setTomas(data.tomas));
  useEffect(() => {
    loadTomas();
  }, []);

  async function startToma(toma) {
    setError('');
    setMessage('');
    try {
      const started = await request(`/mi/tomas/${toma.toma_id}/iniciar`, { method: 'POST', body: JSON.stringify({}) });
      await loadConteo(started.conteo_id);
      await loadTomas();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadConteo(conteoId) {
    try {
      const data = await request(`/mi/conteos/${conteoId}`);
      setConteo(data.conteo);
      setItems(data.items.map((item) => ({ ...item, cantidad: Number(item.cantidad) })));
      setResults([]);
      setQ('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function searchProducts() {
    setError('');
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      const data = await request(`/mi/productos?q=${encodeURIComponent(q.trim())}`);
      setResults(data.productos);
    } catch (err) {
      setError(err.message);
    }
  }

  function addProduct(product) {
    setItems((current) => {
      const existing = current.find((item) => Number(item.producto_id) === Number(product.id));
      if (existing) {
        return current.map((item) => Number(item.producto_id) === Number(product.id) ? { ...item, cantidad: Number(item.cantidad) + 1 } : item);
      }
      return [...current, { producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1 }];
    });
    setQ('');
    setResults([]);
  }

  function updateQty(productoId, cantidad) {
    setItems((current) => current.map((item) => Number(item.producto_id) === Number(productoId) ? { ...item, cantidad } : item));
  }

  function removeItem(productoId) {
    setItems((current) => current.filter((item) => Number(item.producto_id) !== Number(productoId)));
  }

  async function save(finish = false) {
    if (!conteo) return;
    setError('');
    setMessage('');
    const endpoint = finish ? 'finalizar' : 'borrador';
    try {
      const data = await request(`/mi/conteos/${conteo.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ conteo_version: conteo.version, items })
      });
      setConteo((current) => current ? { ...current, version: data.conteo_version, estado: data.estado } : current);
      setMessage(finish ? 'Conteo finalizado' : 'Borrador guardado');
      if (finish) {
        setConteo(null);
        setItems([]);
        await loadTomas();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="count-layout">
      <section className="panel count-panel">
        <div className="section-title">
          <h2>Tomas asignadas</h2>
        </div>
        <div className="toma-list">
          {tomas.map((toma) => (
            <article className={`toma-card ${conteo?.toma_id === toma.toma_id ? 'selected' : ''}`} key={toma.toma_id}>
              <div>
                <strong>{toma.numero_toma}</strong>
                <span>{toma.nombre_toma}</span>
                <small>{toma.agencia || 'Sin agencia'} · {toma.asignacion_estado}</small>
                {toma.conteo_id && toma.lineas > 0 ? (
                  <small className="toma-lines-badge">{toma.lineas} {toma.lineas === 1 ? 'linea registrada' : 'lineas registradas'}</small>
                ) : null}
              </div>
              <button className="table-btn" onClick={() => toma.conteo_id ? loadConteo(toma.conteo_id) : startToma(toma)}>
                {toma.conteo_id ? (toma.lineas > 0 ? 'Continuar' : 'Abrir') : 'Iniciar'}
              </button>
            </article>
          ))}
          {tomas.length === 0 ? <p className="muted">No hay tomas abiertas asignadas.</p> : null}
        </div>
      </section>

      <section className="panel count-panel workbench">
        {conteo ? (
          <>
            <div className="section-title">
              <div>
                <h2>{conteo.numero_toma}</h2>
                <p>{conteo.nombre_toma}</p>
              </div>
              <span className="version">v{conteo.version}</span>
            </div>

            <div className="product-search">
              <Search size={18} />
              <input
                placeholder="Codigo o descripcion"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
              />
              <button className="icon-btn" onClick={searchProducts} aria-label="Buscar producto">
                <Search size={18} />
              </button>
            </div>

            {results.length > 0 ? (
              <div className="result-list">
                {results.map((product) => (
                  <button key={product.id} onClick={() => addProduct(product)}>
                    <span><strong>{product.codigo}</strong>{product.descripcion}</span>
                    <Plus size={18} />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="count-items">
              {items.map((item) => (
                <article className="count-item" key={item.producto_id}>
                  <div>
                    <strong>{item.codigo}</strong>
                    <span>{item.descripcion}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.cantidad}
                    onChange={(event) => updateQty(item.producto_id, Number(event.target.value))}
                  />
                  <button className="icon-btn" onClick={() => removeItem(item.producto_id)} aria-label="Quitar producto">
                    <Trash2 size={18} />
                  </button>
                </article>
              ))}
              {items.length === 0 ? <p className="muted">Agrega productos para guardar el conteo.</p> : null}
            </div>

            <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />

            <div className="count-actions">
              <button className="secondary-action" onClick={() => save(false)} disabled={items.length === 0}>
                <Save size={18} />
                Guardar borrador
              </button>
              <button className="primary" onClick={() => save(true)} disabled={items.length === 0}>
                <CheckCircle size={18} />
                Finalizar conteo
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <ClipboardList size={42} />
            <strong>Selecciona una toma</strong>
          </div>
        )}
      </section>
    </div>
  );
}
