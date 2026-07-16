import { 
  IContradictionTracking, 
  IContradiction,
  ContradictionSeverity,
  getUnresolvedContradictions
} from '../models/ContradictionTracking.model';
import { IInterviewMemory } from '../models/InterviewMemory.model';
import { getOpenAIService } from './OpenAIService';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface DetectContradictionsParams {
  currentAnswer: string;
  currentQuestionNumber: number;
  interviewMemory: IInterviewMemory;
  currentTracking: IContradictionTracking;
}

interface ContradictionDetectionResult {
  newContradictions: IContradiction[];
}

// ============================================================================
// Contradiction Detector Service
// ============================================================================

class ContradictionDetectorService {
  /**
   * Detect contradictions in current answer vs previous statements
   */
  async detectContradictions(params: DetectContradictionsParams): Promise<IContradictionTracking> {
    const { currentAnswer, currentQuestionNumber, interviewMemory, currentTracking } = params;
    
    // Need at least some memory to detect contradictions
    if (interviewMemory.totalFacts < 2) {
      return currentTracking;
    }
    
    try {
      // Call AI to detect contradictions
      const detection = await this.analyzeForContradictions({
        currentAnswer,
        currentQuestionNumber,
        previousStatements: this.formatPreviousStatements(interviewMemory),
      });
      
      // Add new contradictions
      const updatedTracking = this.addContradictions(
        currentTracking,
        detection.newContradictions
      );
      
      // Update statistics
      this.updateStatistics(updatedTracking);
      
      updatedTracking.lastUpdated = new Date();
      
      if (detection.newContradictions.length > 0) {
        console.log(`[ContradictionDetector] Detected ${detection.newContradictions.length} new contradictions`);
      }
      
      return updatedTracking;
      
    } catch (error) {
      console.error('[ContradictionDetector] Detection failed:', error);
      return currentTracking;
    }
  }
  
  /**
   * Call AI to analyze for contradictions
   */
  private async analyzeForContradictions(params: {
    currentAnswer: string;
    currentQuestionNumber: number;
    previousStatements: string;
  }): Promise<ContradictionDetectionResult> {
    const { currentAnswer, currentQuestionNumber, previousStatements } = params;
    
    const systemPrompt = `You are an expert at detecting logical contradictions and inconsistencies in interview answers.

A CONTRADICTION occurs when:
- Two statements directly conflict or are mutually exclusive
- Timeline claims don't add up (e.g., "5 years at Company A 2020-2024" + "3 years at Company B 2022-2025")
- Responsibility claims conflict (e.g., "I worked alone" vs "I led a team")
- Technical details contradict (e.g., "We used React" vs "We never used JavaScript frameworks")
- Numbers don't match (e.g., "managed 20 people" vs "team of 5")

SEVERITY LEVELS:
- minor: Small inconsistency, might be phrasing difference
- moderate: Notable inconsistency that should be clarified
- major: Clear contradiction that raises concerns
- critical: Fundamental contradiction suggesting dishonesty

For EACH contradiction:
1. Extract both contradictory statements
2. Explain why they contradict
3. Assign severity
4. Note which question numbers they came from

DO NOT flag:
- Different aspects of the same thing (not contradictory)
- Evolution over time (e.g., "started with 5, grew to 20")
- Context-appropriate differences

OUTPUT FORMAT (JSON):
{
  "contradictions": [
    {
      "statement1": "worked independently on the project",
      "questionNumber1": 2,
      "statement2": "led a team of 8 engineers on that project",
      "questionNumber2": 5,
      "contradiction": "Cannot work independently AND lead a team of 8",
      "explanation": "These statements about the same project contradict each other regarding team size and role",
      "severity": "major"
    }
  ]
}`;

    const userPrompt = `PREVIOUS STATEMENTS FROM CANDIDATE:
${previousStatements}

CURRENT ANSWER (Question ${currentQuestionNumber}):
${currentAnswer}

Analyze the current answer for contradictions with previous statements.`;

    try {
      const openAIService = getOpenAIService();
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await openAIService.callOpenAI(prompt, 0.2, 1000);
      
      const contradictions = this.validateContradictionDetection(
        response,
        currentQuestionNumber
      );
      
      return { newContradictions: contradictions };
      
    } catch (error) {
      console.error('[ContradictionDetector] AI analysis failed:', error);
      return { newContradictions: [] };
    }
  }
  
