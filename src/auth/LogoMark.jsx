import React from 'react';

export function LogoMark({ size = 40, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="Oryxen"
      width={size}
      height={size}
      className={`select-none ${className}`}
      style={{
        objectFit: 'contain',
        borderRadius: 'var(--radius-md)',
        boxShadow:
          '0 4px 24px rgba(233,69,96,0.30),' +
          '0 0 0 1px rgba(255,255,255,0.10)',
      }}
      draggable={false}
    />
  );
}
