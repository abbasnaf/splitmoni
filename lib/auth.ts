import { cookies } from "next/headers";
import { findSessionUser } from "@/lib/database";

export const SESSION_COOKIE = "splitmoni_session";

export async function getSignedInUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return token ? findSessionUser(token) : null;
}

export async function getSessionToken() {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export function setSessionCookie(response: Response, token: string, maxAge = 60 * 60 * 24 * 30) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  return response;
}
