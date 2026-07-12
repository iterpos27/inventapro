/**
 * Módulo de caché en memoria para búsqueda de productos.
 * Compartido entre mobileApi y webApi para evitar duplicar código
 * y para que ambos APIs se beneficien del mismo caché.
 *
 * El caché tiene un TTL de 60 segundos y se invalida automáticamente
 * cuando hay cambios en el catálogo (INSERT / UPDATE / DELETE de productos).
 */

const productSearchCache = new Map();
const PRODUCT_SEARCH_CACHE_TTL_MS = 60 * 1000;
const PRODUCT_SEARCH_CACHE_MAX = 500;

function productSearchCacheKey(search, limit) {
  return `${String(search || '').trim().replace(/\s+/g, ' ').toLowerCase()}::${limit}`;
}

export function getCachedProductSearch(search, limit) {
  const key = productSearchCacheKey(search, limit);
  const cached = productSearchCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    productSearchCache.delete(key);
    return null;
  }
  return cached.rows;
}

export function setCachedProductSearch(search, limit, rows) {
  if (productSearchCache.size >= PRODUCT_SEARCH_CACHE_MAX) {
    // Eliminar la entrada más antigua (FIFO)
    const oldestKey = productSearchCache.keys().next().value;
    if (oldestKey) productSearchCache.delete(oldestKey);
  }
  productSearchCache.set(productSearchCacheKey(search, limit), {
    rows,
    expiresAt: Date.now() + PRODUCT_SEARCH_CACHE_TTL_MS,
  });
}

export function clearProductSearchCache() {
  productSearchCache.clear();
}
