import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Remove audio without re-encoding or modifying the source video. */
export async function saveMutedVideo(ffmpegPath: string, sourcePath: string, outputPath: string): Promise<void> {
  const source = await fs.stat(sourcePath)
  if (!source.isFile()) throw new Error('The source video is not a file.')

  const destination = await fs.stat(outputPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (destination && source.dev === destination.dev && source.ino === destination.ino) {
    throw new Error('Choose a different filename to keep the original video.')
  }

  // Finish beside the destination before replacing it, so failed downloads leave
  // existing files intact. This process is independent of timeline export/cancel.
  const temporaryPath = path.join(path.dirname(outputPath), `.ltx-muted-${randomUUID()}.mp4`)
  try {
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
      '-i', sourcePath,
      '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart',
      temporaryPath,
    ], { windowsHide: true })
    await fs.rename(temporaryPath, outputPath)
  } finally {
    await fs.rm(temporaryPath, { force: true })
  }
}
