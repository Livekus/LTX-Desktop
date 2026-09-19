import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { promisify } from 'node:util'
import { saveMutedVideo } from './muted-video.ts'

const execFileAsync = promisify(execFile)
const ffmpegPath = process.env.LTX_TEST_FFMPEG_PATH || 'ffmpeg'
const ffmpegAvailable = spawnSync(ffmpegPath, ['-version'], { windowsHide: true }).status === 0

describe('download video without audio', {
  skip: !ffmpegAvailable && 'Set LTX_TEST_FFMPEG_PATH or install FFmpeg to run media integration tests.',
}, () => {
  let directory: string
  let sourcePath: string

  before(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ltx-muted-video-test-'))
    sourcePath = path.join(directory, 'clip with audio.mp4')
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-f', 'lavfi', '-i', 'testsrc2=size=128x72:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
      '-map', '0:v', '-map', '1:a', '-map', '2:a',
      '-t', '1', '-c:v', 'libx264', '-c:a', 'aac', sourcePath,
    ], { windowsHide: true })
  })

  after(async () => {
    if (!directory) return
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('ltx-muted-video-test-'))
    await fs.rm(directory, { recursive: true, force: true })
  })

  const videoPackets = async (filePath: string) => {
    const result = await execFileAsync(ffmpegPath, [
      '-v', 'error', '-i', filePath, '-map', '0:v:0', '-c:v', 'copy', '-f', 'framemd5', '-',
    ], { windowsHide: true })
    return result.stdout
  }

  it('removes every audio track and preserves video packets, timing, and the source file', async () => {
    const originalHash = createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex')
    const outputPath = path.join(directory, 'clip muted.mp4')
    await saveMutedVideo(ffmpegPath, sourcePath, outputPath)

    const probe = await execFileAsync(ffmpegPath, [
      '-hide_banner', '-i', outputPath, '-map', '0:v:0', '-c:v', 'copy', '-f', 'null', '-',
    ], { windowsHide: true })
    assert.match(probe.stderr, /Video: h264/)
    assert.doesNotMatch(probe.stderr, /Audio:/)
    assert.equal(await videoPackets(outputPath), await videoPackets(sourcePath))
    assert.equal(createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex'), originalHash)
  })

  it('also downloads videos that already have no audio', async () => {
    const silentPath = path.join(directory, 'already silent.mp4')
    const outputPath = path.join(directory, 'silent copy.mp4')
    await saveMutedVideo(ffmpegPath, sourcePath, silentPath)
    await saveMutedVideo(ffmpegPath, silentPath, outputPath)
    assert.equal(await videoPackets(outputPath), await videoPackets(silentPath))
  })

  it('protects the original when the destination refers to the same file', async () => {
    await assert.rejects(saveMutedVideo(ffmpegPath, sourcePath, sourcePath), /different filename/)
    const aliasPath = path.join(directory, 'source alias.mp4')
    await fs.link(sourcePath, aliasPath)
    await assert.rejects(saveMutedVideo(ffmpegPath, sourcePath, aliasPath), /different filename/)
  })

  it('keeps an existing destination and cleans partial output when FFmpeg fails', async () => {
    const invalidPath = path.join(directory, 'invalid.mp4')
    const outputPath = path.join(directory, 'existing.mp4')
    await fs.writeFile(invalidPath, 'not a video')
    await fs.writeFile(outputPath, 'existing download')
    await assert.rejects(saveMutedVideo(ffmpegPath, invalidPath, outputPath))
    assert.equal(await fs.readFile(outputPath, 'utf8'), 'existing download')
    assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.ltx-muted-')), false)
  })

  it('replaces an existing destination only after successfully creating the muted video', async () => {
    const outputPath = path.join(directory, 'replace.mp4')
    await fs.writeFile(outputPath, 'old download')
    await saveMutedVideo(ffmpegPath, sourcePath, outputPath)
    assert.equal(await videoPackets(outputPath), await videoPackets(sourcePath))
    assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.ltx-muted-')), false)
  })

  it('reports a missing FFmpeg executable without leaving output behind', async () => {
    const outputPath = path.join(directory, 'missing-ffmpeg.mp4')
    await assert.rejects(saveMutedVideo(path.join(directory, 'missing-ffmpeg'), sourcePath, outputPath))
    await assert.rejects(fs.stat(outputPath), { code: 'ENOENT' })
    assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.ltx-muted-')), false)
  })
})
