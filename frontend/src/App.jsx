import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Menu, UserCircle, LogOut } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
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

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('inventapro_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('inventapro_user') || 'null'));
  const [route, setRoute] = useState(user?.rol === 'usuario' || user?.rol === 'operador' ? 'conteo_borradores' : 'dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const request = useMemo(() => api(token), [token]);
  const navItems = useMemo(() => navForUser(user), [user]);

  useEffect(() => {
    if (user && !navForUser(user).some((item) => item.id === route)) {
      setRoute(user.rol === 'usuario' || user.rol === 'operador' ? 'conteo_borradores' : 'dashboard');
    }
  }, [route, user]);

  function onLogin(session) {
    localStorage.setItem('inventapro_token', session.token);
    localStorage.setItem('inventapro_user', JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
    setRoute(session.user.rol === 'usuario' || session.user.rol === 'operador' ? 'conteo_borradores' : 'dashboard');
  }

  async function logout() {
    // Revocar el token en el servidor antes de limpiar el estado local
    try {
      await request('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (_) {
      // Si falla la revocación (ej: sin red), el token expirará normalmente
    }
    localStorage.removeItem('inventapro_token');
    localStorage.removeItem('inventapro_user');
    setToken('');
    setUser(null);
  }

  if (!token) {
    return <Login onLogin={onLogin} />;
  }

  const Current = {
    conteo_borradores: user?.rol === 'usuario' || user?.rol === 'operador' ? MiConteo : Tomas,
    dashboard: Dashboard,
    productos: Productos,
    conteos: Conteos,
    agencias: Agencias,
    usuarios: Usuarios
  }[route];

  return (
    <div className="shell">
      <Sidebar items={navItems} route={route} setRoute={setRoute} open={mobileOpen} setOpen={setMobileOpen} />
      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">{roleLabel(user?.rol)}</p>
            <h1>{route === 'dashboard' ? 'Panel' : navItems.find((item) => item.id === route)?.label}</h1>
          </div>
          <div className="account-menu">
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
              </div>
            ) : null}
          </div>
        </header>
        <Current request={request} user={user} token={token} setRoute={setRoute} />
      </main>
    </div>
  );
}
