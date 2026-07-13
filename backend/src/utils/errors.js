export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function notFound(req, res) {
  res.status(404).json({ ok: false, message: 'Endpoint no encontrado' });
}

export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(`[Error 500] ${req.method} ${req.path} | IP: ${req.ip || 'unknown'} | User: ${req.user?.id || 'anonymous'}`, error);
  }
  res.status(status).json({
    ok: false,
    message: status >= 500 ? 'Error interno del servidor' : error.message
  });
}

