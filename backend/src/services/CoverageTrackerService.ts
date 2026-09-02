import { ICompetencyCoverage } from '../models/CompetencyCoverage.model';
import { ICompetency } from '../models/InterviewBlueprint.model';
import { getAIService } from '../ai';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface AnalyzeCoverageParams {
  question: string;
  answer: string;
  questionNumber: number;
  competencies: ICompetency[];
  currentCoverage: ICompetencyCoverage;
  interviewId?: string;
}

interface CoverageAnalysisResult {
  assessedCompetencies: {
    name: string;
    evidenceFound: string[]; // Evidence pieces found in answer
    coverageIncrease: number; // How much coverage increased (0-100)
  }[];
}

// ============================================================================
// Coverage Tracker Service
// ============================================================================

class CoverageTrackerService {
  /**
   * Analyze answer and update competency coverage
   */
  async updateCoverage(params: AnalyzeCoverageParams): Promise<ICompetencyCoverage> {
    const { question, answer, questionNumber, competencies, currentCoverage, interviewId } = params;

    try {
      // Call AI to analyze which competencies were demonstrated
      const analysis = await this.analyzeCompetencyDemonstration({
        question,
        answer,
        competencies,
        interviewId,
      });
      
      // Update coverage based on analysis
      const updatedCoverage = this.applyCoverageUpdates(
        currentCoverage,
        analysis,
        questionNumber
      );
      
      // Recalculate overall statistics
      this.recalculateStatistics(updatedCoverage);
      
      updatedCoverage.lastUpdated = new Date();
      
      return updatedCoverage;
      
    } catch (error) {
      console.error('[CoverageTracker] Failed to update coverage:', error);
      // Return current coverage unchanged on error
      return currentCoverage;
    }
  }
  
  /**
   * Call AI to analyze which competencies were demonstrated in the answer
   */
  private async analyzeCompetencyDemonstration(params: {
    question: string;
    answer: string;
    competencies: ICompetency[];
    interviewId?: string;
  }): Promise<CoverageAnalysisResult> {
    const { question, answer, competencies, interviewId } = params;
    
    const systemPrompt = `You are an expert interviewer analyzing candidate answers to track competency coverage.

COMPETENCIES:
${competencies.map(c => `- ${c.name}: ${c.description}`).join('\n')}

TASK:
Analyze the answer and identify which competencies were demonstrated.
For each competency demonstrated, extract specific evidence and estimate coverage increase.

RULES:
- Only include competencies that were actually demonstrated
- Evidence must be specific quotes or behaviors from the answer
- Coverage increase: 0-30% (small mention), 30-60% (moderate evidence), 60-100% (strong evidence)
- If no competencies demonstrated, return empty array

OUTPUT FORMAT (JSON):
{
  "assessedCompetencies": [
    {
      "name": "Leadership",
      "evidenceFound": ["Led team of 5", "Made final decision on architecture"],
      "coverageIncrease": 45
    }
  ]
}`;

    const userPrompt = `QUESTION:
${question}

ANSWER:
${answer}

Analyze which competencies were demonstrated and provide evidence.`;

    try {
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const aiResult = await getAIService().generateStructured<any>(
        { prompt, temperature: 0.3, maxTokens: 800 },
        { interviewId, operation: 'coverage-tracking' }
      );

      // NOTE: pre-existing double-JSON.parse on an already-parsed object —
      // unchanged/preserved as-is; not in scope for this migration.
      const result = JSON.parse(aiResult.data);
      return this.validateCoverageAnalysis(result);
      
    } catch (error) {
      console.error('[CoverageTracker] AI analysis failed:', error);
      return { assessedCompetencies: [] };
    }
  }
  
