import React from 'react';
import { X } from 'lucide-react';
import { IconAction } from './IconAction';

export function Modal({ title, children, onClose, size = 'md' }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal-panel ${size === 'sm' ? 'small' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <IconAction label="Cerrar" icon={X} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
