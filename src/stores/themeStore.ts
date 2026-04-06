import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'dark' | 'light'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((state) => ({ mode: state.mode === 'dark' ? 'light' : 'dark' }))
    }),
    {
      name: 'theme-storage'
    }
  )
)