import InterviewBlueprint, {
  IInterviewBlueprint,
  ICompetency,
} from '../models/InterviewBlueprint.model';
import { getAIService } from '../ai';
import { ApiError } from '../utils/ApiError';

/**
 * Blueprint Request Parameters
 */
export interface BlueprintRequest {
  topic: string;
  roleName?: string;
  industry?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  experienceLevel: 'student' | 'entry' | 'professional' | 'senior' | 'expert';
  interviewStyle: 'technical' | 'behavioral' | 'hr' | 'leadership' | 'situational' | 'general';
}

/**
 * Blueprint Generation Response from AI
 */
export interface BlueprintGenerationResponse {
  competencies: ICompetency[];
  evaluationRules: string;
  questionStrategy: string;
  reportStrategy: string;
}

/**
 * Blueprint Service
 * 
 * Handles blueprint generation, caching, retrieval, and validation
 */
export class BlueprintService {
  private aiService = getAIService();
  
  // Configuration
  private readonly BLUEPRINT_EXPIRY_DAYS = parseInt(
    process.env.BLUEPRINT_EXPIRY_DAYS || '180',
    10
  );
  private readonly MAX_GENERATION_RETRIES = 3;
  private readonly BLUEPRINT_VERSION = '1.0.0';

  /**
   * Get or create blueprint for interview
   * 
   * Flow:
   * 1. Generate hash from parameters
   * 2. Check if blueprint exists and is valid
   * 3. If yes, update lastUsedAt and return
   * 4. If no, generate new blueprint
   * 5. Validate blueprint
   * 6. Store and return
   */
  async getOrCreateBlueprint(params: BlueprintRequest): Promise<IInterviewBlueprint> {
    console.log('[BlueprintService] Getting or creating blueprint for:', {
      topic: params.topic,
      roleName: params.roleName,
      industry: params.industry,
      difficulty: params.difficulty,
      experienceLevel: params.experienceLevel,
      interviewStyle: params.interviewStyle,
    });

    // Generate unique hash for this configuration
    const blueprintHash = InterviewBlueprint.generateHash(params);
    console.log('[BlueprintService] Blueprint hash:', blueprintHash);

    // Check if blueprint exists and is valid
    const existingBlueprint = await InterviewBlueprint.findActiveByHash(blueprintHash);
    
    if (existingBlueprint) {
      console.log('[BlueprintService] Found existing blueprint:', existingBlueprint._id);
      
      // Update last used timestamp
      existingBlueprint.lastUsedAt = new Date();
      await existingBlueprint.save();
      
      return existingBlueprint;
    }

    console.log('[BlueprintService] No existing blueprint found, generating new one...');

    // Generate new blueprint
    const blueprint = await this.generateAndValidateBlueprint(params, blueprintHash);
    
    return blueprint;
  }

