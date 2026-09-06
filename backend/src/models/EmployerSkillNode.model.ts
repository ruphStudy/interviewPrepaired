import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A deterministically normalized skill/competency node shared across one
 * organization's hiring artifacts (25A) — no AI, no fuzzy matching, no
 * synonym generation. `normalizedKey` is computed via
 * `EmployerSkillGraphService`'s pure `normalizeSkillKey()` (trim, lowercase,
 * collapse separators/whitespace) — the SAME deterministic function every
 * time, never re-derived ad hoc elsewhere. `canonicalName` is set ONCE,
 * from the first trusted structured name that created this node, and is
 * never renamed on subsequent rebuilds; later exact-string variants are
 * appended to `aliases` (deduped, capped) instead.
 */
export interface IEmployerSkillNode extends Document {
  organizationId: Types.ObjectId;
  canonicalName: string;
  normalizedKey: string;
  aliases: string[];
  createdAt: Date;
  updatedAt: Date;
}

const employerSkillNodeSchema = new Schema<IEmployerSkillNode>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    canonicalName: { type: String, required: true, trim: true, maxlength: [200, 'canonicalName cannot exceed 200 characters'] },
    normalizedKey: { type: String, required: true, trim: true, maxlength: [200, 'normalizedKey cannot exceed 200 characters'] },
    aliases: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: 'employer_skill_nodes',
  }
);

// One node per normalized skill key per organization, ever — also the
// upsert target for deterministic node resolution.
employerSkillNodeSchema.index({ organizationId: 1, normalizedKey: 1 }, { unique: true });

export default mongoose.model<IEmployerSkillNode>('EmployerSkillNode', employerSkillNodeSchema);
