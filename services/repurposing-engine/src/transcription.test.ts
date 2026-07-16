import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  transcribeAudio,
  generateSubtitleFile,
  uploadSubtitles,
  type TranscriptionResult,
} from './transcription.js'

const SAMPLE_TRANSCRIPTION: TranscriptionResult = {
  text: 'Hello world. This is a test.',
  language: 'en',
  segments: [
    { start: 0, end: 1.5, text: 'Hello world.' },
    { start: 1.5, end: 3.0, text: 'This is a test.' },
  ],
}

describe('transcribeAudio', () => {
  it('returns stub transcription when GROQ_API_KEY is not set', async () => {
    const original = process.env.GROQ_API_KEY
    delete process.env.GROQ_API_KEY

    const result = await transcribeAudio('assets/video.mp4', 'asset-123')

    expect(result.text).toBeTruthy()
    expect(result.language).toBe('en')
    expect(result.segments.length).toBeGreaterThan(0)
    expect(result.segments[0]).toMatchObject({ start: expect.any(Number), end: expect.any(Number), text: expect.any(String) })

    if (original !== undefined) process.env.GROQ_API_KEY = original
  })

  it('stub segments have non-negative start times', async () => {
    delete process.env.GROQ_API_KEY
    const result = await transcribeAudio('assets/video.mp4', 'asset-456')
    for (const seg of result.segments) {
      expect(seg.start).toBeGreaterThanOrEqual(0)
      expect(seg.end).toBeGreaterThan(seg.start)
    }
  })
})

describe('generateSubtitleFile — SRT', () => {
  it('starts with index 1', () => {
    const srt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'srt')
    expect(srt.trimStart()).toMatch(/^1\n/)
  })

  it('contains --> arrow in timecodes', () => {
    const srt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'srt')
    expect(srt).toContain('-->')
  })

  it('uses comma as millisecond separator (SRT format)', () => {
    const srt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'srt')
    expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3}/)
  })

  it('includes all segment texts', () => {
    const srt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'srt')
    for (const seg of SAMPLE_TRANSCRIPTION.segments) {
      expect(srt).toContain(seg.text)
    }
  })

  it('produces one block per segment', () => {
    const srt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'srt')
    // Each block is separated by a blank line; count index lines
    const indexMatches = srt.match(/^\d+$/gm)
    expect(indexMatches?.length).toBe(SAMPLE_TRANSCRIPTION.segments.length)
  })
})

describe('generateSubtitleFile — VTT', () => {
  it('starts with WEBVTT header', () => {
    const vtt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'vtt')
    expect(vtt).toMatch(/^WEBVTT/)
  })

  it('uses dot as millisecond separator (VTT format)', () => {
    const vtt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'vtt')
    expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/)
  })

  it('contains --> arrow in timecodes', () => {
    const vtt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'vtt')
    expect(vtt).toContain('-->')
  })

  it('includes all segment texts', () => {
    const vtt = generateSubtitleFile(SAMPLE_TRANSCRIPTION, 'vtt')
    for (const seg of SAMPLE_TRANSCRIPTION.segments) {
      expect(vtt).toContain(seg.text)
    }
  })
})

describe('generateSubtitleFile — timecode formatting', () => {
  it('formats zero seconds as 00:00:00,000 in SRT', () => {
    const t: TranscriptionResult = {
      text: 'hi',
      language: 'en',
      segments: [{ start: 0, end: 0.5, text: 'hi' }],
    }
    const srt = generateSubtitleFile(t, 'srt')
    expect(srt).toContain('00:00:00,000')
  })

  it('formats 3661.5 seconds correctly in SRT (1h 1m 1s 500ms)', () => {
    const t: TranscriptionResult = {
      text: 'hi',
      language: 'en',
      segments: [{ start: 3661.5, end: 3662, text: 'hi' }],
    }
    const srt = generateSubtitleFile(t, 'srt')
    expect(srt).toContain('01:01:01,500')
  })

  it('formats 3661.5 seconds correctly in VTT (1h 1m 1s 500ms)', () => {
    const t: TranscriptionResult = {
      text: 'hi',
      language: 'en',
      segments: [{ start: 3661.5, end: 3662, text: 'hi' }],
    }
    const vtt = generateSubtitleFile(t, 'vtt')
    expect(vtt).toContain('01:01:01.500')
  })
})

describe('generateSubtitleFile — empty segments', () => {
  it('returns just the header for VTT with no segments', () => {
    const t: TranscriptionResult = { text: '', language: 'en', segments: [] }
    const vtt = generateSubtitleFile(t, 'vtt')
    expect(vtt.trim()).toBe('WEBVTT')
  })

  it('returns empty string for SRT with no segments', () => {
    const t: TranscriptionResult = { text: '', language: 'en', segments: [] }
    const srt = generateSubtitleFile(t, 'srt')
    expect(srt.trim()).toBe('')
  })
})

describe('uploadSubtitles', () => {
  it('returns an S3 key containing the assetId and format', async () => {
    const key = await uploadSubtitles('content', 'asset-789', 'srt')
    expect(key).toContain('asset-789')
    expect(key).toContain('.srt')
  })

  it('returns an S3 key for vtt format', async () => {
    const key = await uploadSubtitles('content', 'asset-789', 'vtt')
    expect(key).toContain('.vtt')
  })
})
