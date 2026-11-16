import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { EmailConfig } from "next-auth/providers";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { magicLinkEmail } from "@/lib/email/templates";
import { DEMO_COACH_EMAIL, DEMO_EMAIL, DEMO_ORG_ADMIN_EMAIL } from "@/lib/demo";
import { normalizeEmail } from "@/lib/email-address";

export const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const demoLoginEnabled = process.env.DEMO_LOGIN_ENABLED === "true";

/** Email magic link, delivered through our EmailSender interface (console by default). */
const magicLink: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.EMAIL_FROM ?? "Mirror <no-reply@mirror.local>",
  maxAge: 24 * 60 * 60,
  // Our own stricter normaliser (Unicode-folded, ASCII-only, exactly one "@"), see lib/email-address.
  normalizeIdentifier(identifier) {
    const email = normalizeEmail(identifier);
    if (!email) throw new Error("Invalid email address");
    return email;
  },
  async sendVerificationRequest({ identifier, url }) {
    await sendEmail(magicLinkEmail({ to: identifier, url }));
  },
};

const providers: NextAuthConfig["providers"] = [magicLink];
if (googleEnabled) providers.push(Google({ allowDangerousEmailAccountLinking: true }));
if (demoLoginEnabled) {
  // Development/demo only: signs in as the seeded demo subject. Disabled unless DEMO_LOGIN_ENABLED=true.
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo user",
      credentials: {},
      async authorize() {
        const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
    Credentials({
      id: "demo-admin",
      name: "Demo org admin",
      credentials: {},
      async authorize() {
        const user = await db.user.findUnique({ where: { email: DEMO_ORG_ADMIN_EMAIL } });
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
    Credentials({
      id: "demo-coach",
      name: "Demo coach",
      credentials: {},
      async authorize() {
        const user = await db.user.findUnique({ where: { email: DEMO_COACH_EMAIL } });
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // JWT sessions so the (dev-only) credentials provider works and no DB hit per request.
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
