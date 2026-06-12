import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Trash2, ClipboardList, Save, CheckCircle, X } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';

const SEARCH_CACHE_KEY = 'conteo_recent_searches_v1';
const SEARCH_CACHE_LIMIT = 100;
const MAX_VISIBLE_ITEMS = 50;

function readSearchCache() {
  try {
    const raw = window.sessionStorage.getItem(SEARCH_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getCachedSearch(term) {
  return readSearchCache()[term] || null;
}

function setCachedSearch(term, productos) {
  try {
    const cache = readSearchCache();
    const next = { [term]: productos, ...cache };
    const entries = Object.entries(next).slice(0, SEARCH_CACHE_LIMIT);
    window.sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // El cache solo acelera busquedas repetidas; si falla, el flujo sigue normal.
  }
}

export function MiConteo({ request }) {
  const [tomas, setTomas] = useState([]);
  const [conteo, setConteo] = useState(null);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [highlightedId, setHighlightedId] = useState(null);
  const searchAbortRef = useRef(null);
  const searchRequestRef = useRef(0);
  const searchTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const quantityRefs = useRef(new Map());

  const validItems = useMemo(() => items.filter((item) => Number(item.cantidad) > 0), [items]);
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);

  const loadTomas = () => request('/mi/tomas').then((data) => setTomas(data.tomas));

  useEffect(() => {
    loadTomas();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    window.clearTimeout(searchTimerRef.current);
    const term = q.trim();
    if (!term || term.length < 3) {
      setResults([]);
      return;
    }

    const delay = window.matchMedia('(max-width: 768px)').matches ? 500 : 420;
    searchTimerRef.current = window.setTimeout(() => {
      searchProducts(term);
    }, delay);
  }, [q]);

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
      setItems(data.items.map((item) => ({ ...item, cantidad: String(Number(item.cantidad) || '') })));
      setResults([]);
      setQ('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function searchProducts(term = q) {
    setError('');
    const cleanTerm = term.trim();
    if (cleanTerm.length < 3) {
      setResults([]);
      return;
    }

    const cached = getCachedSearch(cleanTerm);
    if (cached) {
      setResults(cached);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    try {
      const data = await request(`/mi/productos?q=${encodeURIComponent(cleanTerm)}`, { signal: controller.signal });
      if (requestId === searchRequestRef.current) {
        const productos = data.productos || [];
        setCachedSearch(cleanTerm, productos);
        setResults(productos);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    }
  }

  function clearSearch() {
    window.clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();
    setQ('');
    setResults([]);
    searchInputRef.current?.focus();
  }

  function focusQuantity(productoId) {
    const key = String(productoId);
    [40, 140, 280].forEach((delay) => {
      window.setTimeout(() => {
        const input = quantityRefs.current.get(key);
        if (!input) return;
        input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        input.focus();
        input.select();
      }, delay);
    });
  }

  function addProduct(product) {
    setItems((current) => {
      const existing = current.find((item) => Number(item.producto_id) === Number(product.id));
      if (existing) {
        setMessage('Producto ya estaba agregado. Actualice la cantidad.');
        return [existing, ...current.filter((item) => Number(item.producto_id) !== Number(product.id))];
      }
      return [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: '' }, ...current];
    });
    setHighlightedId(product.id);
    window.setTimeout(() => setHighlightedId(null), 1600);
    setQ('');
    setResults([]);
    focusQuantity(product.id);
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
    if (validItems.length === 0) {
      setError('Agregue productos validos al conteo');
      return;
    }

    const endpoint = finish ? 'finalizar' : 'borrador';
    try {
      const data = await request(`/mi/conteos/${conteo.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ conteo_version: conteo.version, items: validItems })
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
    <div className="count-layout user-conteo-shell">
      <section className="panel count-panel available-counts-panel">
        <div className="section-title">
          <h2>Tomas asignadas</h2>
        </div>
        <div className="toma-list available-count-grid">
          {tomas.map((toma) => (
            <article className={`toma-card available-count ${conteo?.toma_id === toma.toma_id ? 'selected' : ''}`} key={toma.toma_id}>
              <div>
                <strong className="available-count-title">{toma.numero_toma}</strong>
                <span>{toma.nombre_toma}</span>
                <small>{toma.agencia || 'Sin agencia'} - {toma.asignacion_estado}</small>
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
            <div className="count-operation-card">
              <div className="operation-card-body">
                <div className="operation-info">
                  <span className="operation-tag">Toma activa</span>
                  <strong className="operation-title">{conteo.numero_toma}</strong>
                  <span className="save-status">Version {conteo.version}</span>
                  <p className="operation-meta">{conteo.nombre_toma}</p>
                </div>
                <div className="operation-actions">
                  <button className="secondary-action" onClick={() => save(false)} disabled={validItems.length === 0}>
                    <Save size={18} />
                    Guardar borrador
                  </button>
                  <button className="primary" onClick={() => save(true)} disabled={validItems.length === 0}>
                    <CheckCircle size={18} />
                    Finalizar conteo
                  </button>
                </div>
              </div>
            </div>

            <div className="count-tool">
              <label htmlFor="mi-conteo-search">Buscar producto</label>
              <div className="count-search-box">
                <Search className="search-leading-icon" size={18} />
                <input
                  id="mi-conteo-search"
                  ref={searchInputRef}
                  className="search-input"
                  placeholder="Codigo o descripcion"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      searchProducts(q);
                    }
                  }}
                />
                {q ? (
                  <button className="search-clear" onClick={clearSearch} aria-label="Limpiar busqueda">
                    <X size={17} />
                  </button>
                ) : null}

                {results.length > 0 ? (
                  <div className="search-results">
                    {results.map((product) => (
                      <button className="search-result" key={product.id} onClick={() => addProduct(product)}>
                        <span>{product.codigo}</span>
                        <strong>{product.descripcion}</strong>
                        <Plus size={16} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="section-title count-list-heading">
              <h2>Productos contados</h2>
              <span className="count-line-count">{items.length}</span>
            </div>

            <div className="count-items count-list">
              {visibleItems.map((item) => (
                <article
                  className={`count-item ${Number(item.cantidad) > 0 ? 'has-quantity' : 'is-empty-quantity'} ${Number(highlightedId) === Number(item.producto_id) ? 'is-flashing' : ''}`}
                  key={item.producto_id}
                >
                  <button className="icon-btn count-item-delete" onClick={() => removeItem(item.producto_id)} aria-label="Quitar producto">
                    <Trash2 size={18} />
                  </button>
                  <div className="count-item-main">
                    <strong>{item.codigo}</strong>
                    <span>{item.descripcion}</span>
                  </div>
                  <div className="count-item-actions">
                    <input
                      ref={(node) => {
                        const key = String(item.producto_id);
                        if (node) quantityRefs.current.set(key, node);
                        else quantityRefs.current.delete(key);
                      }}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={item.cantidad ?? ''}
                      onChange={(event) => updateQty(item.producto_id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') searchInputRef.current?.focus();
                      }}
                    />
                  </div>
                </article>
              ))}
              {items.length === 0 ? <p className="muted">Agrega productos para guardar el conteo.</p> : null}
              {items.length > MAX_VISIBLE_ITEMS ? (
                <p className="muted">Mostrando los primeros {MAX_VISIBLE_ITEMS} de {items.length} productos contados.</p>
              ) : null}
            </div>

            <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
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
