# Mobile Responsiveness Audit
**Target Application:** TalentAI Platform (React + Vite + Tailwind)
**Date:** 2026-06-06

## 1. Page-by-Page Analysis

### 1.1 Dashboard (`Dashboard.tsx`)
- **Non-responsive grids:** Uses `grid-cols-2 xl:grid-cols-4` and `grid-cols-2 xl:grid-cols-5`. This forces 2 columns even on a 320px screen, causing horizontal overflow and squashed content.
- **Font scaling issues:** Text sizes like `text-3xl` might be too large for dual-column 320px layouts.
- **Padding:** Uses `p-6 lg:p-8` which is better, but `p-4` would be preferable for ultra-small screens.

### 1.2 Candidates (`Candidates.tsx`)
- **Horizontal overflow:** Flex containers without `flex-wrap` (e.g., `flex items-center gap-3`) can cause wrapping issues.
- **Grids:** Candidate list grid handles breakpoints (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), which is correct.
- **Candidate Modal:** Uses `max-w-4xl w-full` (responsive), but internal paddings (`p-8`) consume too much horizontal real estate on a 320px screen (64px total padding).

### 1.3 Jobs (`Jobs.tsx`)
- **Fixed widths:** Uses `max-w-[280px]` which can look broken on very small devices.
- **Padding constraints:** Uses `p-8 max-w-7xl mx-auto` directly. 64px of horizontal padding leaves only 256px of content space on an iPhone SE (320px).

### 1.4 Semantic Search (`SemanticSearchWidget.tsx`)
- **Layout:** Search bar in the header layout (`max-w-lg`) shrinks correctly, but alongside the fixed sidebar, it leaves almost no room.

### 1.5 Recruiter Copilot (`CopilotPanel.tsx`)
- **Fixed widths (CRITICAL):** Uses an inline style `style={{ width: 400 }}`. On screens < 400px, this causes immediate horizontal overflow and prevents the user from closing or interacting with the chat window.
- **Positioning:** Fixed to `bottom-24 right-6`, which doesn't adapt to mobile viewports (should be `inset-0` or full width on mobile).

### 1.6 Interview Prep (`InterviewPrep.tsx`)
- **Grids:** Responsive (`grid-cols-1 lg:grid-cols-3`), but internal metric grids (`grid-cols-2 md:grid-cols-5`) suffer from the same 2-column squashing issue on mobile.

### 1.7 LangGraph Visualizer (`AgentsPipeline.tsx`)
- **Layout:** Sticky node panel `lg:w-[400px] w-full` is responsive, but `p-8` container padding restricts canvas width. 

### 1.8 Layout / Sidebar (`Layout.tsx`)
- **Desktop-only layouts (CRITICAL):** The sidebar has a fixed width of `256px` (or `72px` collapsed) using inline styles. There is no hamburger menu, no off-canvas drawer, and no `hidden md:flex` logic. On a 320px screen, a 256px sidebar leaves exactly 64px for the main application content, rendering the entire app unusable on mobile.

---

## 2. Component Classification

| Component | Status | Reasoning |
| :--- | :--- | :--- |
| **Sidebar Layout** | 🔴 Needs Major Refactor | No mobile menu toggle; fixed 256px width permanently visible. |
| **Recruiter Copilot** | 🔴 Needs Major Refactor | Hardcoded inline `width: 400px` overflows mobile screens. |
| **Dashboard Stats** | 🟡 Needs Minor Fixes | Swap `grid-cols-2` for `grid-cols-1 sm:grid-cols-2`. |
| **Jobs / Job Modal** | 🟡 Needs Minor Fixes | Swap hardcoded `p-8` for `p-4 md:p-8`; remove `max-w-[280px]`. |
| **Candidate List** | 🟢 Mobile Ready | Grids respond gracefully (`grid-cols-1 md:grid-cols-2`). |
| **Candidate Modal** | 🟡 Needs Minor Fixes | Internal spacing (`p-8`) and nested `grid-cols-2` metrics. |

---

## 3. Tailwind Classes Causing Problems

- `w-[400px]` or `style={{ width: 400 }}` (CopilotPanel)
- `max-w-[280px]` (Jobs.tsx)
- `grid-cols-2` and `grid-cols-3` without `md:` or `sm:` prefixes (Dashboard, Candidates, Interview Prep)
- `p-8` applied universally on main wrappers without `p-4 md:p-8` breakpoints.
- Lack of `flex-wrap` on horizontal `.flex.gap-X` elements containing multiple badges.

---

## 4. Implementation Roadmap & Priorities

### P0 Critical
- **Sidebar Navigation Redesign:** Implement a mobile hamburger menu and convert the fixed sidebar into an off-canvas drawer (`hidden md:flex fixed inset-y-0`) for mobile.
- **Copilot Panel Fix:** Remove `width: 400px`. Use `w-full sm:w-[400px]` and adapt bottom/right offsets for mobile screens (e.g., full screen on mobile, floating on desktop).

### P1 Important
- **Dashboard Grid Breakpoints:** Convert all instances of `grid-cols-2` and `grid-cols-3` on the Dashboard and nested metrics to `grid-cols-1 sm:grid-cols-2` to prevent horizontal squashing.
- **Padding Adjustments:** Do a global find-and-replace of `p-8` wrapper classes with `p-4 md:p-6 lg:p-8` to reclaim horizontal space on small screens.

### P2 Enhancement
- **Flex Wrapping:** Add `flex-wrap` to badge containers and skill lists.
- **Touch Targets:** Increase padding on buttons and interactive elements for better touch targets.
- **Font Scaling:** Adjust text sizing (`text-3xl` -> `text-2xl md:text-3xl`) for large headers on mobile screens.

---

## 5. Screenshots Checklist (Testing Matrix)

To fully validate the fixes upon implementation, ensure visual fidelity at the following viewports:

- [ ] **320px** (iPhone SE) - Validate sidebar is hidden, hamburger visible.
- [ ] **375px** (iPhone X/12/13 mini) - Validate Copilot full-screen chat.
- [ ] **390px** (iPhone 12/13/14 Pro) - Validate candidate modal padding.
- [ ] **768px** (iPad Mini Portrait) - Validate 2-column grid transitions.
- [ ] **1024px** (iPad Pro Landscape) - Validate sidebar dock state.
- [ ] **1440px** (Desktop) - Validate ultra-wide metric scaling.
