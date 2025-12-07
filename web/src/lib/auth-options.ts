import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './db';
import { verifyPassword } from './auth';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    // Email/Password authentication
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.passwordHash) {
          throw new Error('Invalid email or password');
        }

        const isValid = await verifyPassword(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        // Check account status
        if (user.accountStatus === 'PENDING_VERIFICATION') {
          throw new Error('Please verify your email before logging in');
        }

        if (user.accountStatus === 'SUSPENDED') {
          throw new Error('Your account has been suspended');
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),

    // Google OAuth
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // GitHub OAuth
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: '/login',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }

      // Handle OAuth user creation
      if (account && account.provider !== 'credentials') {
        const existingUser = await prisma.user.findUnique({
          where: { email: token.email! },
        });

        if (existingUser) {
          token.id = existingUser.id;

          // Update OAuth provider info if not set
          if (!existingUser.oauthProvider) {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                oauthProvider: account.provider,
                oauthId: account.providerAccountId,
                emailVerified: new Date(),
                accountStatus: 'ACTIVE',
              },
            });
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },

    async signIn({ user, account }) {
      // For OAuth providers, auto-verify email
      if (account?.provider !== 'credentials' && user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existingUser) {
          // Create new user for OAuth
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
              oauthProvider: account?.provider,
              oauthId: account?.providerAccountId,
              emailVerified: new Date(),
              accountStatus: 'ACTIVE',
            },
          });
        }
      }

      return true;
    },
  },

  events: {
    async signIn({ user }) {
      // Log sign in
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'user_login',
          details: { method: 'credentials' },
        },
      });
    },
  },

  debug: process.env.NODE_ENV === 'development',
};
