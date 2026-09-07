import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCodingQuestion, { IEmployerCodingQuestion } from '../models/EmployerCodingQuestion.model';
import EmployerCodingTestCase, { IEmployerCodingTestCase } from '../models/EmployerCodingTestCase.model';
import EmployerCodingSubmission, { IEmployerCodingSubmission } from '../models/EmployerCodingSubmission.model';
import EmployerCodingExecution, {
  IEmployerCodingExecution,
  IEmployerCodingExecutionResult,
  EmployerCodingExecutionStatus,
} from '../models/EmployerCodingExecution.model';
import { getCodeExecutionProvider } from '../execution/CodeExecutionProvider';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export const CODING_EXECUTION_VERSION = 'coding-execution-v1';
const MAX_EXECUTION_ATTEMPTS = 5;
// Safe upper caps regardless of what a question declares — 30A already
// bounds these to [500,10000]ms / [16,1024]MB, this is defense in depth.
const MAX_TIME_LIMIT_MS_CAP = 10_000;
const MAX_MEMORY_LIMIT_MB_CAP = 1024;

/**
 * Deterministic (NO AI) execution orchestration for one submitted candidate
 * attempt (30C) — claims exactly one `EmployerCodingExecution` row per
 * submission BEFORE ever invoking the execution provider, so no two
 * concurrent runs can race for the same submission. Every candidate-facing
 * caller MUST go through `toCandidateDetail`; hidden test input/expected
 * output/actual output are never included there.
 */
export class EmployerCodingExecutionService {
  /**
   * Trusted, no-RBAC entry point — the caller (candidate token flow) has
   * already resolved/validated the exact organization/interview/session/
   * question chain. `submissionId` is the only thing re-validated here
   * against that already-trusted chain.
   */
  async runExecutionForSubmission(
    organizationId: Types.ObjectId,
    interviewId: Types.ObjectId,
    codingSessionId: Types.ObjectId,
    codingQuestionId: Types.ObjectId,
    submissionId: string
  ): Promise<IEmployerCodingExecution> {
    const submission = await EmployerCodingSubmission.findOne({
      _id: submissionId,
      organizationId,
      interviewId,
      codingSessionId,
      codingQuestionId,
    });
    if (!submission) {
      throw new ApiError(404, 'Submission not found');
    }
    if (submission.status === 'draft') {
      throw new ApiError(409, 'Only a submitted attempt can be executed.');
    }

    const question = await EmployerCodingQuestion.findOne({ _id: codingQuestionId, organizationId });
    if (!question) {
      throw new ApiError(404, 'Coding question not found');
    }
    if (!question.supportedLanguages.includes(submission.language)) {
      throw new ApiError(400, 'This language is not supported for this question.');
    }

    const existing = await EmployerCodingExecution.findOne({ organizationId, submissionId: submission._id });
    if (existing) {
      return this.handleExisting(existing, submission, question);
    }
    return this.claimAndExecute(organizationId, submission, question);
  }

  /** GET .../coding-submissions/:submissionId/execution — requires ORGANIZATION_VIEW. Read-only; never triggers a run. */
  async getExecutionForEmployer(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    submissionId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);

    const submission = await EmployerCodingSubmission.findOne({ _id: submissionId, organizationId: organization._id, interviewId });
    if (!submission) {
      throw new ApiError(404, 'Submission not found');
    }

