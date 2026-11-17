/** Next.js hook: every uncaught server error (pages, actions, route handlers) is recorded. */
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/monitoring");
  await recordError(err, { route: `${request.method} ${context.routePath ?? request.path.split("?")[0]}` });
}
