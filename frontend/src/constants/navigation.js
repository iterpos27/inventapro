import {
  Gauge,
  ClipboardList,
  FileText,
  Boxes,
  Users,
  Building2,
  Palette,
  ShieldAlert
} from 'lucide-react';

export const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, group: 'main' },
  { id: 'conteo_borradores', label: 'Conteo y Borradores', icon: ClipboardList, group: 'main' },
  { id: 'conteos', label: 'Reportes', icon: FileText, group: 'main' },
  { id: 'productos', label: 'Productos', icon: Boxes, group: 'main' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, group: 'Administracion' },
  { id: 'agencias', label: 'Agencias', icon: Building2, group: 'Administracion' },
  { id: 'branding', label: 'Personalizacion', icon: Palette, group: 'Administracion' },
  { id: 'auditoria', label: 'Auditoria', icon: ShieldAlert, group: 'Administracion' }
];

export function navForUser(user) {
  if (!user) return nav;
  const routesByRole = {
    admin: nav.map((item) => item.id),
    supervisor: ['dashboard', 'conteos'],
    reportes: ['dashboard', 'conteos'],
    usuario: ['conteo_borradores'],
    operador: ['conteo_borradores']
  };
  const allowed = routesByRole[user.rol] || [];
  return nav.filter((item) => allowed.includes(item.id));
}
