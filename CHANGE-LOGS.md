## 🗓️ **2026-02-26**

---

### 🐛 Fixes

---

> ### Migrated API to Next.js App Router Structure
>
> - **What changed:** Moved API functions from `api/` to `app/api/` and removed `vercel.json`.
> - **Why:** Align with standard Next.js App Router conventions and fix Vercel deployment issues caused by conflicting configuration.
> - **Files:**
>   - `api/` (deleted)
>   - `app/api/process-ticket/route.ts` (created)
>   - `app/api/webhook/route.ts` (created)
>   - `app/api/test/route.ts` (created)
>   - `vercel.json` (deleted)
