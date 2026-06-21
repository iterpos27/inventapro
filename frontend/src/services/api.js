const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api/admin' : 'http://localhost:4000/api/admin');

export function api(token) {
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

export async function downloadFile(token, path) {
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
