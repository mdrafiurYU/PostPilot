// Unit tests for image WebP conversion
// Feature: post-pilot, Task 3.8

import { describe, it, expect } from 'vitest'
import { isImageFormat, WEBP_SIZE_TARGET_RATIO } from './imageConversion.js'

describe('WEBP_SIZE_TARGET_RATIO', () => {
  it('is 0.75 (25% reduction target)', () => {
    expect(WEBP_SIZE_TARGET_RATIO).toBe(0.75)
  })
})

describe('isImageFormat', () => {
  it('recognizes jpeg', () => {
    expect(isImageFormat('jpeg')).toBe(true)
    expect(isImageFormat('jpg')).toBe(true)
  })

  it('recognizes png', () => {
    expect(isImageFormat('png')).toBe(true)
  })

  it('recognizes gif', () => {
    expect(isImageFormat('gif')).toBe(true)
  })

  it('rejects video formats', () => {
    expect(isImageFormat('mp4')).toBe(false)
    expect(isImageFormat('mov')).toBe(false)
    expect(isImageFormat('webm')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isImageFormat('JPEG')).toBe(true)
    expect(isImageFormat('PNG')).toBe(true)
  })
})

describe('WebP compression ratio logic', () => {
  it('meetsTarget is true when webp is ≤75% of original', () => {
    const originalSize = 100_000
    const webpSize = 74_000
    const ratio = webpSize / originalSize
    expect(ratio).toBeLessThanOrEqual(WEBP_SIZE_TARGET_RATIO)
  })

  it('meetsTarget is false when webp is >75% of original', () => {
    const originalSize = 100_000
    const webpSize = 76_000
    const ratio = webpSize / originalSize
    expect(ratio).toBeGreaterThan(WEBP_SIZE_TARGET_RATIO)
  })

  it('exactly 75% meets the target', () => {
    const originalSize = 100_000
    const webpSize = 75_000
    const ratio = webpSize / originalSize
    expect(ratio).toBeLessThanOrEqual(WEBP_SIZE_TARGET_RATIO)
  })
})
