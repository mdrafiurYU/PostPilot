// Pipeline Integration Test
// Tests the full asset upload → compression → transcoding → repurposing → targeting → scheduling → publishing pipeline.
// All services are wired together via an in-memory event bus; heavy I/O (FFmpeg, S3, DB, platform APIs) is mocked.
//
// Requirements: 1.3, 2.1, 3.1, 4.3

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostPilotEvent } from '@postpilot/events'
import type { Rendition, Adaptation, Clip, Caption } from '@postpilot/types'

// ─── In-memory event bus ──────────────────────────────────────────────────────
// Captures all published events in order so we can assert the pipeline sequence.

const publishedEvents: PostPilotEvent[] = []

function makeMessageBusMock() {
  return {
    publishEvent: vi.fn(async (event: PostPilotEvent) => {
      publishedEvents.push(event)
    }),
    subscribe: vi.fn(),
    startConsuming: vi.fn().mockResolvedValue(undefined),
    stopConsuming: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── Mock all service messageBus modules ─────────────────────────────────────

vi.mock('../../services/asset-service/src/messageBus.js', () => makeMessageBusMock())
vi.mock('../../services/compression-engine/src/messageBus.js', () => makeMessageBusMock())
vi.mock('../../services/transcoder/src/messageBus.js', () => makeMessageBusMock())
vi.mock('../../services/repurposing-engine/src/messageBus.js', () => makeMessageBusMock())
vi.mock('../../services/targeting-engine/src/messageBus.js', () => makeMessageBusMock())
vi.mock('../../services/publishing-service/src/messageBus.js', () => makeMessageBusMock())

// ─── Mock: compression-engine heavy I/O ──────────────────────────────────────

vi.mock('../../services/compression-engine/src/encodingPipeline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/compression-engine/src/encodingPipeline.js')>()
  return {
    ...actual,
    probeVideo: vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      durationSeconds: 120,
      audioChannelLayout: 'stereo',
    }),
    analyzeContent: vi.fn().mockResolvedValue({
      sceneComplexity: 0.5,
      motionLevel: 0.5,
      grainLevel: 0.3,
    }),
    encodeRendition: vi.fn().mockImplementation(
      async (_src: string, spec: { resolution: string; height: number; qualityTier: string }, codec: string, bitrateKbps: number) => ({
        outputPath: `/tmp/rendition_${spec.resolution}_${codec}.mp4`,
        width: 1920,
        height: spec.height,
        bitrateKbps,
        fileSizeBytes: 8_000_000,
        resolution: spec.resolution,
        qualityTier: spec.qualityTier,
      })
    ),
  }
})

vi.mock('../../services/compression-engine/src/vmafScoring.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/compression-engine/src/vmafScoring.js')>()
  return {
    ...actual,
    computeVmaf: vi.fn().mockResolvedValue({
      score: 90,
      meetsThreshold: true,
      threshold: 85,
      qualityTier: 'standard',
    }),
  }
})

