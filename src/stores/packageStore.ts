import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import semver from 'semver'

export interface PackageInfo {
  name: string
  version: string
  latest?: string
  wanted?: string
  dependent?: string
  description?: string
  type?: 'dependencies' | 'devDependencies'
  outdated?: boolean
  homepage?: string
  license?: string
  size?: string
  fileCount?: number
}

interface CacheData {
  projectPackages: PackageInfo[]
  globalPackages: PackageInfo[]
  lastUpdate: number
  projectPath: string
}

interface PackageState {
  projectPackages: PackageInfo[]
  globalPackages: PackageInfo[]
  loading: boolean
  packageDetails: Record<string, any>
  cache: Record<string, CacheData>
  currentProjectPath: string
  
  setProjectPackages: (packages: PackageInfo[]) => void
  setGlobalPackages: (packages: PackageInfo[]) => void
  setLoading: (loading: boolean) => void
  setPackageDetails: (name: string, details: any) => void
  setCurrentProjectPath: (path: string) => void
  
  getCache: (path: string) => CacheData | null
  setCache: (path: string, data: CacheData) => void
  clearCache: (path?: string) => void
  isCacheValid: (path: string) => boolean
  
  fetchProjectPackages: (projectPath: string, forceRefresh?: boolean) => Promise<void>
  fetchGlobalPackages: (forceRefresh?: boolean) => Promise<void>
  
  installPackage: (args: InstallArgs) => Promise<void>
  uninstallPackage: (args: UninstallArgs) => Promise<void>
  updatePackage: (args: UpdateArgs) => Promise<void>
  installSpecificVersion: (args: InstallVersionArgs) => Promise<void>
}

interface InstallArgs {
  packageName: string
  cwd?: string
  global?: boolean
  dev?: boolean
  version?: string
}

interface UninstallArgs {
  packageName: string
  cwd?: string
  global?: boolean
}

interface UpdateArgs {
  packageName?: string
  cwd?: string
  global?: boolean
  version?: string
}

interface InstallVersionArgs {
  packageName: string
  version: string
  cwd?: string
  global?: boolean
  dev?: boolean
}

const CACHE_EXPIRY = 5 * 60 * 1000 // 5分钟缓存过期

async function fetchPackageDetailsBatch(packageNames: string[], batchSize = 5): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  
  for (let i = 0; i < packageNames.length; i += batchSize) {
    const batch = packageNames.slice(i, i + batchSize)
    const promises = batch.map(async (name) => {
      try {
        const info = await window.electronAPI.npm.getPackageInfo(name)
        const size = await window.electronAPI.npm.getPackageSize(name)
        return { name, info, size }
      } catch {
        return { name, info: null, size: null }
      }
    })
    
    const batchResults = await Promise.all(promises)
    for (const { name, info, size } of batchResults) {
      if (info) {
        results[name] = { ...info, size }
      }
    }
  }
  
  return results
}

