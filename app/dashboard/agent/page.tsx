import type { Metadata } from "next";
import { AgentConsole } from "@/components/agent-console";
export const metadata: Metadata = { title: "RL Agent Internals" };
export default function AgentPage() { return <AgentConsole />; }
