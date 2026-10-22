import type { Metadata } from "next";
import { LogsConsole } from "@/components/logs-console";
export const metadata: Metadata = { title: "Action History" };
export default function LogsPage() { return <LogsConsole />; }
