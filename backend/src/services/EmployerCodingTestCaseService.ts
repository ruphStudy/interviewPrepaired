import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCodingQuestion, { IEmployerCodingQuestion } from '../models/EmployerCodingQuestion.model';
import EmployerCodingTestCase, { IEmployerCodingTestCase, EmployerCodingTestCaseType } from '../models/EmployerCodingTestCase.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_LENGTH = 4000;
const MAX_EXPLANATION_LENGTH = 500;

export interface CodingTestCaseInput {
  type: EmployerCodingTestCaseType;
  input: string;
  expectedOutput: string;
  weight?: number;
  explanation?: string;
}

/**
 * Employer-internal test-case management for `EmployerCodingQuestion` (30A)
 * — pure data, no execution. `hidden` rows must never be returned by any
 * candidate/public-facing surface (enforced by callers using the
 * candidate-safe projection, never this service's own detail shape).
 */
export class EmployerCodingTestCaseService {
  /** GET .../test-cases — requires ORGANIZATION_VIEW. Employer-only — includes hidden cases in full. */
  async listTestCases(organizationId: string, actingRole: OrganizationMemberRole, codingQuestionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const question = await this.findQuestion(organization, codingQuestionId);
    const testCases = await EmployerCodingTestCase.find({ organizationId: organization._id, codingQuestionId: question._id, status: 'active' }).sort({
      order: 1,
    });
    return { testCases: testCases.map((t) => this.toDetail(t)) };
  }

  /** POST .../test-cases — requires INTERVIEWS_MANAGE. Only while the parent question is `draft`. */
  async addTestCase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    codingQuestionId: string,
    input: CodingTestCaseInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const question = await this.findQuestion(organization, codingQuestionId);
    this.assertQuestionEditable(question);

    const normalized = this.validateInput(input);
    const lastOrder = await EmployerCodingTestCase.findOne({ organizationId: organization._id, codingQuestionId: question._id })
      .sort({ order: -1 })
      .select('order');

    const doc = await EmployerCodingTestCase.create({
      organizationId: organization._id,
      codingQuestionId: question._id,
      order: (lastOrder?.order ?? -1) + 1,
      status: 'active',
      ...normalized,
    });

    return this.toDetail(doc);
  }

  /** PATCH .../test-cases/:testCaseId — requires INTERVIEWS_MANAGE. Only while the parent question is `draft`. */
  async updateTestCase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    codingQuestionId: string,
    testCaseId: string,
    input: Partial<CodingTestCaseInput>
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const question = await this.findQuestion(organization, codingQuestionId);
    this.assertQuestionEditable(question);
    const testCase = await this.findTestCase(organization, question, testCaseId);

    const merged: CodingTestCaseInput = {
      type: input.type ?? testCase.type,
      input: input.input ?? testCase.input,
      expectedOutput: input.expectedOutput ?? testCase.expectedOutput,
      weight: input.weight ?? testCase.weight,
      explanation: input.explanation ?? testCase.explanation,
    };
    const normalized = this.validateInput(merged);
    testCase.set(normalized);
    await testCase.save();
    return this.toDetail(testCase);
  }

  /** DELETE .../test-cases/:testCaseId — requires INTERVIEWS_MANAGE. Soft (archive), matching this codebase's archive-over-delete convention. Only while the parent question is `draft`. */
  async archiveTestCase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    codingQuestionId: string,
    testCaseId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const question = await this.findQuestion(organization, codingQuestionId);
    this.assertQuestionEditable(question);
    const testCase = await this.findTestCase(organization, question, testCaseId);

    testCase.status = 'archived';
    await testCase.save();
    return this.toDetail(testCase);
  }

  private assertQuestionEditable(question: IEmployerCodingQuestion): void {
    if (question.status !== 'draft') {
      throw new ApiError(409, 'Test cases can only be managed while the coding question is a draft.');
    }
  }

  private validateInput(input: CodingTestCaseInput): Partial<IEmployerCodingTestCase> {
    if (input.type !== 'sample' && input.type !== 'hidden') {
      throw new ApiError(400, 'type must be "sample" or "hidden"');
    }
    const testInput = typeof input.input === 'string' ? input.input.slice(0, MAX_INPUT_LENGTH) : '';
    if (!testInput) {
      throw new ApiError(400, 'input is required');
    }
    const expectedOutput = typeof input.expectedOutput === 'string' ? input.expectedOutput.slice(0, MAX_OUTPUT_LENGTH) : '';
    if (!expectedOutput) {
      throw new ApiError(400, 'expectedOutput is required');
    }
    const weight = typeof input.weight === 'number' && Number.isFinite(input.weight) ? Math.min(Math.max(input.weight, 0), 100) : 1;
    const explanation = input.explanation ? input.explanation.toString().trim().slice(0, MAX_EXPLANATION_LENGTH) : undefined;

    return { type: input.type, input: testInput, expectedOutput, weight, explanation };
  }

  private async findQuestion(organization: IOrganization, codingQuestionId: string): Promise<IEmployerCodingQuestion> {
    const question = await EmployerCodingQuestion.findOne({ _id: codingQuestionId, organizationId: organization._id });
    if (!question) {
      throw new ApiError(404, 'Coding question not found');
    }
    return question;
  }

  private async findTestCase(organization: IOrganization, question: IEmployerCodingQuestion, testCaseId: string): Promise<IEmployerCodingTestCase> {
    const testCase = await EmployerCodingTestCase.findOne({ _id: testCaseId, organizationId: organization._id, codingQuestionId: question._id });
    if (!testCase) {
      throw new ApiError(404, 'Test case not found');
    }
    return testCase;
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

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(400, 'This organization is archived and read-only');
    }
  }

  private toDetail(doc: IEmployerCodingTestCase): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      codingQuestionId: doc.codingQuestionId.toString(),
      type: doc.type,
      input: doc.input,
      expectedOutput: doc.expectedOutput,
      weight: doc.weight,
      explanation: doc.explanation,
      order: doc.order,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerCodingTestCaseService = new EmployerCodingTestCaseService();
export default employerCodingTestCaseService;
