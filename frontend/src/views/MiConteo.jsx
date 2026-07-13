import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightCircle,
  CheckCircle,
  Circle,
  Plus,
  QrCode,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';

const SEARCH_CACHE_KEY = 'conteo_recent_searches_v2';
const SEARCH_CACHE_LIMIT = 100;
const MAX_VISIBLE_ITEMS = 50;
const AUTO_SAVE_DELAY = 60000;
const MAX_COUNT_DESCRIPTION = 75;

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

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function dayNameEs(value) {
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return '';
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
  return days[new Date(`${dateValue}T00:00:00Z`).getUTCDay()];
}

function formatTime(value) {
  const time = String(value || '').slice(0, 5);
  return /^\d{2}:\d{2}$/.test(time) ? time : '';
}

function tomaPeriodLabel(toma, field) {
  const dateValue = field === 'habilitacion' ? toma.fecha_habilitacion : toma.fecha_cierre;
  const timeValue = field === 'habilitacion' ? toma.hora_inicio : toma.hora_fin;
  return [dayNameEs(dateValue), formatDate(dateValue), formatTime(timeValue)].filter(Boolean).join(' ');
}

function tomaTitle(numeroToma) {
  const value = String(numeroToma || '').trim();
  if (!value) return '#';
  return value.replace(/^TOMA\s+FISICA\s+#\s*/i, '# ').replace(/^#?\s*/, '# ').toUpperCase();
}

function clampCountDescription(value) {
  return String(value || '').trim().slice(0, MAX_COUNT_DESCRIPTION);
}

function clampBrand(value) {
  return String(value || '').trim().slice(0, 40);
}

function isPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

function savedSnapshot(items) {
  return JSON.stringify(items
    .filter((item) => Number(item.cantidad) > 0)
    .map((item) => ({ producto_id: Number(item.producto_id), cantidad: Number(item.cantidad) }))
    .sort((a, b) => a.producto_id - b.producto_id));
}

export function MiConteo({ request }) {
  const [tomas, setTomas] = useState([]);
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const searchAbortRef = useRef(null);
  const searchRequestRef = useRef(0);
  const searchTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const autoSaveActionRef = useRef(() => {});
  const searchInputRef = useRef(null);
  const quantityRefs = useRef(new Map());
  const lastSavedSnapshotRef = useRef('[]');
  const lastSavedItemsRef = useRef([]);
  const itemsRef = useRef([]);
  const savingRef = useRef(false);
  const dirtyUpsertRef = useRef(new Map());
  const dirtyRemoveRef = useRef(new Set());
  const scannerVideoRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const scannerFrameRef = useRef(null);
  const barcodeDetectorRef = useRef(null);

  const validItems = useMemo(() => items.filter((item) => isPositiveInteger(item.cantidad)), [items]);
  const hasInvalidItems = useMemo(
    () => items.some((item) => !isPositiveInteger(item.cantidad)),
    [items]
  );
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
  const totalUnits = useMemo(
    () => validItems.reduce((sum, item) => sum + Number(item.cantidad || 0), 0),
    [validItems]
  );
  const hasPendingDiffChanges = dirtyUpsertRef.current.size > 0 || dirtyRemoveRef.current.size > 0;

  const loadTomas = () => request('/mi/tomas').then((data) => setTomas(data.tomas));

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    loadTomas();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
    window.clearInterval(autoSaveTimerRef.current);
    searchAbortRef.current?.abort();
    stopScanner();
  }, []);

  useEffect(() => {
    if (!scannerOpen) return undefined;
    let cancelled = false;

    async function bootScanner() {
      if (!window.isSecureContext) {
        setScannerError('El escaner del navegador requiere HTTPS.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerError('Este navegador no permite abrir la camara.');
        return;
      }
      if (!('BarcodeDetector' in window)) {
        setScannerError('Este navegador no soporta escaneo nativo. Use la APK o escriba el codigo.');
        return;
      }

      try {
        const detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']
        });
        barcodeDetectorRef.current = detector;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        scannerStreamRef.current = stream;
        const video = scannerVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const scanFrame = async () => {
          if (cancelled || !barcodeDetectorRef.current || !scannerVideoRef.current) return;
          try {
            const detected = await barcodeDetectorRef.current.detect(scannerVideoRef.current);
            const raw = detected?.[0]?.rawValue?.trim();
            if (raw) {
              closeScanner();
              setQ(raw);
              searchInputRef.current?.focus();
              searchProducts(raw);
              return;
            }
          } catch {
            // el ciclo sigue intentando
          }
          scannerFrameRef.current = window.requestAnimationFrame(scanFrame);
        };

        scannerFrameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (err) {
        setScannerError(err?.message || 'No se pudo abrir la camara.');
      }
    }

    setScannerError('');
    bootScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scannerOpen]);

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
    if (!hasPendingDiffChanges) {
      setSaveStatus('Sin cambios recientes.');
      return;
    }
    if (items.length > 0 && hasInvalidItems) {
      setSaveStatus('Corrija o elimine productos con cantidad 0 o invalida.');
      return;
    }
    if (validItems.length === 0) {
      setSaveStatus(items.length > 0 ? 'Pendiente de cantidades.' : 'Sin cambios recientes.');
      return;
    }

    setSaveStatus('Cambios pendientes...');
  }, [conteo?.id, items.length, hasInvalidItems, validItems.length, hasPendingDiffChanges]);

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
      const loadedItems = data.items.map((item) => ({
        ...item,
        cantidad: String(Number.isInteger(Number(item.cantidad)) ? Number(item.cantidad) : 0)
      }));
      setConteo(data.conteo);
      setItems(loadedItems);
      lastSavedSnapshotRef.current = savedSnapshot(loadedItems);
      lastSavedItemsRef.current = loadedItems;
      dirtyUpsertRef.current = new Map();
      dirtyRemoveRef.current = new Set();
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
        if (!productos.length) {
          setWarning('No se encontraron productos para la busqueda realizada.');
        }
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

  function stopScanner() {
    if (scannerFrameRef.current) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
  }

  function addProduct(product) {
    setWarning('');
    setItems((current) => {
      const existing = current.find((item) => Number(item.producto_id) === Number(product.id));
      if (existing) {
        setWarning('Producto ya estaba agregado. Actualice la cantidad.');
        return [existing, ...current.filter((item) => Number(item.producto_id) !== Number(product.id))];
      }
      return [{
        producto_id: product.id,
        codigo: product.codigo,
        marca: product.marca || '',
        descripcion: clampCountDescription(product.descripcion),
        cantidad: '0'
      }, ...current];
    });
    setHighlightedId(product.id);
    window.setTimeout(() => setHighlightedId(null), 1600);
    setQ('');
    setResults([]);
    focusQuantity(product.id);
  }

  function updateQty(productoId, cantidad) {
    const normalized = String(cantidad ?? '').trim();
    if (!normalized) {
      setItems((current) => current.map((item) => Number(item.producto_id) === Number(productoId) ? { ...item, cantidad: '0' } : item));
      markItemDirty(productoId, 0);
      return;
    }
    const numeric = Number(normalized);
    if (!Number.isInteger(numeric) || numeric < 0) {
      return;
    }
    setItems((current) => current.map((item) => Number(item.producto_id) === Number(productoId) ? { ...item, cantidad: String(numeric) } : item));
    markItemDirty(productoId, numeric);
  }

  function handleQtyChange(productoId, rawValue) {
    const cleaned = String(rawValue ?? '')
      .replace(/\D/g, '')
      .replace(/^0+(?=\d)/, '');
    updateQty(productoId, cleaned || '0');
  }

  function removeItem(productoId) {
    setItems((current) => current.filter((item) => Number(item.producto_id) !== Number(productoId)));
    markItemRemoved(productoId);
  }

  function getSavedQuantity(productoId) {
    const saved = lastSavedItemsRef.current.find((item) => Number(item.producto_id) === Number(productoId));
    return Number(saved?.cantidad || 0);
  }

  function markItemDirty(productoId, cantidad) {
    const productId = Number(productoId);
    const numeric = Number(cantidad || 0);
    const savedQty = getSavedQuantity(productId);
    dirtyRemoveRef.current.delete(productId);
    if (numeric <= 0) {
      if (savedQty > 0) {
        dirtyUpsertRef.current.delete(productId);
        dirtyRemoveRef.current.add(productId);
      } else {
        dirtyUpsertRef.current.delete(productId);
      }
      return;
    }
    if (savedQty === numeric) {
      dirtyUpsertRef.current.delete(productId);
      return;
    }
    dirtyUpsertRef.current.set(productId, numeric);
  }

  function markItemRemoved(productoId) {
    const productId = Number(productoId);
    const savedQty = getSavedQuantity(productId);
    dirtyUpsertRef.current.delete(productId);
    if (savedQty > 0) {
      dirtyRemoveRef.current.add(productId);
    } else {
      dirtyRemoveRef.current.delete(productId);
    }
  }

  function buildDirtyPayload() {
    return {
      upsert: [...dirtyUpsertRef.current.entries()].map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
      remove: [...dirtyRemoveRef.current].map((producto_id) => ({ producto_id }))
    };
  }

  function clearSubmittedDirtyChanges(submitted) {
    for (const item of submitted.upsert) {
      const productId = Number(item.producto_id);
      const currentQty = dirtyUpsertRef.current.get(productId);
      if (Number(currentQty) === Number(item.cantidad)) {
        dirtyUpsertRef.current.delete(productId);
      }
    }
    for (const item of submitted.remove) {
      const productId = Number(item.producto_id);
      if (dirtyRemoveRef.current.has(productId)) {
        dirtyRemoveRef.current.delete(productId);
      }
    }
  }

  async function backToList() {
    if (conteo && hasPendingDiffChanges && validItems.length > 0 && !savingRef.current) {
      await save(false, true);
    }
    setConteo(null);
    setItems([]);
    setResults([]);
    setQ('');
    await loadTomas();
  }

  async function save(finish = false, silent = false) {
    if (!conteo || savingRef.current) return;
    setError('');
    if (!silent) setMessage('');
    if (!silent) setWarning('');
    if (hasInvalidItems) {
      setError('Hay productos con cantidad 0 o invalida. Corrijalos o elimínelos antes de guardar.');
      setSaveStatus('Corrija o elimine productos con cantidad 0 o invalida.');
      return;
    }
    if (validItems.length === 0) {
      setError('Agregue productos validos al conteo');
      return;
    }

    const submittedItems = itemsRef.current;
    const payload = finish
      ? { conteo_version: conteo.version, items: validItems }
      : buildDirtyPayload();

    if (!finish && payload.upsert.length === 0 && payload.remove.length === 0) {
      setSaveStatus('Sin cambios recientes.');
      return;
    }

    const endpoint = finish ? 'finalizar' : 'guardar_cambios';
    savingRef.current = true;
    setSaving(true);
    setSaveStatus(finish ? 'Finalizando conteo...' : 'Guardando borrador...');
    try {
      const data = await request(`/mi/conteos/${conteo.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ conteo_version: conteo.version, ...(finish ? payload : payload) })
      });
      setConteo((current) => current ? { ...current, version: data.conteo_version, estado: data.estado } : current);
      if (finish) {
        dirtyUpsertRef.current = new Map();
        dirtyRemoveRef.current = new Set();
      } else {
        clearSubmittedDirtyChanges(payload);
      }
      lastSavedSnapshotRef.current = savedSnapshot(submittedItems);
      lastSavedItemsRef.current = submittedItems;
      const savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSaveStatus(finish ? 'Conteo finalizado.' : `Borrador guardado automaticamente a las ${savedAt}.`);
      if (!silent) setMessage(finish ? 'Conteo finalizado' : 'Borrador guardado');
      if (finish) {
        window.clearInterval(autoSaveTimerRef.current);
        setConteo(null);
        setItems([]);
        lastSavedSnapshotRef.current = '[]';
        lastSavedItemsRef.current = [];
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

  autoSaveActionRef.current = () => {
    if (
      conteo &&
      !savingRef.current &&
      !hasInvalidItems &&
      validItems.length > 0 &&
      hasPendingDiffChanges
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
      </div>
    );
  }

  return (
    <div className="user-conteo-shell user-conteo-active">
      <section className="count-panel workbench">
        <div className="count-operation-card">
          <div className="operation-card-body">
            <div className="operation-info">
              <button className="operation-back-btn" onClick={backToList} aria-label="Volver a conteos">
                <ArrowLeft size={18} />
              </button>
              <span className="operation-tag"><Circle size={10} fill="currentColor" /> OPERACION ACTIVA</span>
              <strong className="operation-title">{tomaTitle(conteo.numero_toma)}</strong>
              <span className="save-status">{saveStatus}</span>
              <div className="operation-meta">
                <span>{conteo.agencia || '-'}</span>
                <span>{tomaPeriodLabel(conteo, 'habilitacion')}</span>
                <span>{tomaPeriodLabel(conteo, 'cierre')}</span>
              </div>
              <div className="operation-summary">
                <span>{items.length} {items.length === 1 ? 'linea' : 'lineas'}</span>
                <span>{validItems.length} con cantidad</span>
                <span>{totalUnits.toFixed(2)} unidades</span>
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
          <div className="count-search-row">
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
                      <div className="search-result-meta">
                        {product.marca ? <small>{clampBrand(product.marca)}</small> : null}
                        <strong>{clampCountDescription(product.descripcion)}</strong>
                      </div>
                      <Plus size={16} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className="scan-trigger" onClick={() => setScannerOpen(true)} aria-label="Escanear codigo">
              <QrCode size={18} />
            </button>
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
                  {item.marca ? <small>{clampBrand(item.marca)}</small> : null}
                  <span>{clampCountDescription(item.descripcion)}</span>
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
                    step="1"
                    placeholder="0"
                    value={item.cantidad ?? ''}
                    onChange={(event) => handleQtyChange(item.producto_id, event.target.value)}
                    disabled={saving}
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

      {scannerOpen ? (
        <div className="scanner-modal" role="dialog" aria-modal="true" aria-label="Escaner de codigo">
          <div className="scanner-panel">
            <div className="scanner-header">
              <strong>Escanear producto</strong>
              <button className="scanner-close" type="button" onClick={closeScanner} aria-label="Cerrar escaner">
                <X size={18} />
              </button>
            </div>
            <p>Apunte la camara al codigo. El producto quedara en resultados para que usted lo elija.</p>
            <div className="scanner-viewport">
              <video ref={scannerVideoRef} muted playsInline />
            </div>
            {scannerError ? <p className="scanner-error">{scannerError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
