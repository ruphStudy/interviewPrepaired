import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ATS/external entity ID mapping (31E) — links ONE internal hiring entity
 * to its counterpart in an external system for exactly one connection.
 * `internalEntityId` is always re-validated by the caller to belong to the
 * SAME organization before a mapping is created/used; `externalEntityId`
 * is NEVER treated as authoritative on its own (never a cross-org lookup
 * key by itself).
 */
export type EmployerIntegrationEntityType = 'job' | 'candidate' | 'application' | 'interview';

export interface IEmployerIntegrationEntityMapping extends Document {
  organizationId: Types.ObjectId;
  connectionId: Types.ObjectId;
  entityType: EmployerIntegrationEntityType;
  internalEntityId: Types.ObjectId;
  externalEntityId: string;
  mappingVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const employerIntegrationEntityMappingSchema = new Schema<IEmployerIntegrationEntityMapping>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    connectionId: { type: Schema.Types.ObjectId, ref: 'EmployerIntegrationConnection', required: true },
    entityType: { type: String, enum: ['job', 'candidate', 'application', 'interview'], required: true },
    internalEntityId: { type: Schema.Types.ObjectId, required: true },
    externalEntityId: { type: String, required: true, trim: true, maxlength: [200, 'externalEntityId cannot exceed 200 characters'] },
    mappingVersion: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_integration_entity_mappings',
  }
);

employerIntegrationEntityMappingSchema.index({ connectionId: 1, entityType: 1, internalEntityId: 1 }, { unique: true });
employerIntegrationEntityMappingSchema.index({ organizationId: 1, connectionId: 1 });

export default mongoose.model<IEmployerIntegrationEntityMapping>(
  'EmployerIntegrationEntityMapping',
  employerIntegrationEntityMappingSchema
);
