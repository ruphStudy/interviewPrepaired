/**
 * Secure code-execution provider abstraction (30C). Deliberately isolated
 * from the rest of the backend so a real, safely-isolated runner (a
 * dedicated container/sandbox service reached over HTTP, never inline in
 * this API process) can be plugged in later WITHOUT touching
 * `EmployerCodingExecutionService`'s orchestration/claim logic.
 *
 * SECURITY CONTRACT for any real implementation of this interface:
 * - No `eval`/`new Function`/`vm` as a security boundary/`require` of
 *   candidate code into this process, no unrestricted host shell/process.
 * - No network access from the executed code.
 * - A fresh, isolated, temporary workspace per run; no project source
 *   mount; no persistent filesystem access; cleanup after every run.
 * - Bounded CPU/wall-clock time, memory, and stdout/stderr size; kill on
 *   timeout.
 * - No host secrets/environment variables leaked into the executed
 *   process.
 * - Output comparison must be deterministic — normalize ONLY trailing
 *   whitespace and line-ending differences; never a fuzzy/AI judgment.
 *
 * This codebase currently has NO such isolated runtime configured (no
 * Docker socket access, no external sandbox/judge service, no execution
 * package). `UnavailableCodeExecutionProvider` is therefore the only
 * provider wired up right now — it never claims to execute anything.
 */

export interface CodeExecutionTestCaseInput {
  testCaseId: string;
  input: string;
  expectedOutput: string;
}

export interface CodeExecutionJob {
  language: string;
  sourceCode: string;
  testCases: CodeExecutionTestCaseInput[];
  timeLimitMs: number;
  memoryLimitMb: number;
}

export type CodeExecutionResultStatus = 'passed' | 'failed' | 'runtime_error' | 'timeout';

export interface CodeExecutionTestResult {
  testCaseId: string;
  status: CodeExecutionResultStatus;
  durationMs?: number;
  memoryMb?: number;
  actualOutput?: string;
  errorMessage?: string;
}

export interface CodeExecutionEnvironment {
  runtime?: string;
  version?: string;
}

export interface CodeExecutionOutcome {
  /** false => the provider (or this language on it) is not actually available right now — the caller must record `executor_unavailable`, never fabricate results. */
  available: boolean;
  results?: CodeExecutionTestResult[];
  environment?: CodeExecutionEnvironment;
  /** Only set for a genuine infrastructure/runtime failure while `available` was true — maps to the execution's `failed` status, never invented pass/fail data. */
  errorMessage?: string;
}

export interface CodeExecutionProvider {
  readonly name: string;
  isAvailable(): boolean;
  supportsLanguage(language: string): boolean;
  execute(job: CodeExecutionJob): Promise<CodeExecutionOutcome>;
}

/**
 * The only provider wired up today — this codebase has no secure isolated
 * execution runtime (no container/sandbox access from the API process).
 * Always reports unavailable; never touches candidate source code in any
 * way (no eval/vm/child_process/require).
 */
export class UnavailableCodeExecutionProvider implements CodeExecutionProvider {
  public readonly name = 'unavailable';

  isAvailable(): boolean {
    return false;
  }

  supportsLanguage(_language: string): boolean {
    return false;
  }

  async execute(_job: CodeExecutionJob): Promise<CodeExecutionOutcome> {
    return { available: false };
  }
}

let provider: CodeExecutionProvider | null = null;

/** Single seam for swapping in a real provider later (e.g. via an env-var-selected implementation) without touching any caller. */
export function getCodeExecutionProvider(): CodeExecutionProvider {
  if (!provider) {
    provider = new UnavailableCodeExecutionProvider();
  }
  return provider;
}
