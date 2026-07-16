import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'postpilot-dev-secret'
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3004'

const authOptions: any = {
  secret: process.env.NEXTAUTH_SECRET ?? JWT_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Email Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: any) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Call auth-service to validate credentials
        const res = await fetch(`${AUTH_SERVICE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })

        if (!res.ok) {
          return null
        }

        const data = await res.json()
        const user = data.user

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }: any) {
      const apiToken = jwt.sign({ sub: token.id, creator_id: token.id }, JWT_SECRET, {
        expiresIn: '30d',
      })
      session.accessToken = apiToken
      session.creatorId = token.id
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export const GET = async (request: Request) => {
  return (NextAuth as any)(authOptions, request)
}

export const POST = async (request: Request) => {
  return (NextAuth as any)(authOptions, request)
}
