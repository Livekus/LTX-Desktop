import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSharedVideoPrompt } from './genspace-prompt.ts'

describe('buildSharedVideoPrompt', () => {
  it('combines project center prompt with the individual video prompt', () => {
    const result = buildSharedVideoPrompt(
      'A romantic comedy series in warm natural light.',
      'The couple walks through a rainy night market.',
    )

    assert.equal(
      result,
      [
        'Series prompt:',
        'A romantic comedy series in warm natural light.',
        '',
        'Video prompt:',
        'The couple walks through a rainy night market.',
      ].join('\n'),
    )
  })

  it('keeps the original video prompt unchanged when the center prompt is empty', () => {
    const videoPrompt = 'The woman sips from a cup of coffee...'

    assert.equal(buildSharedVideoPrompt('', videoPrompt), videoPrompt)
    assert.equal(buildSharedVideoPrompt('   ', videoPrompt), videoPrompt)
  })

  it('uses only the center prompt when an optional video prompt is empty', () => {
    assert.equal(
      buildSharedVideoPrompt('Use the same cast and cinematic style.', ''),
      'Use the same cast and cinematic style.',
    )
  })

  it('trims separator content without mutating fallback prompt text', () => {
    assert.equal(
      buildSharedVideoPrompt('  Shared world rules.  ', '  Unique shot action.  '),
      [
        'Series prompt:',
        'Shared world rules.',
        '',
        'Video prompt:',
        'Unique shot action.',
      ].join('\n'),
    )
  })
})
