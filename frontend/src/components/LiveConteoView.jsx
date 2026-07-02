import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Eye, RefreshCcw, Save, Trash2 } from 'lucide-react';

function toIntegerString(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || '0';
}

function isPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

export function LiveConteoView({ request, tomaId, conteoId, participant, onBack, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conteo, setConteo] = useState(null);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const statusRef = useRef({ version: null, lineas: null });

  const invalidCount = useMemo(
    () => items.filter((item) => !isPositiveInteger(item.cantidad)).length,
    [items]
  );

  async function loadLive({ preserveDirty = false } = {}) {
    setLoading(true);
    setError('');
    try {
      const data = await request(`/tomas/${tomaId}/conteos/${conteoId}/live`);
      setConteo(data.conteo);
      statusRef.current = {
        version: Number(data.conteo?.version || 0),
        lineas: Number(data.items?.length || 0)
      };
      if (!preserveDirty || !dirty) {
        setItems((data.items || []).map((item) => ({ ...item, cantidad: String(Number(item.cantidad || 0)) })));
        setDirty(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkLiveChanges() {
    if (saving || dirty) return;
    try {
      const data = await request(`/tomas/${tomaId}/conteos/${conteoId}/live/status`);
      const nextVersion = Number(data.version || 0);
      const nextLineas = Number(data.lineas || 0);
      if (
        nextVersion !== statusRef.current.version
        || nextLineas !== statusRef.current.lineas
      ) {
        await loadLive();
      }
    } catch {
      // si falla el sondeo, no interrumpimos la pantalla
    }
  }

  useEffect(() => {
    loadLive();
  }, [tomaId, conteoId]);

  useEffect(() => {
    const timer = window.setInterval(checkLiveChanges, 3000);
    return () => window.clearInterval(timer);
  }, [saving, dirty, tomaId, conteoId]);

  function updateQty(productoId, value) {
    setItems((current) => current.map((item) => Number(item.producto_id) === Number(productoId)
      ? { ...item, cantidad: toIntegerString(value) }
      : item));
    setDirty(true);
  }

  function removeItem(productoId) {
    setItems((current) => current.filter((item) => Number(item.producto_id) !== Number(productoId)));
    setDirty(true);
  }

  async function save() {
    if (!conteo) return;
    setMessage('');
    setError('');
    if (!items.length) {
      setError('Debe mantener al menos una línea.');
      return;
    }
    if (invalidCount > 0) {
      setError('Corrija o elimine las líneas con cantidad 0 o inválida.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        conteo_version: conteo.version,
        items: items.map((item) => ({
          producto_id: Number(item.producto_id),
          cantidad: Number(item.cantidad)
        }))
      };
      const data = await request(`/tomas/${tomaId}/conteos/${conteoId}/live`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setConteo((current) => current ? { ...current, version: data.conteo_version } : current);
      statusRef.current = {
        version: Number(data.conteo_version || 0),
        lineas: items.length
      };
      setMessage(data.message || 'Conteo actualizado en vivo');
      setDirty(false);
      await loadLive();
      await onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel live-count-page">
      <div className="live-count-page-header">
        <div>
          <p>SUPERVISION DE CONTEO</p>
          <h2>Conteo en vivo - {participant?.nombre || participant?.usuario || 'Usuario'}</h2>
        </div>
        <button className="outline-action compact" type="button" onClick={onBack}>
          <ArrowLeft size={14} />
          Volver
        </button>
      </div>

      <div className="live-count-toolbar">
        <div className="live-count-status">
          <span><Eye size={14} /> En vivo</span>
          <span>Estado: {conteo?.estado || participant?.conteo_estado || 'borrador'}</span>
          <span>Versión: {conteo?.version ?? '-'}</span>
          <span>Usuario: {participant?.usuario || '-'}</span>
        </div>
        <button className="outline-action compact" type="button" onClick={() => loadLive({ preserveDirty: false })} disabled={loading || saving}>
          <RefreshCcw size={14} />
          Refrescar
        </button>
      </div>

      {loading ? <p className="muted">Cargando conteo...</p> : null}
      {message ? <p className="success-inline">{message}</p> : null}
      {error ? <p className="error-inline">{error}</p> : null}
      {dirty ? <p className="warning-inline">Tiene cambios locales sin guardar.</p> : null}
      {invalidCount > 0 ? (
        <p className="warning-inline">
          Hay {invalidCount} línea(s) con cantidad 0 o inválida. Corríjalas o elimínelas.
        </p>
      ) : null}

      <div className="table-wrap">
        <table className="admin-table users-table live-count-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Cantidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.producto_id}>
                <td><strong>{item.codigo}</strong></td>
                <td title={item.descripcion}>
                  {item.marca ? <small>{item.marca}</small> : null}
                  <div>{item.descripcion}</div>
                </td>
                <td>
                  <input
                    className="live-count-qty"
                    type="number"
                    min="0"
                    step="1"
                    value={item.cantidad}
                    onChange={(event) => updateQty(item.producto_id, event.target.value)}
                  />
                </td>
                <td>
                  <button className="delete-text-btn compact-icon" type="button" onClick={() => removeItem(item.producto_id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty-table">No hay líneas en este conteo.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="live-count-actions">
        <button className="secondary-action" type="button" onClick={onBack} disabled={saving}>
          Cerrar
        </button>
        <button className="primary" type="button" onClick={save} disabled={saving || loading || items.length === 0}>
          <Save size={16} />
          Guardar corrección
        </button>
      </div>
    </div>
  );
}