export const usePackageStore = create<PackageState>()(
  persist(
    (set, get) => ({
      projectPackages: [],
      globalPackages: [],
      loading: false,
      packageDetails: {},
      cache: {},
      currentProjectPath: '',
      
      setProjectPackages: (packages) => set({ projectPackages: packages }),
      setGlobalPackages: (packages) => set({ globalPackages: packages }),
      setLoading: (loading) => set({ loading }),
      setPackageDetails: (name, details) => set((state) => ({
        packageDetails: { ...state.packageDetails, [name]: details }
      })),
      setCurrentProjectPath: (path) => set({ currentProjectPath: path }),
      
      getCache: (path) => {
        const state = get()
        return state.cache[path] || null
      },
      
      setCache: (path, data) => set((state) => ({
        cache: { ...state.cache, [path]: data }
      })),
      
      clearCache: (path) => {
        if (path) {
          set((state) => {
            const newCache = { ...state.cache }
            delete newCache[path]
            return { cache: newCache }
          })
        } else {
          set({ cache: {} })
        }
      },
      
      isCacheValid: (path) => {
        const state = get()
        const cached = state.cache[path]
        if (!cached) return false
        return Date.now() - cached.lastUpdate < CACHE_EXPIRY
      },
      
      fetchProjectPackages: async (projectPath: string, forceRefresh = false) => {
        const state = get()
        
        // 检查缓存
        if (!forceRefresh && state.isCacheValid(projectPath) && state.cache[projectPath]?.projectPackages) {
          const cached = state.cache[projectPath]
          set({ 
            projectPackages: cached.projectPackages,
            currentProjectPath: projectPath
          })
          return
        }
        
        set({ loading: true, currentProjectPath: projectPath })
        
        try {
          const listResult = await window.electronAPI.npm.list(projectPath, false)
          const outdatedResult = await window.electronAPI.npm.outdated(projectPath)
          
          const packages: PackageInfo[] = []
          const allPackageNames: string[] = []
          
          if (listResult.dependencies) {
            Object.entries(listResult.dependencies).forEach(([name]: [string, any]) => {
              allPackageNames.push(name)
            })
          }
          
          if (listResult.devDependencies) {
            Object.entries(listResult.devDependencies).forEach(([name]: [string, any]) => {
              allPackageNames.push(name)
            })
          }
          
          // 分批并行获取详情
          const detailsMap = await fetchPackageDetailsBatch([...new Set(allPackageNames)], 10)
          
          if (listResult.dependencies) {
            Object.entries(listResult.dependencies).forEach(([name, info]: [string, any]) => {
              const outdated = outdatedResult[name]
              const details = detailsMap[name]
              const currentVersion = info.version
              const latestVersion = outdated?.latest || details?.version
              
              let isOutdated = !!outdated
              if (!isOutdated && currentVersion && latestVersion) {
                try {
                  isOutdated = semver.lt(currentVersion, latestVersion)
                } catch {
                }
              }
              
              packages.push({
                name,
                version: currentVersion,
                type: 'dependencies' as const,
                wanted: outdated?.wanted,
                latest: latestVersion,
                outdated: isOutdated,
                description: details?.description || '',
                homepage: details?.homepage,
                license: details?.license,
                size: details?.size?.prettySize,
                fileCount: details?.size?.fileCount
              })
            })
          }
          
          if (listResult.devDependencies) {
            Object.entries(listResult.devDependencies).forEach(([name, info]: [string, any]) => {
              const outdated = outdatedResult[name]
              const details = detailsMap[name]
              const currentVersion = info.version
              const latestVersion = outdated?.latest || details?.version
              
              let isOutdated = !!outdated
              if (!isOutdated && currentVersion && latestVersion) {
                try {
                  isOutdated = semver.lt(currentVersion, latestVersion)
                } catch {
                }
              }
              
              packages.push({
                name,
                version: currentVersion,
                type: 'devDependencies' as const,
                wanted: outdated?.wanted,
                latest: latestVersion,
                outdated: isOutdated,
                description: details?.description || '',
                homepage: details?.homepage,
                license: details?.license,
                size: details?.size?.prettySize,
                fileCount: details?.size?.fileCount
              })
            })
          }
          
          // 更新缓存
          get().setCache(projectPath, {
            projectPackages: packages,
            globalPackages: state.globalPackages,
            lastUpdate: Date.now(),
            projectPath
          })
          
          set({ projectPackages: packages })
        } catch (error) {
          console.error('Failed to fetch project packages:', error)
        } finally {
          set({ loading: false })
        }
      },
      
      fetchGlobalPackages: async (forceRefresh = false) => {
        const state = get()
        
        // 全局包缓存键
        const globalCacheKey = '__global_packages__'
        
        if (!forceRefresh && state.isCacheValid(globalCacheKey) && state.cache[globalCacheKey]?.globalPackages) {
          const cached = state.cache[globalCacheKey]
          set({ globalPackages: cached.globalPackages })
          return
        }
        
        set({ loading: true })
        
        try {
          const listResult = await window.electronAPI.npm.list('', true)
          const outdatedResult = await window.electronAPI.npm.globalOutdated()
          
          const packages: PackageInfo[] = []
          const allPackageNames: string[] = []
          
          if (listResult.dependencies) {
            Object.entries(listResult.dependencies).forEach(([name]: [string, any]) => {
              allPackageNames.push(name)
            })
          }
          
          // 分批并行获取详情
          const detailsMap = await fetchPackageDetailsBatch([...new Set(allPackageNames)], 10)
          
          if (listResult.dependencies) {
            Object.entries(listResult.dependencies).forEach(([name, info]: [string, any]) => {
              const outdated = outdatedResult[name]
              const details = detailsMap[name]
              const currentVersion = info.version
              const latestVersion = outdated?.latest || details?.version
              
              let isOutdated = !!outdated
              if (!isOutdated && currentVersion && latestVersion) {
                try {
                  isOutdated = semver.lt(currentVersion, latestVersion)
                } catch {
                }
              }
              
              packages.push({
                name,
                version: currentVersion,
                wanted: outdated?.wanted,
                latest: latestVersion,
                outdated: isOutdated,
                description: details?.description || '',
                homepage: details?.homepage,
                license: details?.license,
                size: details?.size?.prettySize,
                fileCount: details?.size?.fileCount
              })
            })
          }
          
          // 更新缓存
          get().setCache(globalCacheKey, {
            projectPackages: [],
            globalPackages: packages,
            lastUpdate: Date.now(),
            projectPath: globalCacheKey
          })
          
          set({ globalPackages: packages })
        } catch (error) {
          console.error('Failed to fetch global packages:', error)
        } finally {
          set({ loading: false })
        }
      },
      
      installPackage: async (args: InstallArgs) => {
        set({ loading: true })
        try {
          await window.electronAPI.npm.install(args)
          if (args.global) {
            get().clearCache('__global_packages__')
            await get().fetchGlobalPackages()
          } else if (args.cwd) {
            get().clearCache(args.cwd)
            await get().fetchProjectPackages(args.cwd, true)
          }
        } catch (error) {
          console.error('Failed to install package:', error)
          throw error
        } finally {
          set({ loading: false })
        }
      },
      
      uninstallPackage: async (args: UninstallArgs) => {
        set({ loading: true })
        try {
          await window.electronAPI.npm.uninstall(args)
          if (args.global) {
            get().clearCache('__global_packages__')
            await get().fetchGlobalPackages()
          } else if (args.cwd) {
            get().clearCache(args.cwd)
            await get().fetchProjectPackages(args.cwd, true)
          }
        } catch (error) {
          console.error('Failed to uninstall package:', error)
          throw error
        } finally {
          set({ loading: false })
        }
      },
      
      updatePackage: async (args: UpdateArgs) => {
        set({ loading: true })
        try {
          await window.electronAPI.npm.update(args)
          if (args.global) {
            get().clearCache('__global_packages__')
            await get().fetchGlobalPackages()
          } else if (args.cwd) {
            get().clearCache(args.cwd)
            await get().fetchProjectPackages(args.cwd, true)
          }
        } catch (error) {
          console.error('Failed to update package:', error)
          throw error
        } finally {
          set({ loading: false })
        }
      },
      
      installSpecificVersion: async (args: InstallVersionArgs) => {
        set({ loading: true })
        try {
          await window.electronAPI.npm.installVersion(args)
          if (args.global) {
            get().clearCache('__global_packages__')
            await get().fetchGlobalPackages()
          } else if (args.cwd) {
            get().clearCache(args.cwd)
            await get().fetchProjectPackages(args.cwd, true)
          }
        } catch (error) {
          console.error('Failed to install specific version:', error)
          throw error
        } finally {
          set({ loading: false })
        }
      }
    }),
    {
      name: 'package-storage',
      partialize: (state) => ({
        cache: state.cache,
        currentProjectPath: state.currentProjectPath
      })
    }
  )
)
