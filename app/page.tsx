import Link from "next/link";
import {
  ArrowRight,
  Brain,
  CheckCircle,
  CloudArrowUp,
  Coins,
  Gauge,
  GitBranch,
  Lightning,
  ShieldCheck,
  Stack,
} from "@phosphor-icons/react/dist/ssr";
import { Brand } from "@/components/brand";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const objectives = [
  "Design a cloud-based framework for intelligent API performance optimization.",
  "Monitor latency, throughput, CPU utilization, and response time in real time.",
  "Implement Reinforcement Learning for autonomous optimization of API requests.",
  "Automate load balancing and resource scaling based on workload conditions.",
  "Improve system availability, scalability, and fault tolerance.",
];

const innovations = [
  { title: "RL vs rules", body: "Runs the same seeded workload through learning and static controllers.", icon: Brain },
  { title: "Dynamic resources", body: "Scaling actions change capacity and affect the next observation.", icon: Stack },
  { title: "Intelligent routing", body: "Traffic shifts toward the least-loaded simulated pool.", icon: GitBranch },
  { title: "Adaptive caching", body: "The agent changes Redis TTL and the simulated hit ratio.", icon: Lightning },
  { title: "Learning curve", body: "Q-values, epsilon decay, and cumulative rewards remain inspectable.", icon: Gauge },
  { title: "Cost awareness", body: "The reward balances latency, throughput, SLA risk, and cost.", icon: Coins },
];

