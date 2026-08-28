import { useContext } from 'react';
import { ToastContext } from '../core/toastContext';

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (msg: string) => console.log('[Toast fallback]:', msg),
    };
  }
  return context;
};
