import ts from "typescript";

/**
 * Checks a TypeScript/TSX file's syntax using the TypeScript compiler's parser.
 *
 * This is a zero-cost check (no API calls, no external deps) that runs
 * BEFORE an LLM validation call. It catches structural TypeScript parse errors
 * (unclosed brackets, malformed generics, invalid JSX, etc.) immediately,
 * saving an LLM round-trip for already-broken code.
 *
 * Only SYNTACTIC errors are returned — semantic/type errors require a full
 * compilation program with all project dependencies resolved and are not
 * checked here. For those, the LLM validation prompt handles detection.
 */
export function checkTsSyntax(filePath: string, content: string): string[] {
  const isJsx = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
  const scriptKind = isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.ESNext,
    true, // setParentNodes — required for getLineAndCharacterOfPosition
    scriptKind,
  );

  const compilerOptions: ts.CompilerOptions = {
    noResolve: true, // Don't attempt to resolve imports
    skipLibCheck: true,
    noLib: true, // Don't auto-include lib.d.ts
    allowJs: true,
    jsx: isJsx ? ts.JsxEmit.ReactJSX : undefined,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  };

  // Minimal compiler host that only serves our single in-memory file
  const compilerHost: ts.CompilerHost = {
    getSourceFile: (name) => (name === filePath ? sourceFile : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    fileExists: (name) => name === filePath,
    readFile: (name) => (name === filePath ? content : undefined),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    getEnvironmentVariable: () => "",
  };

  const program = ts.createProgram([filePath], compilerOptions, compilerHost);
  const syntacticDiags = program.getSyntacticDiagnostics(sourceFile);

  const errors: string[] = [];
  for (const diag of syntacticDiags) {
    if (diag.start !== undefined && diag.file) {
      const { line, character } =
        diag.file.getLineAndCharacterOfPosition(diag.start);
      const message = ts.flattenDiagnosticMessageText(diag.messageText, " ");
      errors.push(
        `[CRITICAL] ${filePath}:${line + 1}:${character + 1} - SYNTAX ERROR: ${message}. REPAIR HINT: Fix the TypeScript syntax error at line ${line + 1}.`,
      );
    }
  }

  return errors;
}