const stackGroups = [
  {
    label: "Application plane",
    items: [
      ["Application", "Next.js App Router, TypeScript, Server Actions"],
      ["Interface", "Tailwind CSS, shadcn/ui, Recharts"],
      ["Learning", "Tabular Q-learning with epsilon-greedy exploration"],
    ],
  },
  {
    label: "Infrastructure plane",
    items: [
      ["Data", "Prisma, MySQL, Redis"],
      ["Cloud seam", "AWS SDK v3 for Auto Scaling, ALB, and CloudWatch"],
      ["Delivery", "Docker Compose, Vitest"],
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-[100dvh] overflow-hidden">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 md:px-6">
          <Link href="/" className="rounded-[10px]" aria-label="VectorPay home"><Brand /></Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Overview navigation">
            <a href="#architecture" className="transition-colors duration-200 hover:text-foreground">Architecture</a>
            <a href="#innovation" className="transition-colors duration-200 hover:text-foreground">Innovation</a>
            <a href="#stack" className="transition-colors duration-200 hover:text-foreground">Stack</a>
          </nav>
          <Button asChild size="sm"><Link href="/dashboard">Open dashboard <ArrowRight size={15} /></Link></Button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="relative mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1400px] items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-[minmax(0,1.06fr)_minmax(420px,0.94fr)] lg:gap-16 lg:py-14">
          <div className="page-enter">
            <Badge className="mb-6"><span className="status-breathe size-1.5 rounded-full bg-primary" aria-hidden="true" />System / Full-Stack Simulation</Badge>
            <h1 className="max-w-[760px] text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-5xl lg:text-[3.25rem] xl:text-6xl">A self-learning control loop for payment APIs.</h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">It observes live metrics, learns infrastructure actions, and measures itself against static scaling.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/dashboard">Open dashboard <ArrowRight size={18} /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/dashboard/compare">View comparison</Link></Button>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 border-t border-border/70 pt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" aria-label="Runtime summary">
              <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />Simulator active</span>
              <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />Baseline paired</span>
              <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />AWS gated</span>
            </div>
          </div>
          <div className="page-enter [animation-delay:100ms]">
            <ArchitectureDiagram />
          </div>
        </section>

        <section id="architecture" className="section-reveal scroll-mt-24 border-y bg-card/30">
          <div className="mx-auto max-w-5xl px-4 py-20 md:px-6 md:py-24">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Why this framework exists</h2>
            <p className="mt-6 max-w-[82ch] text-base leading-8 text-muted-foreground md:text-lg">Digital payment gateways handle millions of API requests every day, making performance, scalability, and reliability critical. Traditional API management systems rely on static configurations that cannot adapt efficiently to changing workloads, resulting in increased response time, server overload, and reduced user experience. This project proposes an Autonomous API Performance Optimization Framework that leverages Reinforcement Learning (RL) to dynamically optimize API performance in cloud environments. The framework continuously monitors system metrics such as response time, CPU utilization, memory usage, request rate, and network latency, and automatically determines the optimal scaling, routing, and caching strategies. Cloud services such as AWS Auto Scaling, Load Balancer, CloudWatch, and API Gateway are integrated to enable autonomous decision-making.</p>
          </div>
        </section>

        <section className="section-reveal mx-auto max-w-[1400px] px-4 py-20 md:px-6 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">What the demo proves</h2>
              <p className="mt-4 max-w-md leading-7 text-muted-foreground">Each objective is represented by a running system, an inspectable decision, or a repeatable evaluation.</p>
            </div>
            <div className="terminal-panel overflow-hidden rounded-xl border bg-card/45">
              {objectives.map((objective, index) => (
                <div key={objective} className="group flex gap-4 border-b p-5 transition-colors duration-200 last:border-b-0 hover:bg-primary/[0.035] md:p-6">
                  <span className="mt-0.5 font-mono text-[10px] tracking-[0.12em] text-primary" aria-hidden="true">0{index + 1}</span>
                  <CheckCircle className="mt-0.5 shrink-0 text-primary transition-transform duration-200 group-hover:-translate-y-px" size={20} weight="duotone" aria-hidden="true" />
                  <p className="max-w-2xl text-sm leading-6 text-secondary-foreground">{objective}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="innovation" className="section-reveal scroll-mt-24 border-y bg-card/30">
          <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-6 md:py-24">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Innovation you can inspect</h2>
            <p className="mt-4 max-w-xl leading-7 text-muted-foreground">Every claim has a visible control, learned value, logged effect, or matched-seed result.</p>
            <div className="mt-10 grid auto-rows-[minmax(160px,auto)] gap-4 md:grid-cols-3">
              {innovations.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title}
                    className={`group panel-surface relative overflow-hidden rounded-xl border p-5 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-primary/30 ${index === 0 ? "bg-primary/[0.065] md:col-span-2 md:row-span-2 md:p-7" : index === 2 ? "metric-grid bg-background/70" : index === 4 ? "bg-muted/65" : "bg-background/75"}`}
                  >
                    <span className="absolute right-4 top-4 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Module 0{index + 1}</span>
                    <span className={`flex items-center justify-center rounded-[12px] bg-primary/10 text-primary transition-transform duration-300 group-hover:rotate-[-3deg] group-hover:scale-105 ${index === 0 ? "size-12" : "size-10"}`}>
                      <Icon size={index === 0 ? 26 : 21} weight="duotone" aria-hidden="true" />
                    </span>
                    <div className={index === 0 ? "mt-12 max-w-md md:mt-20" : "mt-6"}>
                      <h3 className={index === 0 ? "text-2xl font-semibold tracking-[-0.03em]" : "font-semibold"}>{item.title}</h3>
                      <p className={`mt-2 leading-6 text-muted-foreground ${index === 0 ? "text-base" : "text-sm"}`}>{item.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="stack" className="section-reveal mx-auto max-w-[1400px] scroll-mt-24 px-4 py-20 md:px-6 md:py-24">
          <div className="flex max-w-3xl items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-primary/25 bg-primary/10 text-primary"><CloudArrowUp size={24} aria-hidden="true" /></span>
            <div><h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Built for a credible architecture review</h2><p className="mt-4 max-w-xl leading-7 text-muted-foreground">A complete Node.js runtime with visible integration seams, durable state, and repeatable evaluation.</p></div>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            {stackGroups.map((group, groupIndex) => (
              <div key={group.label} className={`terminal-panel overflow-hidden rounded-xl border ${groupIndex === 0 ? "bg-card/75" : "bg-primary/[0.04]"}`}>
                <p className="border-b px-5 py-4 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p>
                <div className="p-2">
                  {group.items.map(([layer, technology]) => (
                    <div key={layer} className="grid gap-1 rounded-xl px-3 py-3.5 transition-colors duration-200 hover:bg-background/50 sm:grid-cols-[150px_1fr] sm:gap-5">
                      <span className="text-sm font-medium">{layer}</span><span className="text-sm leading-6 text-muted-foreground">{technology}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="terminal-panel mt-10 flex flex-col items-start justify-between gap-6 rounded-xl border bg-card/80 p-6 md:flex-row md:items-center md:p-8">
            <div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><ShieldCheck size={24} aria-hidden="true" /></span><div><h3 className="font-semibold">Simulation first. Real AWS is an explicit opt-in.</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Every infrastructure decision is logged with its provider and effect.</p></div></div>
            <Button asChild><Link href="/dashboard">Open dashboard <ArrowRight size={16} /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6"><Brand /><span>College cloud architecture demo. Simulated by default.</span></div>
      </footer>
    </div>
  );
}
