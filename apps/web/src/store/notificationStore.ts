import { create } from 'zustand'

type WsStatus = 'connecting' | 'connected' | 'disconnected'

interface NotificationState {
  unreadCount: number
  wsStatus: WsStatus
  hasTokenExpiredChannel: boolean
  incrementUnread: () => void
  resetUnread: () => void
  setWsStatus: (status: WsStatus) => void
  setTokenExpiredChannel: (flag: boolean) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  wsStatus: 'disconnected',
  hasTokenExpiredChannel: false,
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  resetUnread: () => set({ unreadCount: 0 }),
  setWsStatus: (status) => set({ wsStatus: status }),
  setTokenExpiredChannel: (flag) => set({ hasTokenExpiredChannel: flag }),
}))
