'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheckCircle,
  FiXCircle,
  FiInfo,
  FiX,
} from 'react-icons/fi';

interface ToastData {
  message: string;
  type: 'success' | 'error' | 'info';
}

const toastConfig = {
  success: {
    icon: FiCheckCircle,
    title: 'Éxito',
    container: 'bg-white border border-green-200 shadow-green-100',
    iconWrap: 'bg-green-100 text-green-600',
    titleClass: 'text-green-700',
    textClass: 'text-slate-600',
    progress: 'bg-green-500',
  },
  error: {
    icon: FiXCircle,
    title: 'Error',
    container: 'bg-white border border-red-200 shadow-red-100',
    iconWrap: 'bg-red-100 text-red-600',
    titleClass: 'text-red-700',
    textClass: 'text-slate-600',
    progress: 'bg-red-500',
  },
  info: {
    icon: FiInfo,
    title: 'Información',
    container: 'bg-white border border-blue-200 shadow-blue-100',
    iconWrap: 'bg-blue-100 text-blue-600',
    titleClass: 'text-blue-700',
    textClass: 'text-slate-600',
    progress: 'bg-blue-500',
  },
};

const ToastListener = () => {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const closeToast = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast(null);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const { message, type } = (event as CustomEvent).detail as ToastData;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      setToast({ message, type });

      timeoutRef.current = setTimeout(() => {
        setToast(null);
      }, 3000);
    };

    window.addEventListener('toast', handler);

    return () => {
      window.removeEventListener('toast', handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const config = toast ? toastConfig[toast.type] : null;
  const Icon = config?.icon;

  return (
    <AnimatePresence mode="wait">
      {toast && config && Icon && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-5 right-5 z-[9999] w-[calc(100%-2rem)] max-w-xs"
        >
          <div
            className={`
              relative overflow-hidden rounded-2xl
              shadow-2xl
              ${config.container}
            `}
          >
            <div className="flex items-start gap-3 p-4">
              <div
                className={`
                  flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                  ${config.iconWrap}
                `}
              >
                <Icon size={22} strokeWidth={2.4} />
              </div>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${config.titleClass}`}>
                  {config.title}
                </p>
                <p className={`mt-1 text-sm leading-5 ${config.textClass}`}>
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={closeToast}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar notificación"
              >
                <FiX size={16} />
              </button>
            </div>

            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 3, ease: 'linear' }}
              className={`h-[4px] ${config.progress}`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ToastListener;