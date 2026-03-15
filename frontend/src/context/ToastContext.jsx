import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 3500) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, show: true }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type} show`}>
          {t.message}
        </div>
      ))}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
