import { Schema } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Memory Item - A single fact extracted from candidate's answer
 */
export interface IMemoryItem {
  category: 'claim' | 'achievement' | 'experience' | 'number' | 'project' | 'leadership' | 'certification' | 'contradiction';
  content: string;
  context?: string; // Which question this came from
  questionNumber?: number;
  timestamp: Date;
  confidence?: number; // How confident AI is about this fact (0-1)
}

/**
 * Interview Memory - Accumulated knowledge about the candidate
 */
export interface IInterviewMemory {
  // Categorized facts
  claims: string[]; // General claims made by candidate
  achievements: string[]; // Specific accomplishments
  experienceDetails: string[]; // Work experience, roles, responsibilities
  numbers: string[]; // Quantifiable data (team size, revenue, duration, etc.)
  projects: string[]; // Projects mentioned
  leadershipExamples: string[]; // Leadership situations and behaviors
  certifications: string[]; // Certifications, degrees, qualifications
  contradictions: string[]; // Conflicting statements or inconsistencies
  
  // All items with full context
  allItems: IMemoryItem[];
  
  // Metadata
  lastUpdated: Date;
  totalFacts: number;
}

// ============================================================================
// Memory Item Schema
// ============================================================================

const memoryItemSchema = new Schema<IMemoryItem>(
  {
    category: {
      type: String,
      required: true,
      enum: ['claim', 'achievement', 'experience', 'number', 'project', 'leadership', 'certification', 'contradiction'],
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    context: {
      type: String,
      trim: true,
    },
    questionNumber: {
      type: Number,
      min: 1,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.8,
    },
  },
  { _id: false }
);

// ============================================================================
// Interview Memory Schema
// ============================================================================

const interviewMemorySchema = new Schema<IInterviewMemory>(
  {
    claims: {
      type: [String],
      default: [],
    },
    achievements: {
      type: [String],
      default: [],
    },
    experienceDetails: {
      type: [String],
      default: [],
    },
    numbers: {
      type: [String],
      default: [],
    },
    projects: {
      type: [String],
      default: [],
    },
    leadershipExamples: {
      type: [String],
      default: [],
    },
    certifications: {
      type: [String],
      default: [],
    },
    contradictions: {
      type: [String],
      default: [],
    },
    allItems: {
      type: [memoryItemSchema],
      default: [],
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    totalFacts: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

// ============================================================================
// Export Schema (not a standalone model, embedded in Interview)
// ============================================================================

export { memoryItemSchema, interviewMemorySchema };

/**
 * Helper function to create empty interview memory
 */
export function createEmptyMemory(): IInterviewMemory {
  return {
    claims: [],
    achievements: [],
    experienceDetails: [],
    numbers: [],
    projects: [],
    leadershipExamples: [],
    certifications: [],
    contradictions: [],
    allItems: [],
    lastUpdated: new Date(),
    totalFacts: 0,
  };
}

/**
 * Helper function to format memory for AI context
 */
export function formatMemoryForAI(memory: IInterviewMemory): string {
  if (!memory || memory.totalFacts === 0) {
    return 'No previous information gathered yet.';
  }

  const sections: string[] = [];

  if (memory.experienceDetails.length > 0) {
    sections.push(`EXPERIENCE:\n${memory.experienceDetails.map(e => `- ${e}`).join('\n')}`);
  }

  if (memory.numbers.length > 0) {
    sections.push(`QUANTIFIABLE FACTS:\n${memory.numbers.map(n => `- ${n}`).join('\n')}`);
  }

  if (memory.achievements.length > 0) {
    sections.push(`ACHIEVEMENTS:\n${memory.achievements.map(a => `- ${a}`).join('\n')}`);
  }

  if (memory.projects.length > 0) {
    sections.push(`PROJECTS:\n${memory.projects.map(p => `- ${p}`).join('\n')}`);
  }

  if (memory.leadershipExamples.length > 0) {
    sections.push(`LEADERSHIP:\n${memory.leadershipExamples.map(l => `- ${l}`).join('\n')}`);
  }

  if (memory.certifications.length > 0) {
    sections.push(`CERTIFICATIONS/QUALIFICATIONS:\n${memory.certifications.map(c => `- ${c}`).join('\n')}`);
  }

  if (memory.claims.length > 0) {
    sections.push(`OTHER CLAIMS:\n${memory.claims.map(c => `- ${c}`).join('\n')}`);
  }

  if (memory.contradictions.length > 0) {
    sections.push(`⚠️ CONTRADICTIONS DETECTED:\n${memory.contradictions.map(c => `- ${c}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Helper function to get memory summary statistics
 */
export function getMemoryStats(memory: IInterviewMemory): {
  totalFacts: number;
  categories: Record<string, number>;
  hasContradictions: boolean;
} {
  return {
    totalFacts: memory.totalFacts,
    categories: {
      claims: memory.claims.length,
      achievements: memory.achievements.length,
      experience: memory.experienceDetails.length,
      numbers: memory.numbers.length,
      projects: memory.projects.length,
      leadership: memory.leadershipExamples.length,
      certifications: memory.certifications.length,
      contradictions: memory.contradictions.length,
    },
    hasContradictions: memory.contradictions.length > 0,
  };
}
