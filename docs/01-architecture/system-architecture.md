# Phase 1: System Architecture & Technical Design

## 1. High-Level System Architecture

The **Motionz Onboarding Portal** is designed as an enterprise fullstack application built on **Next.js (App Router with TypeScript)** and deployed to **Vercel**, backed by a managed **Supabase PostgreSQL** database.

```mermaid
graph TD
    subgraph Client Layer
        MOB["Mobile Browser / PWA Shell (iOS & Android)"]
        DESK["Desktop Browser (Admin / CSM / Client)"]
    end

    subgraph Edge & Routing Layer (Vercel)
        CDN["Vercel Global Edge Network (CDN)"]
        SEC_HEADERS["Security Middleware (Auth Guard, Tenant Resolver, Noindex)"]
        CDN --> SEC_HEADERS
    end

    subgraph Application Core (Next.js App Router)
        R_ADMIN["/admin/* (Admin Command Center)"]
        R_CSM["/csm/* (CSM Workspace)"]
        R_PORTAL["/portal/[tenantId]/* (Client Portal)"]
        R_API["/api/* (Internal API Handlers & Webhooks)"]
        
        SEC_HEADERS --> R_ADMIN
        SEC_HEADERS --> R_CSM
        SEC_HEADERS --> R_PORTAL
        SEC_HEADERS --> R_API
    end

    subgraph Data & Storage Tier (Supabase)
        PG["PostgreSQL Database with Row-Level Security (RLS)"]
        STORAGE["Secure Document Storage (Contracts & LLC PDFs)"]
        R_ADMIN -->|Service Role| PG
        R_CSM -->|Authenticated Role| PG
        R_PORTAL -->|Tenant Scoped JWT / RLS| PG
        R_PORTAL -->|Presigned Token Stream| STORAGE
    end

    subgraph External Service Integrations
        GHL["GoHighLevel API (CRM, Leads, Calls, SMS)"]
        SHEETS["Google Sheets API (Tracking Data)"]
        ESRI["Esri World Imagery (Satellite Tiles)"]
        AI_SVC["AI Engine (OpenAI / Anthropic / ElevenLabs)"]
        SLACK["Slack Notifications (Webhooks)"]
        AYR["Ayrshare (Social Media Auto-Publishing)"]
        
        R_API --> GHL
        R_API --> SHEETS
        R_PORTAL --> ESRI
        R_API --> AI_SVC
        R_API --> SLACK
        R_API --> AYR
    end
```

---

## 2. Technology Stack & Rationale

| Layer | Selected Technology | Architectural Rationale |
| :--- | :--- | :--- |
| **Framework** | **Next.js (App Router)** | Full-stack monolithic architecture; combines React Server Components (RSC) for speed and SEO with Server Actions for secure backend execution. Eliminates need for separate backend service. |
| **Language** | **TypeScript (Strict)** | Static type safety across database schemas, API contracts, and UI components; eliminates runtime boundary errors. |
| **Hosting & Compute** | **Vercel** | Automated CI/CD, global Edge caching, serverless function auto-scaling, and environment isolation. |
| **Database** | **Supabase / PostgreSQL** | Enterprise relational database with Row Level Security (RLS) for rock-solid multi-tenant isolation, native JSONB support, and migrations. |
| **Authentication** | **Supabase Auth / NextAuth / Clerk** | JWT session tokens, HttpOnly secure cookies, magic link verification, role-based metadata, and optional MFA for Admins/CSMs. |
| **Styling** | **Vanilla CSS Modules / Design System** | Modern, lightweight, ultra-optimized CSS without bulky runtime libraries; custom design tokens for mobile-first dark UI. |
| **PWA & Mobile** | **Service Workers + Web Manifest** | Native mobile experience, offline app shell caching, standalone full-screen view on iOS and Android. |
| **Realtime Audio** | **WebRTC & WebSocket Client** | High-performance low-latency voice streaming for the Call Practice module. |

---

## 3. Tier Responsibilities

### 3.1. Frontend Tier (React Server & Client Components)
- **Server Components (RSC)**: Render static layouts, fetch initial tenant state securely on the server without exposing database queries, enforce fast First Contentful Paint.
- **Client Components (`use client`)**: Handle interactive state: roof canvas drawing, AI chat streams, form validations, dynamic audio playback, and responsive sidebar/drawer toggles.

### 3.2. Serverless Backend & Server Actions Tier
- Handles tenant resolution, input sanitization (Zod), authorization checks, and orchestrates calls to external APIs (GoHighLevel, Google Sheets, AI services).
- Protects API keys and secrets so that no external service credentials (e.g. GoHighLevel Location API keys, OpenAI tokens) ever reach the browser client.

### 3.3. Database & Storage Tier
- Enforces multi-tenant data boundaries at the SQL query level using Row-Level Security policies tied to the authenticated user's session claims.
- Stores agreements and PDFs in private buckets, serving them only through authenticated, expiring presigned URLs or proxied streams.
