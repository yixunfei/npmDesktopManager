import { readFile, access, writeFile } from 'fs/promises'
import { join } from 'path'

export interface ProjectInfo {
  path: string
  name: string
  version: string
  hasPackageJson: boolean
  hasRequirementsTxt: boolean
  hasPomXml: boolean
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
      packageManager: 'npm'
    }

    info.hasRequirementsTxt = await this.exists(join(projectPath, 'requirements.txt'))
    info.hasPomXml = await this.exists(join(projectPath, 'pom.xml'))

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
