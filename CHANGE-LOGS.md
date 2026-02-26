## 🗓️ **2026-02-26**

---

### 🐛 Fixes

---

> ### Fix Vercel Serverless Functions Detection
>
> - **What changed:** Updated API files to use default export pattern instead of App Router syntax, and added `api/test.ts` to `vercel.json`.
> - **Why:** Resolves Vercel deployment error where functions were not recognized and ensures consistent configuration.
> - **Files:**
>   - `api/process-ticket.ts`
>   - `api/webhook.ts`
>   - `api/test.ts`
>   - `vercel.json`