  /**
   * Generate new blueprint with validation and retry logic
   */
  private async generateAndValidateBlueprint(
    params: BlueprintRequest,
    blueprintHash: string
  ): Promise<IInterviewBlueprint> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_GENERATION_RETRIES; attempt++) {
      try {
        console.log(`[BlueprintService] Generation attempt ${attempt}/${this.MAX_GENERATION_RETRIES}`);

        // Generate blueprint using AI — deliberately no interviewId (blueprint
        // generation happens before an interview document exists).
        const blueprintResult = await this.aiService.generateInterviewBlueprint(params, {
          operation: 'blueprint-generation',
        });
        const generatedBlueprint = blueprintResult.data;

        // Validate blueprint
        this.validateBlueprint(generatedBlueprint);

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.BLUEPRINT_EXPIRY_DAYS);

        // Create and save blueprint
        const blueprint = new InterviewBlueprint({
          blueprintHash,
          version: this.BLUEPRINT_VERSION,
          topic: params.topic,
          roleName: params.roleName,
          industry: params.industry,
          difficulty: params.difficulty,
          experienceLevel: params.experienceLevel,
          interviewStyle: params.interviewStyle,
          competencies: generatedBlueprint.competencies,
          evaluationRules: generatedBlueprint.evaluationRules,
          questionStrategy: generatedBlueprint.questionStrategy,
          reportStrategy: generatedBlueprint.reportStrategy,
          usageCount: 0,
          averageScore: 0,
          successRate: 0,
          lastUsedAt: new Date(),
          expiresAt,
          isActive: true,
        });

        await blueprint.save();

        console.log('[BlueprintService] Blueprint created successfully:', blueprint._id);
        return blueprint;

      } catch (error) {
        lastError = error as Error;
        console.error(`[BlueprintService] Generation attempt ${attempt} failed:`, error);

        if (attempt < this.MAX_GENERATION_RETRIES) {
          // Wait before retrying (exponential backoff)
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`[BlueprintService] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    throw new ApiError(
      500,
      `Failed to generate blueprint after ${this.MAX_GENERATION_RETRIES} attempts: ${lastError?.message}`
    );
  }

  /**
   * Validate blueprint structure and rules
   */
  private validateBlueprint(blueprint: BlueprintGenerationResponse): void {
    const errors: string[] = [];

    // Check competencies exist
    if (!blueprint.competencies || !Array.isArray(blueprint.competencies)) {
      errors.push('Competencies must be an array');
    } else {
      // Check competency count
      if (blueprint.competencies.length < 4 || blueprint.competencies.length > 6) {
        errors.push(`Must have 4-6 competencies, got ${blueprint.competencies.length}`);
      }

      // Check competency structure
      blueprint.competencies.forEach((comp, index) => {
        if (!comp.name || typeof comp.name !== 'string') {
          errors.push(`Competency ${index}: name is required and must be a string`);
        }
        if (!comp.description || typeof comp.description !== 'string') {
          errors.push(`Competency ${index}: description is required and must be a string`);
        }
        if (typeof comp.weight !== 'number' || comp.weight < 1 || comp.weight > 100) {
          errors.push(`Competency ${index}: weight must be a number between 1 and 100`);
        }
      });

      // Check weights total exactly 100
      const totalWeight = blueprint.competencies.reduce((sum, comp) => sum + comp.weight, 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        errors.push(`Competency weights must total exactly 100, got ${totalWeight}`);
      }

      // Check for duplicate competency names
      const names = blueprint.competencies.map(c => c.name.toLowerCase());
      const uniqueNames = new Set(names);
      if (names.length !== uniqueNames.size) {
        errors.push('Competency names must be unique');
      }
    }

    // Check required fields
    if (!blueprint.evaluationRules || typeof blueprint.evaluationRules !== 'string') {
      errors.push('Evaluation rules are required and must be a string');
    }
    if (!blueprint.questionStrategy || typeof blueprint.questionStrategy !== 'string') {
      errors.push('Question strategy is required and must be a string');
    }
    if (!blueprint.reportStrategy || typeof blueprint.reportStrategy !== 'string') {
      errors.push('Report strategy is required and must be a string');
    }

    if (errors.length > 0) {
      throw new Error(`Blueprint validation failed: ${errors.join('; ')}`);
    }
  }

  /**
   * Get blueprint by ID
   */
  async getBlueprintById(blueprintId: string): Promise<IInterviewBlueprint> {
    const blueprint = await InterviewBlueprint.findById(blueprintId);
    
    if (!blueprint) {
      throw new ApiError(404, 'Blueprint not found');
    }

    return blueprint;
  }

  /**
   * Update blueprint usage statistics
   * Called after interview completion
   */
  async updateBlueprintStats(
    blueprintId: string,
    interviewScore: number,
    passed: boolean
  ): Promise<void> {
    try {
      await InterviewBlueprint.updateUsageStats(blueprintId, interviewScore, passed);
      console.log('[BlueprintService] Updated blueprint statistics:', blueprintId);
    } catch (error) {
      console.error('[BlueprintService] Failed to update blueprint stats:', error);
      // Don't throw - stats update failure shouldn't break the flow
    }
  }

  /**
   * Deactivate expired blueprints (cron job)
   */
  async deactivateExpiredBlueprints(): Promise<number> {
    const result = await InterviewBlueprint.updateMany(
      {
        isActive: true,
        expiresAt: { $lt: new Date() },
      },
      {
        $set: { isActive: false },
      }
    );

    console.log('[BlueprintService] Deactivated expired blueprints:', result.modifiedCount);
    return result.modifiedCount;
  }

  /**
   * Get blueprint statistics (for admin/analytics)
   */
  async getBlueprintStatistics(blueprintId: string): Promise<{
    usageCount: number;
    averageScore: number;
    successRate: number;
    lastUsedAt: Date;
    isExpired: boolean;
  }> {
    const blueprint = await this.getBlueprintById(blueprintId);

    return {
      usageCount: blueprint.usageCount,
      averageScore: blueprint.averageScore,
      successRate: blueprint.successRate,
      lastUsedAt: blueprint.lastUsedAt,
      isExpired: blueprint.isExpired(),
    };
  }

  /**
   * Search blueprints (for admin)
   */
  async searchBlueprints(filters: {
    topic?: string;
    industry?: string;
    difficulty?: string;
    isActive?: boolean;
    limit?: number;
  }): Promise<IInterviewBlueprint[]> {
    const query: any = {};

    if (filters.topic) {
      query.topic = new RegExp(filters.topic, 'i');
    }
    if (filters.industry) {
      query.industry = new RegExp(filters.industry, 'i');
    }
    if (filters.difficulty) {
      query.difficulty = filters.difficulty;
    }
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    return InterviewBlueprint.find(query)
      .limit(filters.limit || 50)
      .sort({ createdAt: -1 });
  }
}

export const blueprintService = new BlueprintService();
