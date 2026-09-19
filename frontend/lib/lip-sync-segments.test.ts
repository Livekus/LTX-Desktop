import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildContinuousLipSyncSegmentJobs,
  buildLipSyncSegmentJobs,
  generateLipSyncSegments,
  pickLipSyncGenerationDuration,
} from './lip-sync-segments.ts'

const settings = {
  model: 'fast',
  resolution: '720p',
  fps: 24,
  aspectRatio: '16:9',
} as const

describe('pickLipSyncGenerationDuration', () => {
  it('rounds lyric segment duration up to the nearest supported A2V duration', () => {
    assert.equal(pickLipSyncGenerationDuration(2), 2)
    assert.equal(pickLipSyncGenerationDuration(2.01), 3)
    assert.equal(pickLipSyncGenerationDuration(6.5), 8)
  })

  it('rejects invalid or too-long segment durations', () => {
    assert.throws(() => pickLipSyncGenerationDuration(0), /positive/)
    assert.throws(() => pickLipSyncGenerationDuration(20.1), /20s A2V limit/)
  })
})

describe('buildLipSyncSegmentJobs', () => {
  it('builds sorted A2V requests with audio timing and lyric prompt context', () => {
    const jobs = buildLipSyncSegmentJobs({
      audioPath: '/song.wav',
      basePrompt: 'Close-up singer in a neon music video.',
      settings,
      segments: [
        { id: 'chorus', startTime: 12, endTime: 15.2, lyric: 'We run into the light' },
        { id: 'verse', startTime: 4, endTime: 6, lyric: 'Hello from the city', imagePath: '/face.png' },
      ],
    })

    assert.deepEqual(jobs.map((job) => job.id), ['verse', 'chorus'])
    assert.equal(jobs[0].request.audioPath, '/song.wav')
    assert.equal(jobs[0].request.audioStartTime, 4)
    assert.equal(jobs[0].request.audioMaxDuration, 2)
    assert.equal(jobs[0].request.duration, 2)
    assert.equal(jobs[0].request.imagePath, '/face.png')
    assert.match(jobs[0].request.prompt, /Hello from the city/)
    assert.equal(jobs[1].request.audioStartTime, 12)
    assert.equal(jobs[1].request.audioMaxDuration, 3.2)
    assert.equal(jobs[1].request.duration, 4)
  })

  it('rejects segments with invalid time ranges', () => {
    assert.throws(() => buildLipSyncSegmentJobs({
      audioPath: '/song.wav',
      settings,
      segments: [{ startTime: 3, endTime: 3, lyric: 'same instant' }],
    }), /greater than startTime/)
  })
})

describe('buildContinuousLipSyncSegmentJobs', () => {
  it('splits a song period by the selected generation duration', () => {
    const jobs = buildContinuousLipSyncSegmentJobs({
      audioPath: '/song.wav',
      basePrompt: 'Front-facing singer.',
      settings,
      startTime: 0,
      endTime: 12,
      segmentDuration: 5,
      imagePath: '/cat.png',
    })

    assert.deepEqual(jobs.map((job) => [job.audioStartTime, job.audioMaxDuration, job.request.duration]), [
      [0, 5, 5],
      [5, 5, 5],
      [10, 2, 2],
    ])
    assert.equal(jobs[0].request.imagePath, '/cat.png')
    assert.equal(jobs[1].request.imagePath, undefined)
  })

  it('allows absolute end times beyond 20s when every segment stays within the limit', () => {
    const jobs = buildContinuousLipSyncSegmentJobs({
      audioPath: '/song.wav',
      settings,
      startTime: 30,
      endTime: 45,
      segmentDuration: 5,
    })

    assert.deepEqual(jobs.map((job) => [job.audioStartTime, job.endTime]), [
      [30, 35],
      [35, 40],
      [40, 45],
    ])
  })

  it('rejects invalid continuous split settings', () => {
    assert.throws(() => buildContinuousLipSyncSegmentJobs({
      audioPath: '/song.wav',
      settings,
      startTime: 0,
      endTime: 10,
      segmentDuration: 0,
    }), /positive/)
    assert.throws(() => buildContinuousLipSyncSegmentJobs({
      audioPath: '/song.wav',
      settings,
      startTime: 0,
      endTime: 10,
      segmentDuration: 21,
    }), /20s A2V limit/)
    assert.throws(() => buildContinuousLipSyncSegmentJobs({
      audioPath: '/song.wav',
      settings,
      startTime: 10,
      endTime: 10,
      segmentDuration: 5,
    }), /greater than startTime/)
  })
})

describe('generateLipSyncSegments', () => {
  it('submits segment jobs sequentially and stops when requested', async () => {
    const submitted: string[] = []
    const completed: string[] = []

    const results = await generateLipSyncSegments({
      audioPath: '/song.wav',
      settings,
      segments: [
        { id: 'one', startTime: 0, endTime: 2, lyric: 'one' },
        { id: 'two', startTime: 2, endTime: 4, lyric: 'two' },
      ],
      shouldStop: () => submitted.length >= 1,
      onSegmentComplete: (job) => completed.push(job.id),
      submit: async (_request, job) => {
        submitted.push(job.id)
        return `generated:${job.id}`
      },
    })

    assert.deepEqual(submitted, ['one'])
    assert.deepEqual(completed, ['one'])
    assert.deepEqual(results.map((result) => result.response), ['generated:one'])
  })
})
