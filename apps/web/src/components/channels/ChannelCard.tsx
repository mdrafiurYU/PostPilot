'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Channel } from '@/types'

interface ChannelCardProps {
  channel: Channel
  onDisconnect: (channelId: string) => void
}

function formatDate(date?: string | Date): string {
  if (!date) return 'N/A'
  try {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return 'N/A'
  }
}

function StatusBadge({ status }: { status: Channel['status'] }) {
  const styles: Record<Channel['status'], string> = {
    active: 'bg-green-100 text-green-800',
    token_expired: 'bg-red-100 text-red-800',
    disconnected: 'bg-gray-100 text-gray-600',
  }
  const labels: Record<Channel['status'], string> = {
    active: 'Active',
    token_expired: 'Token Expired',
    disconnected: 'Disconnected',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export default function ChannelCard({ channel, onDisconnect }: ChannelCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleConfirmDisconnect() {
    setDialogOpen(false)
    onDisconnect(channel.id)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold capitalize text-gray-900">{channel.platform}</span>
          <span className="text-sm text-gray-600">@{channel.platform_username}</span>
        </div>
        <StatusBadge status={channel.status} />
      </div>

      <div className="text-xs text-gray-500">
        Token expires: <span className="font-medium text-gray-700">{formatDate(channel.token_expires_at)}</span>
      </div>

      {channel.status === 'token_expired' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 font-medium">
            Re-authentication required. Your token has expired.
          </p>
          <a
            href="/channels"
            className="shrink-0 text-sm font-semibold text-red-700 underline hover:text-red-900"
          >
            Re-authenticate
          </a>
        </div>
      )}

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Trigger asChild>
          <button className="self-start text-sm px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
            Disconnect
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none">
            <Dialog.Title className="text-base font-semibold text-gray-900">
              Disconnect {channel.platform_username}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">
              Disconnecting this channel will cancel all pending scheduled posts for{' '}
              <strong>@{channel.platform_username}</strong> on{' '}
              <strong className="capitalize">{channel.platform}</strong>. This action cannot be undone.
            </Dialog.Description>

            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button className="text-sm px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleConfirmDisconnect}
                className="text-sm px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
