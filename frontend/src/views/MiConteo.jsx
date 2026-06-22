import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightCircle,
  Building2,
  Calendar,
  CheckCircle,
  Circle,
  Download,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';
import { downloadFile } from '../services/api';

const SEARCH_CACHE_KEY = 'conteo_recent_searches_v1';
const SEARCH_CACHE_LIMIT = 100;
const MAX_VISIBLE_ITEMS = 50;
const AUTO_SAVE_DELAY = 180000;

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

function normalizeSearchTerm(term) {
  return String(term || '').trim().replace(/\s+/g, ' ').toLowerCase();
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

function tomaTitle(numeroToma) {
  const value = String(numeroToma || '').trim();
  if (!value) return 'TOMA FISICA #';
  if (/^TOMA\s+FISICA\s+#/i.test(value)) return value.toUpperCase();
  return `TOMA FISICA # ${value}`.toUpperCase();
}

function savedSnapshot(items) {
  return JSON.stringify(items
    .filter((item) => Number(item.cantidad) > 0)
    .map((item) => ({ producto_id: Number(item.producto_id), cantidad: Number(item.cantidad) })));
}

export function MiConteo({ request, token }) {
  const [tomas, setTomas] = useState([]);
  const [history, setHistory] = useState([]);
  const [conteo, setConteo] = useState(null);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [highlightedId, setHighlightedId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('Sin cambios recientes.');
  const [saving, setSaving] = useState(false);
  const searchAbortRef = useRef(null);
  const searchRequestRef = useRef(0);
  const searchTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const autoSaveActionRef = useRef(() => {});
  const searchInputRef = useRef(null);
  const quantityRefs = useRef(new Map());
  const lastSavedSnapshotRef = useRef('[]');
  const savingRef = useRef(false);

  const validItems = useMemo(() => items.filter((item) => Number(item.cantidad) > 0), [items]);
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
  const itemsSnapshot = useMemo(() => savedSnapshot(items), [items]);

  const loadTomas = () => request('/mi/tomas').then((data) => setTomas(data.tomas));
  const loadHistory = () => request('/mi/historial').then((data) => setHistory(data.conteos || []));

  useEffect(() => {
    loadTomas();
    loadHistory();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
    window.clearInterval(autoSaveTimerRef.current);
    searchAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    window.clearTimeout(searchTimerRef.current);
    const term = normalizeSearchTerm(q);
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
  }, [conteo?.id, itemsSnapshot]);

  useEffect(() => {
    window.clearInterval(autoSaveTimerRef.current);
    if (!conteo) return undefined;

    const runAutoSave = () => autoSaveActionRef.current();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runAutoSave();
    };

    autoSaveTimerRef.current = window.setInterval(runAutoSave, AUTO_SAVE_DELAY);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(autoSaveTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [conteo?.id]);

  async function startToma(toma) {
    setError('');
    setMessage('');
    setWarning('');
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
    const cleanTerm = normalizeSearchTerm(term);
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
        setWarning('Producto ya estaba agregado. Actualice la cantidad.');
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
    if (!silent) setWarning('');
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
      const savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSaveStatus(finish ? 'Conteo finalizado.' : `Borrador guardado automaticamente a las ${savedAt}.`);
      if (!silent) setMessage(finish ? 'Conteo finalizado' : 'Borrador guardado');
      if (finish) {
        window.clearInterval(autoSaveTimerRef.current);
        setConteo(null);
        setItems([]);
        lastSavedSnapshotRef.current = '[]';
        await loadTomas();
        await loadHistory();
      }
    } catch (err) {
      setError(err.message);
      setSaveStatus('No se pudo guardar.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  autoSaveActionRef.current = () => {
    if (
      conteo &&
      !savingRef.current &&
      validItems.length > 0 &&
      itemsSnapshot !== lastSavedSnapshotRef.current
    ) {
      save(false, true);
    }
  };

  if (!conteo) {
    return (
      <div className="user-conteo-shell user-conteo-select">

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
                  <strong className="available-count-title">{tomaTitle(toma.numero_toma)}</strong>
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
        <section className="panel users-card report-card operator-history-card">
          <div className="section-title"><h2>Historial de conteos</h2></div>
          <div className="table-wrap">
            <table className="admin-table users-table report-table">
              <thead><tr><th>Toma</th><th>Agencia</th><th>Estado</th><th>Lineas</th><th>Unidades</th><th>Finalizacion</th><th>Excel</th></tr></thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{tomaTitle(item.numero_toma)}</strong><span>{item.nombre_toma || ''}</span></td>
                    <td>{item.agencia || '-'}</td>
                    <td><span className={`report-status ${item.estado === 'finalizado' ? 'done' : 'open'}`}>{item.estado}</span></td>
                    <td>{item.lineas || 0}</td>
                    <td>{Number(item.unidades || 0).toFixed(2)}</td>
                    <td>{formatDateTime(item.fecha_finalizacion || item.fecha_inicio)}</td>
                    <td>{item.estado === 'finalizado' ? <button className="edit-text-btn success" type="button" onClick={() => downloadFile(token, `/conteos/${item.id}/excel`).catch((err) => setError(err.message))}><Download size={14} />Descargar</button> : <span className="muted">Pendiente</span>}</td>
                  </tr>
                ))}
                {history.length === 0 ? <tr><td colSpan="7" className="empty-table">Todavia no hay conteos registrados.</td></tr> : null}
              </tbody>
            </table>
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
              <strong className="operation-title">{tomaTitle(conteo.numero_toma)}</strong>
              <span className="save-status">{saveStatus}</span>
              <div className="operation-meta">
                <span><Building2 size={14} /> Agencia: {conteo.agencia || ''}</span>
                <span><Calendar size={14} /> Habilitacion: {tomaPeriodLabel(conteo, 'habilitacion')}</span>
                <span><Calendar size={14} /> Cierre: {tomaPeriodLabel(conteo, 'cierre')}</span>
              </div>
            </div>
            <div className="operation-actions">
              <button className="secondary-action draft-save-action" onClick={() => save(false)} disabled={saving || validItems.length === 0}>
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

        <FeedbackToast message={message} error={error} warning={warning} onClose={() => { setMessage(''); setError(''); setWarning(''); }} />
      </section>
    </div>
  );
}
