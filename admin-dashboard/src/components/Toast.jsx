import React, { useEffect, useState } from 'react';

let pushToast = null;

export function toast(message, type = 'success') {
  if (pushToast) pushToast(message, type);
}

export function toastSuccess(message) {
  toast(message, 'success');
}

export function toastError(message) {
  toast(message, 'error');
}

export default function Toasts() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    pushToast = (message, type) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
