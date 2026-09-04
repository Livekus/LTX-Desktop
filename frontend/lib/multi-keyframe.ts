import { clampKeyframeStrength, DEFAULT_KEYFRAME_STRENGTH } from './keyframe-strength.ts'
import { pickFreeFrameIndex } from './keyframe-timeline.ts'

export {
  clampKeyframeStrength,
  DEFAULT_KEYFRAME_STRENGTH,
  MISSING_KEYFRAME_STRENGTH,
} from './keyframe-strength.ts'

/** Local Distilled cap. Must match backend LOCAL_MULTI_KEYFRAME_MAX_COUNT. API stays 0. */
export const LOCAL_MULTI_KEYFRAME_MAX_COUNT = 10
export const PROMPT_VIDEO_IMAGE_MAX_COUNT = 4

export interface KeyframeItem {
  id: string
  path: string
  frameIndex: number
  strength: number
}

export function appendKeyframePaths(
  keyframes: readonly KeyframeItem[],
  paths: readonly string[],
  lastFrame: number,
  preferredFrame: number,
  maxCount: number,
  createId: () => string = () => crypto.randomUUID(),
): KeyframeItem[] {
  const next = [...keyframes]
  for (const path of paths) {
    if (next.length >= maxCount) break
    const frameIndex = pickFreeFrameIndex(next, lastFrame, preferredFrame)
    if (frameIndex === null) break
    next.push({ id: createId(), path, frameIndex, strength: DEFAULT_KEYFRAME_STRENGTH })
  }
  return next
}

function promptImageFrameIndex(index: number, count: number, lastFrame: number): number {
  if (count <= 1) return 0
  return Math.round((Math.max(0, lastFrame) * index) / (count - 1))
}

export function promptVideoKeyframesFromImagePaths(
  paths: readonly string[],
  lastFrame: number,
  createId: () => string = () => crypto.randomUUID(),
): KeyframeItem[] {
  const count = Math.min(paths.length, PROMPT_VIDEO_IMAGE_MAX_COUNT)
  return paths.slice(0, count).map((path, index) => ({
    id: createId(),
    path,
    frameIndex: promptImageFrameIndex(index, count, lastFrame),
    strength: DEFAULT_KEYFRAME_STRENGTH,
  }))
}

export function promptVideoImagePathsFromKeyframes(
  keyframes: readonly Pick<KeyframeItem, 'path' | 'frameIndex'>[],
  maxCount: number = PROMPT_VIDEO_IMAGE_MAX_COUNT,
): string[] {
  return [...keyframes]
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .slice(0, maxCount)
    .map(({ path }) => path)
}

export function applyKeyframeImagePaths({
  keyframes,
  paths,
  replaceId,
  lastFrame,
  preferredFrame,
  maxCount,
  createId,
}: {
  keyframes: readonly KeyframeItem[]
  paths: readonly string[]
  replaceId: string | null
  lastFrame: number | null
  preferredFrame: number
  maxCount: number
  createId?: () => string
}): KeyframeItem[] {
  if (paths.length === 0) return [...keyframes]

  let next = [...keyframes]
  let remaining = paths
  if (replaceId) {
    const [first, ...rest] = paths
    next = next.map((keyframe) => (
      keyframe.id === replaceId ? { ...keyframe, path: first } : keyframe
    ))
    remaining = rest
  }

  if (lastFrame === null || remaining.length === 0) return next
  return appendKeyframePaths(
    next,
    remaining,
    lastFrame,
    preferredFrame,
    maxCount,
    createId,
  )
}

export type PersistedKeyframe = {
  path: string
  frameIndex: number
  strength: number
}

export function toPersistedKeyframes(
  keyframes: readonly KeyframeItem[],
): PersistedKeyframe[] {
  return keyframes.map(({ path, frameIndex, strength }) => ({
    path,
    frameIndex,
    strength: clampKeyframeStrength(strength),
  }))
}

export function fromPersistedKeyframes(
  keyframes: readonly { path: string; frameIndex: number; strength?: number }[],
  createId: () => string = () => crypto.randomUUID(),
): KeyframeItem[] {
  return keyframes.map(({ path, frameIndex, strength }) => ({
    id: createId(),
    path,
    frameIndex,
    strength: clampKeyframeStrength(strength),
  }))
}

export function videoGenerationModeFromInputs({
  keyframes,
  audioUrl,
  imageUrl,
}: {
  keyframes?: readonly unknown[] | null
  audioUrl?: string | null
  imageUrl?: string | null
}): 'multi-keyframe' | 'audio-to-video' | 'image-to-video' | 'text-to-video' {
  if (keyframes && keyframes.length > 0) return 'multi-keyframe'
  if (audioUrl) return 'audio-to-video'
  if (imageUrl) return 'image-to-video'
  return 'text-to-video'
}

export function toKeyframeInputs(
  keyframes: readonly Pick<KeyframeItem, 'path' | 'frameIndex' | 'strength'>[],
): { imagePath: string; frameIndex: number; strength: number }[] {
  return keyframes.map(({ path, frameIndex, strength }) => ({
    imagePath: path,
    frameIndex,
    strength: clampKeyframeStrength(strength),
  }))
}

export function enhanceKeyframesPayload(
  keyframes: readonly Pick<KeyframeItem, 'path' | 'frameIndex' | 'strength'>[],
): { imagePath: string; frameIndex: number; strength: number }[] | undefined {
  if (keyframes.length === 0) return undefined
  return toKeyframeInputs([...keyframes].sort((a, b) => a.frameIndex - b.frameIndex))
}
