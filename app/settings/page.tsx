import type { Metadata } from "next";
import { isAdminSession } from "@/lib/auth";
import { AdminLogin, SettingsConsole } from "@/components/settings-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  return (await isAdminSession()) ? <SettingsConsole /> : <AdminLogin />;
}
