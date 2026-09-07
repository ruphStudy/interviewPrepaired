import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Organization-scoped, provider-neutral external integration connection
 * (31D) — webhook/ATS/calendar. NEVER returns `secretConfigEncrypted`
 * through any API response; a webhook signing secret is shown to the
 * employer in PLAINTEXT exactly once, at creation, and never again. Only
 * `generic` webhook is genuinely functional in v1 — every other provider
 * value exists so the UI/schema can distinguish "configured but not yet
 * implemented" from "unsupported", never to fake connectivity.
 */
export type EmployerIntegrationType = 'webhook' | 'ats' | 'calendar';
export type EmployerIntegrationProvider =
  | 'generic'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'google_calendar'
  | 'microsoft_calendar'
  | 'custom';
export type EmployerIntegrationConnectionStatus = 'active' | 'disabled' | 'error';

export interface IEmployerIntegrationConnectionConfig {
  baseUrl?: string;
  externalAccountId?: string;
  calendarId?: string;
  /** Webhook-specific — which 31E event types this connection should receive. Additive to the spec's base `config` shape; empty means "all supported events". */
  enabledEventTypes?: string[];
}

export interface IEmployerIntegrationConnection extends Document {
  organizationId: Types.ObjectId;
  type: EmployerIntegrationType;
  provider: EmployerIntegrationProvider;
  name: string;
  status: EmployerIntegrationConnectionStatus;
  config: IEmployerIntegrationConnectionConfig;
  /** AES-256-GCM ciphertext (see utils/integrationSecretEncryption.ts) — NEVER serialized to any API response. */
  secretConfigEncrypted?: string;
  connectionVersion: string;
  createdByMembershipId: Types.ObjectId;
  updatedByMembershipId?: Types.ObjectId;
  lastValidatedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const configSchema = new Schema<IEmployerIntegrationConnectionConfig>(
  {
    baseUrl: { type: String, trim: true, maxlength: [2048, 'baseUrl cannot exceed 2048 characters'] },
    externalAccountId: { type: String, trim: true, maxlength: [200, 'externalAccountId cannot exceed 200 characters'] },
    calendarId: { type: String, trim: true, maxlength: [200, 'calendarId cannot exceed 200 characters'] },
    enabledEventTypes: { type: [String], default: undefined },
  },
  { _id: false }
);

const employerIntegrationConnectionSchema = new Schema<IEmployerIntegrationConnection>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: { type: String, enum: ['webhook', 'ats', 'calendar'], required: true },
    provider: {
      type: String,
      enum: ['generic', 'greenhouse', 'lever', 'workday', 'google_calendar', 'microsoft_calendar', 'custom'],
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: [200, 'name cannot exceed 200 characters'] },
    status: { type: String, enum: ['active', 'disabled', 'error'], required: true, default: 'active' },
    config: { type: configSchema, required: true, default: () => ({}) },
    secretConfigEncrypted: { type: String, select: false },
    connectionVersion: { type: String, required: true },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    updatedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
    lastValidatedAt: { type: Date },
    lastError: { type: String, trim: true, maxlength: [500, 'lastError cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_integration_connections',
  }
);

employerIntegrationConnectionSchema.index({ organizationId: 1, type: 1 });
employerIntegrationConnectionSchema.index({ organizationId: 1, provider: 1 });

export default mongoose.model<IEmployerIntegrationConnection>('EmployerIntegrationConnection', employerIntegrationConnectionSchema);
