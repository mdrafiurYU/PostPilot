// HLS/DASH manifest generation for the Compression Engine
// Requirements: 7.8

import type { Rendition } from '@postpilot/types'

export type ManifestFormat = 'hls' | 'dash'

/**
 * Generate an HLS (.m3u8) master playlist referencing all renditions.
 * Each rendition entry includes BANDWIDTH, RESOLUTION, and CODECS attributes.
 *
 * Requirements: 7.8 — manifest SHALL reference all renditions
 */
export function generateHlsManifest(renditions: Rendition[]): string {
  const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3', '']

  for (const rendition of renditions) {
    const bandwidth = rendition.bitrate_kbps * 1000
    const resolution = `${rendition.width}x${rendition.height}`
    const codecs = codecToHlsCodecString(rendition.codec)

    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution},CODECS="${codecs}"`,
      rendition.s3_key
    )
  }

  return lines.join('\n')
}

/**
 * Generate a DASH (.mpd) manifest referencing all renditions.
 * Produces a minimal MPD with one AdaptationSet containing all representations.
 *
 * Requirements: 7.8 — manifest SHALL reference all renditions
 */
export function generateDashManifest(renditions: Rendition[]): string {
  const representations = renditions
    .map((r) => {
      const bandwidth = r.bitrate_kbps * 1000
      return [
        `      <Representation id="${r.id}" mimeType="video/mp4"`,
        `        codecs="${codecToDashCodecString(r.codec)}"`,
        `        width="${r.width}" height="${r.height}"`,
        `        bandwidth="${bandwidth}">`,
        `        <BaseURL>${r.s3_key}</BaseURL>`,
        `      </Representation>`,
      ].join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static">',
    '  <Period>',
    '    <AdaptationSet mimeType="video/mp4" segmentAlignment="true">',
    representations,
    '    </AdaptationSet>',
    '  </Period>',
    '</MPD>',
  ].join('\n')
}

function codecToHlsCodecString(codec: Rendition['codec']): string {
  switch (codec) {
    case 'h264': return 'avc1.42E01E,mp4a.40.2'
    case 'h265': return 'hvc1.1.6.L93.90,mp4a.40.2'
    case 'av1':  return 'av01.0.04M.08,mp4a.40.2'
    default: return 'avc1.42E01E,mp4a.40.2'
  }
}

function codecToDashCodecString(codec: Rendition['codec']): string {
  switch (codec) {
    case 'h264': return 'avc1.42E01E'
    case 'h265': return 'hvc1.1.6.L93.90'
    case 'av1':  return 'av01.0.04M.08'
    default: return 'avc1.42E01E'
  }
}

/**
 * Count the number of rendition references in an HLS manifest.
 * Used for property testing (Property 27).
 */
export function countHlsRenditionRefs(manifest: string): number {
  return (manifest.match(/#EXT-X-STREAM-INF:/g) ?? []).length
}

/**
 * Count the number of rendition references in a DASH manifest.
 * Used for property testing (Property 27).
 */
export function countDashRenditionRefs(manifest: string): number {
  return (manifest.match(/<Representation /g) ?? []).length
}
