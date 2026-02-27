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
function normalizePath(path: string): string {
  // Remove @/ prefix
  let normalized = path.replace(/^@\//, "");
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
 * Verifies if the imports in the generated code match the execution plan or existing codebase.
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
  const localImports = extractLocalImports(code);

  // Collect all valid files (new, modified, existing)
  const validFiles = new Set<string>();

  // Add files from plan
  (executionPlan.newFilesToCreate || []).forEach((f) =>
    validFiles.add(normalizePath(f)),
  );
  (executionPlan.filesToModify || []).forEach((f) =>
    validFiles.add(normalizePath(f)),
  );

  // Add files from codebaseTree (simple parsing)
  // Assumes codebaseTree is a list of paths
  const existingFiles = codebaseTree
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  existingFiles.forEach((f) => validFiles.add(normalizePath(f)));

  for (const importPath of localImports) {
    const normalizedImport = normalizePath(importPath);

    // Check if the imported file exists in our valid set
    // This is a fuzzy check because 'components/UserCard' might match 'app/components/UserCard' or just 'components/UserCard'
    // We check if any valid file ENDS with the imported path
    const isValid = Array.from(validFiles).some((validFile) =>
      validFile.includes(normalizedImport),
    );

    if (!isValid) {
      return `You imported '${importPath}', but that file doesn't seem to exist in the Execution Plan or the Codebase. Fix the import or define the component inline.`;
    }
  }

  return null;
}
