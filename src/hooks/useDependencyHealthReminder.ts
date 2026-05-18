import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

const SCAN_TTL = 5 * 60 * 1000
const lastScanAt = new Map<string, number>()

export function useDependencyHealthReminder(
  manager: DependencyHealthManager,
  cwd: string,
  enabled: boolean
) {
  const addNotification = useAppStore((state) => state.addNotification)

  useEffect(() => {
    if (!enabled || !cwd) return

    const key = `${manager}:${cwd}`
    const previous = lastScanAt.get(key) || 0
    if (Date.now() - previous < SCAN_TTL) return
    lastScanAt.set(key, Date.now())

    let cancelled = false
    window.electronAPI.dependencyHealth.scan(manager, cwd)
      .then((result) => {
        if (cancelled) return
        const important = result.summary.critical + result.summary.high + result.summary.medium
        if (important <= 0) return
        addNotification({
          type: 'warning',
          message: `${manager} 依赖诊断提醒`,
          description: `发现 ${important} 项循环依赖、版本冲突或配置问题，可打开“依赖诊断”查看修复建议。`
        })
      })
      .catch(() => {
      })

    return () => {
      cancelled = true
    }
  }, [manager, cwd, enabled, addNotification])
}
