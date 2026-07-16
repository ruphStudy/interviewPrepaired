import { IInterviewMemory, IMemoryItem, createEmptyMemory, formatMemoryForAI } from '../models/InterviewMemory.model';
import { getOpenAIService } from './OpenAIService';

/**
 * Memory Extraction Request
 */
export interface MemoryExtractionRequest {
  question: string;
  answer: string;
  questionNumber: number;
  existingMemory?: IInterviewMemory;
}

/**
 * Memory Extraction Response from AI
 */
export interface MemoryExtractionResponse {
  claims: string[];
  achievements: string[];
  experienceDetails: string[];
  numbers: string[];
  projects: string[];
  leadershipExamples: string[];
  certifications: string[];
  contradictions: string[];
}

/**
 * Interview Memory Service
 * 
 * Extracts and manages candidate information throughout the interview
 */
export class InterviewMemoryService {
  private openAIService = getOpenAIService();

  /**
   * Extract key facts from candidate's answer
   * 
   * This is called after each answer to build interview memory
   */
  async extractMemoryFromAnswer(request: MemoryExtractionRequest): Promise<IInterviewMemory> {
    console.log(`[MemoryService] Extracting memory from Q${request.questionNumber} answer`);

    try {
      // Get current memory or create empty
      const currentMemory = request.existingMemory || createEmptyMemory();

      // Call AI to extract facts
      const extractedFacts = await this.callAIForMemoryExtraction(
        request.question,
        request.answer,
        currentMemory
      );

      // Update memory with new facts
      const updatedMemory = this.mergeMemory(currentMemory, extractedFacts, request.questionNumber);

      console.log(`[MemoryService] Memory updated. Total facts: ${updatedMemory.totalFacts}`);
      
      return updatedMemory;

    } catch (error) {
      console.error('[MemoryService] Error extracting memory:', error);
      // Return existing memory on error (don't break the flow)
      return request.existingMemory || createEmptyMemory();
    }
  }

  /**
   * Call OpenAI to extract facts from answer
   */
  private async callAIForMemoryExtraction(
    question: string,
    answer: string,
    existingMemory: IInterviewMemory
  ): Promise<MemoryExtractionResponse> {
    const existingMemorySummary = formatMemoryForAI(existingMemory);

    const prompt = `You are an expert interviewer analyzing a candidate's answer.

Extract key facts from this answer that should be remembered for future questions.

QUESTION ASKED:
${question}

CANDIDATE'S ANSWER:
${answer}

PREVIOUSLY EXTRACTED FACTS:
${existingMemorySummary}

YOUR TASK:
Extract NEW facts from this answer. Categorize each fact appropriately.

CATEGORIES:
1. claims - General statements or assertions
2. achievements - Specific accomplishments with results
3. experienceDetails - Work history, roles, responsibilities, companies
4. numbers - Quantifiable data (team sizes, revenue, percentages, durations, years of experience)
5. projects - Projects or initiatives mentioned
6. leadershipExamples - Leadership situations, decisions, or behaviors
7. certifications - Degrees, certifications, qualifications, courses
8. contradictions - Statements that conflict with previously stated facts

EXTRACTION RULES:
- Be concise but specific (1-2 sentences per fact)
- Include context where relevant
- Extract actual numbers and be precise
- Only flag contradictions if they clearly conflict with existing facts
- Skip vague or generic statements
- Focus on verifiable, concrete information

EXAMPLES:

For answer: "I managed a team of 20 engineers for 3 years and increased productivity by 40%"
Extract:
- experienceDetails: "Managed engineering team for 3 years"
- numbers: "Team size: 20 engineers", "Duration: 3 years", "Productivity increase: 40%"
- achievements: "Increased team productivity by 40%"
- leadershipExamples: "Led team of 20 engineers"

For answer: "I have a CS degree from MIT and I'm AWS certified"
Extract:
- certifications: "Computer Science degree from MIT", "AWS certification"

For answer: "I worked alone on that project" (when previously said "I led a team")
Extract:
- contradictions: "Previously mentioned leading a team, now says worked alone"

Return ONLY valid JSON:
{
  "claims": [],
  "achievements": [],
  "experienceDetails": [],
  "numbers": [],
  "projects": [],
  "leadershipExamples": [],
  "certifications": [],
  "contradictions": []
}`;

    try {
      const response = await this.openAIService.callOpenAI(prompt, 0.3, 800);
      
      // Validate response
      return this.validateMemoryResponse(response);
      
    } catch (error) {
      console.error('[MemoryService] AI extraction failed:', error);
      // Return empty extraction on error
      return {
        claims: [],
        achievements: [],
        experienceDetails: [],
        numbers: [],
        projects: [],
        leadershipExamples: [],
        certifications: [],
        contradictions: [],
      };
    }
  }

