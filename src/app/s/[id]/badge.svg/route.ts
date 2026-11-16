import { publicShare } from "@/lib/services/share";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Embeddable badge image for a verified-strengths link (e.g. on a personal site or email signature). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await publicShare(id, false);
  if (!s || s.kind !== "BADGE") return new Response("Not found", { status: 404 });
  const lines = s.badge.strengths.map((x) => x.name);
  const h = 92 + lines.length * 22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="${h}" viewBox="0 0 360 ${h}" role="img" aria-label="${esc(`Verified strengths for ${s.name}: ${lines.join(", ")}`)}">
<rect width="360" height="${h}" rx="12" fill="#ffffff" stroke="#d4d4d8"/><rect width="360" height="6" rx="3" fill="#2563eb"/>
<text x="20" y="34" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#1d4ed8">✓ Verified strengths · Mirror</text>
<text x="20" y="58" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#18181b">${esc(s.name)}</text>
${lines.map((l, i) => `<text x="20" y="${84 + i * 22}" font-family="system-ui,sans-serif" font-size="14" fill="#27272a">• ${esc(l)}</text>`).join("")}
<text x="20" y="${h - 12}" font-family="system-ui,sans-serif" font-size="11" fill="#52525b">${s.badge.raters} raters · ${esc(s.issued.toLocaleDateString("en", { month: "short", year: "numeric" }))}</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