  /**
   * Validate AI response
   */
  private validateCoverageAnalysis(data: any): CoverageAnalysisResult {
    if (!data.assessedCompetencies || !Array.isArray(data.assessedCompetencies)) {
      return { assessedCompetencies: [] };
    }
    
    return {
      assessedCompetencies: data.assessedCompetencies
        .filter((item: any) => 
          item.name && 
          Array.isArray(item.evidenceFound) && 
          typeof item.coverageIncrease === 'number'
        )
        .map((item: any) => ({
          name: item.name,
          evidenceFound: item.evidenceFound,
          coverageIncrease: Math.min(100, Math.max(0, item.coverageIncrease))
        }))
    };
  }
  
  /**
   * Apply coverage updates to existing coverage data
   */
  private applyCoverageUpdates(
    currentCoverage: ICompetencyCoverage,
    analysis: CoverageAnalysisResult,
    questionNumber: number
  ): ICompetencyCoverage {
    const updatedItems = currentCoverage.items.map(item => {
      // Find if this competency was assessed in this answer
      const assessment = analysis.assessedCompetencies.find(
        a => a.name.toLowerCase() === item.competencyName.toLowerCase()
      );
      
      if (assessment) {
        // Competency was assessed - update coverage
        const newCoverage = Math.min(
          100,
          item.coveragePercentage + (assessment.coverageIncrease * 0.3) // Damping factor
        );
        
        return {
          ...item,
          coveragePercentage: Math.round(newCoverage),
          questionCount: item.questionCount + 1,
          evidenceCount: item.evidenceCount + assessment.evidenceFound.length,
          lastAssessed: questionNumber
        };
      }
      
      return item;
    });
    
    return {
      ...currentCoverage,
      items: updatedItems
    };
  }
  
  /**
   * Recalculate overall statistics
   */
  private recalculateStatistics(coverage: ICompetencyCoverage): void {
    if (coverage.items.length === 0) {
      coverage.overallCoverage = 0;
      coverage.leastCoveredCompetency = undefined;
      coverage.mostCoveredCompetency = undefined;
      return;
    }
    
    // Calculate overall average
    const total = coverage.items.reduce((sum, item) => sum + item.coveragePercentage, 0);
    coverage.overallCoverage = Math.round(total / coverage.items.length);
    
    // Find least and most covered
    const sorted = [...coverage.items].sort((a, b) => a.coveragePercentage - b.coveragePercentage);
    coverage.leastCoveredCompetency = sorted[0].competencyName;
    coverage.mostCoveredCompetency = sorted[sorted.length - 1].coveragePercentage > 0
      ? sorted[sorted.length - 1].competencyName
      : undefined;
  }
  
  /**
   * Get next competency to prioritize (least covered)
   */
  getNextCompetencyToPrioritize(coverage: ICompetencyCoverage): string | undefined {
    if (coverage.items.length === 0) return undefined;
    
    // Sort by coverage (ascending) and last assessed (ascending)
    const sorted = [...coverage.items].sort((a, b) => {
      if (a.coveragePercentage !== b.coveragePercentage) {
        return a.coveragePercentage - b.coveragePercentage;
      }
      // If same coverage, prioritize ones not assessed recently
      return (a.lastAssessed || 0) - (b.lastAssessed || 0);
    });
    
    return sorted[0].competencyName;
  }
  
  /**
   * Get coverage summary for AI prompts
   */
  getCoverageSummaryForAI(coverage: ICompetencyCoverage): string {
    if (!coverage.items.length) return 'No coverage tracking available.';
    
    const lines = coverage.items.map(item => {
      const status = item.coveragePercentage >= 80 ? '✓' :
                     item.coveragePercentage >= 40 ? '~' : '✗';
      return `${status} ${item.competencyName}: ${item.coveragePercentage}% (${item.questionCount} questions)`;
    });
    
    return [
      `COMPETENCY COVERAGE (Overall: ${coverage.overallCoverage}%):`,
      ...lines,
      '',
      `PRIORITY: Focus on "${coverage.leastCoveredCompetency}" (least covered)`
    ].join('\n');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const coverageTrackerService = new CoverageTrackerService();
export default coverageTrackerService;
