export function normalizeRole(role) {
  return role === 'operador' ? 'usuario' : role;
}

export function roleCan(role, permission) {
  const matrix = {
    admin: ['admin', 'reports', 'count', 'api_count'],
    supervisor: ['reports', 'count'],
    reportes: ['reports'],
    usuario: ['count', 'api_count']
  };
  return (matrix[normalizeRole(role)] || []).includes(permission);
}