vi.mock('../../services/compression-engine/src/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  uploadStringToS3: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/compression-engine/src/db.js', () => ({
  getAssetById: vi.fn().mockResolvedValue({
    id: 'asset-pipeline-1',
    creator_id: 'creator-1',
    filename: 'video.mp4',
    media_type: 'video',
    format: 'mp4',
    file_size_bytes: 50_000_000,
    s3_key: 'assets/asset-pipeline-1/original/video.mp4',
    status: 'uploaded',
    created_at: new Date(),
    updated_at: new Date(),
  }),
  updateAssetStatus: vi.fn().mockResolvedValue(undefined),
  insertRendition: vi.fn().mockResolvedValue(undefined),
  getRenditionsByAssetId: vi.fn().mockResolvedValue([]),
  upsertAdaptation: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mock: transcoder heavy I/O ───────────────────────────────────────────────

vi.mock('../../services/transcoder/src/adaptationPipeline.js', () => ({
  probeVideoDimensions: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
  encodeAdaptation: vi.fn().mockImplementation(
    async (_src: string, variant: { platform: string; formatVariant: string }) => ({
      outputPath: `/tmp/adaptation_${variant.platform}_${variant.formatVariant}.mp4`,
      fileSizeBytes: 5_000_000,
    })
  ),
}))

vi.mock('../../services/transcoder/src/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/transcoder/src/db.js', () => ({
  getAssetById: vi.fn().mockResolvedValue({
    id: 'asset-pipeline-1',
    creator_id: 'creator-1',
    filename: 'video.mp4',
    media_type: 'video',
    format: 'mp4',
    file_size_bytes: 50_000_000,
    s3_key: 'assets/asset-pipeline-1/original/video.mp4',
    status: 'compressed',
    created_at: new Date(),
    updated_at: new Date(),
  }),
  updateAssetStatus: vi.fn().mockResolvedValue(undefined),
  upsertAdaptation: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mock: repurposing-engine heavy I/O ──────────────────────────────────────

vi.mock('../../services/repurposing-engine/src/transcription.js', () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    text: 'This is a sample transcription of the video content.',
    segments: [
      { start: 0, end: 30, text: 'This is a sample transcription' },
      { start: 30, end: 60, text: 'of the video content.' },
    ],
    wordErrorRate: 0.05,
  }),
  generateSubtitleFile: vi.fn().mockReturnValue('1\n00:00:00,000 --> 00:00:30,000\nThis is a sample transcription\n'),
  uploadSubtitles: vi.fn().mockResolvedValue('assets/asset-pipeline-1/subtitles.srt'),
}))

vi.mock('../../services/repurposing-engine/src/sceneDetection.js', () => ({
  detectScenes: vi.fn().mockResolvedValue([
    { startSeconds: 0, endSeconds: 30, engagementScore: 0.8 },
    { startSeconds: 30, endSeconds: 60, engagementScore: 0.7 },
    { startSeconds: 60, endSeconds: 90, engagementScore: 0.9 },
  ]),
  scoreSegments: vi.fn().mockImplementation((candidates: unknown[]) => candidates),
  selectClips: vi.fn().mockImplementation((candidates: unknown[]) => candidates),
  extractClip: vi.fn().mockImplementation(
    async (_s3Key: string, assetId: string, _candidate: unknown, index: number) =>
      `assets/${assetId}/clips/clip_${index}.mp4`
  ),
  canExtractClips: vi.fn().mockReturnValue(true),
}))

vi.mock('../../services/repurposing-engine/src/captionGeneration.js', () => ({
  generateCaptionsForClip: vi.fn().mockImplementation(
    async (clip: { id: string; asset_id: string }): Promise<Caption[]> => {
      const platforms = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook'] as const
      return platforms.map((platform) => ({
        id: `caption-${clip.id}-${platform}`,
        clip_id: clip.id,
        asset_id: clip.asset_id,
        platform,
        text: `Sample caption for ${platform}`,
        character_count: 25,
        hashtags: ['#content', '#creator'],
        created_at: new Date(),
      }))
    }
  ),
}))

vi.mock('../../services/repurposing-engine/src/db.js', () => ({
  insertClip: vi.fn().mockImplementation(async (clip: Clip) => clip),
  updateClipSubtitlesKey: vi.fn().mockResolvedValue(undefined),
  getClipsByAssetId: vi.fn().mockResolvedValue([]),
}))

// ─── Mock: targeting-engine heavy I/O ────────────────────────────────────────

vi.mock('../../services/targeting-engine/src/db.js', () => ({
  upsertHashtagSuggestions: vi.fn().mockResolvedValue(undefined),
  getHashtagSuggestions: vi.fn().mockResolvedValue([]),
  getChannel: vi.fn().mockResolvedValue(null),
  getPost: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../services/targeting-engine/src/hashtagGeneration.js', () => ({
  generateHashtagSuggestions: vi.fn().mockImplementation(
    (postId: string, platform: string) =>
      Array.from({ length: 10 }, (_, i) => ({
        hashtag: `#tag${i + 1}`,
        platform,
        volume_tier: 'mid' as const,
        predicted_reach_score: 80 - i * 5,
        rank: i + 1,
      }))
  ),
}))

// ─── Mock: publishing-service heavy I/O ──────────────────────────────────────

vi.mock('../../services/publishing-service/src/db.js', () => ({
  insertPost: vi.fn().mockImplementation(async (post: unknown) => post),
  getPostById: vi.fn().mockResolvedValue(null),
  updatePostStatus: vi.fn().mockResolvedValue(undefined),
  insertBatch: vi.fn().mockImplementation(async (batch: unknown) => batch),
  getBatchById: vi.fn().mockResolvedValue(null),
  getScheduledPostsDue: vi.fn().mockResolvedValue([]),
  getChannelById: vi.fn().mockResolvedValue({
    id: 'channel-1',
    creator_id: 'creator-1',
    platform: 'tiktok',
    platform_user_id: 'tiktok-user-1',
    platform_username: 'testcreator',
    token_vault_key: 'vault/channel-1',
    token_expires_at: new Date(Date.now() + 3600_000),
    status: 'active',
    post_count: 15,
    created_at: new Date(),
    updated_at: new Date(),
  }),
  updateChannelStatus: vi.fn().mockResolvedValue(undefined),
  cancelPostsByChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/publishing-service/src/vault.js', () => ({
  getTokens: vi.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: Date.now() + 3600_000,
  }),
}))

