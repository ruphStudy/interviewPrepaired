import { ISTARAnalysis, shouldAnalyzeSTAR, getSTARCoachingTips } from '../models/STARAnalysis.model';
import { getOpenAIService } from './OpenAIService';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface AnalyzeSTARParams {
  question: string;
  answer: string;
  interviewStyle: string;
}

// ============================================================================
// STAR Analysis Service
// ============================================================================

class STARAnalysisService {
  /**
   * Analyze answer using STAR framework
   */
  async analyzeSTAR(params: AnalyzeSTARParams): Promise<ISTARAnalysis | null> {
    const { question, answer, interviewStyle } = params;
    
    // Only analyze for behavioral/leadership/situational interviews
    if (!shouldAnalyzeSTAR(interviewStyle)) {
      return null;
    }
    
    try {
      const analysis = await this.performSTARAnalysis({ question, answer });
      
      console.log(`[STARAnalysis] Completed. Overall score: ${analysis.overallSTARScore.toFixed(1)}/10, Complete: ${analysis.hasCompleteSTAR}`);
      
      return analysis;
      
    } catch (error) {
      console.error('[STARAnalysis] Analysis failed:', error);
      return null;
    }
  }
  
  /**
   * Call AI to perform STAR analysis
   */
  private async performSTARAnalysis(params: {
    question: string;
    answer: string;
  }): Promise<ISTARAnalysis> {
    const { question, answer } = params;
    
    const systemPrompt = `You are an expert in behavioral interview coaching and STAR framework analysis.

STAR FRAMEWORK:
- **Situation**: Context, background, setting
- **Task**: Challenge, problem, goal that needed to be addressed
- **Action**: Specific actions the candidate took (focus on "I", not "we")
- **Result**: Outcomes, impact, metrics, lessons learned

For each component, score 0-10 based on:
0-3: Missing or very weak
4-6: Present but lacks detail or clarity
7-8: Good detail and clarity
9-10: Excellent detail, specific, compelling

SCORING CRITERIA:
- Situation (0-10): How well did they set the scene?
- Task (0-10): How clearly did they define the challenge?
- Action (0-10): How specifically did they describe their actions?
- Result (0-10): How well did they quantify outcomes?

COACHING FEEDBACK:
Provide 2-4 specific tips on how to improve the answer.

OUTPUT FORMAT (JSON):
{
  "situationScore": 7,
  "taskScore": 8,
  "actionScore": 9,
  "resultScore": 6,
  "missingComponents": ["result"],
  "coachingFeedback": [
    "Add specific metrics or numbers to quantify the result",
    "Mention what you learned from this experience"
  ]
}`;

    const userPrompt = `QUESTION:
${question}

ANSWER:
${answer}

Analyze this answer using the STAR framework.`;

    try {
      const openAIService = getOpenAIService();
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await openAIService.callOpenAI(prompt, 0.3, 800);
      
      return this.validateSTARAnalysis(response);
      
    } catch (error) {
      console.error('[STARAnalysis] AI analysis failed:', error);
      // Return default low scores
      return this.getDefaultAnalysis();
    }
  }
  
