import type { Metadata } from "next";
import { LearningLab } from "@/components/learning-lab";

export const metadata: Metadata = { title: "Learning Lab" };
export default function LabPage() { return <LearningLab />; }
