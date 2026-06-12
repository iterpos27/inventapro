import {
  Gauge,
  ClipboardList,
  FileText,
  Boxes,
  Users,
  Building2
} from 'lucide-react';

export const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, group: 'main' },
  { id: 'conteo_borradores', label: 'Conteo y Borradores', icon: ClipboardList, group: 'main' },
  { id: 'conteos', label: 'Reportes', icon: FileText, group: 'main' },
  { id: 'productos', label: 'Productos', icon: Boxes, group: 'main' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, group: 'Administracion' },
  { id: 'agencias', label: 'Agencias', icon: Building2, group: 'Administracion' }
];

export function navForUser(user) {
  if (!user) return nav;
  if (user.rol === 'usuario' || user.rol === 'operador') {
    return nav.filter((item) => item.id === 'conteo_borradores');
  }
  return nav;
}
