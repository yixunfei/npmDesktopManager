import semver from 'semver'

export interface VersionAnalysis {
  recommended: string | null
  latest: string | null
  safe: string | null
  compatible: string[]
  hasSecurityUpdate: boolean
  hasConflict: boolean
  conflictInfo?: {
    recommendedVersion: string
    safeVersion: string
  }
}

export interface VersionRecommendation {
  packageName: string
  currentVersion: string
  targetVersion: string
  updateType: 'patch' | 'minor' | 'major' | 'unknown'
  isSafe: boolean
  isCompatible: boolean
  changelog?: string
}

export class SmartUpdateService {
  analyzeVersions(
    packageName: string,
    currentVersion: string,
    allVersions: string[],
    wantedVersion?: string,
    latestVersion?: string
  ): VersionAnalysis {
    const result: VersionAnalysis = {
      recommended: wantedVersion || null,
      latest: latestVersion || null,
      safe: null,
      compatible: [],
      hasSecurityUpdate: false,
      hasConflict: false
    }

    const stableVersions = allVersions.filter(v => !this.isPrerelease(v))
    
    result.compatible = stableVersions.filter(v => {
      try {
        return semver.gte(v, currentVersion) && semver.satisfies(v, `^${currentVersion}`)
      } catch {
        return false
      }
    }).sort(semver.rcompare)

    if (result.compatible.length > 0 && !result.recommended) {
      result.recommended = result.compatible[0]
    }

    if (!result.latest && stableVersions.length > 0) {
      result.latest = stableVersions[0]
    }

    result.hasSecurityUpdate = this.checkForSecurityUpdate(packageName, currentVersion, stableVersions)
    result.safe = result.hasSecurityUpdate ? this.findSafeVersion(stableVersions, currentVersion) : null

    if (result.recommended && result.safe && result.recommended !== result.safe) {
      result.hasConflict = true
      result.conflictInfo = {
        recommendedVersion: result.recommended,
        safeVersion: result.safe
      }
    }

    return result
  }

  getUpdateType(currentVersion: string, targetVersion: string): 'patch' | 'minor' | 'major' | 'unknown' {
    try {
      const current = semver.parse(currentVersion)
      const target = semver.parse(targetVersion)
      
      if (!current || !target) return 'unknown'
      
      if (target.major > current.major) return 'major'
      if (target.minor > current.minor) return 'minor'
      if (target.patch > current.patch) return 'patch'
      
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  scoreVersion(version: string, currentVersion: string, hasSecurityFix: boolean = false): number {
    let score = 0

    try {
      if (this.isPrerelease(version)) {
        score -= 30
      } else {
        score += 15
      }

      if (semver.satisfies(version, `^${currentVersion}`)) {
        score += 40
      } else if (semver.satisfies(version, `~${currentVersion}`)) {
        score += 25
      }

      if (hasSecurityFix) {
        score += 35
      }

      const versionAge = this.getVersionAge(version)
      if (versionAge < 7) {
        score += 5
      } else if (versionAge < 30) {
        score += 10
      }

      return Math.max(0, score)
    } catch {
      return 0
    }
  }

  private isPrerelease(version: string): boolean {
    try {
      const parsed = semver.parse(version)
      return !!parsed?.prerelease && parsed.prerelease.length > 0
    } catch {
      return false
    }
  }

  private checkForSecurityUpdate(packageName: string, currentVersion: string, versions: string[]): boolean {
    try {
      const currentMajor = semver.major(currentVersion)
      const currentMinor = semver.minor(currentVersion)
      
      for (const version of versions) {
        try {
          const vMajor = semver.major(version)
          const vMinor = semver.minor(version)
          
          if (vMajor === currentMajor && vMinor === currentMinor) {
            if (semver.gt(version, currentVersion)) {
              if (version.toLowerCase().includes('security') || 
                  version.toLowerCase().includes('fix')) {
                return true
              }
            }
          }
        } catch {
          continue
        }
      }
      
      return false
    } catch {
      return false
    }
  }

  private findSafeVersion(versions: string[], currentVersion: string): string | null {
    try {
      for (const version of versions) {
        if (semver.gt(version, currentVersion)) {
          if (version.toLowerCase().includes('security') || 
              version.toLowerCase().includes('fix')) {
            return version
          }
        }
      }
      
      return versions.filter(v => semver.gt(v, currentVersion))[0] || null
    } catch {
      return null
    }
  }

  private getVersionAge(version: string): number {
    return 30
  }
}
