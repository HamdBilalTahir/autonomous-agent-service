import fs from "fs";
import path from "path";
import { ExecutionPlan } from "./schema";

/**
 * Extracts local import paths from the generated code.
 * Matches imports starting with @/, ./, or ../
 */
function extractLocalImports(code: string): string[] {
  const regex = /import\s+.*?\s+from\s+['"]((?:@\/|\.\/|\.\.\/).*?)['"]/g;
  const imports: string[] = [];
  let match;
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Normalizes a path for comparison.
 * Removes @/ alias and extensions.
 */
function normalizePath(p: string): string {
  // Remove @/ prefix
  let normalized = p.replace(/^@\//, "");
  // Remove ./ prefix
  normalized = normalized.replace(/^\.\//, "");
  // Remove ../ prefix (simple heuristic, might not be perfect for deep nesting without resolving)
  // For validation against a flat list, strict resolution is hard.
  // We'll rely on string matching against known paths.

  // Remove extension
  normalized = normalized.replace(/\.(tsx|ts|jsx|js)$/, "");

  return normalized;
}

/**
 * Resolves a local import path to an absolute file path.
 */
function resolveImportPath(importPath: string): string | null {
  let relativePath = importPath;
  if (importPath.startsWith("@/")) {
    relativePath = importPath.replace("@/", "");
  } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
    // Cannot easily resolve relative paths without knowing the source file path.
    // We'll skip deep relative path checking for now and rely on simple existence check.
    // Or we could try to resolve relative to cwd if it matches a top-level file?
    // For now, let's focus on @/ imports which are absolute to project root.
    return null; // Skip relative paths for deep verification
  }

  const projectRoot = process.cwd();
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  const baseAbsPath = path.join(projectRoot, relativePath);

  // Check exact file
  if (fs.existsSync(baseAbsPath) && fs.statSync(baseAbsPath).isFile()) {
    return baseAbsPath;
  }

  // Check with extensions
  for (const ext of extensions) {
    if (fs.existsSync(baseAbsPath + ext)) {
      return baseAbsPath + ext;
    }
  }

  // Check index files
  for (const ext of extensions) {
    const indexPath = path.join(baseAbsPath, `index${ext}`);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Scans a file for exports.
 */
function scanFileExports(filePath: string): {
  hasDefault: boolean;
  namedExports: Set<string>;
} {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const hasDefault = /export\s+default\s+/.test(content);
    const namedExports = new Set<string>();

    // export const/function/class/interface/type Name ...
    const namedRegex =
      /export\s+(?:const|function|class|interface|type|async\s+function)\s+(\w+)/g;
    let match;
    while ((match = namedRegex.exec(content)) !== null) {
      namedExports.add(match[1]);
    }

    // export { Name } ...
    const exportBraceRegex = /export\s+\{\s*([\w,\s]+)\s*\}/g;
    while ((match = exportBraceRegex.exec(content)) !== null) {
      const names = match[1].split(",").map((s) => s.trim());
      names.forEach((n) => {
        // Handle "Name as Alias"
        const parts = n.split(/\s+as\s+/);
        namedExports.add(parts[parts.length - 1]);
      });
    }

    return { hasDefault, namedExports };
  } catch (e) {
    console.warn(`⚠️ Failed to read file for export scanning: ${filePath}`, e);
    return { hasDefault: false, namedExports: new Set() };
  }
}

/**
 * Verifies if the imports in the generated code match the execution plan or existing codebase.
 * Also enforces import style protocols (Default vs Named).
 * @param code The generated code.
 * @param executionPlan The execution plan containing new/modified files.
 * @param codebaseTree The text representation of the existing file structure.
 * @returns An error message if a mismatch is found, or null if valid.
 */
export function verifyImports(
  code: string,
  executionPlan: ExecutionPlan,
  codebaseTree: string,
): string | null {
  // 1. Check for file existence
  const localImports = extractLocalImports(code);
  const validFiles = new Set<string>();

  (executionPlan.newFilesToCreate || []).forEach((f) =>
    validFiles.add(normalizePath(f)),
  );
  (executionPlan.filesToModify || []).forEach((f) =>
    validFiles.add(normalizePath(f)),
  );

  const existingFiles = codebaseTree
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  existingFiles.forEach((f) => validFiles.add(normalizePath(f)));

  for (const importPath of localImports) {
    const normalizedImport = normalizePath(importPath);
    const isValid = Array.from(validFiles).some((validFile) =>
      validFile.includes(normalizedImport),
    );

    if (!isValid) {
      return `You imported '${importPath}', but that file doesn't seem to exist in the Execution Plan or the Codebase. Fix the import or define the component inline.`;
    }
  }

  // 2. Enforce Import Style Protocols (Regex Heuristics + File Scanning)
  const importRegex =
    /import\s+(?:(\w+)|\{\s*([\w,\s]+)\s*\})\s+from\s+['"](.+?)['"]/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const defaultImport = match[1];
    const namedImportsStr = match[2];
    const importPath = match[3];

    // Only check local imports (starting with @/ or .)
    if (!importPath.startsWith("@/") && !importPath.startsWith(".")) continue;

    // RULE: Hooks should be Named Imports (Heuristic)
    if (importPath.includes("/hooks/") && defaultImport) {
      return `Protocol Violation: Hooks must be imported as named exports (e.g., import { useAuth } from 'hooks/useAuth'), not default. Found: import ${defaultImport} from '${importPath}'`;
    }

    // RULE: Utils should be Named Imports (Heuristic)
    if (importPath.includes("/utils/") && defaultImport) {
      return `Protocol Violation: Utility functions must be imported as named exports (e.g., import { cn } from 'lib/utils'), not default. Found: import ${defaultImport} from '${importPath}'`;
    }

    // REAL-TIME EXPORT VERIFICATION (File Scanning)
    // Attempt to resolve the file and check its actual exports
    if (importPath.startsWith("@/")) {
      const resolvedPath = resolveImportPath(importPath);
      if (resolvedPath) {
        const { hasDefault, namedExports } = scanFileExports(resolvedPath);

        // Check Default Import validity
        if (defaultImport && !hasDefault) {
          return `Export Mismatch: You imported '${defaultImport}' as a default export from '${importPath}', but '${resolvedPath}' has no default export. Use a named import instead.`;
        }

        // Check Named Import validity
        if (namedImportsStr) {
          const namedImports = namedImportsStr
            .split(",")
            .map((s) => s.trim())
            .filter((s) => !s.startsWith("type ")); // Skip type-only imports in verification for now

          for (const name of namedImports) {
            // Handle "Name as Alias"
            const exportedName = name.split(/\s+as\s+/)[0];
            if (!namedExports.has(exportedName)) {
              // Be lenient if we failed to parse completely, but stricter if we found SOME exports
              if (namedExports.size > 0) {
                return `Export Mismatch: You imported '{ ${exportedName} }' from '${importPath}', but '${resolvedPath}' does not export it. Available exports: ${Array.from(namedExports).join(", ")}`;
              }
            }
          }
        }
      }
    }
  }

  return null;
}
