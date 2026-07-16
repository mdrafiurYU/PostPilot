// Smoke tests for the Compression Engine
// Verifies H.264, H.265, and AV1 encoding pipelines run end-to-end without error
// and that content-aware encoding orchestration completes successfully.
// Feature: post-pilot, Task 3.14
// Requirements: 7.1, 7.2, 7.3, 7.4

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ContentAnalysis, EncodedRendition } from './encodingPipeline.js'
import type { VmafResult } from './vmafScoring.js'
import type { Rendition } from '@postpilot/types'

// ─── Module mocks (heavy I/O and FFmpeg) ─────────────────────────────────────

vi.mock('./encodingPipeline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./encodingPipeline.js')>()
  return {
    ...actual,
    probeVideo: vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      durationSeconds: 30,
      audioChannelLayout: 'stereo',
    }),
    analyzeContent: vi.fn().mockResolvedValue({
      sceneComplexity: 0.6,
      motionLevel: 0.4,
      grainLevel: 0.2,
    } satisfies ContentAnalysis),
    encodeRendition: vi.fn().mockImplementation(
      async (_src: string, spec: { resolution: string; height: number; qualityTier: string }, codec: string, bitrateKbps: number) => ({
        outputPath: `/tmp/rendition_${spec.resolution}_${codec}.mp4`,
        width: 1920,
        height: spec.height,
        bitrateKbps,
        fileSizeBytes: 10_000_000,
        resolution: spec.resolution as "360p" | "720p" | "1080p" | "source",
        qualityTier: spec.qualityTier as 'low' | 'standard' | 'high',
      } satisfies EncodedRendition)
    ),
  }
})

vi.mock('./vmafScoring.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vmafScoring.js')>()
  return {
    ...actual,
    computeVmaf: vi.fn().mockResolvedValue({
      score: 90,
      meetsThreshold: true,
      threshold: 85,
      qualityTier: 'standard',
    } satisfies VmafResult),
  }
})

