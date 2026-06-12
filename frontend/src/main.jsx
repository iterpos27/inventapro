import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Boxes,
  Building2,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Plus,
  Save,
  Search,
  Trash2,
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
  { id: 'mi_conteo', label: 'Mi conteo', icon: ClipboardList, permissions: ['count'] },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'productos', label: 'Productos', icon: Boxes },
  { id: 'tomas', label: 'Tomas fisicas', icon: ClipboardCheck },
  { id: 'conteos', label: 'Conteos', icon: PackageSearch },
  { id: 'agencias', label: 'Agencias', icon: Building2 },
  { id: 'usuarios', label: 'Usuarios', icon: Users }
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('inventapro_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('inventapro_user') || 'null'));
  const [route, setRoute] = useState(user?.rol === 'usuario' ? 'mi_conteo' : 'dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

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
            <p className="eyebrow">Centro Ruliman</p>
            <h1>{navItems.find((item) => item.id === route)?.label}</h1>
          </div>
          <div className="account">
            <span>{user?.nombre}</span>
            <button className="icon-btn" onClick={logout} aria-label="Cerrar sesion">
              <LogOut size={18} />
            </button>
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

function Sidebar({ items, route, setRoute, open, setOpen }) {
  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">IP</div>
          <div>
            <strong>InventaPro</strong>
            <span>Inventario fisico</span>
          </div>
          <button className="icon-btn close mobile-only" onClick={() => setOpen(false)} aria-label="Cerrar menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={route === item.id ? 'active' : ''}
                onClick={() => {
                  setRoute(item.id);
                  setOpen(false);
                }}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      {open ? <button className="backdrop mobile-only" onClick={() => setOpen(false)} aria-label="Cerrar menu" /> : null}
    </>
  );
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
  useEffect(() => { request('/dashboard').then((data) => setMetrics(data.metrics)); }, [request]);
  const cards = [
    ['Productos activos', metrics?.productos || 0],
    ['Tomas creadas', metrics?.tomas || 0],
    ['Tomas abiertas', metrics?.tomas_abiertas || 0],
    ['Conteos finalizados', metrics?.conteos_finalizados || 0],
    ['Usuarios activos', metrics?.usuarios || 0]
  ];
  return <section className="grid metrics">{cards.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>;
}

function Productos({ request }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ codigo: '', descripcion: '' });
  const [importMessage, setImportMessage] = useState('');
  const load = () => request(`/productos?q=${encodeURIComponent(q)}`).then((data) => setItems(data.productos));
  useEffect(() => { load(); }, []);
  async function submit(event) {
    event.preventDefault();
    await request('/productos', { method: 'POST', body: JSON.stringify(form) });
    setForm({ codigo: '', descripcion: '' });
    load();
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
  return (
    <Crud title="Productos" q={q} setQ={setQ} onSearch={load}>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        <input placeholder="Descripcion" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        <button className="primary">Guardar</button>
      </form>
      <div className="file-action">
        <label className="file-label">
          Importar productos
          <input type="file" accept=".xlsx,.csv" onChange={importFile} />
        </label>
        {importMessage ? <span>{importMessage}</span> : null}
      </div>
      <DataTable columns={['codigo', 'descripcion', 'estado']} rows={items} />
    </Crud>
  );
}

function Agencias({ request }) {
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState('');
  const load = () => request('/agencias').then((data) => setItems(data.agencias));
  useEffect(() => { load(); }, []);
  async function submit(event) {
    event.preventDefault();
    await request('/agencias', { method: 'POST', body: JSON.stringify({ nombre }) });
    setNombre('');
    load();
  }
  return (
    <Panel>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Nombre de agencia" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button className="primary">Guardar</button>
      </form>
      <DataTable columns={['nombre', 'estado']} rows={items} />
    </Panel>
  );
}

function Usuarios({ request }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: '', usuario: '', password: '', rol: 'usuario' });
  const load = () => request('/usuarios').then((data) => setItems(data.usuarios));
  useEffect(() => { load(); }, []);
  async function submit(event) {
    event.preventDefault();
    await request('/usuarios', { method: 'POST', body: JSON.stringify(form) });
    setForm({ nombre: '', usuario: '', password: '', rol: 'usuario' });
    load();
  }
  return (
    <Panel>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input placeholder="Usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
        <input placeholder="Contrasena" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
          <option value="admin">admin</option>
          <option value="supervisor">supervisor</option>
          <option value="reportes">reportes</option>
          <option value="usuario">usuario</option>
        </select>
        <button className="primary">Crear</button>
      </form>
      <DataTable columns={['nombre', 'usuario', 'rol', 'estado']} rows={items} />
    </Panel>
  );
}

function Tomas({ request, token }) {
  const [items, setItems] = useState([]);
  useEffect(() => { request('/tomas').then((data) => setItems(data.tomas)); }, [request]);
  async function consolidado(toma) {
    await request(`/tomas/${toma.id}/consolidado`, { method: 'POST', body: JSON.stringify({}) });
    await downloadFile(token, `/tomas/${toma.id}/consolidado`);
  }
  return (
    <Panel>
      <DataTable
        columns={['numero_toma', 'nombre_toma', 'agencia', 'estado', 'usuarios_asignados', 'usuarios_finalizados', 'acciones']}
        rows={items.map((item) => ({ ...item, acciones: <button className="table-btn" onClick={() => consolidado(item)}>Consolidado</button> }))}
      />
    </Panel>
  );
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
