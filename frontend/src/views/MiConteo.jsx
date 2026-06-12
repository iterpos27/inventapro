import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightCircle,
  Building2,
  Calendar,
  CheckCircle,
  Circle,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';

const SEARCH_CACHE_KEY = 'conteo_recent_searches_v1';
const SEARCH_CACHE_LIMIT = 100;
const MAX_VISIBLE_ITEMS = 50;
const AUTO_SAVE_DELAY = 4500;

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

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-EC', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date).replace(',', '').toUpperCase();
}

function tomaPeriodLabel(toma, field) {
  if (field === 'habilitacion') {
    return formatDateTime(toma.fecha_habilitacion) || [toma.fecha_habilitacion, toma.hora_inicio].filter(Boolean).join(' ');
  }
  return formatDateTime(toma.fecha_cierre) || [toma.fecha_cierre, toma.hora_fin].filter(Boolean).join(' ');
}

function savedSnapshot(items) {
  return JSON.stringify(items
    .filter((item) => Number(item.cantidad) > 0)
    .map((item) => ({ producto_id: Number(item.producto_id), cantidad: Number(item.cantidad) })));
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
  const [saveStatus, setSaveStatus] = useState('Sin cambios recientes.');
  const [saving, setSaving] = useState(false);
  const searchAbortRef = useRef(null);
  const searchRequestRef = useRef(0);
  const searchTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const quantityRefs = useRef(new Map());
  const lastSavedSnapshotRef = useRef('[]');
  const savingRef = useRef(false);

  const validItems = useMemo(() => items.filter((item) => Number(item.cantidad) > 0), [items]);
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
  const itemsSnapshot = useMemo(() => savedSnapshot(items), [items]);

  const loadTomas = () => request('/mi/tomas').then((data) => setTomas(data.tomas));

  useEffect(() => {
    loadTomas();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
    window.clearTimeout(autoSaveTimerRef.current);
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

  useEffect(() => {
    window.clearTimeout(autoSaveTimerRef.current);
    if (!conteo) return;
    if (itemsSnapshot === lastSavedSnapshotRef.current) {
      setSaveStatus('Sin cambios recientes.');
      return;
    }
    if (validItems.length === 0) {
      setSaveStatus(items.length > 0 ? 'Pendiente de cantidades.' : 'Sin cambios recientes.');
      return;
    }

    setSaveStatus('Cambios pendientes...');
    autoSaveTimerRef.current = window.setTimeout(() => {
      save(false, true);
    }, AUTO_SAVE_DELAY);
  }, [conteo?.id, itemsSnapshot]);

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
      const loadedItems = data.items.map((item) => ({ ...item, cantidad: String(Number(item.cantidad) || '') }));
      setConteo(data.conteo);
      setItems(loadedItems);
      lastSavedSnapshotRef.current = savedSnapshot(loadedItems);
      setSaveStatus('Sin cambios recientes.');
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

  async function save(finish = false, silent = false) {
    if (!conteo || savingRef.current) return;
    setError('');
    if (!silent) setMessage('');
    if (validItems.length === 0) {
      setError('Agregue productos validos al conteo');
      return;
    }

    const endpoint = finish ? 'finalizar' : 'borrador';
    savingRef.current = true;
    setSaving(true);
    setSaveStatus(finish ? 'Finalizando conteo...' : 'Guardando borrador...');
    try {
      const data = await request(`/mi/conteos/${conteo.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ conteo_version: conteo.version, items: validItems })
      });
      setConteo((current) => current ? { ...current, version: data.conteo_version, estado: data.estado } : current);
      lastSavedSnapshotRef.current = itemsSnapshot;
      setSaveStatus(finish ? 'Conteo finalizado.' : 'Borrador guardado automaticamente.');
      if (!silent) setMessage(finish ? 'Conteo finalizado' : 'Borrador guardado');
      if (finish) {
        window.clearTimeout(autoSaveTimerRef.current);
        setConteo(null);
        setItems([]);
        lastSavedSnapshotRef.current = '[]';
        await loadTomas();
      }
    } catch (err) {
      setError(err.message);
      setSaveStatus('No se pudo guardar.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!conteo) {
    return (
      <div className="user-conteo-shell user-conteo-select">
        <div className="admin-page-heading user-conteo-heading">
          <div>
            <p>CONTEO FISICO</p>
            <h2>Seleccionar conteo</h2>
          </div>
        </div>

        <section className="panel count-panel available-counts-panel">
          <div className="section-title">
            <h2>Conteos disponibles</h2>
          </div>
          <div className="toma-list available-count-grid">
            {tomas.map((toma) => (
              <button
                className="toma-card available-count"
                key={toma.toma_id}
                onClick={() => toma.conteo_id ? loadConteo(toma.conteo_id) : startToma(toma)}
              >
                <span className="available-count-body">
                  <strong className="available-count-title">{toma.numero_toma}</strong>
                  <span>AGENCIA: {toma.agencia || ''}</span>
                  <span>HABILITACION: {tomaPeriodLabel(toma, 'habilitacion')}</span>
                  <span>FINALIZACION: {tomaPeriodLabel(toma, 'cierre')}</span>
                  <small>{toma.lineas || 0} {Number(toma.lineas) === 1 ? 'linea registrada' : 'lineas registradas'} - {toma.conteo_id ? 'Continuar' : 'Empezar'}</small>
                </span>
                <ArrowRightCircle size={22} />
              </button>
            ))}
            {tomas.length === 0 ? <p className="muted">No hay tomas abiertas asignadas.</p> : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="user-conteo-shell user-conteo-active">
      <section className="count-panel workbench">
        <div className="count-operation-card">
          <div className="operation-card-body">
            <div className="operation-info">
              <span className="operation-tag"><Circle size={10} fill="currentColor" /> OPERACION ACTIVA</span>
              <strong className="operation-title">{conteo.numero_toma}</strong>
              <span className="save-status">{saveStatus}</span>
              <div className="operation-meta">
                <span><Building2 size={14} /> Agencia: {conteo.agencia || ''}</span>
                <span><Calendar size={14} /> Habilitacion: {tomaPeriodLabel(conteo, 'habilitacion')}</span>
                <span><Calendar size={14} /> Cierre: {tomaPeriodLabel(conteo, 'cierre')}</span>
              </div>
            </div>
            <div className="operation-actions">
              <button className="secondary-action" onClick={() => save(false)} disabled={saving || validItems.length === 0}>
                <Save size={18} />
                Guardar borrador
              </button>
              <button className="primary success-action" onClick={() => save(true)} disabled={saving || validItems.length === 0}>
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

        <div className="panel counted-products-card">
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
            {items.length === 0 ? <p className="empty-count-message">Agregue productos para iniciar el conteo.</p> : null}
            {items.length > MAX_VISIBLE_ITEMS ? (
              <p className="muted">Mostrando los primeros {MAX_VISIBLE_ITEMS} de {items.length} productos contados.</p>
            ) : null}
          </div>
        </div>

        <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      </section>
    </div>
  );
}
