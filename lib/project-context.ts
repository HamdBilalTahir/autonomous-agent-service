import { readFile } from "fs/promises";
import { GitHubService } from "./github";

/**
 * Reads and parses the target project's package.json to extract the full list
 * of installed npm packages (dependencies + devDependencies + peerDependencies).
 *
 * Returns an empty array if package.json cannot be read or parsed — callers
 * should treat an empty list as "unknown, don't block" rather than "nothing installed".
 */
export async function getInstalledPackages(
  github?: GitHubService,
  owner?: string,
  repo?: string,
  branch?: string,
): Promise<string[]> {
  try {
    let raw: string;
    if (github && owner && repo) {
      const content = await github.getFileContent(
        owner,
        repo,
        "package.json",
        branch,
      );
      if (!content) return [];
      raw = content;
    } else {
      raw = await readFile("package.json", "utf-8");
    }

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
export async function analyzeProjectContext(
  github?: GitHubService,
  owner?: string,
  repo?: string,
  branch?: string,
): Promise<string> {
  const fileNames = [
    "package.json",
    ["next.config.js", "next.config.mjs", "next.config.ts"],
    ["tailwind.config.js", "tailwind.config.ts"],
    ["app/layout.tsx", "src/app/layout.tsx"],
  ];

  const getFile = async (pathOrPaths: string | string[]): Promise<string> => {
    const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
    for (const path of paths) {
      try {
        if (github && owner && repo) {
          const content = await github.getFileContent(
            owner,
            repo,
            path,
            branch,
          );
          if (content) return content;
        } else {
          return await readFile(path, "utf-8");
        }
      } catch (e) {
        // continue to next path
      }
    }
    return "";
  };

  const context = await Promise.all(fileNames.map(getFile));

  return `PROJECT CONTEXT:
Package.json: ${context[0] || "{}"}
Next Config: ${context[1] || "Not found"}
Tailwind Config: ${context[2] || "Not found"}  
Layout Fonts: ${context[3] || "Not found (checked app/layout.tsx and src/app/layout.tsx)"}`;
}
