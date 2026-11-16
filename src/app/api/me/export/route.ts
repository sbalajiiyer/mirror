import { auth } from "@/auth";
import { exportMyData } from "@/lib/services/my-data";

/** "Download my data": everything Mirror stores about the signed-in person, as JSON. */
export async function GET() {
  const uid = (await auth())?.user?.id;
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const data = await exportMyData(uid);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="mirror-my-data-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
}
