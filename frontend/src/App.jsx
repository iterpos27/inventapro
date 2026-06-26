import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, KeyRound, LogOut, Menu, ShieldX, UserCircle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { FeedbackToast } from './components/FeedbackToast';
import { Modal } from './components/Modal';
import { api } from './services/api';
import { navForUser } from './constants/navigation';
import { roleLabel } from './utils/helpers';

// Vistas
import { Login } from './views/Login';
import { MiConteo } from './views/MiConteo';
import { Dashboard } from './views/Dashboard';
import { Productos } from './views/Productos';
import { Conteos } from './views/Conteos';
import { Agencias } from './views/Agencias';
import { Usuarios } from './views/Usuarios';
import { Tomas } from './views/Tomas';
import { Branding } from './views/Branding';
import { Auditoria } from './views/Auditoria';

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('inventapro_user') || 'null');
  } catch {
    localStorage.removeItem('inventapro_user');
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('inventapro_token') || '');
  const [user, setUser] = useState(readStoredUser);
  const [route, setRoute] = useState(user?.rol === 'usuario' || user?.rol === 'operador' ? 'conteo_borradores' : 'dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [accountError, setAccountError] = useState('');
  const accountMenuRef = useRef(null);
  const [branding, setBranding] = useState({
    brand_name: 'InventaPro',
    brand_abbreviation: 'IP',
    brand_subtitle: 'Sistema de Conteo e Inventario',
    brand_logo_url: '',
    brand_favicon_url: '',
    brand_color_primary: '#1c4f82',
    brand_color_secondary: '#2864a3'
  });
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem('inventapro_token');
    localStorage.removeItem('inventapro_user');
    setToken('');
    setUser(null);
    setCheckingSession(false);
    setAccountOpen(false); // Cierra el menú al salir
  }, []);
  const request = useMemo(() => api(token, clearSession), [clearSession, token]);
  const navItems = useMemo(() => navForUser(user), [user]);
  const defaultRoute = navItems[0]?.id || 'conteo_borradores';

  useEffect(() => {
    // Cargar branding desde endpoint público
    api()('/branding')
      .then((data) => {
        if (data?.branding) {
          setBranding(data.branding);
          const primary = data.branding.brand_color_primary || '#1c4f82';
          const secondary = data.branding.brand_color_secondary || '#2864a3';
          document.documentElement.style.setProperty('--primary-color', primary);
          document.documentElement.style.setProperty('--secondary-color', secondary);

          // Actualizar favicon dinámicamente según iniciales y color de marca
          const abbr = data.branding.brand_abbreviation || 'IP';
          const faviconUrl = String(data.branding.brand_favicon_url || '').trim();
          const favicon = document.querySelector('link[rel="icon"]');
          const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${encodeURIComponent(primary)}"/><text x="50" y="55" fill="white" font-size="52" font-weight="bold" font-family="sans-serif" dominant-baseline="middle" text-anchor="middle">${abbr}</text></svg>`;
          if (favicon) {
            favicon.href = faviconUrl || `data:image/svg+xml,${svgHtml}`;
          } else {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.type = faviconUrl ? 'image/png' : 'image/svg+xml';
            link.href = faviconUrl || `data:image/svg+xml,${svgHtml}`;
            document.head.appendChild(link);
          }
        }
      })
      .catch((err) => console.error('Error cargando branding:', err));
  }, []);

  useEffect(() => {
    // Actualizar el título de la pestaña dinámicamente
    const activeLabel = navItems.find((item) => item.id === route)?.label || 'Panel';
    document.title = `${activeLabel} | ${branding.brand_name}`;
  }, [route, branding, navItems]);

  useEffect(() => {
    if (user && !navForUser(user).some((item) => item.id === route)) {
      setRoute(navForUser(user)[0]?.id || 'conteo_borradores');
    }
  }, [route, user]);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [route]);

  useEffect(() => {
    if (!accountOpen && !mobileOpen) {
      return undefined;
    }

    function handlePointer(event) {
      if (accountOpen && accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountOpen(false);
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setMobileOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [accountOpen, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!token) {
      setCheckingSession(false);
      return;
    }
    setCheckingSession(true);
    request('/auth/me')
      .then((data) => {
        localStorage.setItem('inventapro_user', JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, [request, token]);

  function onLogin(session) {
    localStorage.setItem('inventapro_token', session.token);
    localStorage.setItem('inventapro_user', JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
    setRoute(navForUser(session.user)[0]?.id || 'conteo_borradores');
    setCheckingSession(false);
  }

  async function logout() {
    // Revocar el token en el servidor antes de limpiar el estado local
    try {
      await request('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (_) {
      // Si falla la revocación (ej: sin red), el token expirará normalmente
    }
    clearSession();
  }

  async function logoutAll() {
    setAccountError('');
    try {
      await request('/auth/logout-all', { method: 'POST', body: JSON.stringify({}) });
      clearSession();
    } catch (error) {
      setAccountError(error.message);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setAccountError('');
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setAccountError('Las contrasenas nuevas no coinciden');
      return;
    }
    try {
      await request('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: passwordForm.current_password, new_password: passwordForm.new_password })
      });
      clearSession();
    } catch (error) {
      setAccountError(error.message);
    }
  }

  if (checkingSession) {
    return <div className="login-screen"><div className="login-panel"><p>Validando sesion...</p></div></div>;
  }

  if (!token || !user) {
    return <Login onLogin={onLogin} branding={branding} />;
  }

  const Current = {
    conteo_borradores: user?.rol === 'usuario' || user?.rol === 'operador' ? MiConteo : Tomas,
    dashboard: Dashboard,
    productos: Productos,
    conteos: Conteos,
    agencias: Agencias,
    usuarios: Usuarios,
    branding: Branding,
    auditoria: Auditoria
  }[route] || ({ conteo_borradores: MiConteo, dashboard: Dashboard }[defaultRoute]);

  return (
    <div className="shell">
      <Sidebar items={navItems} route={route} setRoute={setRoute} open={mobileOpen} setOpen={setMobileOpen} branding={branding} />
      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">{roleLabel(user?.rol)}</p>
            <h1>{route === 'dashboard' ? 'Panel' : navItems.find((item) => item.id === route)?.label}</h1>
          </div>
          <div className="account-menu" ref={accountMenuRef}>
            <button
              className="account-trigger"
              onClick={() => setAccountOpen((value) => !value)}
              aria-label="Abrir menu de usuario"
              title={user?.nombre || 'Usuario'}
            >
              <UserCircle size={20} />
              <span>
                <strong>{user?.nombre || 'Administrador'}</strong>
                <small>{roleLabel(user?.rol)}</small>
              </span>
              <ChevronDown className="account-chevron" size={16} />
            </button>
            {accountOpen ? (
              <div className="account-popover">
                <button onClick={logout}>
                  <LogOut size={18} />
                  Salir
                </button>
                <button onClick={() => { setPasswordOpen(true); setAccountOpen(false); setAccountError(''); }}>
                  <KeyRound size={18} />
                  Cambiar contrasena
                </button>
                <button onClick={logoutAll}>
                  <ShieldX size={18} />
                  Cerrar todas las sesiones
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <Current request={request} user={user} token={token} setRoute={setRoute} branding={branding} setBranding={setBranding} />
        {passwordOpen ? (
          <Modal title="Cambiar contrasena" onClose={() => { setPasswordOpen(false); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); }} size="sm">
            <form className="modal-form user-modal-form" onSubmit={changePassword}>
              <label>
                Contrasena actual
                <div className="password-input-wrap">
                  <input type={showCurrentPassword ? "text" : "password"} value={passwordForm.current_password} onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })} required />
                  <button type="button" className="toggle-password-btn" onClick={() => setShowCurrentPassword(!showCurrentPassword)} aria-label={showCurrentPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label>
                Nueva contrasena
                <div className="password-input-wrap">
                  <input type={showNewPassword ? "text" : "password"} minLength="10" value={passwordForm.new_password} onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })} required />
                  <button type="button" className="toggle-password-btn" onClick={() => setShowNewPassword(!showNewPassword)} aria-label={showNewPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label>
                Confirmar contrasena
                <div className="password-input-wrap">
                  <input type={showConfirmPassword ? "text" : "password"} minLength="10" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })} required />
                  <button type="button" className="toggle-password-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <FeedbackToast error={accountError} onClose={() => setAccountError('')} />
              <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => { setPasswordOpen(false); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); }}>Cancelar</button><button className="primary" type="submit">Actualizar</button></div>
            </form>
          </Modal>
        ) : null}
      </main>
    </div>
  );
}
