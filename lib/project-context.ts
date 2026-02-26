import { readFile } from "fs/promises";
import path from "path";

/**
 * Analyzes the current project configuration to provide context for the PM agent.
 * Reads key configuration files to determine Next.js version, Tailwind setup, fonts, etc.
 */
export async function analyzeProjectContext(): Promise<string> {
  const context = await Promise.all([
    // Read package.json for versions
    readFile("package.json", "utf-8").catch(() => "{}"),
    // Read existing configs
    readFile("next.config.js", "utf-8")
      .catch(() => readFile("next.config.mjs", "utf-8"))
      .catch(() => readFile("next.config.ts", "utf-8"))
      .catch(() => ""),
    // Check Tailwind config
    readFile("tailwind.config.js", "utf-8")
      .catch(() => readFile("tailwind.config.ts", "utf-8"))
      .catch(() => ""),
    // Read layout for font imports
    readFile("app/layout.tsx", "utf-8")
      .catch(() => readFile("src/app/layout.tsx", "utf-8"))
      .catch(() => ""),
  ]);

  return `PROJECT CONTEXT:
Package.json: ${context[0]}
Next Config: ${context[1] || "Not found"}
Tailwind Config: ${context[2] || "Not found"}  
Layout Fonts: ${context[3] || "Not found (checked app/layout.tsx and src/app/layout.tsx)"}`;
}