  /**
   * Format previous statements for AI context
   */
  private formatPreviousStatements(memory: IInterviewMemory): string {
    const lines: string[] = [];
    
    // Get items by category from allItems
    const experienceItems = memory.allItems.filter(item => item.category === 'experience');
    const numberItems = memory.allItems.filter(item => item.category === 'number');
    const projectItems = memory.allItems.filter(item => item.category === 'project');
    const leadershipItems = memory.allItems.filter(item => item.category === 'leadership');
    const achievementItems = memory.allItems.filter(item => item.category === 'achievement');
    
    // Experience details
    if (experienceItems.length > 0) {
      lines.push('EXPERIENCE:');
      experienceItems.forEach(item => {
        lines.push(`- [Q${item.questionNumber}] ${item.content}`);
      });
    }
    
    // Numbers/metrics
    if (numberItems.length > 0) {
      lines.push('NUMBERS/METRICS:');
      numberItems.forEach(item => {
        lines.push(`- [Q${item.questionNumber}] ${item.content}`);
      });
    }
    
    // Projects
    if (projectItems.length > 0) {
      lines.push('PROJECTS:');
      projectItems.forEach(item => {
        lines.push(`- [Q${item.questionNumber}] ${item.content}`);
      });
    }
    
    // Leadership
    if (leadershipItems.length > 0) {
      lines.push('LEADERSHIP:');
      leadershipItems.forEach(item => {
        lines.push(`- [Q${item.questionNumber}] ${item.content}`);
      });
    }
    
    // Achievements
    if (achievementItems.length > 0) {
      lines.push('ACHIEVEMENTS:');
      achievementItems.forEach(item => {
        lines.push(`- [Q${item.questionNumber}] ${item.content}`);
      });
    }
    
    return lines.join('\n');
  }
  
  /**
   * Validate AI response
   */
  private validateContradictionDetection(
    data: any,
    currentQuestionNumber: number
  ): IContradiction[] {
    if (!data.contradictions || !Array.isArray(data.contradictions)) {
      return [];
    }
    
    return data.contradictions
      .filter((item: any) => 
        item.statement1 &&
        item.statement2 &&
        item.contradiction &&
        item.explanation &&
        item.severity &&
        typeof item.questionNumber1 === 'number'
      )
      .map((item: any) => ({
        statement1: item.statement1.trim(),
        questionNumber1: item.questionNumber1,
        statement2: item.statement2.trim(),
        questionNumber2: item.questionNumber2 || currentQuestionNumber,
        contradiction: item.contradiction.trim(),
        explanation: item.explanation.trim(),
        severity: item.severity as ContradictionSeverity,
        resolved: false,
        clarificationAsked: false,
        timestamp: new Date(),
      }));
  }
  
  /**
   * Add contradictions to tracking (no deduplication - each is unique)
   */
  private addContradictions(
    tracking: IContradictionTracking,
    newContradictions: IContradiction[]
  ): IContradictionTracking {
    return {
      ...tracking,
      contradictions: [...tracking.contradictions, ...newContradictions],
    };
  }
  
  /**
   * Update statistics
   */
  private updateStatistics(tracking: IContradictionTracking): void {
    tracking.totalContradictions = tracking.contradictions.length;
    tracking.unresolvedCount = tracking.contradictions.filter(c => !c.resolved).length;
    tracking.criticalCount = tracking.contradictions.filter(
      c => (c.severity === 'major' || c.severity === 'critical') && !c.resolved
    ).length;
  }
  
  /**
   * Get next contradiction to clarify
   */
  getNextContradictionToClarify(tracking: IContradictionTracking): IContradiction | undefined {
    const unresolved = getUnresolvedContradictions(tracking);
    // Return highest severity unasked contradiction
    return unresolved.find(c => !c.clarificationAsked);
  }
  
  /**
   * Mark contradiction as clarified
   */
  markClarificationAsked(
    tracking: IContradictionTracking,
    contradictionIndex: number,
    questionNumber: number
  ): IContradictionTracking {
    if (contradictionIndex >= 0 && contradictionIndex < tracking.contradictions.length) {
      tracking.contradictions[contradictionIndex].clarificationAsked = true;
      tracking.contradictions[contradictionIndex].clarificationQuestionNumber = questionNumber;
    }
    return tracking;
  }
  
  /**
   * Resolve contradiction
   */
  resolveContradiction(
    tracking: IContradictionTracking,
    contradictionIndex: number,
    resolutionNotes: string
  ): IContradictionTracking {
    if (contradictionIndex >= 0 && contradictionIndex < tracking.contradictions.length) {
      tracking.contradictions[contradictionIndex].resolved = true;
      tracking.contradictions[contradictionIndex].resolutionNotes = resolutionNotes;
    }
    
    this.updateStatistics(tracking);
    return tracking;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const contradictionDetectorService = new ContradictionDetectorService();
export default contradictionDetectorService;
