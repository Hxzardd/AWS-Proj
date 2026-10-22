import type { Metadata } from "next";
import { CompareConsole } from "@/components/compare-console";
export const metadata: Metadata = { title: "RL vs Baseline" };
export default function ComparePage() { return <CompareConsole />; }
