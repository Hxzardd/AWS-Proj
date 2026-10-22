# VectorPay Control Plane Design System

This file is the visual source of truth for the project. Page-specific files under `pages/` may override it.

## Product Direction

- Audience: viva examiners, cloud architecture reviewers, and operators.
- Main job: make the control loop credible and understandable within 60 seconds.
- Visual metaphor: a modern observability console, not a retro CRT or neon hacker terminal.
- Personality: precise, calm, inspectable, and safety-conscious.
- Design dials: variance `6/10`, motion `5/10`, density `8/10`.

## Color System

The generated database recommendation used terminal green. The user explicitly rejected that direction, so the production palette uses ice blue for controls and amber for the static baseline.

| Role | Value | Use |
| --- | --- | --- |
| Background | `#080A0F` | Application canvas |
| Card | `#0D1119` | Panels and data surfaces |
| Popover | `#111722` | Tooltips and elevated controls |
| Foreground | `#F2F5FA` | Primary text |
| Muted foreground | `#929DAF` | Secondary copy |
| Border | `#263146` | Panel and control edges |
| Primary | `#82B1FF` | RL agent, active controls, focus |
| Warning | `#EFB86F` | Baseline controller and caution |
| Destructive | `#FF7F8E` | SLA breaches, errors, destructive actions |
| Chart 3 | `#78C7E8` | Supporting telemetry |

Never communicate state with color alone. Pair color with labels, line styles, icons, or numeric values.

## Typography

- Geist Sans for narrative text and headings.
- Geist Mono for metrics, state keys, action names, environment labels, and compact metadata.
- Use tabular numerals for all changing measurements and table columns.
- Heading tracking may be tight; body copy stays at normal tracking with a 1.5 or greater line height.
- Terminal styling comes from hierarchy and mono metadata, not from making all copy monospace.

## Geometry and Density

- Outer panels: `12px` radius.
- Controls and nested surfaces: `8-10px` radius.
- Status chips: `6px` radius, uppercase mono label.
- Dashboard spacing: `8-24px`; marketing sections may use `64-96px` vertical rhythm.
- Prefer 1px borders and restrained inset highlights over large shadows.
- Dense data views may scroll horizontally inside an explicit bordered surface; the page itself must not overflow.

## Motion

- Interaction feedback: `160-220ms`.
- Page and panel entry: `260-440ms` with `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animate only `transform` and `opacity` for entry effects.
- Live status may pulse continuously because it communicates active execution.
- Architecture flow runs a finite sequence and stops.
- Do not animate charts on every polling tick.
- Every animation must collapse under `prefers-reduced-motion: reduce`.

## Component Interfaces

- `TelemetryTile`: label, value, detail, icon, and semantic tone. Use for single live measurements.
- `SeedField`: owns the consistent numeric seed control, accessible name, focus treatment, and input behavior.
- `FeedbackBanner`: owns async error, success, and information semantics with an `aria-live` region.
- `Card`: default terminal panel surface. Avoid adding a second custom shadow or radius at call sites.
- `Badge`: compact system metadata or status, not a decorative pill.

## Chart Semantics

- RL controller: solid ice-blue line.
- Static baseline: dashed amber line.
- SLA/anomaly state: coral marker or text annotation.
- Always render a visible legend and numeric KPI outside the chart.
- Keep polling animations disabled to avoid false movement and visual fatigue.

## Interaction States

Every interactive element requires default, hover, active, focus-visible, disabled, and pending behavior. Async labels use an ellipsis, for example `Starting…` and `Refreshing…`.

## Accessibility and Safety

- Maintain at least WCAG AA text contrast.
- Use semantic links, buttons, labels, tables, and headings.
- Keep a visible skip link and focus target for main content.
- Provide a label or accessible name for every control.
- Preserve browser zoom and keyboard navigation.
- Explain how to recover from configuration and storage errors.
- Real AWS mode must remain visually and behaviorally gated.

## Avoid

- Green terminal wash, neon glow, CRT scanlines, or hacker-culture decoration.
- Purple-to-pink AI gradients.
- Identical card grids with no hierarchy.
- Infinite decorative animation.
- `transition: all`, layout-shifting hover effects, or missing focus states.
- Raw hex colors in page modules. Use semantic tokens.
- Fabricated metrics, claims, or “AI” status copy.

## Pre-Delivery Gate

- [ ] Test at 375px, 768px, 1024px, and 1440px.
- [ ] Verify no page-level horizontal overflow.
- [ ] Verify keyboard focus and skip navigation.
- [ ] Verify reduced-motion behavior.
- [ ] Verify loading, empty, running, stopped, success, warning, and error states.
- [ ] Verify RL and baseline remain distinguishable without relying on color alone.
- [ ] Run lint, strict TypeScript, tests, and production build.
