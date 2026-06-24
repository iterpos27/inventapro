import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { FeedbackToast } from '../components/FeedbackToast';

export function Login({ onLogin, branding }) {
  const [form, setForm] = useState({ usuario: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { brand_name, brand_abbreviation, brand_subtitle, brand_logo_url } = branding || {
    brand_name: 'InventaPro',
    brand_abbreviation: 'IP',
    brand_subtitle: 'Sistema de Conteo e Inventario',
    brand_logo_url: ''
  };

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await api()('/auth/login', { method: 'POST', body: JSON.stringify(form) });
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand large">
          <div className="brand-mark">
            {brand_logo_url ? <img src={brand_logo_url} alt={brand_name || 'Logo'} /> : brand_abbreviation}
          </div>
          <div>
            <strong>{brand_name.toUpperCase()}</strong>
            <span>{brand_subtitle}</span>
          </div>
        </div>
        <label>
          Usuario
          <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} autoFocus />
        </label>
        <label>
          Contrasena
          <div className="password-input-wrap">
            <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="toggle-password-btn" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <FeedbackToast error={error} onClose={() => setError('')} />
        <button className="primary" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
      </form>
      <footer className="login-footer">
        <span>{brand_name}</span>
        <span>Version 1.1.0</span>
      </footer>
    </div>
  );
}
