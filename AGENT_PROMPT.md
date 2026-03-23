# Cursor Agent Kickoff — AtoZ Meta Publisher UI Rebuild

Read `.cursorrules` fully before writing any code.

## Task
Rebuild the frontend of the A to Z Meta Publisher app as a modern Next.js 14 
application. The Flask backend at localhost:4000 already exists — do NOT modify it.

## Step-by-Step Build Order

1. **Scaffold** Next.js 14 with TypeScript, Tailwind, shadcn/ui init
2. **Configure** tailwind.config.ts with AtoZ brand colors from .cursorrules
3. **Build AppShell** — Sidebar + main layout with Framer Motion page transitions
4. **Build PhoneMockup component** — reusable iPhone-style preview frame
5. **Build PostThumbnailCard** — with platform badge, status, hover animation
6. **Build Dashboard page** — bento stats + thumbnail grid + timeline
7. **Build Posts page** — grid/table toggle + Sheet slide-in detail view
8. **Build Drafts page** — approve/reject workflow
9. **Build Scheduler page** — calendar with upcoming posts
10. **Build Analytics page** — Recharts + competitor bento grid

## Visual Reference
The target aesthetic is: Vercel dashboard meets Instagram creator studio.
Clean white cards, thin borders, generous whitespace, with AtoZ navy/amber 
brand accents. Platform colors (FB blue, IG pink) appear ONLY on badges and 
platform-specific tabs — not as primary UI colors.

Start with Step 1 and confirm scaffold is working before proceeding.
