import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDefaultTimeline,
  generationParamsSchema,
  normalizeProject,
} from './project-model.ts'

describe('project center prompt schema', () => {
  it('defaults missing project center inputs for existing projects', () => {
    const timeline = createDefaultTimeline('Timeline 1')
    const project = normalizeProject({
      version: 2,
      id: 'project-1',
      name: 'Series project',
      createdAt: 1,
      updatedAt: 2,
      bins: {},
      assets: [],
      timelines: [timeline],
      activeTimelineId: timeline.id,
    })

    assert.equal(project.centerPrompt, '')
    assert.equal(project.centerAudioPath, null)
    assert.equal(project.centerAudioStartTime, 0)
    assert.equal(project.centerAudioEndTime, null)
    assert.equal(project.centerAudioContinuous, false)
  })

  it('stores center audio period for lip-sync generation', () => {
    const timeline = createDefaultTimeline('Timeline 1')
    const project = normalizeProject({
      version: 2,
      id: 'project-1',
      name: 'Lip-sync project',
      centerPrompt: 'A singer on stage.',
      centerAudioPath: 'C:\\audio\\song.wav',
      centerAudioStartTime: 12.5,
      centerAudioEndTime: 16.75,
      centerAudioContinuous: true,
      createdAt: 1,
      updatedAt: 2,
      bins: {},
      assets: [],
      timelines: [timeline],
      activeTimelineId: timeline.id,
    })

    assert.equal(project.centerAudioPath, 'C:\\audio\\song.wav')
    assert.equal(project.centerAudioStartTime, 12.5)
    assert.equal(project.centerAudioEndTime, 16.75)
    assert.equal(project.centerAudioContinuous, true)
  })

  it('stores center prompt separately from individual generation prompt', () => {
    const params = generationParamsSchema.parse({
      mode: 'text-to-video',
      prompt: 'The couple walks through a rainy night market.',
      centerPrompt: 'A romantic comedy series in warm natural light.',
      model: 'fast',
      duration: 5,
      resolution: '540p',
      fps: 24,
      audio: true,
      cameraMotion: 'none',
    })

    assert.equal(params.prompt, 'The couple walks through a rainy night market.')
    assert.equal(params.centerPrompt, 'A romantic comedy series in warm natural light.')
  })
})
