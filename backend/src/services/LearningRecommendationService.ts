import { IInterview } from '../models/interview.model';
import { getOpenAIService } from './OpenAIService';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface LearningRecommendation {
  competency: string;
  currentScore: number; // Current performance level (0-10)
  targetScore: number; // Desired level (typically 7-8)
  gap: number; // Difference
  priority: Priority;
  
  learningPath: LearningPathItem[];
  estimatedStudyHours: number;
  weeklyStudyPlan: string[];
  
  resources: Resource[];
  practiceTopics: string[];
}

export interface LearningPathItem {
  step: number;
  title: string;
  description: string;
  estimatedHours: number;
  resources: string[];
}

export interface Resource {
  type: 'course' | 'book' | 'article' | 'video' | 'practice';
  title: string;
  description: string;
  url?: string;
  estimatedHours?: number;
}

export interface PersonalizedImprovementPlan {
  recommendations: LearningRecommendation[];
  totalStudyHours: number;
  estimatedTimeToReady: string; // "4-6 weeks"
  nextInterviewTopics: string[];
  weeklySchedule: WeeklySchedule;
}

export interface WeeklySchedule {
  week1: string[];
  week2: string[];
  week3: string[];
  week4: string[];
}

// ============================================================================
// Learning Recommendation Service
// ============================================================================

class LearningRecommendationService {
  /**
   * Generate personalized learning recommendations
   */
  async generateRecommendations(interview: IInterview): Promise<PersonalizedImprovementPlan | null> {
    if (!interview.finalReport) return null;
    
    try {
      // Identify weak competencies
      const weakCompetencies = this.identifyWeakCompetencies(interview);
      
      if (weakCompetencies.length === 0) {
        console.log('[LearningReco] No weak competencies - candidate is performing well!');
        return this.generateMaintenancePlan(interview);
      }
      
      // Generate recommendations for each weak competency
      const recommendations: LearningRecommendation[] = [];
      
      for (const comp of weakCompetencies) {
        const recommendation = await this.generateCompetencyRecommendation(comp, interview);
        recommendations.push(recommendation);
      }
      
      // Sort by priority
      recommendations.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
      
      // Calculate totals
      const totalStudyHours = recommendations.reduce((sum, r) => sum + r.estimatedStudyHours, 0);
      const estimatedTimeToReady = this.estimateTimeToReady(totalStudyHours);
      
      // Generate next interview topics
      const nextInterviewTopics = this.suggestNextInterviewTopics(interview, recommendations);
      
      // Create weekly schedule
      const weeklySchedule = this.createWeeklySchedule(recommendations);
      
      console.log(`[LearningReco] Generated ${recommendations.length} recommendations, ${totalStudyHours}h total`);
      
      return {
        recommendations,
        totalStudyHours,
        estimatedTimeToReady,
        nextInterviewTopics,
        weeklySchedule,
      };
      
    } catch (error) {
      console.error('[LearningReco] Failed to generate recommendations:', error);
      return null;
    }
  }
  
  /**
   * Identify weak competencies from interview
   */
  private identifyWeakCompetencies(interview: IInterview): Array<{ name: string; score: number }> {
    const weak: Array<{ name: string; score: number }> = [];
    
    // From evaluation dimensions
    interview.questions.forEach(q => {
      q.evaluation?.dimensions?.forEach(d => {
        if (d.score < 6) {
          const existing = weak.find(w => w.name === d.name);
          if (existing) {
            existing.score = (existing.score + d.score) / 2;
          } else {
            weak.push({ name: d.name, score: d.score });
          }
        }
      });
    });
    
    // From competency coverage
    if (interview.competencyCoverage) {
      interview.competencyCoverage.items.forEach(item => {
        if (item.coveragePercentage < 60) {
          const existing = weak.find(w => w.name === item.competencyName);
          if (!existing) {
            weak.push({ name: item.competencyName, score: item.coveragePercentage / 10 });
          }
        }
      });
    }
    
    return weak.sort((a, b) => a.score - b.score).slice(0, 5); // Top 5 weakest
  }
  
  /**
   * Generate recommendation for a single competency
   */
  private async generateCompetencyRecommendation(
    competency: { name: string; score: number },
    interview: IInterview
  ): Promise<LearningRecommendation> {
    const gap = 8 - competency.score; // Target: 8/10
    const priority = this.determinePriority(competency.score);
    
    // Call AI to generate learning path
    const aiRecommendation = await this.generateAILearningPath({
      competency: competency.name,
      currentScore: competency.score,
      topic: interview.topic,
      difficulty: interview.difficulty,
    });
    
    return {
      competency: competency.name,
      currentScore: Math.round(competency.score * 10) / 10,
      targetScore: 8,
      gap: Math.round(gap * 10) / 10,
      priority,
      learningPath: aiRecommendation.learningPath,
      estimatedStudyHours: aiRecommendation.estimatedStudyHours,
      weeklyStudyPlan: aiRecommendation.weeklyStudyPlan,
      resources: aiRecommendation.resources,
      practiceTopics: aiRecommendation.practiceTopics,
    };
  }
  
