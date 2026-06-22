import React, { useEffect, useState } from 'react';
import { Palette, RefreshCw } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';

export function Branding({ request, branding, setBranding }) {
  const [form, setForm] = useState({
    brand_name: '',
    brand_abbreviation: '',
    brand_subtitle: '',
    brand_color_primary: '',
    brand_color_secondary: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branding) {
      setForm({
        brand_name: branding.brand_name || '',
        brand_abbreviation: branding.brand_abbreviation || '',
        brand_subtitle: branding.brand_subtitle || '',
        brand_color_primary: branding.brand_color_primary || '#1c4f82',
        brand_color_secondary: branding.brand_color_secondary || '#2864a3'
      });
    }
  }, [branding]);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      await request('/branding', {
        method: 'PUT',
        body: JSON.stringify(form)
      });
      setMessage('Configuracion de marca actualizada correctamente');
      setBranding(form);

      // Aplicar colores dinámicos al root
      document.documentElement.style.setProperty('--primary-color', form.brand_color_primary);
      document.documentElement.style.setProperty('--secondary-color', form.brand_color_secondary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetToDefaults() {
    setForm({
      brand_name: 'InventaPro',
      brand_abbreviation: 'IP',
      brand_subtitle: 'Sistema de Conteo e Inventario',
      brand_color_primary: '#1c4f82',
      brand_color_secondary: '#2864a3'
    });
  }

  return (
    <div className="branding-page">
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      
      <div className="admin-page-heading">
        <div />
        <button className="secondary-action" type="button" onClick={resetToDefaults}>
          <RefreshCw size={15} />
          Valores por defecto
        </button>
      </div>

      <div className="grid-2-col">
        <section className="panel branding-card">
          <h3>Personalizacion de Marca y Colores</h3>
          <p className="section-desc">
            Modifique los titulos, siglas y colores principales de la aplicacion para adaptarla a la identidad corporativa.
          </p>

          <form onSubmit={submit} className="modal-form branding-form">
            <label>
              Nombre de Marca
              <input
                type="text"
                required
                maxLength="40"
                value={form.brand_name}
                onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                placeholder="Ej. InventaPro"
              />
            </label>

            <label>
              Sigla / Abreviacion (2-3 letras)
              <input
                type="text"
                required
                maxLength="4"
                value={form.brand_abbreviation}
                onChange={(e) => setForm({ ...form, brand_abbreviation: e.target.value })}
                placeholder="Ej. IP"
              />
            </label>

            <label>
              Subtitulo / Eslogan
              <input
                type="text"
                maxLength="120"
                value={form.brand_subtitle}
                onChange={(e) => setForm({ ...form, brand_subtitle: e.target.value })}
                placeholder="Ej. Sistema de Inventario"
              />
            </label>

            <div className="color-inputs-group">
              <label className="color-label">
                Color Primario (Sidebar, Encabezados)
                <div className="color-picker-wrap">
                  <input
                    type="color"
                    value={form.brand_color_primary}
                    onChange={(e) => setForm({ ...form, brand_color_primary: e.target.value })}
                  />
                  <input
                    type="text"
                    required
                    pattern="^#[0-9a-fA-F]{6}$"
                    value={form.brand_color_primary}
                    onChange={(e) => setForm({ ...form, brand_color_primary: e.target.value })}
                  />
                </div>
              </label>

              <label className="color-label">
                Color Secundario (Botones, Destacados)
                <div className="color-picker-wrap">
                  <input
                    type="color"
                    value={form.brand_color_secondary}
                    onChange={(e) => setForm({ ...form, brand_color_secondary: e.target.value })}
                  />
                  <input
                    type="text"
                    required
                    pattern="^#[0-9a-fA-F]{6}$"
                    value={form.brand_color_secondary}
                    onChange={(e) => setForm({ ...form, brand_color_secondary: e.target.value })}
                  />
                </div>
              </label>
            </div>

            <div className="form-actions-right">
              <button className="primary" type="submit" disabled={loading}>
                <Palette size={16} />
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel preview-card">
          <h3>Vista Previa del Tema</h3>
          <p className="section-desc">
            Visualizacion en tiempo real de como luciran los componentes principales con los colores seleccionados.
          </p>

          <div className="theme-preview-box">
            {/* Sidebar Preview */}
            <div className="preview-element preview-sidebar" style={{ backgroundColor: form.brand_color_primary }}>
              <div className="preview-brand">
                <div className="preview-logo-mark" style={{ backgroundColor: form.brand_color_secondary }}>
                  {form.brand_abbreviation || 'IP'}
                </div>
                <div className="preview-brand-info">
                  <strong>{form.brand_name || 'InventaPro'}</strong>
                  <span>{form.brand_subtitle || 'Sistema de Conteo'}</span>
                </div>
              </div>
              <div className="preview-nav-item active">Dashboard</div>
              <div className="preview-nav-item">Reportes</div>
              <div className="preview-nav-item">Productos</div>
            </div>

            {/* Dashboard Mock Preview */}
            <div className="preview-content-area">
              <div className="preview-header">
                <strong>Panel Principal</strong>
                <div className="preview-user-profile">
                  <div className="avatar">A</div>
                  <span>Admin</span>
                </div>
              </div>

              <div className="preview-body">
                <div className="preview-stat-card">
                  <div className="stat-value">124</div>
                  <div className="stat-label">Conteo Total</div>
                </div>

                <div className="preview-buttons">
                  <button className="primary-btn-mock" style={{ backgroundColor: form.brand_color_primary }}>
                    Boton Primario
                  </button>
                  <button className="secondary-btn-mock" style={{ border: `1px solid ${form.brand_color_secondary}`, color: form.brand_color_secondary }}>
                    Boton Secundario
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
