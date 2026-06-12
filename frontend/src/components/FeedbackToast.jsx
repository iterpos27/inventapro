import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

export function FeedbackToast({ message = '', error = '', onClose }) {
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
