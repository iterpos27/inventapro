import React from 'react';

export function IconAction({ label, icon: Icon, variant = 'plain', onClick, type = 'button', disabled = false }) {
  return (
    <button className={`icon-action ${variant}`} type={type} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <Icon size={17} />
    </button>
  );
}
