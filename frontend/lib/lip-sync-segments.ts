import type { ApiRequestBodyOf } from './api-client'

type GenerateVideoRequest = ApiRequestBodyOf<'generateVideo'>
type GenerateVideoDuration = NonNullable<GenerateVideoRequest['duration']>
const MAX_LIP_SYNC_GENERATION_DURATION = 20

const LIP_SYNC_GENERATION_DURATIONS = [
  2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20,
] as const satisfies readonly GenerateVideoDuration[]

export interface LipSyncLyricSegment {
  id?: string
  startTime: number
  endTime: number
  lyric: string
  prompt?: string
  imagePath?: string | null
  lastImagePath?: string | null
}

export interface LipSyncGenerationSettings {
  model: GenerateVideoRequest['model']
  resolution: string
  fps: number
  aspectRatio?: string
  audio?: GenerateVideoRequest['audio']
  cameraMotion?: string
  negativePrompt?: GenerateVideoRequest['negativePrompt']
  loras?: GenerateVideoRequest['loras']
}

export interface LipSyncSegmentJob {
  id: string
  startTime: number
  endTime: number
  audioStartTime: number
  audioMaxDuration: number
  request: GenerateVideoRequest
}

export interface BuildLipSyncSegmentJobsParams {
  audioPath: string
  basePrompt?: string
  settings: LipSyncGenerationSettings
  segments: readonly LipSyncLyricSegment[]
}

export interface BuildContinuousLipSyncSegmentJobsParams {
  audioPath: string
  basePrompt?: string
  settings: LipSyncGenerationSettings
  startTime: number
  endTime: number
  segmentDuration: number
  imagePath?: string | null
  lastImagePath?: string | null
}

export interface GenerateLipSyncSegmentsParams<TResponse> extends BuildLipSyncSegmentJobsParams {
  submit: (request: GenerateVideoRequest, job: LipSyncSegmentJob) => Promise<TResponse>
  shouldStop?: () => boolean
  onSegmentStart?: (job: LipSyncSegmentJob, index: number, total: number) => void
  onSegmentComplete?: (job: LipSyncSegmentJob, response: TResponse, index: number, total: number) => void
}

export interface LipSyncSegmentResult<TResponse> {
  job: LipSyncSegmentJob
  response: TResponse
}

