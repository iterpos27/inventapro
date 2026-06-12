import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Plus,
  Power,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Trash2,
  UserCircle,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/admin';

function api(token) {
  return async (path, options = {}) => {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta invalida del servidor' }));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || 'Error de servidor');
    }
    return data;
  };
}

async function downloadFile(token, path) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'No se pudo descargar el archivo' }));
    throw new Error(data.message || 'No se pudo descargar el archivo');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] || 'reporte.xlsx';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, group: 'main' },
  { id: 'conteo_borradores', label: 'Conteo y Borradores', icon: ClipboardList, group: 'main' },
  { id: 'conteos', label: 'Reportes', icon: FileText, group: 'main' },
  { id: 'productos', label: 'Productos', icon: Boxes, group: 'main' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, group: 'Administracion' },
  { id: 'agencias', label: 'Agencias', icon: Building2, group: 'Administracion' }
];

function App() {
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

  function logout() {
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
            <button className="account-trigger" onClick={() => setAccountOpen((value) => !value)}>
              <UserCircle size={22} />
              <span>
                <strong>{user?.nombre || 'Administrador'}</strong>
                <small>{roleLabel(user?.rol)}</small>
              </span>
              <ChevronDown size={16} />
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
        <Current request={request} user={user} token={token} />
      </main>
    </div>
  );
}

function navForUser(user) {
  if (!user) return nav;
  if (user.rol === 'usuario' || user.rol === 'operador') {
    return nav.filter((item) => item.id === 'conteo_borradores');
  }
  return nav;
}

function roleLabel(role) {
  const labels = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    reportes: 'Reportes',
    usuario: 'Usuario',
    operador: 'Usuario'
  };
  return labels[role] || 'Administrador';
}

