import 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    creatorId?: string
  }
  interface User {
    // We could also add id here if desired
    id?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    creator_id?: string
    sub?: string
    id?: string
  }
}