  /**
   * Validate and enhance AI response
   */
  private validateSTARAnalysis(data: any): ISTARAnalysis {
    // Extract scores (default to 0 if missing)
    const situationScore = Math.min(10, Math.max(0, data.situationScore || 0));
    const taskScore = Math.min(10, Math.max(0, data.taskScore || 0));
    const actionScore = Math.min(10, Math.max(0, data.actionScore || 0));
    const resultScore = Math.min(10, Math.max(0, data.resultScore || 0));
    
    // Calculate overall
    const overallSTARScore = (situationScore + taskScore + actionScore + resultScore) / 4;
    
    // Determine missing components (score < 4)
    const missingComponents: ('situation' | 'task' | 'action' | 'result')[] = [];
    if (situationScore < 4) missingComponents.push('situation');
    if (taskScore < 4) missingComponents.push('task');
    if (actionScore < 4) missingComponents.push('action');
    if (resultScore < 4) missingComponents.push('result');
    
    // Determine strength/weakness
    const scores = {
      situation: situationScore,
      task: taskScore,
      action: actionScore,
      result: resultScore,
    };
    
    const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const strengthComponent = sortedScores[0][0] as 'situation' | 'task' | 'action' | 'result';
    const weaknessComponent = sortedScores[sortedScores.length - 1][0] as 'situation' | 'task' | 'action' | 'result';
    
    // Get coaching feedback
    let coachingFeedback = data.coachingFeedback || [];
    if (!Array.isArray(coachingFeedback)) {
      coachingFeedback = [];
    }
    
    // Add default coaching if missing
    if (coachingFeedback.length === 0) {
      coachingFeedback = getSTARCoachingTips(missingComponents);
    }
    
    return {
      situationScore,
      taskScore,
      actionScore,
      resultScore,
      overallSTARScore: Math.round(overallSTARScore * 10) / 10,
      missingComponents,
      strengthComponent: sortedScores[0][1] > 0 ? strengthComponent : undefined,
      weaknessComponent: sortedScores[sortedScores.length - 1][1] < 7 ? weaknessComponent : undefined,
      coachingFeedback: coachingFeedback.slice(0, 5),
      hasCompleteSTAR: missingComponents.length === 0,
    };
  }
  
  /**
   * Get default analysis when AI fails
   */
  private getDefaultAnalysis(): ISTARAnalysis {
    return {
      situationScore: 5,
      taskScore: 5,
      actionScore: 5,
      resultScore: 5,
      overallSTARScore: 5,
      missingComponents: [],
      coachingFeedback: ['Answer could not be analyzed for STAR framework'],
      hasCompleteSTAR: false,
    };
  }
  
  /**
   * Get STAR summary for final report
   */
  getSTARSummary(analyses: ISTARAnalysis[]): {
    averageOverallScore: number;
    averageSituationScore: number;
    averageTaskScore: number;
    averageActionScore: number;
    averageResultScore: number;
    completeSTARCount: number;
    totalAnalyzed: number;
    mostCommonMissing: string;
  } {
    if (analyses.length === 0) {
      return {
        averageOverallScore: 0,
        averageSituationScore: 0,
        averageTaskScore: 0,
        averageActionScore: 0,
        averageResultScore: 0,
        completeSTARCount: 0,
        totalAnalyzed: 0,
        mostCommonMissing: 'N/A',
      };
    }
    
    const sum = analyses.reduce(
      (acc, a) => ({
        overall: acc.overall + a.overallSTARScore,
        situation: acc.situation + a.situationScore,
        task: acc.task + a.taskScore,
        action: acc.action + a.actionScore,
        result: acc.result + a.resultScore,
      }),
      { overall: 0, situation: 0, task: 0, action: 0, result: 0 }
    );
    
    const count = analyses.length;
    const completeSTARCount = analyses.filter(a => a.hasCompleteSTAR).length;
    
    // Find most common missing component
    const missingCounts: Record<string, number> = {};
    analyses.forEach(a => {
      a.missingComponents.forEach(c => {
        missingCounts[c] = (missingCounts[c] || 0) + 1;
      });
    });
    
    const mostCommonMissing = Object.entries(missingCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
    
    return {
      averageOverallScore: Math.round((sum.overall / count) * 10) / 10,
      averageSituationScore: Math.round((sum.situation / count) * 10) / 10,
      averageTaskScore: Math.round((sum.task / count) * 10) / 10,
      averageActionScore: Math.round((sum.action / count) * 10) / 10,
      averageResultScore: Math.round((sum.result / count) * 10) / 10,
      completeSTARCount,
      totalAnalyzed: count,
      mostCommonMissing,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const starAnalysisService = new STARAnalysisService();
export default starAnalysisService;
