import { describe, it, expect } from 'vitest'

describe('Project setup smoke test', () => {
  it('vitest is configured correctly', () => {
    expect(true).toBe(true)
  })

  it('environment is jsdom', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })
})
