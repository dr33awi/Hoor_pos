import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  
  // Theme
  darkMode: boolean;
  
  // Toasts
  toasts: Toast[];
  
  // Loading
  isLoading: boolean;
  loadingMessage: string;
  
  // Modal
  modalOpen: boolean;
  modalContent: React.ReactNode | null;
  
  // Actions
  toggleSidebar: () => void;
  toggleSidebarCollapse: () => void;
  toggleDarkMode: () => void;
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  setLoading: (loading: boolean, message?: string) => void;
  openModal: (content: React.ReactNode) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  darkMode: false,
  toasts: [],
  isLoading: false,
  loadingMessage: '',
  modalOpen: false,
  modalContent: null,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  toggleSidebarCollapse: () => set((state) => ({ 
    sidebarCollapsed: !state.sidebarCollapsed 
  })),
  
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  
  showToast: (message, type = 'info') => {
    const id = Date.now().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);
  },
  
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
  
  setLoading: (loading, message = '') => set({
    isLoading: loading,
    loadingMessage: message,
  }),
  
  openModal: (content) => set({
    modalOpen: true,
    modalContent: content,
  }),
  
  closeModal: () => set({
    modalOpen: false,
    modalContent: null,
  }),
}));
