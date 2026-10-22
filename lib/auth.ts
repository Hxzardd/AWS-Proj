import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/config";

const COOKIE_NAME = "vectorpay-admin";

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(value: string) {
  const { SESSION_SECRET } = getServerEnv();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyAdminPassword(password: string) {
  const { ADMIN_PASSWORD } = getServerEnv();
  const [candidate, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(ADMIN_PASSWORD)),
  ]);
  return secureEqual(bytesToHex(candidate), bytesToHex(expected));
}

export async function createAdminSession() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1_000;
  const payload = `admin:${expiresAt}`;
  const signature = await sign(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

export async function isAdminSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number(payload.split(":")[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return secureEqual(signature, await sign(payload));
}

export async function requireAdminSession() {
  if (!(await isAdminSession())) throw new Error("Admin authentication is required.");
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
