import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Competency definition for a specific role/profession
 */
export interface ICompetency {
  name: string;
  description: string;
  weight: number; // Must total 100 across all competencies
}

/**
 * Competency score for evaluation results
 */
export interface ICompetencyScore {
  name: string;
  score: number; // 0-10
  feedback?: string;
}

/**
 * Interview Blueprint - AI-generated evaluation framework
 * Generated once per unique combination of:
 * topic + roleName + industry + difficulty + experienceLevel + interviewStyle
 */
export interface IInterviewBlueprint extends Document {
  // Blueprint Identity
  blueprintHash: string; // Unique hash of: topic+roleName+industry+difficulty+experienceLevel+interviewStyle
  version: string; // Blueprint version for tracking changes
  
  // Interview Configuration
  topic: string;
  roleName?: string; // e.g., "Senior Developer", "Sales Manager"
  industry?: string; // e.g., "Healthcare", "Finance", "Technology"
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  experienceLevel: 'student' | 'entry' | 'professional' | 'senior' | 'expert';
  interviewStyle: 'technical' | 'behavioral' | 'hr' | 'leadership' | 'situational' | 'general';
  
  // AI-Generated Content
  competencies: ICompetency[]; // 4-6 dynamic competencies
  evaluationRules: string; // How to evaluate this profession
  questionStrategy: string; // What questions to ask
  reportStrategy: string; // How to generate final report
  
  // Usage Tracking
  usageCount: number; // How many times this blueprint was used
  averageScore: number; // Average interview score using this blueprint
  successRate: number; // % of candidates who passed (for future ML optimization)
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date; // Blueprint expires after configured period (default: 180 days)
  isActive: boolean; // Can be deactivated without deletion
  
  // Instance Methods
  isExpired(): boolean;
  isValid(): boolean;
  extendExpiration(days: number): Promise<void>;
}

export interface IInterviewBlueprintModel extends Model<IInterviewBlueprint> {
  // Static methods
  findByHash(hash: string): Promise<IInterviewBlueprint | null>;
  findActiveByHash(hash: string): Promise<IInterviewBlueprint | null>;
  generateHash(params: {
    topic: string;
    roleName?: string;
    industry?: string;
    difficulty: string;
    experienceLevel: string;
    interviewStyle: string;
  }): string;
  updateUsageStats(
    blueprintId: string,
    interviewScore: number,
    passed: boolean
  ): Promise<void>;
}

// ============================================================================
// Mongoose Schemas
// ============================================================================

const competencySchema = new Schema<ICompetency>(
  {
    name: {
      type: String,
      required: [true, 'Competency name is required'],
      trim: true,
      minlength: [2, 'Competency name must be at least 2 characters'],
      maxlength: [100, 'Competency name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Competency description is required'],
      trim: true,
      minlength: [10, 'Competency description must be at least 10 characters'],
      maxlength: [500, 'Competency description cannot exceed 500 characters'],
    },
    weight: {
      type: Number,
      required: [true, 'Competency weight is required'],
      min: [1, 'Weight must be at least 1'],
      max: [100, 'Weight cannot exceed 100'],
    },
  },
  { _id: false }
);

const interviewBlueprintSchema = new Schema<IInterviewBlueprint>(
  {
    blueprintHash: {
      type: String,
      required: [true, 'Blueprint hash is required'],
      unique: true,
      index: true,
    },
    version: {
      type: String,
      required: [true, 'Blueprint version is required'],
      default: '1.0.0',
    },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      trim: true,
      index: true,
    },
    roleName: {
      type: String,
      trim: true,
      index: true,
    },
    industry: {
      type: String,
      trim: true,
      index: true,
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty is required'],
      enum: {
        values: ['beginner', 'intermediate', 'advanced', 'expert'],
        message: '{VALUE} is not a valid difficulty level',
      },
      index: true,
    },
    experienceLevel: {
      type: String,
      required: [true, 'Experience level is required'],
      enum: {
        values: ['student', 'entry', 'professional', 'senior', 'expert'],
        message: '{VALUE} is not a valid experience level',
      },
      index: true,
    },
    interviewStyle: {
      type: String,
      required: [true, 'Interview style is required'],
      enum: {
        values: ['technical', 'behavioral', 'hr', 'leadership', 'situational', 'general'],
        message: '{VALUE} is not a valid interview style',
      },
      index: true,
    },
    competencies: {
      type: [competencySchema],
      required: [true, 'Competencies are required'],
      validate: {
        validator: function (v: ICompetency[]) {
          if (v.length < 4 || v.length > 6) {
            return false;
          }
          // Validate weights total exactly 100
          const totalWeight = v.reduce((sum, comp) => sum + comp.weight, 0);
          return Math.abs(totalWeight - 100) < 0.01; // Allow floating point tolerance
        },
        message: 'Must have 4-6 competencies with weights totaling exactly 100',
      },
    },
    evaluationRules: {
      type: String,
      required: [true, 'Evaluation rules are required'],
      trim: true,
    },
    questionStrategy: {
      type: String,
      required: [true, 'Question strategy is required'],
      trim: true,
    },
    reportStrategy: {
      type: String,
      required: [true, 'Report strategy is required'],
      trim: true,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: [0, 'Usage count cannot be negative'],
    },
    averageScore: {
      type: Number,
      default: 0,
      min: [0, 'Average score cannot be negative'],
      max: [10, 'Average score cannot exceed 10'],
    },
    successRate: {
      type: Number,
      default: 0,
      min: [0, 'Success rate cannot be negative'],
      max: [100, 'Success rate cannot exceed 100'],
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'interviewBlueprints',
  }
);

