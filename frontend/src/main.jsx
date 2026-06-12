import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Boxes,
  Building2,
  CheckCircle,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  UserCircle,
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
  { id: 'mi_conteo', label: 'Conteo y Borradores', icon: ClipboardList, group: 'main', permissions: ['count'] },
  { id: 'conteos', label: 'Reportes', icon: FileText, group: 'main' },
  { id: 'productos', label: 'Productos', icon: Boxes, group: 'main' },
  { id: 'usuarios', label: 'Administracion', icon: Settings, group: 'main' },
  { id: 'agencias', label: 'Agencias', icon: Building2, group: 'Administracion' },
  { id: 'tomas', label: 'Configuracion del sistema', icon: ClipboardCheck, group: 'Administracion' }
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('inventapro_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('inventapro_user') || 'null'));
  const [route, setRoute] = useState(user?.rol === 'usuario' ? 'mi_conteo' : 'dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const request = useMemo(() => api(token), [token]);
  const navItems = useMemo(() => navForUser(user), [user]);

  useEffect(() => {
    if (user && !navForUser(user).some((item) => item.id === route)) {
      setRoute(user.rol === 'usuario' ? 'mi_conteo' : 'dashboard');
    }
  }, [route, user]);

  function onLogin(session) {
    localStorage.setItem('inventapro_token', session.token);
    localStorage.setItem('inventapro_user', JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
    setRoute(session.user.rol === 'usuario' || session.user.rol === 'operador' ? 'mi_conteo' : 'dashboard');
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
    mi_conteo: MiConteo,
    dashboard: Dashboard,
    productos: Productos,
    tomas: Tomas,
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
  if (!user) return nav.filter((item) => item.id !== 'mi_conteo');
  if (user.rol === 'usuario' || user.rol === 'operador') {
    return nav.filter((item) => item.id === 'mi_conteo');
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
            const visibleItems = group.name === 'Administracion'
              ? group.items.filter((item) => item.id !== 'agencias' && item.id !== 'tomas')
              : group.items;
            const childItems = group.name === 'Administracion'
              ? group.items.filter((item) => item.id === 'agencias' || item.id === 'tomas')
              : [];
            const groupActive = group.items.some((item) => item.id === route);
            return (
              <div className="nav-block plain" key={group.name}>
                {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={route === item.id || (item.id === 'usuarios' && groupActive) ? 'active' : ''}
                    onClick={() => {
                      setRoute(item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon size={18} />
                    {item.label}
                    {item.id === 'usuarios' ? <ChevronDown className="nav-chevron" size={15} /> : null}
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
        {error ? <p className="error">{error}</p> : null}
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

            {message ? <p className="success">{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}

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

function Productos({ request }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ codigo: '', descripcion: '' });
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const load = () => request(`/productos?q=${encodeURIComponent(q)}`).then((data) => setItems(data.productos));
  useEffect(() => { load(); }, []);
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
    const body = new FormData();
    body.append('archivo', file);
    const data = await request('/productos/import', { method: 'POST', body });
    const info = data.importacion;
    setImportMessage(`Importados ${info.procesados}: ${info.insertados} nuevos, ${info.actualizados} actualizados, ${info.omitidos} omitidos.`);
    load();
    event.target.value = '';
  }
  function editProduct(product) {
    setEditing(product);
    setForm({ codigo: product.codigo || '', descripcion: product.descripcion || '' });
    setMessage('');
    setError('');
  }
  function resetProductForm() {
    setEditing(null);
    setForm({ codigo: '', descripcion: '' });
  }
  async function setProductStatus(product, estado) {
    setMessage('');
    setError('');
    try {
      await request(`/productos/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ codigo: product.codigo, descripcion: product.descripcion, estado })
      });
      setMessage(estado ? 'Producto activado correctamente' : 'Producto desactivado correctamente');
      load();
    } catch (err) {
      setError(err.message);
    }
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
    <Crud title="Productos" q={q} setQ={setQ} onSearch={load}>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        <input placeholder="Descripcion" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        <button className="primary">{editing ? 'Actualizar' : 'Guardar'}</button>
        {editing ? <button className="outline-action" type="button" onClick={resetProductForm}>Cancelar</button> : null}
      </form>
      <div className="file-action">
        <label className="file-label">
          Importar productos
          <input type="file" accept=".xlsx,.csv" onChange={importFile} />
        </label>
        {importMessage ? <span>{importMessage}</span> : null}
      </div>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <DataTable
        columns={['codigo', 'descripcion', 'estado', 'acciones']}
        rows={items.map((item) => ({
          ...item,
          acciones: (
            <RowActions
              onEdit={() => editProduct(item)}
              onToggle={() => setProductStatus(item, !item.estado)}
              toggleLabel={item.estado ? 'Desactivar' : 'Activar'}
              onDelete={() => deleteProduct(item)}
            />
          )
        }))}
      />
    </Crud>
  );
}

function Agencias({ request }) {
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState('');
  const [editing, setEditing] = useState(null);
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
        await request(`/agencias/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ nombre, estado: editing.estado }) });
        setMessage('Agencia actualizada correctamente');
      } else {
        await request('/agencias', { method: 'POST', body: JSON.stringify({ nombre }) });
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
    setNombre(agency.nombre || '');
    setMessage('');
    setError('');
  }
  function resetAgencyForm() {
    setEditing(null);
    setNombre('');
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
    <Panel>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Nombre de agencia" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button className="primary">{editing ? 'Actualizar' : 'Guardar'}</button>
        {editing ? <button className="outline-action" type="button" onClick={resetAgencyForm}>Cancelar</button> : null}
      </form>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <DataTable
        columns={['nombre', 'estado', 'acciones']}
        rows={items.map((item) => ({
          ...item,
          acciones: (
            <RowActions
              onEdit={() => editAgency(item)}
              onToggle={() => setAgencyStatus(item, !item.estado)}
              toggleLabel={item.estado ? 'Desactivar' : 'Activar'}
              onDelete={() => deleteAgency(item)}
            />
          )
        }))}
      />
    </Panel>
  );
}

function Usuarios({ request }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: '', usuario: '', password: '', rol: 'usuario' });
  const [editing, setEditing] = useState(null);
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
          body: JSON.stringify({ ...form, estado: editing.estado })
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
    setForm({ nombre: user.nombre || '', usuario: user.usuario || '', password: '', rol: user.rol || 'usuario' });
    setMessage('');
    setError('');
  }
  function resetUserForm() {
    setEditing(null);
    setForm({ nombre: '', usuario: '', password: '', rol: 'usuario' });
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
      if (editing?.id === user.id) resetUserForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Panel>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input placeholder="Usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
        <input placeholder={editing ? 'Nueva contrasena opcional' : 'Contrasena'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
          <option value="admin">admin</option>
          <option value="supervisor">supervisor</option>
          <option value="reportes">reportes</option>
          <option value="usuario">usuario</option>
        </select>
        <button className="primary">{editing ? 'Actualizar' : 'Crear'}</button>
        {editing ? <button className="outline-action" type="button" onClick={resetUserForm}>Cancelar</button> : null}
      </form>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <DataTable
        columns={['nombre', 'usuario', 'rol', 'estado', 'acciones']}
        rows={items.map((item) => ({
          ...item,
          acciones: (
            <RowActions
              onEdit={() => editUser(item)}
              onToggle={() => setUserStatus(item, !item.estado)}
              toggleLabel={item.estado ? 'Desactivar' : 'Activar'}
              onDelete={() => deleteUser(item)}
            />
          )
        }))}
      />
    </Panel>
  );
}

function RowActions({ onEdit, onToggle, toggleLabel, onDelete }) {
  return (
    <div className="row-actions">
      <button className="table-btn" type="button" onClick={onEdit}>Editar</button>
      <button className="outline-action compact" type="button" onClick={onToggle}>{toggleLabel}</button>
      <button className="danger-action compact" type="button" onClick={onDelete}>Eliminar</button>
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
    <div className="tomas-workspace">
      <section className="panel">
        <div className="section-title">
          <h2>{selected ? `Toma ${selected.numero_toma}` : 'Crear toma fisica'}</h2>
          {selected ? <button className="outline-action" onClick={() => { setSelected(null); setParticipants([]); setForm(defaultTomaForm()); }}>Nueva</button> : null}
        </div>
        <TomaForm form={form} setForm={setForm} users={users} onSubmit={selected ? updateToma : createToma} submitLabel={selected ? 'Guardar cambios' : 'Crear toma'} />
        {selected ? (
          <div className="action-grid">
            <button className="secondary-action" onClick={assignUsers}>Asignar usuarios</button>
            <button className="table-btn" onClick={() => changeStatus(selected.estado === 'abierta' ? 'cerrar' : 'reabrir')}>{selected.estado === 'abierta' ? 'Cerrar toma' : 'Reabrir toma'}</button>
            <button className="outline-action" onClick={reuseToma}>Reutilizar toma</button>
            <button className="outline-action" onClick={() => consolidado(selected)}>Consolidado</button>
            <button className="danger-action" onClick={deleteToma}>Eliminar</button>
          </div>
        ) : null}
        {message ? <p className="success">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>Tomas fisicas</h2>
        </div>
        <div className="toma-list admin-list">
          {items.map((item) => (
            <article className={`toma-card ${selected?.id === item.id ? 'selected' : ''}`} key={item.id}>
              <div>
                <strong>{item.numero_toma} · {item.estado}</strong>
                <span>{item.nombre_toma}</span>
                <small>{item.agencia || 'Sin agencia'} · {item.usuarios_asignados} usuarios · {item.usuarios_finalizados} finalizados</small>
              </div>
              <button className="table-btn" onClick={() => openDetail(item.id)}>Detalle</button>
            </article>
          ))}
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
          <DataTable
            columns={['nombre', 'usuario', 'asignacion_estado', 'conteo_estado', 'acciones']}
            rows={participants.map((participant) => ({
              id: participant.usuario_id,
              ...participant,
              acciones: participant.conteo_estado === 'finalizado'
                ? <button className="table-btn" onClick={() => enableUser(participant.usuario_id)}>Habilitar</button>
                : '-'
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}

function TomaForm({ form, setForm, users, onSubmit, submitLabel }) {
  function toggleUser(id) {
    const value = String(id);
    setForm((current) => ({
      ...current,
      usuarios: current.usuarios.includes(value)
        ? current.usuarios.filter((userId) => userId !== value)
        : [...current.usuarios, value]
    }));
  }

  return (
    <form className="toma-form" onSubmit={onSubmit}>
      <input placeholder="Agencia" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
      <label>
        Habilitacion
        <input type="date" value={form.fecha_habilitacion} onChange={(e) => setForm({ ...form, fecha_habilitacion: e.target.value })} />
      </label>
      <label>
        Cierre
        <input type="date" value={form.fecha_cierre} onChange={(e) => setForm({ ...form, fecha_cierre: e.target.value })} />
      </label>
      <label>
        Hora inicio
        <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
      </label>
      <label>
        Hora fin
        <input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
      </label>
      <div className="user-picker">
        {users.map((user) => (
          <label key={user.id}>
            <input type="checkbox" checked={form.usuarios.includes(String(user.id))} onChange={() => toggleUser(user.id)} />
            {user.nombre}
          </label>
        ))}
      </div>
      <button className="primary">{submitLabel}</button>
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
  useEffect(() => { request('/conteos').then((data) => setItems(data.conteos)); }, [request]);
  return (
    <Panel>
      <DataTable
        columns={['numero_toma', 'usuario_nombre', 'estado', 'version', 'fecha_inicio', 'fecha_finalizacion', 'acciones']}
        rows={items.map((item) => ({
          ...item,
          acciones: item.estado === 'finalizado'
            ? <button className="table-btn" onClick={() => downloadFile(token, `/conteos/${item.id}/excel`)}>Excel</button>
            : '-'
        }))}
      />
    </Panel>
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

createRoot(document.getElementById('root')).render(<App />);