  /**
   * Validate and sanitize AI response
   */
  private validateMemoryResponse(response: any): MemoryExtractionResponse {
    const ensureArray = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value.filter(item => typeof item === 'string' && item.trim().length > 0);
      }
      return [];
    };

    return {
      claims: ensureArray(response.claims),
      achievements: ensureArray(response.achievements),
      experienceDetails: ensureArray(response.experienceDetails),
      numbers: ensureArray(response.numbers),
      projects: ensureArray(response.projects),
      leadershipExamples: ensureArray(response.leadershipExamples),
      certifications: ensureArray(response.certifications),
      contradictions: ensureArray(response.contradictions),
    };
  }

  /**
   * Merge extracted facts into existing memory
   */
  private mergeMemory(
    currentMemory: IInterviewMemory,
    extracted: MemoryExtractionResponse,
    questionNumber: number
  ): IInterviewMemory {
    const timestamp = new Date();

    // Create new memory items
    const newItems: IMemoryItem[] = [];

    // Helper to add items
    const addItems = (category: IMemoryItem['category'], items: string[]) => {
      items.forEach(content => {
        newItems.push({
          category,
          content,
          questionNumber,
          timestamp,
          confidence: 0.8,
        });
      });
    };

    // Add all extracted facts
    addItems('claim', extracted.claims);
    addItems('achievement', extracted.achievements);
    addItems('experience', extracted.experienceDetails);
    addItems('number', extracted.numbers);
    addItems('project', extracted.projects);
    addItems('leadership', extracted.leadershipExamples);
    addItems('certification', extracted.certifications);
    addItems('contradiction', extracted.contradictions);

    // Merge with existing memory (avoid duplicates)
    const updatedMemory: IInterviewMemory = {
      claims: this.mergeDeduplicate(currentMemory.claims, extracted.claims),
      achievements: this.mergeDeduplicate(currentMemory.achievements, extracted.achievements),
      experienceDetails: this.mergeDeduplicate(currentMemory.experienceDetails, extracted.experienceDetails),
      numbers: this.mergeDeduplicate(currentMemory.numbers, extracted.numbers),
      projects: this.mergeDeduplicate(currentMemory.projects, extracted.projects),
      leadershipExamples: this.mergeDeduplicate(currentMemory.leadershipExamples, extracted.leadershipExamples),
      certifications: this.mergeDeduplicate(currentMemory.certifications, extracted.certifications),
      contradictions: this.mergeDeduplicate(currentMemory.contradictions, extracted.contradictions),
      allItems: [...currentMemory.allItems, ...newItems],
      lastUpdated: timestamp,
      totalFacts: 0, // Will be calculated below
    };

    // Calculate total facts
    updatedMemory.totalFacts = updatedMemory.allItems.length;

    return updatedMemory;
  }

  /**
   * Merge arrays and remove duplicates (case-insensitive, trimmed comparison)
   */
  private mergeDeduplicate(existing: string[], newItems: string[]): string[] {
    const combined = [...existing, ...newItems];
    const seen = new Set<string>();
    const result: string[] = [];

    combined.forEach(item => {
      const normalized = item.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(item);
      }
    });

    return result;
  }

  /**
   * Get memory formatted for AI context
   */
  formatMemoryForAI(memory: IInterviewMemory): string {
    return formatMemoryForAI(memory);
  }

  /**
   * Get relevant memory for next question generation
   * 
   * This can be enhanced to filter most relevant facts
   */
  getRelevantMemoryForQuestion(
    memory: IInterviewMemory
  ): string {
    if (!memory || memory.totalFacts === 0) {
      return '';
    }

    // For now, return all memory
    // TODO: Filter based on target competencies or relevance
    return formatMemoryForAI(memory);
  }

  /**
   * Detect potential follow-up opportunities from memory
   */
  suggestFollowUpTopics(memory: IInterviewMemory): string[] {
    const suggestions: string[] = [];

    // Suggest follow-ups for quantifiable achievements
    memory.numbers.forEach(num => {
      if (num.includes('team') || num.includes('people')) {
        suggestions.push(`Team management experience (${num})`);
      }
      if (num.includes('%') || num.includes('increase') || num.includes('reduce')) {
        suggestions.push(`Impact metrics (${num})`);
      }
    });

    // Suggest diving deeper into projects
    memory.projects.forEach(project => {
      suggestions.push(`Project details: ${project}`);
    });

    // Suggest exploring leadership examples
    memory.leadershipExamples.forEach(example => {
      suggestions.push(`Leadership situation: ${example}`);
    });

    // Flag contradictions for clarification
    memory.contradictions.forEach(contradiction => {
      suggestions.push(`⚠️ Clarify: ${contradiction}`);
    });

    return suggestions.slice(0, 5); // Limit to top 5 suggestions
  }

  /**
   * Check if candidate has provided enough detail
   * 
   * Used to determine if follow-up is needed
   */
  hasEnoughDetail(memory: IInterviewMemory): boolean {
    // Simple heuristic: At least 3 facts per category that matters
    return (
      memory.experienceDetails.length >= 2 &&
      memory.numbers.length >= 2 &&
      (memory.achievements.length >= 1 || memory.projects.length >= 1)
    );
  }
}

export const interviewMemoryService = new InterviewMemoryService();