  /**
   * Call AI to generate learning path
   */
  private async generateAILearningPath(params: {
    competency: string;
    currentScore: number;
    topic: string;
    difficulty: string;
  }): Promise<{
    learningPath: LearningPathItem[];
    estimatedStudyHours: number;
    weeklyStudyPlan: string[];
    resources: Resource[];
    practiceTopics: string[];
  }> {
    const { competency, currentScore, topic, difficulty } = params;
    
    const systemPrompt = `You are an expert career coach and learning advisor.

TASK: Create a personalized learning path to improve ${competency} for ${topic} interviews.

CURRENT LEVEL: ${currentScore}/10
TARGET LEVEL: 8/10
DIFFICULTY: ${difficulty}

OUTPUT FORMAT (JSON):
{
  "learningPath": [
    {
      "step": 1,
      "title": "Understand Fundamentals",
      "description": "Brief description",
      "estimatedHours": 5,
      "resources": ["Resource 1", "Resource 2"]
    }
  ],
  "estimatedStudyHours": 20,
  "weeklyStudyPlan": [
    "Week 1: Focus on fundamentals",
    "Week 2: Practice basic scenarios"
  ],
  "resources": [
    {
      "type": "course",
      "title": "Course name",
      "description": "What you'll learn",
      "estimatedHours": 10
    }
  ],
  "practiceTopics": [
    "Topic 1 to practice",
    "Topic 2 to practice"
  ]
}`;

    const userPrompt = `Generate a learning path to improve ${competency} from ${currentScore}/10 to 8/10 for ${topic} ${difficulty} interviews.`;

    try {
      const openAIService = getOpenAIService();
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await openAIService.callOpenAI(prompt, 0.7, 1500);
      
      return this.validateAILearningPath(response);
      
    } catch (error) {
      console.error('[LearningReco] AI generation failed:', error);
      return this.getDefaultLearningPath(competency);
    }
  }
  
  /**
   * Validate AI response
   */
  private validateAILearningPath(data: any): {
    learningPath: LearningPathItem[];
    estimatedStudyHours: number;
    weeklyStudyPlan: string[];
    resources: Resource[];
    practiceTopics: string[];
  } {
    return {
      learningPath: Array.isArray(data.learningPath) ? data.learningPath : [],
      estimatedStudyHours: typeof data.estimatedStudyHours === 'number' ? data.estimatedStudyHours : 20,
      weeklyStudyPlan: Array.isArray(data.weeklyStudyPlan) ? data.weeklyStudyPlan : [],
      resources: Array.isArray(data.resources) ? data.resources : [],
      practiceTopics: Array.isArray(data.practiceTopics) ? data.practiceTopics : [],
    };
  }
  
  /**
   * Get default learning path
   */
  private getDefaultLearningPath(competency: string): {
    learningPath: LearningPathItem[];
    estimatedStudyHours: number;
    weeklyStudyPlan: string[];
    resources: Resource[];
    practiceTopics: string[];
  } {
    return {
      learningPath: [
        {
          step: 1,
          title: `Study ${competency} fundamentals`,
          description: `Review core concepts and best practices`,
          estimatedHours: 10,
          resources: ['Online courses', 'Documentation', 'Books'],
        },
        {
          step: 2,
          title: `Practice ${competency} scenarios`,
          description: `Work through practice problems and examples`,
          estimatedHours: 10,
          resources: ['Practice platforms', 'Mock interviews'],
        },
      ],
      estimatedStudyHours: 20,
      weeklyStudyPlan: [
        'Week 1-2: Study fundamentals',
        'Week 3-4: Practice scenarios',
      ],
      resources: [],
      practiceTopics: [`${competency} basics`, `${competency} advanced topics`],
    };
  }
  
  /**
   * Determine priority
   */
  private determinePriority(score: number): Priority {
    if (score < 3) return 'critical';
    if (score < 5) return 'high';
    if (score < 6) return 'medium';
    return 'low';
  }
  
  /**
   * Estimate time to ready
   */
  private estimateTimeToReady(totalHours: number): string {
    // Assume 5-10 hours study per week
    const weeksAtFivePurHours = Math.ceil(totalHours / 5);
    const weeksAtTenPerHour = Math.ceil(totalHours / 10);
    
    return `${weeksAtTenPerHour}-${weeksAtFivePurHours} weeks`;
  }
  
  /**
   * Suggest next interview topics
   */
  private suggestNextInterviewTopics(
    interview: IInterview,
    recommendations: LearningRecommendation[]
  ): string[] {
    const topics = [
      `Practice ${interview.topic} at ${interview.difficulty} level`,
    ];
    
    recommendations.slice(0, 3).forEach(r => {
      topics.push(`Focus on ${r.competency} specifically`);
    });
    
    topics.push(`Try a mock interview with a peer or mentor`);
    
    return topics;
  }
  
  /**
   * Create weekly schedule
   */
  private createWeeklySchedule(recommendations: LearningRecommendation[]): WeeklySchedule {
    const schedule: WeeklySchedule = {
      week1: [],
      week2: [],
      week3: [],
      week4: [],
    };
    
    // Distribute recommendations across weeks
    recommendations.forEach((rec, index) => {
      const weekKey = `week${(index % 4) + 1}` as keyof WeeklySchedule;
      schedule[weekKey].push(`Study ${rec.competency} (${Math.ceil(rec.estimatedStudyHours / 4)}h)`);
    });
    
    return schedule;
  }
  
  /**
   * Generate maintenance plan (for strong performers)
   */
  private generateMaintenancePlan(interview: IInterview): PersonalizedImprovementPlan {
    return {
      recommendations: [],
      totalStudyHours: 5,
      estimatedTimeToReady: 'Already ready!',
      nextInterviewTopics: [
        `Maintain skills with weekly ${interview.topic} practice`,
        'Challenge yourself with harder difficulty levels',
        'Mentor others to reinforce your knowledge',
      ],
      weeklySchedule: {
        week1: ['Light review - 1-2 hours'],
        week2: ['Practice advanced scenarios'],
        week3: ['Peer mock interview'],
        week4: ['Stay current with industry trends'],
      },
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const learningRecommendationService = new LearningRecommendationService();
export default learningRecommendationService;
