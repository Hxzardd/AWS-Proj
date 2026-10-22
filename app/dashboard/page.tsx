import type { Metadata } from "next";
import { SimulationConsole } from "@/components/simulation-console";

export const metadata: Metadata = { title: "Live Control Loop" };
export default function DashboardPage() { return <SimulationConsole />; }
