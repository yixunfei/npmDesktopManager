import { spawn } from 'child_process'
import { createLogId, formatCommand, sendCommandLog } from './commandLogger'
import { commandEnv, decodeCommandChunk } from './encoding'

export interface LoggedCommandResult {
  stdout: string
  stderr: string
}

export interface LoggedCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  displayBin?: string
  maxBuffer?: number
  log?: boolean
}

export function runLoggedCommand(
  bin: string,
  args: string[],
  options: LoggedCommandOptions = {}
): Promise<LoggedCommandResult> {
  const {
    cwd,
    env,
    displayBin = bin,
    maxBuffer = 1024 * 1024 * 10,
    log = true
  } = options
  const logId = createLogId()
  const command = formatCommand(displayBin, args)
  let stdout = ''
  let stderr = ''
  let settled = false
  let lastEmitAt = 0
  let pendingEmit: NodeJS.Timeout | null = null

  const emit = (status: 'running' | 'success' | 'error') => {
    if (!log) return
    lastEmitAt = Date.now()
    sendCommandLog(logId, command, stdout, stderr, status)
  }

  const scheduleEmit = () => {
    if (!log) return
    const now = Date.now()
    if (now - lastEmitAt > 100) {
      emit('running')
      return
    }
    if (!pendingEmit) {
      pendingEmit = setTimeout(() => {
        pendingEmit = null
        emit('running')
      }, 100)
    }
  }

  emit('running')

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: commandEnv(env),
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin),
      windowsHide: true
    })

    const fail = (error: Error & { stdout?: string; stderr?: string; code?: number | string }) => {
      if (settled) return
      settled = true
      if (pendingEmit) clearTimeout(pendingEmit)
      error.stdout = stdout
      error.stderr = stderr
      emit('error')
      reject(error)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += decodeCommandChunk(chunk)
      if (stdout.length + stderr.length > maxBuffer) {
        child.kill()
        fail(new Error(`Command output exceeded ${Math.round(maxBuffer / 1024 / 1024)}MB`))
        return
      }
      scheduleEmit()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += decodeCommandChunk(chunk)
      if (stdout.length + stderr.length > maxBuffer) {
        child.kill()
        fail(new Error(`Command output exceeded ${Math.round(maxBuffer / 1024 / 1024)}MB`))
        return
      }
      scheduleEmit()
    })

    child.on('error', (error: Error & { code?: string }) => {
      fail(error)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (pendingEmit) clearTimeout(pendingEmit)

      if (code === 0) {
        emit('success')
        resolve({ stdout, stderr })
        return
      }

      const error = new Error(stderr || `Command exited with code ${code}`) as Error & {
        stdout?: string
        stderr?: string
        code?: number | null
      }
      error.stdout = stdout
      error.stderr = stderr
      error.code = code
      emit('error')
      reject(error)
    })
  })
}