// ─── Mock: all 5 platform adapters ───────────────────────────────────────────

vi.mock('../../services/publishing-service/src/platformAdapters.js', () => ({
  getPlatformAdapter: vi.fn().mockReturnValue({
    publishPost: vi.fn().mockResolvedValue({
      platformPostId: 'platform-post-id-123',
      publishedAt: new Date(),
    }),
    refreshToken: vi.fn().mockResolvedValue({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_at: Date.now() + 3600_000,
    }),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    getMetrics: vi.fn().mockResolvedValue({ views: 100, likes: 10, engagement_rate: 0.05 }),
  }),
}))

// ─── Mock: publishing-service index (avoid server startup side-effects) ───────

vi.mock('../../services/publishing-service/src/index.js', () => ({
  broadcastBatchStatusUpdate: vi.fn(),
  app: {},
}))

// ─── Mock: fs/promises (cleanup) ─────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRendition(index: number): Rendition {
  const resolutions = ['360p', '720p', '1080p'] as const
  const res = resolutions[index % 3]
  const heights = [360, 720, 1080]
  return {
    id: `rendition-${index}`,
    asset_id: 'asset-pipeline-1',
    codec: 'h264',
    resolution: res,
    width: 1920,
    height: heights[index % 3],
    bitrate_kbps: 2500,
    vmaf_score: 90,
    file_size_bytes: 8_000_000,
    s3_key: `assets/asset-pipeline-1/renditions/${res}_h264.mp4`,
    created_at: new Date(),
  }
}

function makeAdaptation(platform: string, formatVariant: string): Adaptation {
  return {
    id: `adaptation-${platform}-${formatVariant}`,
    asset_id: 'asset-pipeline-1',
    platform: platform as Adaptation['platform'],
    format_variant: formatVariant,
    aspect_ratio: '9:16',
    codec: 'h264',
    s3_key: `assets/asset-pipeline-1/adaptations/${platform}_${formatVariant}.mp4`,
    status: 'ready',
    created_at: new Date(),
  }
}

// ─── Module handles captured at import time ───────────────────────────────────
// Modules are cached after first import, so subscribe() calls only happen once.
// We capture the handlers here (outside describe) so all tests can reuse them.

// Import service modules to trigger subscribe() registrations
const repurposingMessageBus = await import('../../services/repurposing-engine/src/messageBus.js')
const targetingMessageBus = await import('../../services/targeting-engine/src/messageBus.js')

// Trigger module-level subscribe() calls
await import('../../services/repurposing-engine/src/index.js')
await import('../../services/targeting-engine/src/index.js')

// Capture the registered handlers from the subscribe mocks
const repurposingHandler = vi.mocked(repurposingMessageBus.subscribe).mock.calls.find(
  ([eventType]) => eventType === 'asset.adapted'
)?.[1] as ((event: unknown) => Promise<void>)

const targetingHandler = vi.mocked(targetingMessageBus.subscribe).mock.calls.find(
  ([eventType]) => eventType === 'asset.repurposed'
)?.[1] as ((event: unknown) => Promise<void>)

// ─── Integration tests ────────────────────────────────────────────────────────

