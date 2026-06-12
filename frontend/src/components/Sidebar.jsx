import React, { useState } from 'react';
import { X, Settings, ChevronDown } from 'lucide-react';

export function Sidebar({ items, route, setRoute, open, setOpen }) {
  const [adminOpen, setAdminOpen] = useState(false);
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
                        if (item.id === 'administracion') {
                          setAdminOpen((current) => !current);
                          return;
                        }
                        setRoute(item.id);
                        setOpen(false);
                      }}
                    >
                      <Icon size={18} />
                      {item.label}
                      {item.id === 'administracion' ? <ChevronDown className="nav-chevron" size={15} /> : null}
                    </button>
                  );
                })}
                {group.name === 'Administracion' && (adminOpen || groupActive) ? (
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
