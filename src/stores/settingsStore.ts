import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PackageInfo } from './packageStore'

export type UpdateStrategy = 'recommended' | 'smart' | 'security' | 'latest'
export type ConflictStrategy = 'prompt' | 'auto-recommended' | 'auto-security'
export type SecuritySensitivity = 'high' | 'medium' | 'low'
export type AppLanguage = 'zh-CN' | 'en-US'
export type LanguageSource = 'default' | 'installer' | 'startup' | 'settings'

interface SettingsState {
  language: AppLanguage
  languageInitialized: boolean
  languageSource: LanguageSource
  updateStrategy: UpdateStrategy
  conflictStrategy: ConflictStrategy
  securitySensitivity: SecuritySensitivity
  setLanguage: (language: AppLanguage, source?: LanguageSource) => void
  initializeLanguage: (language: AppLanguage, source: LanguageSource) => void
  setUpdateStrategy: (strategy: UpdateStrategy) => void
  setConflictStrategy: (strategy: ConflictStrategy) => void
  setSecuritySensitivity: (sensitivity: SecuritySensitivity) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'en-US',
      languageInitialized: false,
      languageSource: 'default',
      updateStrategy: 'recommended',
      conflictStrategy: 'prompt',
      securitySensitivity: 'medium',
      setLanguage: (language, source = 'settings') => set({
        language,
        languageInitialized: true,
        languageSource: source
      }),
      initializeLanguage: (language, source) => set({
        language,
        languageInitialized: true,
        languageSource: source
      }),
      setUpdateStrategy: (updateStrategy) => set({ updateStrategy }),
      setConflictStrategy: (conflictStrategy) => set({ conflictStrategy }),
      setSecuritySensitivity: (securitySensitivity) => set({ securitySensitivity })
    }),
    {
      name: 'settings-storage',
      merge: (persisted, current) => {
        const persistedState = (persisted || {}) as Partial<SettingsState>
        const hadLanguagePreference = persistedState.language === 'zh-CN' || persistedState.language === 'en-US'

        return {
          ...current,
          ...persistedState,
          language: persistedState.language || current.language,
          languageInitialized: persistedState.languageInitialized ?? hadLanguagePreference,
          languageSource: persistedState.languageSource || (hadLanguagePreference ? 'settings' : current.languageSource)
        }
      }
    }
  )
)

export function resolvePackageUpdateTarget(pkg: PackageInfo, strategy: UpdateStrategy): string | undefined {
  if (strategy === 'latest' || strategy === 'security') {
    return pkg.latest || pkg.wanted || pkg.version
  }

  return pkg.wanted || pkg.latest || pkg.version
}
