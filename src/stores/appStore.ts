import { create } from 'zustand'

interface AppState {
  currentPath: string
  setCurrentPath: (path: string) => void
  
  loading: boolean
  setLoading: (loading: boolean) => void
  
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  
  initCurrentPath: () => Promise<void>
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  description?: string
}

export const useAppStore = create<AppState>((set) => ({
  currentPath: '',
  setCurrentPath: (path) => set({ currentPath: path }),
  
  loading: false,
  setLoading: (loading) => set({ loading }),
  
  notifications: [],
  addNotification: (notification) => {
    const id = Date.now().toString()
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }]
    }))
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      }))
    }, 4000)
  },
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
  
  initCurrentPath: async () => {
    try {
      const path = await window.electronAPI.getDefaultPath()
      set({ currentPath: path })
    } catch (error) {
      console.error('Failed to get default path:', error)
    }
  }
}))