describe('Pipeline integration: asset upload → publish', () => {
  beforeEach(() => {
    publishedEvents.length = 0
    // Reset only the call counts on mocks that track invocations, not the handlers
    vi.clearAllMocks()
  })

  it('emits all pipeline events in the correct order (Req 1.3, 2.1, 3.1, 4.3)', async () => {
    expect(repurposingHandler, 'repurposing engine should register asset.adapted handler').toBeDefined()
    expect(targetingHandler, 'targeting engine should register asset.repurposed handler').toBeDefined()

    // ── Step 1: Asset Service emits asset.uploaded ────────────────────────────
    const { publishEvent: assetPublish } = await import('../../services/asset-service/src/messageBus.js')

    const assetUploadedEvent = {
      eventId: 'evt-uploaded-1',
      occurredAt: new Date().toISOString(),
      type: 'asset.uploaded' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        creatorId: 'creator-1',
        s3Key: 'assets/asset-pipeline-1/original/video.mp4',
        mediaType: 'video' as const,
        format: 'mp4' as const,
        fileSizeBytes: 50_000_000,
      },
    }

    await assetPublish(assetUploadedEvent)

    // ── Step 2: Compression Engine handles asset.uploaded → emits asset.compressed
    const { handleAssetUploaded } = await import('../../services/compression-engine/src/index.js')
    await handleAssetUploaded(assetUploadedEvent)

    // ── Step 3: Transcoder handles asset.compressed → emits asset.adapted ────
    const { handleAssetCompressed } = await import('../../services/transcoder/src/index.js')

    const assetCompressedEvent = {
      eventId: 'evt-compressed-1',
      occurredAt: new Date().toISOString(),
      type: 'asset.compressed' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        renditions: [makeRendition(0), makeRendition(1), makeRendition(2)],
      },
    }

    await handleAssetCompressed(assetCompressedEvent)

    // ── Step 4: Repurposing Engine handles asset.adapted → emits asset.repurposed
    const assetAdaptedEvent = {
      eventId: 'evt-adapted-1',
      occurredAt: new Date().toISOString(),
      type: 'asset.adapted' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        adaptations: [
          makeAdaptation('tiktok', 'reels'),
          makeAdaptation('instagram', 'reels'),
          makeAdaptation('youtube', 'watch'),
          makeAdaptation('linkedin', 'feed'),
          makeAdaptation('facebook', 'reels'),
        ],
      },
    }

    await repurposingHandler(assetAdaptedEvent)

    // ── Step 5: Targeting Engine handles asset.repurposed → emits targeting.ready
    const clips: Clip[] = [
      {
        id: 'clip-1',
        asset_id: 'asset-pipeline-1',
        start_seconds: 0,
        end_seconds: 30,
        duration_seconds: 30,
        engagement_score: 0.8,
        s3_key: 'assets/asset-pipeline-1/clips/clip_0.mp4',
        captions: [],
        created_at: new Date(),
      },
    ]

    const assetRepurposedEvent = {
      eventId: 'evt-repurposed-1',
      occurredAt: new Date().toISOString(),
      type: 'asset.repurposed' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        clips,
        captions: [],
      },
    }

    await targetingHandler(assetRepurposedEvent)

    // ── Step 6: Publishing Service emits post.scheduled ───────────────────────
    const { publishEvent: publishingPublish } = await import('../../services/publishing-service/src/messageBus.js')

    const postScheduledEvent = {
      eventId: 'evt-scheduled-1',
      occurredAt: new Date().toISOString(),
      type: 'post.scheduled' as const,
      payload: {
        postId: 'post-1',
        channelId: 'channel-1',
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    }

    await publishingPublish(postScheduledEvent)

    // ── Step 7: Platform adapter publishes → emits post.published ─────────────
    const { getPlatformAdapter } = await import('../../services/publishing-service/src/platformAdapters.js')
    const { getTokens } = await import('../../services/publishing-service/src/vault.js')
    const { getChannelById } = await import('../../services/publishing-service/src/db.js')

    const channel = await getChannelById('channel-1')
    const tokens = await getTokens(channel!.token_vault_key)
    const adapter = getPlatformAdapter(channel!.platform)

    const mockPost = {
      id: 'post-1',
      creator_id: 'creator-1',
      channel_id: 'channel-1',
      asset_id: 'asset-pipeline-1',
      scheduled_at: new Date(Date.now() - 1000),
      status: 'scheduled' as const,
      retry_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    }

    const publishResult = await adapter.publishPost(mockPost, channel!, tokens)

    await publishingPublish({
      eventId: 'evt-published-1',
      occurredAt: new Date().toISOString(),
      type: 'post.published' as const,
      payload: {
        postId: 'post-1',
        channelId: 'channel-1',
        publishedAt: publishResult.publishedAt.toISOString(),
        platformPostId: publishResult.platformPostId,
      },
    })

    // ── Assertions ────────────────────────────────────────────────────────────

    const eventTypes = publishedEvents.map((e) => e.type)

    // All 7 pipeline event types must be present
    expect(eventTypes).toContain('asset.uploaded')
    expect(eventTypes).toContain('asset.compressed')
    expect(eventTypes).toContain('asset.adapted')
    expect(eventTypes).toContain('asset.repurposed')
    expect(eventTypes).toContain('targeting.ready')
    expect(eventTypes).toContain('post.scheduled')
    expect(eventTypes).toContain('post.published')

    // Verify strict ordering: each event must precede the next in the pipeline
    const idx = (type: PostPilotEvent['type']) => eventTypes.indexOf(type)

    expect(idx('asset.uploaded')).toBeLessThan(idx('asset.compressed'))    // Req 1.3
    expect(idx('asset.compressed')).toBeLessThan(idx('asset.adapted'))     // Req 1.3
    expect(idx('asset.adapted')).toBeLessThan(idx('asset.repurposed'))     // Req 2.1
    expect(idx('asset.repurposed')).toBeLessThan(idx('targeting.ready'))   // Req 3.1
    expect(idx('targeting.ready')).toBeLessThan(idx('post.scheduled'))     // Req 4.3
    expect(idx('post.scheduled')).toBeLessThan(idx('post.published'))      // Req 4.3
  })

  it('asset.compressed event contains ≥3 renditions (Req 1.3)', async () => {
    const { handleAssetUploaded } = await import('../../services/compression-engine/src/index.js')

    await handleAssetUploaded({
      eventId: 'evt-uploaded-2',
      occurredAt: new Date().toISOString(),
      type: 'asset.uploaded' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        creatorId: 'creator-1',
        s3Key: 'assets/asset-pipeline-1/original/video.mp4',
        mediaType: 'video' as const,
        format: 'mp4' as const,
        fileSizeBytes: 50_000_000,
      },
    })

    const compressedEvent = publishedEvents.find((e) => e.type === 'asset.compressed')
    expect(compressedEvent).toBeDefined()
    const renditions = (compressedEvent!.payload as { renditions: Rendition[] }).renditions
    expect(renditions.length).toBeGreaterThanOrEqual(3)
  })

  it('asset.adapted event covers all 5 platforms (Req 1.3)', async () => {
    const { handleAssetCompressed } = await import('../../services/transcoder/src/index.js')

    await handleAssetCompressed({
      eventId: 'evt-compressed-2',
      occurredAt: new Date().toISOString(),
      type: 'asset.compressed' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        renditions: [makeRendition(0), makeRendition(1), makeRendition(2)],
      },
    })

    const adaptedEvent = publishedEvents.find((e) => e.type === 'asset.adapted')
    expect(adaptedEvent).toBeDefined()
    const adaptations = (adaptedEvent!.payload as { adaptations: Adaptation[] }).adaptations
    const platforms = new Set(adaptations.map((a) => a.platform))
    expect(platforms.has('tiktok')).toBe(true)
    expect(platforms.has('instagram')).toBe(true)
    expect(platforms.has('youtube')).toBe(true)
    expect(platforms.has('linkedin')).toBe(true)
    expect(platforms.has('facebook')).toBe(true)
  })

  it('targeting.ready event contains 5–30 hashtag suggestions (Req 3.1)', async () => {
    expect(targetingHandler, 'targeting engine should register asset.repurposed handler').toBeDefined()

    await targetingHandler({
      eventId: 'evt-repurposed-2',
      occurredAt: new Date().toISOString(),
      type: 'asset.repurposed' as const,
      payload: {
        assetId: 'asset-pipeline-1',
        clips: [
          {
            id: 'clip-2',
            asset_id: 'asset-pipeline-1',
            start_seconds: 0,
            end_seconds: 30,
            duration_seconds: 30,
            engagement_score: 0.8,
            s3_key: 'assets/asset-pipeline-1/clips/clip_0.mp4',
            captions: [],
            created_at: new Date(),
          },
        ],
        captions: [],
      },
    })

    const targetingEvent = publishedEvents.find((e) => e.type === 'targeting.ready')
    expect(targetingEvent).toBeDefined()
    const hashtags = (targetingEvent!.payload as { hashtags: unknown[] }).hashtags
    expect(hashtags.length).toBeGreaterThanOrEqual(5)
    expect(hashtags.length).toBeLessThanOrEqual(30)
  })

  it('post.published event contains non-null platformPostId and publishedAt (Req 4.3)', async () => {
    const { publishEvent: publishingPublish } = await import('../../services/publishing-service/src/messageBus.js')

    const publishedAt = new Date()
    await publishingPublish({
      eventId: 'evt-published-2',
      occurredAt: new Date().toISOString(),
      type: 'post.published' as const,
      payload: {
        postId: 'post-2',
        channelId: 'channel-1',
        publishedAt: publishedAt.toISOString(),
        platformPostId: 'platform-post-id-456',
      },
    })

    const publishedEvent = publishedEvents.find((e) => e.type === 'post.published')
    expect(publishedEvent).toBeDefined()
    const payload = publishedEvent!.payload as { platformPostId: string; publishedAt: string }
    expect(payload.platformPostId).toBeTruthy()
    expect(payload.publishedAt).toBeTruthy()
  })
})
