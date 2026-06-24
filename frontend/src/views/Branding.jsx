import React, { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Palette, RefreshCw } from 'lucide-react';
import { FeedbackToast } from '../components/FeedbackToast';

const DEFAULT_BRANDING = {
  brand_name: 'InventaPro',
  brand_abbreviation: 'IP',
  brand_subtitle: 'Sistema de Conteo e Inventario',
  brand_logo_url: '',
  brand_favicon_url: '',
  brand_color_primary: '#1c4f82',
  brand_color_secondary: '#2864a3'
};

export function Branding({ request, branding, setBranding }) {
  const [form, setForm] = useState(DEFAULT_BRANDING);
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branding) {
      setForm({
        brand_name: branding.brand_name || DEFAULT_BRANDING.brand_name,
        brand_abbreviation: branding.brand_abbreviation || DEFAULT_BRANDING.brand_abbreviation,
        brand_subtitle: branding.brand_subtitle || DEFAULT_BRANDING.brand_subtitle,
        brand_logo_url: branding.brand_logo_url || '',
        brand_favicon_url: branding.brand_favicon_url || '',
        brand_color_primary: branding.brand_color_primary || DEFAULT_BRANDING.brand_color_primary,
        brand_color_secondary: branding.brand_color_secondary || DEFAULT_BRANDING.brand_color_secondary
      });
    }
  }, [branding]);

  const logoPreview = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);
    return form.brand_logo_url || '';
  }, [form.brand_logo_url, logoFile]);

  const faviconPreview = useMemo(() => {
    if (faviconFile) return URL.createObjectURL(faviconFile);
    return form.brand_favicon_url || '';
  }, [faviconFile, form.brand_favicon_url]);

  useEffect(() => () => {
    if (logoPreview && logoFile) {
      URL.revokeObjectURL(logoPreview);
    }
  }, [logoFile, logoPreview]);

  useEffect(() => () => {
    if (faviconPreview && faviconFile) {
      URL.revokeObjectURL(faviconPreview);
    }
  }, [faviconFile, faviconPreview]);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const payload = new FormData();
      payload.append('brand_name', form.brand_name.trim());
      payload.append('brand_abbreviation', form.brand_abbreviation.trim().toUpperCase());
      payload.append('brand_subtitle', form.brand_subtitle.trim());
      payload.append('brand_color_primary', form.brand_color_primary);
      payload.append('brand_color_secondary', form.brand_color_secondary);
      if (logoFile) payload.append('brand_logo', logoFile);
      if (faviconFile) payload.append('brand_favicon', faviconFile);

      const data = await request('/branding', {
        method: 'PUT',
        body: payload
      });

      const nextBranding = {
        ...form,
        ...(data.branding || {}),
        brand_abbreviation: (data.branding?.brand_abbreviation || form.brand_abbreviation).toUpperCase()
      };
      setForm(nextBranding);
      setBranding(nextBranding);
      setLogoFile(null);
      setFaviconFile(null);
      setMessage('Configuracion de marca actualizada correctamente');

      document.documentElement.style.setProperty('--primary-color', nextBranding.brand_color_primary);
      document.documentElement.style.setProperty('--secondary-color', nextBranding.brand_color_secondary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetToDefaults() {
    setForm(DEFAULT_BRANDING);
    setLogoFile(null);
    setFaviconFile(null);
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
          <h3>Personalizacion de marca y colores</h3>
          <p className="section-desc">
            Cambie nombre, siglas, logo, favicon y colores principales para ajustar el sistema a su empresa.
          </p>

          <form onSubmit={submit} className="modal-form branding-form">
            <label>
              Nombre de marca
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
              Sigla / abreviacion (2-4 letras)
              <input
                type="text"
                required
                maxLength="4"
                value={form.brand_abbreviation}
                onChange={(e) => setForm({ ...form, brand_abbreviation: e.target.value.toUpperCase() })}
                placeholder="Ej. IP"
              />
            </label>

            <label>
              Subtitulo / eslogan
              <input
                type="text"
                maxLength="120"
                value={form.brand_subtitle}
                onChange={(e) => setForm({ ...form, brand_subtitle: e.target.value })}
                placeholder="Ej. Sistema de Inventario"
              />
            </label>

            <label>
              Logo del sistema
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              />
              <small>Suba una imagen local. Si no selecciona una nueva, se conserva la actual.</small>
            </label>

            <label>
              Favicon del sistema
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp,.ico"
                onChange={(e) => setFaviconFile(e.target.files?.[0] || null)}
              />
              <small>Se aplicara automaticamente en la pestana del navegador.</small>
            </label>

            <div className="color-inputs-group">
              <label className="color-label">
                Color primario
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
                Color secundario
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
                {loading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel preview-card">
          <h3>Vista previa del tema</h3>
          <p className="section-desc">
            Revise como se vera la marca antes de guardar.
          </p>

          <div className="theme-preview-box">
            <div className="preview-element preview-sidebar" style={{ backgroundColor: form.brand_color_primary }}>
              <div className="preview-brand">
                <div className="preview-logo-mark" style={{ backgroundColor: form.brand_color_secondary }}>
                  {logoPreview
                    ? <img src={logoPreview} alt={form.brand_name || 'Logo'} />
                    : (form.brand_abbreviation || 'IP')}
                </div>
                <div className="preview-brand-info">
                  <strong>{form.brand_name || DEFAULT_BRANDING.brand_name}</strong>
                  <span>{form.brand_subtitle || DEFAULT_BRANDING.brand_subtitle}</span>
                </div>
              </div>
              <div className="preview-nav-item active">Dashboard</div>
              <div className="preview-nav-item">Reportes</div>
              <div className="preview-nav-item">Productos</div>
            </div>

            <div className="preview-content-area">
              <div className="preview-header">
                <strong>Panel principal</strong>
                <div className="preview-user-profile">
                  <div className="avatar">A</div>
                  <span>Admin</span>
                </div>
              </div>

              <div className="preview-body">
                <div className="preview-stat-card">
                  <div className="stat-value">124</div>
                  <div className="stat-label">Conteo total</div>
                </div>

                <div className="preview-buttons">
                  <button className="primary-btn-mock" style={{ backgroundColor: form.brand_color_primary }}>
                    Boton primario
                  </button>
                  <button className="secondary-btn-mock" style={{ border: `1px solid ${form.brand_color_secondary}`, color: form.brand_color_secondary }}>
                    Boton secundario
                  </button>
                </div>

                <div className="preview-buttons">
                  <div className="preview-brand-info" style={{ alignItems: 'center', gap: 10 }}>
                    <ImagePlus size={16} color={form.brand_color_secondary} />
                    <span>{faviconFile ? faviconFile.name : (faviconPreview ? 'Favicon cargado' : 'Sin favicon personalizado')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