function Sidebar({ items, route, setRoute, open, setOpen }) {
  const grouped = groupNav(items);
  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">CR</div>
          <div>
            <strong>InventaPro</strong>
            <span>SISTEMA DE INVENTARIO</span>
          </div>
          <button className="icon-btn close mobile-only" onClick={() => setOpen(false)} aria-label="Cerrar menu">
            <X size={18} />
          </button>
        </div>
        <nav className="side-nav">
          {grouped.map((group) => {
            const groupActive = group.items.some((item) => item.id === route);
            const visibleItems = group.name === 'Administracion'
              ? [{ id: 'administracion', label: 'Administracion', icon: Settings }]
              : group.items;
            const childItems = group.name === 'Administracion'
              ? group.items
              : [];
            return (
              <div className="nav-block plain" key={group.name}>
                {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={route === item.id || (item.id === 'administracion' && groupActive) ? 'active' : ''}
                    onClick={() => {
                      setRoute(item.id === 'administracion' ? 'usuarios' : item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon size={18} />
                    {item.label}
                    {item.id === 'administracion' ? <ChevronDown className="nav-chevron" size={15} /> : null}
                  </button>
                );
                })}
                {group.name === 'Administracion' && groupActive ? (
                  <div className="nav-children">
                    {childItems.map((item) => (
                      <button
                        key={item.id}
                        className={route === item.id ? 'active' : ''}
                        onClick={() => {
                          setRoute(item.id);
                          setOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      {open ? <button className="backdrop mobile-only" onClick={() => setOpen(false)} aria-label="Cerrar menu" /> : null}
    </>
  );
}

function groupNav(items) {
  const order = ['main', 'Administracion'];
  return order
    .map((name) => ({ name, items: items.filter((item) => (item.group || 'main') === name) }))
    .filter((group) => group.items.length > 0);
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ usuario: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          <div className="brand-mark">CR</div>
          <div>
            <strong>CENTRO DEL RULIMAN</strong>
            <span>Sistema de Conteo e Inventario</span>
          </div>
        </div>
        <label>
          Usuario
          <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} autoFocus />
        </label>
        <label>
          Contrasena
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <FeedbackToast error={error} onClose={() => setError('')} />
        <button className="primary" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
      </form>
      <footer className="login-footer">
        <span>CENTRO DEL RULIMAN</span>
        <span>Version 1.1.0</span>
      </footer>
    </div>
  );
}

function MiConteo({ request }) {
  const [tomas, setTomas] = useState([]);
  const [conteo, setConteo] = useState(null);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadTomas = () => request('/mi/tomas').then((data) => setTomas(data.tomas));
  useEffect(() => { loadTomas(); }, []);

  async function startToma(toma) {
    setError('');
    setMessage('');
    const started = await request(`/mi/tomas/${toma.toma_id}/iniciar`, { method: 'POST', body: JSON.stringify({}) });
    await loadConteo(started.conteo_id);
    await loadTomas();
  }

  async function loadConteo(conteoId) {
    const data = await request(`/mi/conteos/${conteoId}`);
    setConteo(data.conteo);
    setItems(data.items.map((item) => ({ ...item, cantidad: Number(item.cantidad) })));
    setResults([]);
    setQ('');
  }

  async function searchProducts() {
    setError('');
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const data = await request(`/mi/productos?q=${encodeURIComponent(q.trim())}`);
    setResults(data.productos);
  }

  function addProduct(product) {
    setItems((current) => {
      const existing = current.find((item) => Number(item.producto_id) === Number(product.id));
      if (existing) {
        return current.map((item) => Number(item.producto_id) === Number(product.id) ? { ...item, cantidad: Number(item.cantidad) + 1 } : item);
      }
      return [...current, { producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1 }];
    });
    setQ('');
    setResults([]);
  }

  function updateQty(productoId, cantidad) {
    setItems((current) => current.map((item) => Number(item.producto_id) === Number(productoId) ? { ...item, cantidad } : item));
  }

  function removeItem(productoId) {
    setItems((current) => current.filter((item) => Number(item.producto_id) !== Number(productoId)));
  }

  async function save(finish = false) {
    if (!conteo) return;
    setError('');
    setMessage('');
    const endpoint = finish ? 'finalizar' : 'borrador';
    try {
      const data = await request(`/mi/conteos/${conteo.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ conteo_version: conteo.version, items })
      });
      setConteo((current) => current ? { ...current, version: data.conteo_version, estado: data.estado } : current);
      setMessage(finish ? 'Conteo finalizado' : 'Borrador guardado');
      if (finish) {
        setConteo(null);
        setItems([]);
        await loadTomas();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="count-layout">
      <section className="panel count-panel">
        <div className="section-title">
          <h2>Tomas asignadas</h2>
        </div>
        <div className="toma-list">
          {tomas.map((toma) => (
            <article className={`toma-card ${conteo?.toma_id === toma.toma_id ? 'selected' : ''}`} key={toma.toma_id}>
              <div>
                <strong>{toma.numero_toma}</strong>
                <span>{toma.nombre_toma}</span>
                <small>{toma.agencia || 'Sin agencia'} · {toma.asignacion_estado}</small>
              </div>
              <button className="table-btn" onClick={() => toma.conteo_id ? loadConteo(toma.conteo_id) : startToma(toma)}>
                {toma.conteo_id ? 'Abrir' : 'Iniciar'}
              </button>
            </article>
          ))}
          {tomas.length === 0 ? <p className="muted">No hay tomas abiertas asignadas.</p> : null}
        </div>
      </section>

      <section className="panel count-panel workbench">
        {conteo ? (
          <>
            <div className="section-title">
              <div>
                <h2>{conteo.numero_toma}</h2>
                <p>{conteo.nombre_toma}</p>
              </div>
              <span className="version">v{conteo.version}</span>
            </div>

            <div className="product-search">
              <Search size={18} />
              <input
                placeholder="Codigo o descripcion"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
              />
              <button className="icon-btn" onClick={searchProducts} aria-label="Buscar producto">
                <Search size={18} />
              </button>
            </div>

            {results.length > 0 ? (
              <div className="result-list">
                {results.map((product) => (
                  <button key={product.id} onClick={() => addProduct(product)}>
                    <span><strong>{product.codigo}</strong>{product.descripcion}</span>
                    <Plus size={18} />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="count-items">
              {items.map((item) => (
                <article className="count-item" key={item.producto_id}>
                  <div>
                    <strong>{item.codigo}</strong>
                    <span>{item.descripcion}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.cantidad}
                    onChange={(event) => updateQty(item.producto_id, Number(event.target.value))}
                  />
                  <button className="icon-btn" onClick={() => removeItem(item.producto_id)} aria-label="Quitar producto">
                    <Trash2 size={18} />
                  </button>
                </article>
              ))}
              {items.length === 0 ? <p className="muted">Agrega productos para guardar el conteo.</p> : null}
            </div>

            <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />

            <div className="count-actions">
              <button className="secondary-action" onClick={() => save(false)} disabled={items.length === 0}>
                <Save size={18} />
                Guardar borrador
              </button>
              <button className="primary" onClick={() => save(true)} disabled={items.length === 0}>
                <CheckCircle size={18} />
                Finalizar conteo
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <ClipboardList size={42} />
            <strong>Selecciona una toma</strong>
          </div>
        )}
      </section>
    </div>
  );
}

function Dashboard({ request }) {
  const [metrics, setMetrics] = useState(null);
  const [latest, setLatest] = useState([]);
  useEffect(() => {
    request('/dashboard').then((data) => {
      setMetrics(data.metrics);
      setLatest(data.latest_tomas || []);
    });
  }, [request]);
  const cards = [
    ['Productos', metrics?.productos || 0],
    ['Tomas abiertas', metrics?.tomas_abiertas || 0],
    ['Conteos finalizados', metrics?.conteos_finalizados || 0],
    ['Usuarios activos', metrics?.usuarios || 0]
  ];
  const tomasTotal = Math.max(1, (metrics?.tomas_abiertas || 0) + (metrics?.tomas_finalizadas || 0));
  const conteosTotal = Math.max(1, (metrics?.conteos_finalizados || 0) + (metrics?.conteos_borrador || 0));
  const tomasPercent = Math.round(((metrics?.tomas_finalizadas || 0) / tomasTotal) * 100);
  const conteosPercent = Math.round(((metrics?.conteos_finalizados || 0) / conteosTotal) * 100);

  return (
    <div className="dashboard-view">
      <div className="page-kicker">INVENTARIO FISICO</div>
      <h2>Panel de control</h2>
      <section className="grid metrics">{cards.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
      <section className="dashboard-widgets">
        <DonutCard
          title="Estado de tomas"
          percent={tomasPercent}
          color="#15803d"
          rows={[
            ['Finalizadas', metrics?.tomas_finalizadas || 0, '#15803d'],
            ['Abiertas', metrics?.tomas_abiertas || 0, '#eab308']
          ]}
        />
        <DonutCard
          title="Avance de conteos"
          percent={conteosPercent}
          color="#2563a7"
          rows={[
            ['Finalizados', metrics?.conteos_finalizados || 0, '#15803d'],
            ['Borradores', metrics?.conteos_borrador || 0, '#eab308']
          ]}
        />
        <article className="widget trend-widget">
          <h3>Tendencia de conteos</h3>
          <div className="trend-bars">
            <div className="trend-bar" style={{ height: `${Math.max(34, (metrics?.conteos_finalizados || 1) * 10)}px` }} />
            <strong>{metrics?.conteos_finalizados || 0}</strong>
            <span>{new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' })}</span>
          </div>
        </article>
      </section>
      <div className="quick-actions">
        <button className="primary"><Plus size={18} />Crear toma</button>
        <button className="outline-action"><Boxes size={18} />Productos</button>
        <button className="link-action"><FileText size={18} />Reportes</button>
      </div>
      <section className="panel latest-panel">
        <h3>Ultimas tomas fisicas</h3>
        <DataTable columns={['numero_toma', 'usuarios_asignados', 'estado', 'fecha_creacion', 'fecha_finalizacion']} rows={latest.map((item, index) => ({ id: `${item.numero_toma}-${index}`, ...item }))} />
      </section>
    </div>
  );
}

function DonutCard({ title, percent, color, rows }) {
  return (
    <article className="widget donut-card">
      <h3>{title}</h3>
      <div className="donut-layout">
        <div className="donut" style={{ '--percent': `${percent}%`, '--donut-color': color }}>
          <span>{percent}%</span>
        </div>
        <div className="legend-list">
          {rows.map(([label, value, dot]) => (
            <div className="legend-row" key={label}>
              <i style={{ background: dot }} />
              <strong>{label}: {value}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function IconAction({ label, icon: Icon, variant = 'plain', onClick, type = 'button', disabled = false }) {
  return (
    <button className={`icon-action ${variant}`} type={type} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <Icon size={17} />
    </button>
  );
}

function FeedbackToast({ message = '', error = '', onClose }) {
  const text = error || message;
  const type = error ? 'error' : 'success';
  const Icon = error ? AlertTriangle : CheckCircle;

  useEffect(() => {
    if (!text) return undefined;
    const timer = window.setTimeout(() => {
      onClose?.();
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [text, onClose]);

  if (!text) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <article className={`toast-card ${type}`}>
        <span className="toast-icon">
          <Icon size={20} />
        </span>
        <div className="toast-content">
          <strong>{error ? 'Error' : 'Exito'}</strong>
          <p>{text}</p>
        </div>
        <button className="toast-close" type="button" onClick={onClose} aria-label="Cerrar notificacion">
          <X size={16} />
        </button>
      </article>
    </div>
  );
}

function Modal({ title, children, onClose, size = 'md' }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal-panel ${size === 'sm' ? 'small' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <IconAction label="Cerrar" icon={X} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}

function Productos({ request }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState('codigo');
  const [direction, setDirection] = useState('asc');
  const [form, setForm] = useState({ codigo: '', descripcion: '' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const load = (overrides = {}) => {
    const nextPage = overrides.page ?? page;
    const nextSort = overrides.sort ?? sort;
    const nextDirection = overrides.direction ?? direction;
    return request(`/productos?q=${encodeURIComponent(q)}&page=${nextPage}&perPage=30&sort=${nextSort}&direction=${nextDirection}`).then((data) => {
      setItems(data.productos);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || nextPage));
      setTotalPages(Number(data.totalPages || 1));
      setSort(data.sort || nextSort);
      setDirection(data.direction || nextDirection);
    });
  };
  useEffect(() => { load({ page: 1, sort: 'codigo', direction: 'asc' }); }, []);
  function searchProducts() {
    load({ page: 1 });
  }
  function sortProducts(column) {
    const nextDirection = sort === column && direction === 'asc' ? 'desc' : 'asc';
    load({ page: 1, sort: column, direction: nextDirection });
  }
  function goToPage(nextPage) {
    load({ page: Math.max(1, Math.min(nextPage, totalPages)) });
  }
  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editing) {
        await request(`/productos/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ ...form, estado: editing.estado }) });
        setMessage('Producto actualizado correctamente');
      } else {
        await request('/productos', { method: 'POST', body: JSON.stringify(form) });
        setMessage('Producto guardado correctamente');
      }
      resetProductForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('');
    setError('');
    try {
      const body = new FormData();
      body.append('archivo', file);
      const data = await request('/productos/import', { method: 'POST', body });
      const info = data.importacion;
      const text = `Importados ${info.procesados}: ${info.insertados} nuevos, ${info.actualizados} actualizados, ${info.omitidos} omitidos.`;
      setImportMessage(text);
      setMessage(text);
      load({ page: 1, sort: 'codigo', direction: 'asc' });
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }
  function editProduct(product) {
    setEditing(product);
    setForm({ codigo: product.codigo || '', descripcion: product.descripcion || '' });
    setModalOpen(true);
    setMessage('');
    setError('');
  }
  function resetProductForm() {
    setEditing(null);
    setForm({ codigo: '', descripcion: '' });
    setModalOpen(false);
  }
  async function deleteProduct(product) {
    setMessage('');
    setError('');
    try {
      await request(`/productos/${product.id}`, { method: 'DELETE' });
      setMessage('Producto eliminado correctamente');
      if (editing?.id === product.id) resetProductForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="users-page products-page">
      <div className="admin-page-heading">
        <div>
          <p>CATALOGO</p>
          <h2>Productos</h2>
        </div>
        <div className="product-heading-actions">
          <label className="outline-action product-import-btn">
            <Download size={16} />
            Importar Excel
            <input type="file" accept=".xlsx,.csv" onChange={importFile} />
          </label>
          <button className="primary admin-create-btn" type="button" onClick={() => { resetProductForm(); setModalOpen(true); }}>
            <Plus size={16} />
            Agregar
          </button>
        </div>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      <section className="panel product-search-card">
        <label>
          Buscar producto
          <div className="product-search-row">
            <input
              placeholder="Codigo o descripcion"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
            />
            <button className="primary" type="button" onClick={searchProducts}>
              <Search size={18} />
              Buscar
            </button>
          </div>
        </label>
      </section>
      <section className="panel users-card product-table-card">
        <div className="product-table-title">
          <h3>Inventario</h3>
          <span>{total} productos</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table users-table products-table">
            <thead>
              <tr>
                <th>
                  <button className="sort-header" type="button" onClick={() => sortProducts('codigo')}>
                    Codigo
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>
                  <button className="sort-header" type="button" onClick={() => sortProducts('descripcion')}>
                    Descripcion
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.codigo}</td>
                  <td>{item.descripcion}</td>
                  <td>
                    <div className="text-actions">
                      <button className="edit-text-btn" type="button" onClick={() => editProduct(item)}>
                        <Edit3 size={15} />
                        Editar
                      </button>
                      <button className="delete-text-btn" type="button" onClick={() => deleteProduct(item)}>
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="3">No hay productos para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="pagination-bar">
          <strong>Pagina {page} de {totalPages}</strong>
          <div>
            <button className="outline-action compact" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft size={15} />
              Anterior
            </button>
            <button className="outline-action compact" type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Siguiente
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
        {importMessage ? <p className="muted product-import-summary">{importMessage}</p> : null}
      </section>
      {modalOpen ? (
        <Modal title={editing ? 'Editar producto' : 'Crear producto'} onClose={resetProductForm}>
          <form className="modal-form user-modal-form" onSubmit={submit}>
            <label>
              Codigo
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </label>
            <label>
              Descripcion
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </label>
            <footer className="modal-actions">
              <button className="outline-action" type="button" onClick={resetProductForm}>Cancelar</button>
              <button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Crear'}</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function Agencias({ request }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: '', estado: true });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = () => request('/agencias').then((data) => setItems(data.agencias));
  useEffect(() => { load(); }, []);
  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editing) {
        await request(`/agencias/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        setMessage('Agencia actualizada correctamente');
      } else {
        await request('/agencias', { method: 'POST', body: JSON.stringify({ nombre: form.nombre }) });
        setMessage('Agencia guardada correctamente');
      }
      resetAgencyForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  function editAgency(agency) {
    setEditing(agency);
    setForm({ nombre: agency.nombre || '', estado: Boolean(agency.estado) });
    setModalOpen(true);
    setMessage('');
    setError('');
  }
  function resetAgencyForm() {
    setEditing(null);
    setForm({ nombre: '', estado: true });
    setModalOpen(false);
  }
  async function setAgencyStatus(agency, estado) {
    setMessage('');
    setError('');
    try {
      await request(`/agencias/${agency.id}`, { method: 'PATCH', body: JSON.stringify({ nombre: agency.nombre, estado }) });
      setMessage(estado ? 'Agencia activada correctamente' : 'Agencia desactivada correctamente');
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  async function deleteAgency(agency) {
    setMessage('');
    setError('');
    try {
      await request(`/agencias/${agency.id}`, { method: 'DELETE' });
      setMessage('Agencia desactivada correctamente');
      if (editing?.id === agency.id) resetAgencyForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="users-page">
      <div className="admin-page-heading">
        <div>
          <p>ADMINISTRACION</p>
          <h2>Agencias</h2>
        </div>
        <button className="primary admin-create-btn" type="button" onClick={() => { resetAgencyForm(); setModalOpen(true); }}>
          <Building2 size={16} />
          Crear agencia
        </button>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      <section className="panel users-card">
        <h3>Agencias registradas</h3>
        <div className="table-wrap">
          <table className="admin-table users-table agencies-table">
            <thead>
              <tr>
                <th>Agencia</th>
                <th>Estado</th>
                <th>Creacion</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre}</td>
                  <td><span className={`status-badge ${item.estado ? 'active' : 'inactive'}`}>{item.estado ? 'Activo' : 'Inactivo'}</span></td>
                  <td>{formatDateTime(item.fecha_creacion)}</td>
                  <td>
                    <div className="text-actions">
                      <button className="edit-text-btn" type="button" onClick={() => editAgency(item)}>
                        <Edit3 size={15} />
                        Editar
                      </button>
                      <button className="toggle-text-btn" type="button" onClick={() => setAgencyStatus(item, !item.estado)}>
                        {item.estado ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="delete-text-btn" type="button" onClick={() => deleteAgency(item)}>
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {modalOpen ? (
        <Modal title={editing ? 'Editar agencia' : 'Crear agencia'} onClose={resetAgencyForm}>
          <form className="modal-form user-modal-form" onSubmit={submit}>
            <label>
              {editing ? 'Nombre' : 'Nombre de agencia'}
              <input
                placeholder={editing ? '' : 'PORTOVIEJO 01'}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>
            {editing ? (
              <label>
                Estado
                <select value={form.estado ? '1' : '0'} onChange={(e) => setForm({ ...form, estado: e.target.value === '1' })}>
                  <option value="1">Activa</option>
                  <option value="0">Inactiva</option>
                </select>
              </label>
            ) : null}
            <footer className="modal-actions">
              <button className="outline-action" type="button" onClick={resetAgencyForm}>Cancelar</button>
              <button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Crear'}</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function Usuarios({ request }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: '', usuario: '', password: '', rol: 'usuario' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = () => request('/usuarios').then((data) => setItems(data.usuarios));
  useEffect(() => { load(); }, []);
  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editing) {
        await request(`/usuarios/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...form, estado: form.estado })
        });
        setMessage('Usuario actualizado correctamente');
      } else {
        await request('/usuarios', { method: 'POST', body: JSON.stringify(form) });
        setMessage('Usuario creado correctamente');
      }
      resetUserForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  function editUser(user) {
    setEditing(user);
    setForm({ nombre: user.nombre || '', usuario: user.usuario || '', password: '', rol: user.rol || 'usuario', estado: Boolean(user.estado) });
    setModalOpen(true);
    setMessage('');
    setError('');
  }
  function resetUserForm() {
    setEditing(null);
    setForm({ nombre: '', usuario: '', password: '', rol: 'usuario', estado: true });
    setModalOpen(false);
  }
  async function setUserStatus(user, estado) {
    setMessage('');
    setError('');
    try {
      await request(`/usuarios/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: user.nombre, usuario: user.usuario, password: '', rol: user.rol, estado })
      });
      setMessage(estado ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente');
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  async function deleteUser(user) {
    setMessage('');
    setError('');
    try {
      await request(`/usuarios/${user.id}`, { method: 'DELETE' });
      setMessage('Usuario desactivado correctamente');
      setDeleteTarget(null);
      if (editing?.id === user.id) resetUserForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="users-page">
      <div className="admin-page-heading">
        <div>
          <p>ADMINISTRACION</p>
          <h2>Usuarios</h2>
        </div>
        <button className="primary admin-create-btn" type="button" onClick={() => { resetUserForm(); setModalOpen(true); }}>
          <UserPlus size={16} />
          Crear usuario
        </button>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />
      <section className="panel users-card">
        <h3>Usuarios registrados</h3>
        <div className="table-wrap">
          <table className="admin-table users-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre}</td>
                  <td>{item.usuario}</td>
                  <td>{item.rol}</td>
                  <td><span className={`status-badge ${item.estado ? 'active' : 'inactive'}`}>{item.estado ? 'Activo' : 'Inactivo'}</span></td>
                  <td>{formatDateTime(item.fecha_creacion)}</td>
                  <td>
                    <div className="text-actions">
                      <button className="edit-text-btn" type="button" onClick={() => editUser(item)}>
                        <Edit3 size={15} />
                        Editar
                      </button>
                      <button className="delete-text-btn" type="button" onClick={() => setDeleteTarget(item)}>
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {modalOpen ? (
        <Modal title={editing ? 'Editar usuario' : 'Crear usuario'} onClose={resetUserForm}>
          <form className="modal-form user-modal-form" onSubmit={submit}>
            <label>
              Nombre
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label>
              Usuario
              <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
            </label>
            <label>
              {editing ? 'Clave nueva' : 'Contrasena'}
              <input
                type="password"
                placeholder={editing ? 'Dejar vacio para no cambiar' : ''}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <div className={editing ? 'modal-two-cols' : ''}>
              <label>
                Rol
                <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="reportes">Reportes</option>
                  <option value="usuario">Usuario</option>
                </select>
              </label>
              {editing ? (
                <label>
                  Estado
                  <select value={form.estado ? '1' : '0'} onChange={(e) => setForm({ ...form, estado: e.target.value === '1' })}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </label>
              ) : null}
            </div>
            <footer className="modal-actions">
              <button className="outline-action" type="button" onClick={resetUserForm}>Cancelar</button>
              <button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Crear'}</button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {deleteTarget ? (
        <Modal title="Eliminar usuario" onClose={() => setDeleteTarget(null)} size="sm">
          <div className="confirm-body">
            Desea eliminar/desactivar el usuario <strong>{deleteTarget.nombre}</strong>?
          </div>
          <footer className="modal-actions">
            <button className="outline-action" type="button" onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button className="danger-solid" type="button" onClick={() => deleteUser(deleteTarget)}>Si, eliminar</button>
          </footer>
        </Modal>
      ) : null}
    </div>
  );
}

function RowActions({ onEdit, onToggle, toggleLabel, onDelete }) {
  return (
    <div className="row-actions">
      <IconAction label="Editar" icon={Edit3} onClick={onEdit} />
      <IconAction label={toggleLabel} icon={Power} variant="outline" onClick={onToggle} />
      <IconAction label="Eliminar" icon={Trash2} variant="danger" onClick={onDelete} />
    </div>
  );
}

function Tomas({ request, token }) {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultTomaForm());
  const [modalOpen, setModalOpen] = useState(false);

  const load = () => request('/tomas').then((data) => setItems(data.tomas));
  const loadUsers = () => request('/usuarios').then((data) => setUsers(data.usuarios.filter((user) => ['usuario', 'operador'].includes(user.rol) && user.estado)));
  useEffect(() => { load(); loadUsers(); }, []);

  async function createToma(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      const data = await request('/tomas', { method: 'POST', body: JSON.stringify({ ...form, usuarios: form.usuarios.map(Number) }) });
      setMessage(data.message || 'Toma creada');
      setForm(defaultTomaForm());
      setModalOpen(false);
      await load();
      await openDetail(data.toma.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openDetail(id) {
    setMessage('');
    setError('');
    const data = await request(`/tomas/${id}`);
    setSelected(data.toma);
    setParticipants(data.participantes);
    setForm({
      agencia: data.toma.agencia || '',
      fecha_habilitacion: String(data.toma.fecha_habilitacion || data.toma.fecha_toma || '').slice(0, 10),
      fecha_cierre: String(data.toma.fecha_cierre || '').slice(0, 10),
      hora_inicio: String(data.toma.hora_inicio || '').slice(0, 5),
      hora_fin: String(data.toma.hora_fin || '').slice(0, 5),
      usuarios: []
    });
  }

  async function updateToma(event) {
    event.preventDefault();
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setMessage(data.message || 'Toma actualizada');
      setModalOpen(false);
      await load();
      await openDetail(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignUsers() {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/asignaciones`, { method: 'POST', body: JSON.stringify({ usuarios: form.usuarios.map(Number) }) });
      setMessage(data.message || 'Usuarios asignados');
      setForm((current) => ({ ...current, usuarios: [] }));
      await openDetail(selected.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(accion) {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/estado`, { method: 'POST', body: JSON.stringify({ accion }) });
      setMessage(data.message);
      await openDetail(selected.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reuseToma() {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      const data = await request(`/tomas/${selected.id}/reutilizar`, { method: 'POST', body: JSON.stringify(form) });
      setMessage(data.message);
      await load();
      await openDetail(data.toma.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function enableUser(usuarioId) {
    if (!selected) return;
    const data = await request(`/tomas/${selected.id}/usuarios/${usuarioId}/habilitar`, { method: 'POST', body: JSON.stringify({}) });
    setMessage(data.message);
    await openDetail(selected.id);
    await load();
  }

  async function deleteToma() {
    if (!selected) return;
    setMessage('');
    setError('');
    try {
      await request(`/tomas/${selected.id}`, { method: 'DELETE' });
      setSelected(null);
      setParticipants([]);
      setForm(defaultTomaForm());
      setModalOpen(false);
      setMessage('Toma eliminada correctamente');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function consolidado(toma) {
    await request(`/tomas/${toma.id}/consolidado`, { method: 'POST', body: JSON.stringify({}) });
    await downloadFile(token, `/tomas/${toma.id}/consolidado`);
  }

  return (
    <div className="users-page tomas-page">
      <div className="admin-page-heading">
        <div>
          <p>CONTEO FISICO</p>
          <h2>Crear toma fisica</h2>
        </div>
      </div>
      <FeedbackToast message={message} error={error} onClose={() => { setMessage(''); setError(''); }} />

      <section className="panel toma-create-panel">
        <h3>Crear toma fisica</h3>
        <TomaForm form={form} setForm={setForm} users={users} onSubmit={createToma} submitLabel="Crear toma fisica" mode="inline" />
      </section>

      <section className="panel users-card toma-table-card">
        <h3>Tomas abiertas</h3>
        <div className="table-wrap">
          <table className="admin-table users-table tomas-table">
            <thead>
              <tr>
                <th>Toma fisica</th>
                <th>Asignados</th>
                <th>En proceso</th>
                <th>Finalizados</th>
                <th>Periodo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? 'selected-row' : ''}>
                  <td>
                    <strong>TOMA FISICA # {item.numero_toma}</strong>
                    <span>AGENCIA: {item.agencia || ''}</span>
                    <span>HABILITACION: {formatPeriodDate(item.fecha_habilitacion, item.hora_inicio)}</span>
                    <span>FINALIZACION: {formatPeriodDate(item.fecha_cierre, item.hora_fin)}</span>
                  </td>
                  <td>{item.usuarios_asignados || 0}</td>
                  <td>{Math.max(Number(item.usuarios_asignados || 0) - Number(item.usuarios_finalizados || 0), 0)}</td>
                  <td>{item.usuarios_finalizados || 0}</td>
                  <td>{formatShortPeriod(item)}</td>
                  <td>
                    <button className="outline-action compact" type="button" onClick={() => openDetail(item.id)}>Ver detalle</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan="6">No hay tomas registradas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="panel tomas-detail">
          <div className="section-title">
            <div>
              <h2>Participantes</h2>
              <p>{selected.nombre_toma}</p>
            </div>
            <span className="version">{selected.estado}</span>
          </div>
          <div className="action-grid toma-detail-actions">
            <IconAction label="Editar toma" icon={Edit3} variant="primary" onClick={() => setModalOpen(true)} />
            <IconAction label="Asignar usuarios" icon={UserPlus} variant="success" onClick={assignUsers} />
            <IconAction label={selected.estado === 'abierta' ? 'Cerrar toma' : 'Reabrir toma'} icon={Power} variant="primary" onClick={() => changeStatus(selected.estado === 'abierta' ? 'cerrar' : 'reabrir')} />
            <IconAction label="Reutilizar toma" icon={RefreshCcw} variant="outline" onClick={reuseToma} />
            <IconAction label="Consolidado" icon={Download} variant="outline" onClick={() => consolidado(selected)} />
            <IconAction label="Eliminar toma" icon={Trash2} variant="danger" onClick={deleteToma} />
          </div>
          <DataTable
            columns={['nombre', 'usuario', 'asignacion_estado', 'conteo_estado', 'acciones']}
            rows={participants.map((participant) => ({
              id: participant.usuario_id,
              ...participant,
              acciones: participant.conteo_estado === 'finalizado'
                ? <IconAction label="Habilitar conteo" icon={RefreshCcw} variant="primary" onClick={() => enableUser(participant.usuario_id)} />
                : '-'
            }))}
          />
        </section>
      ) : null}
      {modalOpen ? (
        <Modal title="Editar toma" onClose={() => setModalOpen(false)}>
          <TomaForm form={form} setForm={setForm} users={users} onSubmit={updateToma} submitLabel="Guardar cambios" />
        </Modal>
      ) : null}
    </div>
  );
}

function TomaForm({ form, setForm, users, onSubmit, submitLabel, mode = 'modal' }) {
  function toggleUser(id) {
    const value = String(id);
    setForm((current) => ({
      ...current,
      usuarios: current.usuarios.includes(value)
        ? current.usuarios.filter((userId) => userId !== value)
        : [...current.usuarios, value]
    }));
  }
  function selectAllUsers() {
    setForm((current) => ({ ...current, usuarios: users.map((user) => String(user.id)) }));
  }
  function clearUsers() {
    setForm((current) => ({ ...current, usuarios: [] }));
  }
  function updateDateTime(field, value) {
    const [date = '', time = ''] = value.split('T');
    setForm((current) => field === 'start'
      ? { ...current, fecha_habilitacion: date, hora_inicio: time }
      : { ...current, fecha_cierre: date, hora_fin: time });
  }
  const inline = mode === 'inline';

  return (
    <form className={`toma-form ${inline ? 'inline-toma-form' : ''}`} onSubmit={onSubmit}>
      {inline ? (
        <label>
          Toma fisica #
          <input value={previewTomaNumber(form.fecha_habilitacion)} readOnly />
        </label>
      ) : null}
      <label>
        Agencia
        <input placeholder="Sin agencia" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
      </label>
      <label>
        Habilitacion
        <input
          type={inline ? 'datetime-local' : 'date'}
          value={inline ? composeDateTime(form.fecha_habilitacion, form.hora_inicio) : form.fecha_habilitacion}
          onChange={(e) => inline ? updateDateTime('start', e.target.value) : setForm({ ...form, fecha_habilitacion: e.target.value })}
        />
      </label>
      <label>
        Finalizacion
        <input
          type={inline ? 'datetime-local' : 'date'}
          value={inline ? composeDateTime(form.fecha_cierre, form.hora_fin) : form.fecha_cierre}
          onChange={(e) => inline ? updateDateTime('end', e.target.value) : setForm({ ...form, fecha_cierre: e.target.value })}
        />
      </label>
      {!inline ? (
        <>
          <label>
            Hora inicio
            <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
          </label>
          <label>
            Hora fin
            <input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
          </label>
        </>
      ) : null}
      {inline ? (
        <div className="toma-preview">
          <strong>TOMA FISICA # {previewTomaNumber(form.fecha_habilitacion)}</strong>
          <span>AGENCIA: {form.agencia || ''}</span>
          <span>HABILITACION: {formatPeriodDate(form.fecha_habilitacion, form.hora_inicio)}</span>
          <span>FINALIZACION: {formatPeriodDate(form.fecha_cierre, form.hora_fin)}</span>
        </div>
      ) : null}
      <div className="user-picker-heading">
        <strong>Usuarios participantes</strong>
        <span>
          <button className="outline-action compact" type="button" onClick={selectAllUsers}>Todos</button>
          <button className="link-action compact" type="button" onClick={clearUsers}>Ninguno</button>
        </span>
      </div>
      <div className={`user-picker ${inline ? 'wide' : ''}`}>
        {users.map((user) => (
          <label key={user.id}>
            <input type="checkbox" checked={form.usuarios.includes(String(user.id))} onChange={() => toggleUser(user.id)} />
            <span>
              <strong>{user.nombre}</strong>
              <small>{user.usuario}</small>
            </span>
          </label>
        ))}
      </div>
      <button className="primary toma-submit" type="submit">
        <Plus size={16} />
        {submitLabel}
      </button>
    </form>
  );
}

function defaultTomaForm() {
  return {
    agencia: '',
    fecha_habilitacion: '',
    fecha_cierre: '',
    hora_inicio: '',
    hora_fin: '',
    usuarios: []
  };
}

function Conteos({ request, token }) {
  const [items, setItems] = useState([]);
  const [from, setFrom] = useState(defaultReportRange().from);
  const [to, setTo] = useState(defaultReportRange().to);
  useEffect(() => { request('/conteos').then((data) => setItems(data.conteos)); }, [request]);
  const filtered = useMemo(() => items.filter((item) => isWithinRange(item.fecha_inicio || item.fecha_finalizacion, from, to)), [items, from, to]);
  const dailyRows = useMemo(() => buildDailyReport(filtered), [filtered]);
  const tomaRows = useMemo(() => buildTomaReport(items), [items]);

  return (
    <div className="users-page reports-page">
      <div className="admin-page-heading">
        <div>
          <p>AUDITORIA</p>
          <h2>Reportes</h2>
        </div>
      </div>

      <section className="panel users-card report-card">
        <h3>Reporte por rango de fechas</h3>
        <div className="report-filter">
          <label>
            Desde
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="primary" type="button">
            <Search size={18} />
            Consultar
          </button>
        </div>
        <div className="table-wrap">
          <table className="admin-table users-table report-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Conteos</th>
                <th>Borradores</th>
                <th>Finalizados</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length ? dailyRows.map((row) => (
                <tr key={row.day}>
                  <td>{formatDateOnly(row.day)}</td>
                  <td>{row.total}</td>
                  <td>{row.drafts}</td>
                  <td>{row.finished}</td>
                </tr>
              )) : (
                <tr>
                  <td className="empty-table" colSpan="4">Sin movimientos para el rango seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel users-card report-card">
        <h3>Exportaciones por toma fisica</h3>
        <div className="table-wrap">
          <table className="admin-table users-table report-table export-table">
            <thead>
              <tr>
                <th>Toma fisica</th>
                <th>Estado</th>
                <th>Usuarios</th>
                <th>Finalizados</th>
                <th>Fin</th>
                <th>Excel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tomaRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>TOMA FISICA # {row.numero_toma || '-'}</strong>
                    <span>AGENCIA: {row.agencia || ''}</span>
                    <span>{row.nombre_toma}</span>
                  </td>
                  <td><span className={`report-status ${row.status}`}>{row.statusLabel}</span></td>
                  <td>{row.total}</td>
                  <td>{row.finished}</td>
                  <td>{formatDateTime(row.finishedAt)}</td>
                  <td>
                    {row.excelId ? (
                      <button className="link-action compact" type="button" onClick={() => downloadFile(token, `/conteos/${row.excelId}/excel`)}>Excel</button>
                    ) : 'Pendiente'}
                  </td>
                  <td>
                    <button
                      className="outline-action compact"
                      type="button"
                      disabled={!row.excelId}
                      onClick={() => row.excelId && downloadFile(token, `/conteos/${row.excelId}/excel`)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {tomaRows.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan="7">No hay tomas fisicas para exportar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Crud({ children, q, setQ, onSearch }) {
  return (
    <Panel>
      <div className="searchbar">
        <Search size={18} />
        <input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch()} />
        <button onClick={onSearch}>Buscar</button>
      </div>
      {children}
    </Panel>
  );
}

function Panel({ children }) {
  return <section className="panel">{children}</section>;
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((col) => <th key={col}>{col.replaceAll('_', ' ')}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => <td key={col}>{formatValue(row[col])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(value) {
  if (React.isValidElement(value)) return value;
  if (typeof value === 'boolean') return value ? 'Activo' : 'Inactivo';
  if (value == null) return '-';
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('sv-SE').replace('T', ' ').slice(0, 19);
}

function composeDateTime(date, time) {
  if (!date && !time) return '';
  return `${date || ''}T${time || ''}`;
}

function previewTomaNumber(date) {
  const year = String(date || new Date().getFullYear()).slice(0, 4);
  return `${year}-000`;
}

function formatPeriodDate(date, time) {
  if (!date && !time) return '';
  const dateOnly = String(date || '1970-01-01').slice(0, 10);
  const timeOnly = String(time || '00:00').slice(0, 5);
  const parsed = new Date(`${dateOnly}T${timeOnly}`);
  if (Number.isNaN(parsed.getTime())) return `${dateOnly || ''} ${timeOnly || ''}`.trim();
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
  const dayName = days[parsed.getDay()];
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const yyyy = parsed.getFullYear();
  return `${dayName} ${dd}/${mm}/${yyyy} ${timeOnly || ''}`.trim();
}

function formatShortPeriod(toma) {
  const start = `${String(toma.fecha_habilitacion || '').slice(0, 10)} ${String(toma.hora_inicio || '').slice(0, 5)}`.trim();
  const end = `${String(toma.fecha_cierre || '').slice(0, 10)} ${String(toma.hora_fin || '').slice(0, 5)}`.trim();
  return `${start} / ${end}`;
}

function defaultReportRange() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10)
  };
}

function isWithinRange(value, from, to) {
  if (!value) return false;
  const day = String(value).slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

function buildDailyReport(items) {
  const days = new Map();
  for (const item of items) {
    const day = String(item.fecha_inicio || item.fecha_finalizacion || '').slice(0, 10);
    if (!day) continue;
    const current = days.get(day) || { day, total: 0, drafts: 0, finished: 0 };
    current.total += 1;
    if (item.estado === 'finalizado') current.finished += 1;
    else current.drafts += 1;
    days.set(day, current);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function buildTomaReport(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.toma_id || item.numero_toma || item.id;
    const current = groups.get(key) || {
      id: key,
      numero_toma: item.numero_toma,
      nombre_toma: item.nombre_toma || '',
      agencia: parseAgencyFromTomaName(item.nombre_toma),
      total: 0,
      finished: 0,
      status: 'open',
      statusLabel: 'abierta',
      excelId: null,
      finishedAt: null
    };
    current.total += 1;
    if (item.estado === 'finalizado') {
      current.finished += 1;
      current.excelId = current.excelId || item.id;
      current.finishedAt = item.fecha_finalizacion || current.finishedAt;
    }
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    status: group.finished > 0 && group.finished === group.total ? 'done' : 'open',
    statusLabel: group.finished > 0 && group.finished === group.total ? 'finalizada' : 'abierta'
  }));
}

function parseAgencyFromTomaName(value) {
  const match = String(value || '').match(/AGENCIA:\s*([^\n\r]*)/i);
  return match?.[1]?.trim() || '';
}

function formatDateOnly(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

createRoot(document.getElementById('root')).render(<App />);
