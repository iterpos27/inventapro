import React, { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

function toIntegerString(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || '0';
}

function isPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

export function LiveConteoModal({ request, tomaId, conteoId, participant, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conteo, setConteo] = useState(null);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const invalidCount = useMemo(
    () => items.filter((item) => !isPositiveInteger(item.cantidad)).length,
    [items]
  );

  async function loadLive() {
    setLoading(true);
    setError('');
    try {
      const data = await request(`/tomas/${tomaId}/conteos/${conteoId}/live`);
      setConteo(data.conteo);
      setItems((data.items || []).map((item) => ({ ...item, cantidad: String(Number(item.cantidad || 0)) })));
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLive();
  }, [tomaId, conteoId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!saving && !dirty) {
        loadLive();
      }
    }, 8000);
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
      setError('Debe mantener al menos una linea.');
      return;
    }
    if (invalidCount > 0) {
      setError('Corrija o elimine las lineas con cantidad 0 o invalida.');
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
      setMessage(data.message || 'Conteo actualizado en vivo');
      setDirty(false);
      await loadLive();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Conteo en vivo - ${participant?.nombre || participant?.usuario || 'Usuario'}`}
      onClose={onClose}
    >
      <div className="live-count-modal">
        <div className="live-count-toolbar">
          <div className="live-count-status">
            <span><Eye size={14} /> En vivo</span>
            <span>Estado: {conteo?.estado || participant?.conteo_estado || 'borrador'}</span>
            <span>Version: {conteo?.version ?? '-'}</span>
          </div>
          <button className="outline-action compact" type="button" onClick={loadLive} disabled={loading || saving}>
            <RefreshCcw size={14} />
            Refrescar
          </button>
        </div>

        {loading ? <p className="muted">Cargando conteo...</p> : null}
        {message ? <p className="success-inline">{message}</p> : null}
        {error ? <p className="error-inline">{error}</p> : null}
        {invalidCount > 0 ? (
          <p className="warning-inline">
            Hay {invalidCount} linea(s) con cantidad 0 o invalida. Corrijalas o elimínelas.
          </p>
        ) : null}

        <div className="table-wrap">
          <table className="admin-table users-table live-count-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Descripcion</th>
                <th>Cantidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.producto_id}>
                  <td><strong>{item.codigo}</strong></td>
                  <td title={item.descripcion}>{item.descripcion}</td>
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
                  <td colSpan="4" className="empty-table">No hay lineas en este conteo.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="live-count-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={saving}>
            Cerrar
          </button>
          <button className="primary" type="button" onClick={save} disabled={saving || loading || items.length === 0}>
            <Save size={16} />
            Guardar correccion
          </button>
        </div>
      </div>
    </Modal>
  );
}
