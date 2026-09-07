import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerIntegrationConnection, {
  IEmployerIntegrationConnection,
  EmployerIntegrationType,
  EmployerIntegrationProvider,
  IEmployerIntegrationConnectionConfig,
} from '../models/EmployerIntegrationConnection.model';
import EmployerIntegrationEntityMapping from '../models/EmployerIntegrationEntityMapping.model';
import { encryptSecret, generateWebhookSigningSecret } from '../utils/integrationSecretEncryption';
import { assertSafeOutboundUrl } from '../utils/ssrfSafeUrl';
import { getATSProvider } from '../integrations/EmployerATSProvider';
import { getCalendarProvider } from '../integrations/CalendarProvider';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CONNECTION_VERSION = 'employer-integration-v1';
const TYPES: EmployerIntegrationType[] = ['webhook', 'ats', 'calendar'];
const PROVIDERS: EmployerIntegrationProvider[] = [
  'generic',
  'greenhouse',
  'lever',
  'workday',
  'google_calendar',
  'microsoft_calendar',
  'custom',
];
const MAX_EVENT_TYPES = 20;

export interface IntegrationConnectionInput {
  type: EmployerIntegrationType;
  provider: EmployerIntegrationProvider;
  name: string;
  config?: { baseUrl?: string; externalAccountId?: string; calendarId?: string; enabledEventTypes?: string[] };
  /** Only meaningful for a `webhook`/`generic` (or `ats`/`custom`) connection — a NEW signing secret is generated server-side; the caller may never set the secret value itself. */
  regenerateSecret?: boolean;
}

/**
 * Organization-scoped, provider-neutral integration connection CRUD (31D)
 * — company organizations only, exact tenant scoping on every query. A
 * webhook signing secret is returned in PLAINTEXT to the caller ONLY on
 * the exact call that generates/regenerates it — never persisted in
 * plaintext, never included in any other response.
 */
export class EmployerIntegrationConnectionService {
  /** POST .../integrations — requires ORGANIZATION_UPDATE. */
  async createConnection(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    input: IntegrationConnectionInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const normalized = await this.validateInput(input);
    const generatesSecret = this.isWebhookCapable(input.type, input.provider) && Boolean(normalized.config.baseUrl);

    let plaintextSecret: string | undefined;
    let secretConfigEncrypted: string | undefined;
    if (generatesSecret) {
      plaintextSecret = generateWebhookSigningSecret();
      secretConfigEncrypted = encryptSecret(plaintextSecret);
    }

    const doc = await EmployerIntegrationConnection.create({
      organizationId: organization._id,
      type: input.type,
      provider: input.provider,
      name: normalized.name,
      status: 'active',
      config: normalized.config,
      secretConfigEncrypted,
      connectionVersion: CONNECTION_VERSION,
      createdByMembershipId: membershipId,
    });

    const detail = await this.toDetail(doc);
    return plaintextSecret ? { ...detail, signingSecret: plaintextSecret } : detail;
  }

  /** GET .../integrations — requires ORGANIZATION_VIEW. */
  async listConnections(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const connections = await EmployerIntegrationConnection.find({ organizationId: organization._id }).sort({ createdAt: -1 });
    return { connections: await Promise.all(connections.map((c) => this.toDetail(c))) };
  }

  /** GET .../integrations/:connectionId — requires ORGANIZATION_VIEW. */
  async getConnection(organizationId: string, actingRole: OrganizationMemberRole, connectionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const connection = await this.findConnection(organization, connectionId);
    return this.toDetail(connection);
  }

  /** PATCH .../integrations/:connectionId — requires ORGANIZATION_UPDATE. */
  async updateConnection(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    connectionId: string,
    input: Partial<IntegrationConnectionInput>
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const connection = await this.findConnection(organization, connectionId);

    const merged: IntegrationConnectionInput = {
      type: connection.type,
      provider: connection.provider,
      name: input.name ?? connection.name,
      config: input.config ?? connection.config,
    };
    const normalized = await this.validateInput(merged);

    connection.name = normalized.name;
    connection.config = normalized.config;
    connection.updatedByMembershipId = new Types.ObjectId(membershipId);

    let plaintextSecret: string | undefined;
    if (input.regenerateSecret && this.isWebhookCapable(connection.type, connection.provider) && normalized.config.baseUrl) {
      plaintextSecret = generateWebhookSigningSecret();
      connection.secretConfigEncrypted = encryptSecret(plaintextSecret);
    }

    await connection.save();
    const detail = await this.toDetail(connection);
    return plaintextSecret ? { ...detail, signingSecret: plaintextSecret } : detail;
  }

  /** POST .../integrations/:connectionId/disable — requires ORGANIZATION_UPDATE. */
  async disableConnection(organizationId: string, actingRole: OrganizationMemberRole, connectionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const connection = await this.findConnection(organization, connectionId);
    connection.status = 'disabled';
    await connection.save();
    return this.toDetail(connection);
  }

