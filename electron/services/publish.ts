import { exec } from 'child_process'
import { promisify } from 'util'
import { access, readFile } from 'fs/promises'
import { join } from 'path'

const execAsync = promisify(exec)

export interface PublishCheckResult {
  canPublish: boolean
  errors: string[]
  warnings: string[]
  packageInfo: any
}

export class PublishService {
  async check(projectPath: string): Promise<PublishCheckResult> {
    const result: PublishCheckResult = {
      canPublish: true,
      errors: [],
      warnings: [],
      packageInfo: null
    }

    try {
      const packageJsonPath = join(projectPath, 'package.json')
      await access(packageJsonPath)
      
      const content = await readFile(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content)
      result.packageInfo = pkg

      if (!pkg.name) {
        result.errors.push('package.json 缺少 name 字段')
        result.canPublish = false
      }

      if (!pkg.version) {
        result.errors.push('package.json 缺少 version 字段')
        result.canPublish = false
      }

      if (!pkg.description) {
        result.warnings.push('建议添加 description 字段')
      }

      if (!pkg.keywords || pkg.keywords.length === 0) {
        result.warnings.push('建议添加 keywords 字段以提高可发现性')
      }

      if (!pkg.license) {
        result.warnings.push('建议添加 license 字段')
      }

      if (!pkg.repository && !pkg.homepage) {
        result.warnings.push('建议添加 repository 或 homepage 字段')
      }

      const readmePath = join(projectPath, 'README.md')
      try {
        await access(readmePath)
      } catch {
        result.warnings.push('缺少 README.md 文件')
      }

    } catch (error) {
      result.errors.push('无法读取 package.json')
      result.canPublish = false
    }

    return result
  }

  async publish(args: any): Promise<string> {
    const { cwd, tag, access, registry } = args
    let command = 'npm publish'
    
    if (tag) command += ` --tag ${tag}`
    if (access) command += ` --access ${access}`
    if (registry) command += ` --registry ${registry}`
    
    const { stdout, stderr } = await execAsync(command, { cwd })
    return stdout || stderr
  }
}