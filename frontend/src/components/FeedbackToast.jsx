import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export function FeedbackToast({ message = '', error = '', warning = '', onClose }) {
  const text = error || warning || message;
  const type = error ? 'error' : warning ? 'warning' : 'success';
  const Icon = error ? AlertTriangle : warning ? Info : CheckCircle;
  const title = error ? 'Error' : warning ? 'Advertencia' : 'Exito';

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
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
        <button className="toast-close" type="button" onClick={onClose} aria-label="Cerrar notificacion">
          <X size={16} />
        </button>
      </article>
    </div>
  );
}