  /**
   * POST .../integrations/:connectionId/validate — requires
   * ORGANIZATION_UPDATE. Never fakes connectivity — delegates to the exact
   * provider adapter, which honestly reports `not_configured` /
   * `provider_not_implemented` for everything not genuinely supported yet.
   */
  async validateConnection(organizationId: string, actingRole: OrganizationMemberRole, connectionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const connection = await this.findConnection(organization, connectionId);

    let available = false;
    let reason: string | undefined;
    if (connection.type === 'webhook' && connection.provider === 'generic') {
      if (!connection.config.baseUrl) {
        reason = 'not_configured';
      } else {
        try {
          await assertSafeOutboundUrl(connection.config.baseUrl);
          available = true;
          reason = 'ok';
        } catch (error) {
          reason = error instanceof ApiError ? error.message : 'Invalid endpoint URL';
        }
      }
    } else if (connection.type === 'ats') {
      const result = await getATSProvider(connection.provider).validateConnection(connection);
      available = result.available;
      reason = result.reason;
    } else if (connection.type === 'calendar') {
      const result = await getCalendarProvider(connection.provider).validateConnection(connection);
      available = result.synced;
      reason = result.reason;
    }

    connection.lastValidatedAt = new Date();
    connection.status = available ? 'active' : connection.status === 'disabled' ? 'disabled' : 'error';
    connection.lastError = available ? undefined : reason;
    await connection.save();

    return { available, reason, ...(await this.toDetail(connection)) };
  }

  private isWebhookCapable(type: EmployerIntegrationType, provider: EmployerIntegrationProvider): boolean {
    return (type === 'webhook' && provider === 'generic') || (type === 'ats' && provider === 'custom');
  }

  private async validateInput(input: IntegrationConnectionInput): Promise<{ name: string; config: IEmployerIntegrationConnectionConfig }> {
    if (!TYPES.includes(input.type)) {
      throw new ApiError(400, 'Invalid integration type');
    }
    if (!PROVIDERS.includes(input.provider)) {
      throw new ApiError(400, 'Invalid integration provider');
    }
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }

    const config: IEmployerIntegrationConnectionConfig = {};
    if (this.isWebhookCapable(input.type, input.provider)) {
      const baseUrl = input.config?.baseUrl?.trim();
      if (baseUrl) {
        await assertSafeOutboundUrl(baseUrl);
        config.baseUrl = baseUrl.slice(0, 2048);
      }
      const enabledEventTypes = Array.isArray(input.config?.enabledEventTypes)
        ? Array.from(new Set(input.config!.enabledEventTypes!.filter((v) => typeof v === 'string'))).slice(0, MAX_EVENT_TYPES)
        : undefined;
      if (enabledEventTypes && enabledEventTypes.length > 0) {
        config.enabledEventTypes = enabledEventTypes;
      }
    } else {
      if (input.config?.baseUrl) {
        config.baseUrl = input.config.baseUrl.trim().slice(0, 2048);
      }
      if (input.config?.externalAccountId) {
        config.externalAccountId = input.config.externalAccountId.trim().slice(0, 200);
      }
      if (input.config?.calendarId) {
        config.calendarId = input.config.calendarId.trim().slice(0, 200);
      }
    }

    return { name: name.slice(0, 200), config };
  }

  private async findConnection(organization: IOrganization, connectionId: string): Promise<IEmployerIntegrationConnection> {
    const connection = await EmployerIntegrationConnection.findOne({ _id: connectionId, organizationId: organization._id }).select(
      '+secretConfigEncrypted'
    );
    if (!connection) {
      throw new ApiError(404, 'Integration connection not found');
    }
    return connection;
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

  /** NEVER includes `secretConfigEncrypted` or any plaintext secret. */
  private async toDetail(connection: IEmployerIntegrationConnection): Promise<Record<string, unknown>> {
    const mappingCount = connection.type === 'ats' ? await EmployerIntegrationEntityMapping.countDocuments({ connectionId: connection._id }) : undefined;
    return {
      id: connection._id.toString(),
      type: connection.type,
      provider: connection.provider,
      name: connection.name,
      status: connection.status,
      config: {
        baseUrl: connection.config.baseUrl,
        externalAccountId: connection.config.externalAccountId,
        calendarId: connection.config.calendarId,
        enabledEventTypes: connection.config.enabledEventTypes,
      },
      hasSigningSecret: Boolean(connection.secretConfigEncrypted),
      connectionVersion: connection.connectionVersion,
      lastValidatedAt: connection.lastValidatedAt,
      lastError: connection.lastError,
      mappingCount,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}

export const employerIntegrationConnectionService = new EmployerIntegrationConnectionService();
export default employerIntegrationConnectionService;
