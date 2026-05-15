import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PackageInfo } from './packageStore'

export type UpdateStrategy = 'recommended' | 'smart' | 'security' | 'latest'
export type ConflictStrategy = 'prompt' | 'auto-recommended' | 'auto-security'
export type SecuritySensitivity = 'high' | 'medium' | 'low'
export type AppLanguage = 'zh-CN' | 'en-US'

interface SettingsState {
  language: AppLanguage
  updateStrategy: UpdateStrategy
  conflictStrategy: ConflictStrategy
  securitySensitivity: SecuritySensitivity
  setLanguage: (language: AppLanguage) => void
  setUpdateStrategy: (strategy: UpdateStrategy) => void
  setConflictStrategy: (strategy: ConflictStrategy) => void
  setSecuritySensitivity: (sensitivity: SecuritySensitivity) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'zh-CN',
      updateStrategy: 'recommended',
      conflictStrategy: 'prompt',
      securitySensitivity: 'medium',
      setLanguage: (language) => set({ language }),
      setUpdateStrategy: (updateStrategy) => set({ updateStrategy }),
      setConflictStrategy: (conflictStrategy) => set({ conflictStrategy }),
      setSecuritySensitivity: (securitySensitivity) => set({ securitySensitivity })
    }),
    {
      name: 'settings-storage'
    }
  )
)

export function resolvePackageUpdateTarget(pkg: PackageInfo, strategy: UpdateStrategy): string | undefined {
  if (strategy === 'latest' || strategy === 'security') {
    return pkg.latest || pkg.wanted || pkg.version
  }

  return pkg.wanted || pkg.latest || pkg.version
}