vi.mock('./s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  uploadStringToS3: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./db.js', () => ({
  getAssetById: vi.fn().mockResolvedValue({ id: 'asset-smoke-1', file_size_bytes: 50_000_000 }),
  updateAssetStatus: vi.fn().mockResolvedValue(undefined),
  insertRendition: vi.fn().mockResolvedValue(undefined),
  getRenditionsByAssetId: vi.fn().mockResolvedValue([]),
  upsertAdaptation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./messageBus.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAssetUploadedEvent(assetId: string) {
  return {
    eventId: `evt-${assetId}`,
    occurredAt: new Date().toISOString(),
    type: 'asset.uploaded' as const,
    payload: {
      assetId,
      creatorId: 'creator-smoke',
      s3Key: `uploads/${assetId}/source.mp4`,
      mediaType: 'video' as const,
      format: 'mp4' as const,
      fileSizeBytes: 1024
    },
  }
}

function makeRendition(codec: 'h264' | 'h265' | 'av1', resolution: string, height: number): Rendition {
  return {
    id: `rendition-${codec}-${resolution}`,
    asset_id: 'asset-smoke-1',
    codec,
    resolution: resolution as Rendition['resolution'],
    width: 1920,
    height,
    bitrate_kbps: 2500,
    vmaf_score: 90,
    file_size_bytes: 10_000_000,
    s3_key: `assets/asset-smoke-1/renditions/${resolution}_${codec}.mp4`,
    created_at: new Date(),
  }
}

// ─── Smoke tests ──────────────────────────────────────────────────────────────

describe('Compression Engine smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Codec encoding pipelines (Req 7.1)', () => {
    it('H.264 encoding completes without error', async () => {
      const { encodeRendition, RENDITION_SPECS, adjustBitrateForContent, analyzeContent, probeVideo } = await import('./encodingPipeline.js')
      const { computeVmaf } = await import('./vmafScoring.js')
      const { generateHlsManifest } = await import('./manifestGeneration.js')

      const probe = await probeVideo('/tmp/sample.mp4')
      const analysis = await analyzeContent('/tmp/sample.mp4')

      const renditions: Rendition[] = []
      for (const spec of RENDITION_SPECS) {
        const bitrateKbps = adjustBitrateForContent(spec.baseBitrateKbps, analysis)
        const encoded = await encodeRendition('/tmp/sample.mp4', spec, 'h264', bitrateKbps, probe.audioChannelLayout, probe.width, probe.height)
        const vmaf = await computeVmaf('/tmp/sample.mp4', encoded.outputPath, spec.qualityTier)

        expect(encoded.outputPath).toBeTruthy()
        expect(vmaf.score).toBeGreaterThan(0)

        renditions.push(makeRendition('h264', spec.resolution, encoded.height))
      }

      const manifest = generateHlsManifest(renditions)
      expect(manifest).toContain('#EXTM3U')
      expect(renditions.length).toBeGreaterThanOrEqual(3)
    })

    it('H.265 encoding completes without error', async () => {
      const { encodeRendition, RENDITION_SPECS, adjustBitrateForContent, analyzeContent, probeVideo } = await import('./encodingPipeline.js')
      const { computeVmaf } = await import('./vmafScoring.js')
      const { generateHlsManifest } = await import('./manifestGeneration.js')

      const probe = await probeVideo('/tmp/sample.mp4')
      const analysis = await analyzeContent('/tmp/sample.mp4')

      const renditions: Rendition[] = []
      for (const spec of RENDITION_SPECS) {
        const bitrateKbps = adjustBitrateForContent(spec.baseBitrateKbps, analysis)
        const encoded = await encodeRendition('/tmp/sample.mp4', spec, 'h265', bitrateKbps, probe.audioChannelLayout, probe.width, probe.height)
        const vmaf = await computeVmaf('/tmp/sample.mp4', encoded.outputPath, spec.qualityTier)

        expect(encoded.outputPath).toBeTruthy()
        expect(vmaf.score).toBeGreaterThan(0)

        renditions.push(makeRendition('h265', spec.resolution, encoded.height))
      }

      const manifest = generateHlsManifest(renditions)
      expect(manifest).toContain('#EXTM3U')
      expect(renditions.length).toBeGreaterThanOrEqual(3)
    })

    it('AV1 encoding completes without error', async () => {
      const { encodeRendition, RENDITION_SPECS, adjustBitrateForContent, analyzeContent, probeVideo } = await import('./encodingPipeline.js')
      const { computeVmaf } = await import('./vmafScoring.js')
      const { generateHlsManifest } = await import('./manifestGeneration.js')

      const probe = await probeVideo('/tmp/sample.mp4')
      const analysis = await analyzeContent('/tmp/sample.mp4')

      const renditions: Rendition[] = []
      for (const spec of RENDITION_SPECS) {
        const bitrateKbps = adjustBitrateForContent(spec.baseBitrateKbps, analysis)
        const encoded = await encodeRendition('/tmp/sample.mp4', spec, 'av1', bitrateKbps, probe.audioChannelLayout, probe.width, probe.height)
        const vmaf = await computeVmaf('/tmp/sample.mp4', encoded.outputPath, spec.qualityTier)

        expect(encoded.outputPath).toBeTruthy()
        expect(vmaf.score).toBeGreaterThan(0)

        renditions.push(makeRendition('av1', spec.resolution, encoded.height))
      }

      const manifest = generateHlsManifest(renditions)
      expect(manifest).toContain('#EXTM3U')
      expect(renditions.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Content-aware encoding pipeline (Req 7.4)', () => {
    it('full pipeline runs end-to-end via handleAssetUploaded', async () => {
      const { handleAssetUploaded } = await import('./index.js')
      const { updateAssetStatus, insertRendition, upsertAdaptation } = await import('./db.js')
      const { publishEvent } = await import('./messageBus.js')
      const { uploadToS3, uploadStringToS3 } = await import('./s3.js')

      const event = makeAssetUploadedEvent('asset-smoke-1')

      await expect(handleAssetUploaded(event)).resolves.not.toThrow()

      // Asset status transitions: compressing → compressed
      expect(updateAssetStatus).toHaveBeenCalledWith('asset-smoke-1', 'compressing')
      expect(updateAssetStatus).toHaveBeenCalledWith('asset-smoke-1', 'compressed')

      // Renditions were persisted (one per RENDITION_SPEC)
      expect(insertRendition).toHaveBeenCalled()

      // HLS manifest was uploaded
      expect(uploadStringToS3).toHaveBeenCalled()

      // Adaptation record was upserted
      expect(upsertAdaptation).toHaveBeenCalled()

      // asset.compressed event was emitted
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'asset.compressed' })
      )
    })

    it('content analysis feeds into bitrate adjustment', async () => {
      const { analyzeContent, adjustBitrateForContent, RENDITION_SPECS } = await import('./encodingPipeline.js')

      const analysis = await analyzeContent('/tmp/sample.mp4')

      // Verify analysis returns valid normalized values
      expect(analysis.sceneComplexity).toBeGreaterThanOrEqual(0)
      expect(analysis.sceneComplexity).toBeLessThanOrEqual(1)
      expect(analysis.motionLevel).toBeGreaterThanOrEqual(0)
      expect(analysis.motionLevel).toBeLessThanOrEqual(1)

      // Verify each rendition spec gets a positive adjusted bitrate
      for (const spec of RENDITION_SPECS) {
        const adjusted = adjustBitrateForContent(spec.baseBitrateKbps, analysis)
        expect(adjusted).toBeGreaterThan(0)
      }
    })

    it('pipeline produces at least 3 renditions (Req 7.3)', async () => {
      const { insertRendition } = await import('./db.js')
      const { handleAssetUploaded } = await import('./index.js')

      const event = makeAssetUploadedEvent('asset-smoke-1')
      await handleAssetUploaded(event)

      expect((insertRendition as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3)
    })
  })
})
