import "server-only";
import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";
import { ApiError, authenticateApi } from "@/lib/services/api-tokens";

/** Wrap a read-only API route: token auth, JSON errors, no caching. */
export function apiRoute<P>(fn: (userId: string, params: P, req: Request) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const userId = await authenticateApi(req);
      const data = await fn(userId, await ctx.params, req);
      return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.code === "not_found" ? 404 : 400 });
      console.error(e);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}
