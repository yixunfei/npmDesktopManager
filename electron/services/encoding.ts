import { TextDecoder } from 'util'

export function commandEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const mavenOpts = [process.env.MAVEN_OPTS, '-Dfile.encoding=UTF-8']
    .filter(Boolean)
    .join(' ')

  return {
    ...process.env,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
    PYTHONUTF8: process.env.PYTHONUTF8 || '1',
    MAVEN_OPTS: mavenOpts,
    ...extra
  }
}

export function decodeCommandChunk(chunk: Buffer): string {
  return decodeCommandBuffer(chunk)
}

export class CommandOutputDecoder {
  private readonly utf8Decoder = new TextDecoder('utf-8')
  private readonly chunks: Buffer[] = []
  private byteLength = 0
  private text = ''

  write(chunk: Buffer): string {
    if (process.platform !== 'win32') {
      this.text += this.utf8Decoder.decode(chunk, { stream: true })
      return this.text
    }

    this.chunks.push(Buffer.from(chunk))
    this.byteLength += chunk.length
    this.text = decodeCommandBuffer(Buffer.concat(this.chunks, this.byteLength))
    return this.text
  }
}

function decodeCommandBuffer(chunk: Buffer): string {
  const utf8 = new TextDecoder('utf-8').decode(chunk)
  if (process.platform === 'win32') {
    try {
      const gb18030 = new TextDecoder('gb18030').decode(chunk)
      return scoreDecodedText(gb18030) < scoreDecodedText(utf8) ? gb18030 : utf8
    } catch {
      return utf8
    }
  }
  return utf8
}

function scoreDecodedText(text: string): number {
  if (!text) return 0

  let score = 0
  const replacementCount = (text.match(/\uFFFD/g) || []).length
  const privateUseCount = (text.match(/[\uE000-\uF8FF]/g) || []).length
  const suspiciousAsciiCount = (text.match(/[ÃÂ�]/g) || []).length
  const mojibakeCount = (text.match(/锟斤拷/g) || []).length

  score += replacementCount * 100
  score += privateUseCount * 20
  score += suspiciousAsciiCount * 5
  score += mojibakeCount * 100

  return score
}
