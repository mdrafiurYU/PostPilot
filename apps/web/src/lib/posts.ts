import type { Post, Platform } from '@/types'
export { canCancelOrReschedule } from '@/lib/validation'

export function filterPosts(
  posts: Post[],
  platform?: Platform,
  channelId?: string
): Post[] {
  return posts.filter((post) => {
    if (platform && post.channel?.platform !== platform) return false
    if (channelId && post.channel_id !== channelId) return false
    return true
  })
}