    const execution = await EmployerCodingExecution.findOne({ organizationId: organization._id, submissionId: submission._id });
    if (!execution) {
      return { executed: false };
    }
    return this.toEmployerDetail(execution);
  }

  private async handleExisting(
    existing: IEmployerCodingExecution,
    submission: IEmployerCodingSubmission,
    question: IEmployerCodingQuestion
  ): Promise<IEmployerCodingExecution> {
    if (existing.status === 'completed') {
      return existing;
    }
    if (existing.status === 'running') {
      throw new ApiError(409, 'Execution is already in progress — please try again shortly');
    }
    if (existing.attemptCount >= MAX_EXECUTION_ATTEMPTS) {
      throw new ApiError(409, `Maximum of ${MAX_EXECUTION_ATTEMPTS} execution attempts reached for this submission.`);
    }

    const reclaimed = await EmployerCodingExecution.findOneAndUpdate(
      { _id: existing._id, status: { $in: ['pending', 'failed', 'timeout', 'executor_unavailable'] } },
      { $set: { status: 'running', startedAt: new Date() }, $inc: { attemptCount: 1 }, $unset: { completedAt: 1, errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerCodingExecution.findById(existing._id);
      if (refetched?.status === 'completed') {
        return refetched;
      }
      throw new ApiError(409, 'Execution is already in progress — please try again shortly');
    }

    await this.markSubmissionPending(submission);
    return this.runAndFinalize(reclaimed, submission, question);
  }

  private async claimAndExecute(
    organizationId: Types.ObjectId,
    submission: IEmployerCodingSubmission,
    question: IEmployerCodingQuestion
  ): Promise<IEmployerCodingExecution> {
    let claimed: IEmployerCodingExecution;
    try {
      claimed = await EmployerCodingExecution.create({
        organizationId,
        applicationId: submission.applicationId,
        interviewId: submission.interviewId,
        codingSessionId: submission.codingSessionId,
        codingQuestionId: submission.codingQuestionId,
        submissionId: submission._id,
        executionVersion: CODING_EXECUTION_VERSION,
        status: 'running',
        language: submission.language,
        attemptCount: 1,
        startedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerCodingExecution.findOne({ organizationId, submissionId: submission._id });
      if (!winner) {
        throw new ApiError(409, 'Execution is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, submission, question);
    }

    await this.markSubmissionPending(submission);
    return this.runAndFinalize(claimed, submission, question);
  }

  private async markSubmissionPending(submission: IEmployerCodingSubmission): Promise<void> {
    await EmployerCodingSubmission.updateOne({ _id: submission._id }, { $set: { status: 'execution_pending' } });
  }

  private async runAndFinalize(
    claimed: IEmployerCodingExecution,
    submission: IEmployerCodingSubmission,
    question: IEmployerCodingQuestion
  ): Promise<IEmployerCodingExecution> {
    try {
      const testCases = await EmployerCodingTestCase.find({
        organizationId: claimed.organizationId,
        codingQuestionId: question._id,
        status: 'active',
      }).sort({ order: 1 });

      if (testCases.length === 0) {
        return this.finalize(claimed, submission, 'failed', [], undefined, 'No active test cases are configured for this question.');
      }

      const provider = getCodeExecutionProvider();
      if (!provider.isAvailable() || !provider.supportsLanguage(submission.language)) {
        return this.finalize(claimed, submission, 'executor_unavailable', [], { provider: provider.name });
      }

      const outcome = await provider.execute({
        language: submission.language,
        sourceCode: submission.sourceCode,
        testCases: testCases.map((t) => ({ testCaseId: t._id.toString(), input: t.input, expectedOutput: t.expectedOutput })),
        timeLimitMs: Math.min(question.timeLimitMs, MAX_TIME_LIMIT_MS_CAP),
        memoryLimitMb: Math.min(question.memoryLimitMb, MAX_MEMORY_LIMIT_MB_CAP),
      });

      if (!outcome.available) {
        return this.finalize(claimed, submission, 'executor_unavailable', [], { provider: provider.name });
      }
      if (outcome.errorMessage) {
        return this.finalize(claimed, submission, 'failed', [], { provider: provider.name, ...outcome.environment }, outcome.errorMessage);
      }

      const testCaseById = new Map(testCases.map((t) => [t._id.toString(), t]));
      const results: IEmployerCodingExecutionResult[] = [];
      for (const r of outcome.results ?? []) {
        const testCase = testCaseById.get(r.testCaseId);
        if (!testCase) continue;
        results.push({
          testCaseId: testCase._id,
          type: testCase.type,
          status: r.status,
          durationMs: r.durationMs,
          memoryMb: r.memoryMb,
          actualOutput: r.actualOutput?.slice(0, 4000),
          errorMessage: r.errorMessage?.slice(0, 500),
        });
      }

      return this.finalize(claimed, submission, 'completed', results, { provider: provider.name, ...outcome.environment });
    } catch (error) {
      const message = error instanceof ApiError ? error.message.slice(0, 500) : 'Execution failed unexpectedly.';
      return this.finalize(claimed, submission, 'failed', [], undefined, message);
    }
  }

  private async finalize(
    claimed: IEmployerCodingExecution,
    submission: IEmployerCodingSubmission,
    status: EmployerCodingExecutionStatus,
    results: IEmployerCodingExecutionResult[],
    environment?: { provider: string; runtime?: string; version?: string },
    errorMessage?: string
  ): Promise<IEmployerCodingExecution> {
    const summary = this.computeSummary(results);

    const setFields: Record<string, unknown> = {
      status,
      results,
      summary,
      executionEnvironment: environment,
      completedAt: new Date(),
    };
    if (errorMessage) {
      setFields.errorMessage = errorMessage;
    }

    const updated = await EmployerCodingExecution.findOneAndUpdate(
      { _id: claimed._id },
      errorMessage ? { $set: setFields } : { $set: setFields, $unset: { errorMessage: 1 } },
      { new: true }
    );

    const submissionStatus = status === 'completed' ? 'executed' : 'execution_failed';
    await EmployerCodingSubmission.updateOne({ _id: submission._id }, { $set: { status: submissionStatus } });

    return updated!;
  }

  private computeSummary(results: IEmployerCodingExecutionResult[]) {
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.status === 'passed').length;
    const sampleResults = results.filter((r) => r.type === 'sample');
    const hiddenResults = results.filter((r) => r.type === 'hidden');
    return {
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      hiddenTests: hiddenResults.length,
      hiddenPassed: hiddenResults.filter((r) => r.status === 'passed').length,
      sampleTests: sampleResults.length,
      samplePassed: sampleResults.filter((r) => r.status === 'passed').length,
      passPercent: totalTests > 0 ? Math.round((passedTests / totalTests) * 10000) / 100 : 0,
    };
  }

  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  /** Full detail, employer-only — includes hidden test input/expected/actual output. Never call this for a candidate-facing response. */
  toEmployerDetail(execution: IEmployerCodingExecution): Record<string, unknown> {
    return {
      executed: true,
      status: execution.status,
      language: execution.language,
      results: execution.results.map((r) => ({
        testCaseId: r.testCaseId.toString(),
        type: r.type,
        status: r.status,
        durationMs: r.durationMs,
        memoryMb: r.memoryMb,
        actualOutput: r.actualOutput,
        errorMessage: r.errorMessage,
      })),
      summary: execution.summary,
      executionEnvironment: execution.executionEnvironment,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      errorMessage: execution.errorMessage,
    };
  }

  /**
   * Candidate-safe projection (30C section 5) — sample results keep
   * input/expected/actual output; hidden results are reduced to a bare
   * status only (never testCaseId/input/expectedOutput/actualOutput/
   * durationMs/memoryMb/errorMessage).
   */
  toCandidateDetail(execution: IEmployerCodingExecution, testCasesById: Map<string, IEmployerCodingTestCase>): Record<string, unknown> {
    let hiddenIndex = 0;
    const results = execution.results.map((r) => {
      if (r.type === 'hidden') {
        hiddenIndex += 1;
        return { label: `Hidden test ${hiddenIndex}`, status: r.status };
      }
      const testCase = testCasesById.get(r.testCaseId.toString());
      return {
        input: testCase?.input,
        expectedOutput: testCase?.expectedOutput,
        actualOutput: r.actualOutput,
        status: r.status,
      };
    });

    return {
      executed: true,
      status: execution.status,
      language: execution.language,
      results,
      summary: execution.summary,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
    };
  }
}

export const employerCodingExecutionService = new EmployerCodingExecutionService();
export default employerCodingExecutionService;
