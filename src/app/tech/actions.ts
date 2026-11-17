"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkTechPassword, techGateConfigured, techPass, TECH_COOKIE } from "@/lib/tech-gate";
import { clientIp, hit } from "@/lib/rate-limit";

export async function unlockTech(formData: FormData) {
  if (!techGateConfigured()) redirect("/tech?e=off");
  if (!(await hit("techPageIp", await clientIp())).ok) redirect("/tech?e=rate");
  if (!checkTechPassword(String(formData.get("password") ?? ""))) redirect("/tech?e=wrong");
  (await cookies()).set(TECH_COOKIE, techPass(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/tech", maxAge: 7 * 86400 });
  redirect("/tech");
}

export async function lockTech() {
  (await cookies()).delete({ name: TECH_COOKIE, path: "/tech" });
  redirect("/tech");
}
