import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";

export const GET = apiRoute(async (userId) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  return { id: u.id, email: u.email, name: u.profile?.displayName ?? u.name, goals: u.profile?.goals ?? [] };
});
