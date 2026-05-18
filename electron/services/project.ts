import { readFile, access, writeFile } from 'fs/promises'
import { join } from 'path'

export interface ProjectInfo {
  path: string
  name: string
  version: string
  hasPackageJson: boolean
  hasRequirementsTxt: boolean
  hasPomXml: boolean
  hasCargoToml: boolean
  hasGradleBuild: boolean
  hasGoMod: boolean
  hasNativeProject: boolean
  ecosystems: string[]
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown'
}

export class ProjectService {
  async detectProject(projectPath: string): Promise<ProjectInfo> {
    const info: ProjectInfo = {
      path: projectPath,
      name: '',
      version: '',
      hasPackageJson: false,
      hasRequirementsTxt: false,
      hasPomXml: false,
      hasCargoToml: false,
      hasGradleBuild: false,
      hasGoMod: false,
      hasNativeProject: false,
      ecosystems: [],
      packageManager: 'npm'
    }

    info.hasRequirementsTxt = await this.exists(join(projectPath, 'requirements.txt'))
    info.hasPomXml = await this.exists(join(projectPath, 'pom.xml'))
    info.hasCargoToml = await this.exists(join(projectPath, 'Cargo.toml'))
    info.hasGradleBuild = await this.exists(join(projectPath, 'build.gradle'))
      || await this.exists(join(projectPath, 'build.gradle.kts'))
      || await this.exists(join(projectPath, 'settings.gradle'))
      || await this.exists(join(projectPath, 'settings.gradle.kts'))
    info.hasGoMod = await this.exists(join(projectPath, 'go.mod'))
    info.hasNativeProject = await this.exists(join(projectPath, 'CMakeLists.txt'))
      || await this.exists(join(projectPath, 'vcpkg.json'))
      || await this.exists(join(projectPath, 'conanfile.txt'))
      || await this.exists(join(projectPath, 'conanfile.py'))

    try {
      await access(join(projectPath, 'package.json'))
      info.hasPackageJson = true
      
      const pkg = await this.readPackageJson(projectPath)
      info.name = pkg.name || ''
      info.version = pkg.version || ''
      
      if (await this.exists(join(projectPath, 'yarn.lock'))) {
        info.packageManager = 'yarn'
      } else if (await this.exists(join(projectPath, 'pnpm-lock.yaml'))) {
        info.packageManager = 'pnpm'
      } else if (await this.exists(join(projectPath, 'package-lock.json'))) {
        info.packageManager = 'npm'
      }
    } catch (error) {
      info.hasPackageJson = false
    }

    info.ecosystems = [
      info.hasPackageJson ? 'npm' : '',
      info.hasRequirementsTxt ? 'pip' : '',
      info.hasPomXml ? 'maven' : '',
      info.hasCargoToml ? 'cargo' : '',
      info.hasGradleBuild ? 'gradle' : '',
      info.hasGoMod ? 'go' : '',
      info.hasNativeProject ? 'native' : ''
    ].filter(Boolean)

    return info
  }

  async readPackageJson(projectPath: string): Promise<any> {
    const content = await readFile(join(projectPath, 'package.json'), 'utf-8')
    return JSON.parse(content)
  }

  async writePackageJson(projectPath: string, content: any): Promise<void> {
    const jsonContent = JSON.stringify(content, null, 2)
    await writeFile(join(projectPath, 'package.json'), jsonContent, 'utf-8')
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }
}
