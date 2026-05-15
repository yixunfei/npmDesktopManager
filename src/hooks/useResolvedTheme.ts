import { useEffect, useState } from 'react'
import { ResolvedThemeMode, ThemeMode } from '../stores/themeStore'

function readSystemTheme(): ResolvedThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useResolvedTheme(mode: ThemeMode): ResolvedThemeMode {
  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>(() => readSystemTheme())

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemMode(media.matches ? 'dark' : 'light')

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return mode === 'system' ? systemMode : mode
}