// ============================================================================
// Indexes
// ============================================================================

// Compound index for efficient blueprint lookup
interviewBlueprintSchema.index({
  blueprintHash: 1,
  isActive: 1,
  expiresAt: 1,
});

// Index for cleanup of expired blueprints
interviewBlueprintSchema.index({ expiresAt: 1, isActive: 1 });

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Find blueprint by hash
 */
interviewBlueprintSchema.statics.findByHash = async function (
  hash: string
): Promise<IInterviewBlueprint | null> {
  return this.findOne({ blueprintHash: hash });
};

/**
 * Find active (non-expired) blueprint by hash
 */
interviewBlueprintSchema.statics.findActiveByHash = async function (
  hash: string
): Promise<IInterviewBlueprint | null> {
  return this.findOne({
    blueprintHash: hash,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });
};

/**
 * Generate deterministic hash for blueprint caching
 */
interviewBlueprintSchema.statics.generateHash = function (params: {
  topic: string;
  roleName?: string;
  industry?: string;
  difficulty: string;
  experienceLevel: string;
  interviewStyle: string;
}): string {
  const crypto = require('crypto');
  
  // Normalize values for consistent hashing
  const normalized = {
    topic: (params.topic || '').toLowerCase().trim(),
    roleName: (params.roleName || '').toLowerCase().trim(),
    industry: (params.industry || '').toLowerCase().trim(),
    difficulty: (params.difficulty || '').toLowerCase().trim(),
    experienceLevel: (params.experienceLevel || '').toLowerCase().trim(),
    interviewStyle: (params.interviewStyle || '').toLowerCase().trim(),
  };
  
  // Create consistent string representation
  const hashString = `${normalized.topic}|${normalized.roleName}|${normalized.industry}|${normalized.difficulty}|${normalized.experienceLevel}|${normalized.interviewStyle}`;
  
  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(hashString).digest('hex');
};

/**
 * Update usage statistics (for future ML optimization)
 */
interviewBlueprintSchema.statics.updateUsageStats = async function (
  blueprintId: string,
  interviewScore: number,
  passed: boolean
): Promise<void> {
  const blueprint = await this.findById(blueprintId);
  if (!blueprint) {
    throw new Error('Blueprint not found');
  }

  // Update usage count
  blueprint.usageCount += 1;
  
  // Update average score (incremental average)
  blueprint.averageScore =
    (blueprint.averageScore * (blueprint.usageCount - 1) + interviewScore) /
    blueprint.usageCount;
  
  // Update success rate
  const totalPassed = Math.round((blueprint.successRate * (blueprint.usageCount - 1)) / 100);
  blueprint.successRate = ((totalPassed + (passed ? 1 : 0)) / blueprint.usageCount) * 100;
  
  // Update last used timestamp
  blueprint.lastUsedAt = new Date();
  
  await blueprint.save();
};

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Check if blueprint is expired
 */
interviewBlueprintSchema.methods.isExpired = function (this: IInterviewBlueprint): boolean {
  return new Date() > this.expiresAt;
};

/**
 * Check if blueprint is valid for use
 */
interviewBlueprintSchema.methods.isValid = function (this: IInterviewBlueprint): boolean {
  return this.isActive && !this.isExpired();
};

/**
 * Extend blueprint expiration (when reused)
 */
interviewBlueprintSchema.methods.extendExpiration = async function (
  this: IInterviewBlueprint,
  days: number = 180
): Promise<IInterviewBlueprint> {
  const newExpiryDate = new Date();
  newExpiryDate.setDate(newExpiryDate.getDate() + days);
  this.expiresAt = newExpiryDate;
  return await this.save();
};

// ============================================================================
// Export Model
// ============================================================================

const InterviewBlueprint = mongoose.model<IInterviewBlueprint, IInterviewBlueprintModel>(
  'InterviewBlueprint',
  interviewBlueprintSchema
);

export default InterviewBlueprint;