function assertFiniteTime(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`)
  }
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function pickLipSyncGenerationDuration(seconds: number): GenerateVideoDuration {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Segment duration must be a finite positive number')
  }

  const duration = LIP_SYNC_GENERATION_DURATIONS.find((candidate) => candidate >= seconds)
  if (!duration) {
    throw new Error(`Segment duration ${seconds.toFixed(2)}s exceeds the 20s A2V limit`)
  }
  return duration
}

function buildSegmentPrompt(basePrompt: string | undefined, segment: LipSyncLyricSegment): string {
  const parts = [
    basePrompt?.trim(),
    segment.prompt?.trim(),
    segment.lyric.trim()
      ? `Lip-sync the performer exactly to this lyric segment: "${segment.lyric.trim()}". Match mouth shapes, timing, and emotion to the words.`
      : 'Lip-sync the performer exactly to this audio segment. Match mouth shapes and timing.',
  ].filter((part): part is string => Boolean(part))

  return parts.join('\n\n')
}

export function buildLipSyncSegmentJobs({
  audioPath,
  basePrompt,
  settings,
  segments,
}: BuildLipSyncSegmentJobsParams): LipSyncSegmentJob[] {
  if (!audioPath.trim()) {
    throw new Error('audioPath is required for lip-sync segment generation')
  }

  return [...segments]
    .sort((left, right) => left.startTime - right.startTime)
    .map((segment, index): LipSyncSegmentJob => {
      assertFiniteTime(segment.startTime, 'Segment startTime')
      assertFiniteTime(segment.endTime, 'Segment endTime')
      if (segment.endTime <= segment.startTime) {
        throw new Error('Segment endTime must be greater than startTime')
      }

      const audioMaxDuration = roundSeconds(segment.endTime - segment.startTime)
      const duration = pickLipSyncGenerationDuration(audioMaxDuration)
      const request: GenerateVideoRequest = {
        prompt: buildSegmentPrompt(basePrompt, segment),
        model: settings.model,
        resolution: settings.resolution as GenerateVideoRequest['resolution'],
        duration,
        fps: settings.fps as GenerateVideoRequest['fps'],
        audio: settings.audio ?? true,
        cameraMotion: (settings.cameraMotion ?? 'none') as GenerateVideoRequest['cameraMotion'],
        negativePrompt: settings.negativePrompt ?? '',
        aspectRatio: (settings.aspectRatio ?? '16:9') as GenerateVideoRequest['aspectRatio'],
        audioPath,
        audioStartTime: roundSeconds(segment.startTime),
        audioMaxDuration,
        ...(segment.imagePath ? { imagePath: segment.imagePath } : {}),
        ...(segment.lastImagePath ? { lastImagePath: segment.lastImagePath } : {}),
        ...(settings.loras?.length ? { loras: settings.loras } : {}),
      }

      return {
        id: segment.id ?? `lip-sync-segment-${index + 1}`,
        startTime: segment.startTime,
        endTime: segment.endTime,
        audioStartTime: roundSeconds(segment.startTime),
        audioMaxDuration,
        request,
      }
    })
}

export function buildContinuousLipSyncSegmentJobs({
  audioPath,
  basePrompt,
  settings,
  startTime,
  endTime,
  segmentDuration,
  imagePath,
  lastImagePath,
}: BuildContinuousLipSyncSegmentJobsParams): LipSyncSegmentJob[] {
  assertFiniteTime(startTime, 'Audio startTime')
  assertFiniteTime(endTime, 'Audio endTime')
  if (endTime <= startTime) {
    throw new Error('Audio endTime must be greater than startTime')
  }
  if (!Number.isFinite(segmentDuration) || segmentDuration <= 0) {
    throw new Error('Segment duration must be a finite positive number')
  }
  if (segmentDuration > MAX_LIP_SYNC_GENERATION_DURATION) {
    throw new Error(`Segment duration ${segmentDuration.toFixed(2)}s exceeds the 20s A2V limit`)
  }

  const segments: LipSyncLyricSegment[] = []
  let cursor = roundSeconds(startTime)
  const finalEndTime = roundSeconds(endTime)
  let index = 1

  while (cursor < finalEndTime) {
    const segmentEndTime = roundSeconds(Math.min(cursor + segmentDuration, finalEndTime))
    if (segmentEndTime <= cursor) break
    segments.push({
      id: `lip-sync-continuous-${index}`,
      startTime: cursor,
      endTime: segmentEndTime,
      lyric: '',
      imagePath: index === 1 ? imagePath ?? null : null,
      lastImagePath: index === 1 && imagePath ? lastImagePath ?? null : null,
    })
    cursor = segmentEndTime
    index += 1
  }

  return buildLipSyncSegmentJobs({
    audioPath,
    basePrompt,
    settings,
    segments,
  })
}

export async function generateLipSyncSegments<TResponse>({
  submit,
  shouldStop,
  onSegmentStart,
  onSegmentComplete,
  ...buildParams
}: GenerateLipSyncSegmentsParams<TResponse>): Promise<LipSyncSegmentResult<TResponse>[]> {
  const jobs = buildLipSyncSegmentJobs(buildParams)
  const results: LipSyncSegmentResult<TResponse>[] = []

  for (let index = 0; index < jobs.length; index += 1) {
    if (shouldStop?.()) break

    const job = jobs[index]
    onSegmentStart?.(job, index, jobs.length)
    const response = await submit(job.request, job)
    results.push({ job, response })
    onSegmentComplete?.(job, response, index, jobs.length)
  }

  return results
}
