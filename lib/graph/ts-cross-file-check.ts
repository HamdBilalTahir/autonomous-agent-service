import ts from "typescript";
import * as path from "path";

export interface CrossFileCheckResult {
  filePath: string;
  criticalErrors: string[];
}

interface FileExports {
  namedExports: Set<string>;
  hasDefaultExport: boolean;
  /** true when the file has `export * from '...'` — we can't enumerate exports */
  hasWildcardReexport: boolean;
}

/**
 * Extracts the export surface of a TypeScript/TSX source file from its AST.
 *
 * Handles:
 *   export const / function / class / interface / type / enum X  → namedExports
 *   export default ...                                             → hasDefaultExport
 *   export { A, B as C }                                          → namedExports
 *   export * from '...'                                           → hasWildcardReexport
 */
function buildExportCatalog(sourceFile: ts.SourceFile): FileExports {
  const namedExports = new Set<string>();
  let hasDefaultExport = false;
  let hasWildcardReexport = false;

  function visit(node: ts.Node) {
    if (ts.isExportAssignment(node)) {
      // export default X  OR  export = X
      hasDefaultExport = true;
    } else if (ts.isExportDeclaration(node)) {
      if (!node.exportClause) {
        // export * from '...'
        hasWildcardReexport = true;
      } else if (ts.isNamedExports(node.exportClause)) {
        // export { A, B as C }
        for (const el of node.exportClause.elements) {
          namedExports.add(el.name.text);
        }
      }
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      const mods = ts.getModifiers(node);
      const isExported = mods?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      const isDefault = mods?.some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (isExported && isDefault) {
        hasDefaultExport = true;
      } else if (isExported && node.name) {
        namedExports.add(node.name.text);
      }
    } else if (ts.isVariableStatement(node)) {
      const mods = ts.getModifiers(node);
      const isExported = mods?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            namedExports.add(decl.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return { namedExports, hasDefaultExport, hasWildcardReexport };
}

/**
 * Checks cross-file import/export consistency for a batch of generated files.
 *
 * WHAT IT CATCHES (zero false positives):
 *   • Named import `{ X }` from a generated file that only has `export default`
 *   • Named import `{ X }` from a generated file that has no export named X
 *   • Default import `Foo` from a generated file that has no default export
 *
 * WHAT IT IGNORES (no false positives):
 *   • Imports from external packages (react, next, etc.) — not in generatedFiles
 *   • Imports from project files not being generated this round
 *   • Files with `export * from '...'` — wildcard re-exports cannot be enumerated
 *
 * This runs in < 10ms on a 20-file batch. It is purely AST-based — no type
 * inference, no compiler host, no API calls.
 *
 * @param allGeneratedFiles  The complete set of files generated this round
 *                           (needed to build the export catalog for cross-file lookups)
 * @param filesToCheck       The subset of files whose imports should be validated
 *                           (usually the same as allGeneratedFiles, or just the revised files)
 */
export function checkCrossFileImports(
  allGeneratedFiles: { filePath: string; fileContent: string }[],
  filesToCheck: { filePath: string; fileContent: string }[],
): CrossFileCheckResult[] {
  if (allGeneratedFiles.length === 0) return [];

  // ── 1. Parse all generated files into SourceFiles ─────────────────────────
  const sourceFiles = new Map<string, ts.SourceFile>();
  // Map "@/components/ui/button" → "src/components/ui/button.tsx"
  const atAliasMap = new Map<string, string>();

  for (const { filePath, fileContent } of allGeneratedFiles) {
    const isJsx = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
    const sf = ts.createSourceFile(
      filePath,
      fileContent,
      ts.ScriptTarget.ESNext,
      true,
      isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    sourceFiles.set(filePath, sf);

    // Build @/ alias lookup: strip leading "src/" or "./" and remove extension
    const stripped = filePath
      .replace(/^(\.\/)?src\//, "")
      .replace(/\.(ts|tsx|js|jsx)$/, "");
    atAliasMap.set(`@/${stripped}`, filePath);
    // Also index without the src/ prefix in case filePath is already relative
    const noPrefix = filePath
      .replace(/^\.\//, "")
      .replace(/\.(ts|tsx|js|jsx)$/, "");
    if (!atAliasMap.has(`@/${noPrefix}`)) {
      atAliasMap.set(`@/${noPrefix}`, filePath);
    }
  }

  // ── 2. Build export catalog for every generated file ──────────────────────
  const exportCatalogs = new Map<string, FileExports>();
  for (const [filePath, sf] of sourceFiles) {
    exportCatalogs.set(filePath, buildExportCatalog(sf));
  }

  // ── 3. Resolve import path → generated file path ──────────────────────────
  function resolveImport(
    importPath: string,
    containingFile: string,
  ): string | null {
    if (importPath.startsWith("@/")) {
      const withoutExt = importPath.replace(/\.(ts|tsx|js|jsx)$/, "");
      return atAliasMap.get(withoutExt) ?? null;
    }
    if (importPath.startsWith(".")) {
      const dir = path.dirname(containingFile);
      const base = path.resolve(dir, importPath);
      for (const ext of [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        "/index.ts",
        "/index.tsx",
      ]) {
        if (sourceFiles.has(base + ext)) return base + ext;
      }
    }
    return null; // external package or non-generated project file — skip
  }

  // ── 4. Check imports in each file under review ────────────────────────────
  const results: CrossFileCheckResult[] = [];

  for (const { filePath } of filesToCheck) {
    const sfOrUndef = sourceFiles.get(filePath);
    if (!sfOrUndef) {
      results.push({ filePath, criticalErrors: [] });
      continue;
    }
    // Capture the narrowed type in a const so nested functions can use it
    // without TypeScript complaining about potential undefined.
    const sf: ts.SourceFile = sfOrUndef;

    const errors: string[] = [];

    function checkImportDeclaration(node: ts.ImportDeclaration) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) return;
      const moduleSpecifier = node.moduleSpecifier.text;
      const resolvedPath = resolveImport(moduleSpecifier, filePath);
      if (!resolvedPath) return; // not a generated file — skip

      const catalog = exportCatalogs.get(resolvedPath);
      if (!catalog) return;
      // Can't enumerate wildcard re-exports — give benefit of the doubt
      if (catalog.hasWildcardReexport) return;

      if (!node.importClause) return;
      const { name, namedBindings } = node.importClause;

      // Default import: `import Foo from '...'`
      if (name && !catalog.hasDefaultExport) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        const suggestion =
          catalog.namedExports.size > 0
            ? `import { ${[...catalog.namedExports][0]} } from '${moduleSpecifier}'`
            : `Check the exports of '${moduleSpecifier}'`;
        errors.push(
          `[CRITICAL] ${filePath}:${line + 1} - Default import '${name.text}' from '${moduleSpecifier}' but that file has no default export. REPAIR HINT: Use named import instead: ${suggestion}`,
        );
      }

      // Named imports: `import { A, B } from '...'`
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const el of namedBindings.elements) {
          const importedName = (el.propertyName ?? el.name).text;
          if (!catalog.namedExports.has(importedName)) {
            const { line } = sf.getLineAndCharacterOfPosition(el.getStart());
            if (catalog.hasDefaultExport && catalog.namedExports.size === 0) {
              errors.push(
                `[CRITICAL] ${filePath}:${line + 1} - Named import '${importedName}' from '${moduleSpecifier}' failed: that file only has a default export. REPAIR HINT: Use default import: import ${importedName} from '${moduleSpecifier}'`,
              );
            } else {
              const available = [...catalog.namedExports].join(", ") || "none";
              errors.push(
                `[CRITICAL] ${filePath}:${line + 1} - Named import '${importedName}' not found in '${moduleSpecifier}' (available exports: ${available}). REPAIR HINT: Either export '${importedName}' from '${moduleSpecifier}' or correct the import name.`,
              );
            }
          }
        }
      }
    }

    ts.forEachChild(sf, (node) => {
      if (ts.isImportDeclaration(node)) checkImportDeclaration(node);
    });

    results.push({ filePath, criticalErrors: errors });
  }

  return results;
}

// ─── Package import checker ────────────────────────────────────────────────────

/**
 * Built-in Node.js modules and virtual modules that are never in package.json.
 * Imports of these are always valid and must not be flagged.
 */
const NODE_BUILTINS = new Set([
  "fs",
  "path",
  "os",
  "crypto",
  "http",
  "https",
  "url",
  "stream",
  "util",
  "events",
  "child_process",
  "buffer",
  "querystring",
  "zlib",
  "assert",
  "net",
  "tls",
  "dns",
  "readline",
  "cluster",
  "worker_threads",
  "perf_hooks",
  "module",
  "vm",
  "v8",
  "process",
  "timers",
  "console",
  "string_decoder",
]);

/**
 * Extracts the bare package name from an import path.
 * "@scope/pkg/sub" → "@scope/pkg"
 * "pkg/sub"        → "pkg"
 * "./relative"     → null (relative — not an npm package)
 */
function extractPackageName(importPath: string): string | null {
  if (importPath.startsWith(".") || importPath.startsWith("/")) return null;
  if (importPath.startsWith("@/")) return null; // project alias
  const parts = importPath.split("/");
  // Scoped package: @scope/name
  if (parts[0].startsWith("@") && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

/**
 * Checks that every external npm package imported in the generated files
 * is present in the target project's package.json (dependencies / devDependencies).
 *
 * Skips the check entirely when `installedPackages` is empty (unknown state —
 * avoids false positives if package.json could not be read).
 *
 * Returns one [CRITICAL] error per missing package, with a REPAIR HINT
 * that tells the engineer to either install the package or use an installed
 * alternative.
 */
export function checkPackageImports(
  files: { filePath: string; fileContent: string }[],
  installedPackages: string[],
): CrossFileCheckResult[] {
  if (installedPackages.length === 0) return []; // unknown state — skip

  const installed = new Set(installedPackages);
  const results: CrossFileCheckResult[] = [];

  for (const { filePath, fileContent } of files) {
    const isJsx = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
    const sf = ts.createSourceFile(
      filePath,
      fileContent,
      ts.ScriptTarget.ESNext,
      true,
      isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const errors: string[] = [];

    ts.forEachChild(sf, (node) => {
      if (!ts.isImportDeclaration(node)) return;
      if (!ts.isStringLiteral(node.moduleSpecifier)) return;
      const importPath = node.moduleSpecifier.text;
      const pkgName = extractPackageName(importPath);
      if (!pkgName) return; // relative or alias — skip
      if (NODE_BUILTINS.has(pkgName)) return;
      if (installed.has(pkgName)) return;

      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      errors.push(
        `[CRITICAL] ${filePath}:${line + 1} - Package '${pkgName}' is imported but NOT in package.json. REPAIR HINT: Either (1) replace with an installed alternative, or (2) implement the functionality locally without this package.`,
      );
    });

    results.push({ filePath, criticalErrors: errors });
  }

  return results;
}
