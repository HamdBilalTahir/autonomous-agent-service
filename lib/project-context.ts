import { readFile } from "fs/promises";

/**
 * Reads and parses the target project's package.json to extract the full list
 * of installed npm packages (dependencies + devDependencies + peerDependencies).
 *
 * Returns an empty array if package.json cannot be read or parsed — callers
 * should treat an empty list as "unknown, don't block" rather than "nothing installed".
 */
export async function getInstalledPackages(): Promise<string[]> {
  try {
    const raw = await readFile("package.json", "utf-8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

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
