import OpenAI from 'openai';
import { EvaluationResponse } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
  private model: string;

  constructor() {
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  async generateQuestion(
    topic: string,
    difficulty: string,
    experience: number,
    questionNumber: number,
    previousQuestions: string[] = [],
    jobDescription?: string,
    lastAnswer?: string,
    isFollowUp: boolean = false
  ): Promise<string> {
    let systemPrompt = `You are an expert technical interviewer conducting a ${difficulty} level interview for a ${topic} position.
The candidate has ${experience} years of experience.

Your role:
- Ask realistic, practical interview questions
- Ask ONE question at a time
- Focus on ${topic} expertise
- Match difficulty level: ${difficulty}
- Do not provide answers or hints
- Keep questions clear and concise`;

    if (jobDescription) {
      systemPrompt += `\n\nJob Description:\n${jobDescription}`;
    }

    let userPrompt = '';
    
    if (isFollowUp && lastAnswer) {
      userPrompt = `Based on the candidate's previous answer, generate an intelligent follow-up question to dive deeper:

Previous Answer: "${lastAnswer}"

Generate a follow-up question that explores:
- Specific details or examples
- Implementation challenges
- Trade-offs and decision-making
- Real-world scenarios

Provide only the question, no additional text.`;
    } else {
      userPrompt = `Generate question #${questionNumber} for this ${topic} interview.

${previousQuestions.length > 0 ? `Previous questions asked:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n` : ''}

Generate a NEW question that:
- Has not been asked before
- Tests ${topic} knowledge at ${difficulty} level
- Is appropriate for someone with ${experience} years of experience
- Is practical and realistic

Provide only the question, no additional text.`;
    }

    try {
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      return response.choices[0]?.message?.content?.trim() || 'Could not generate question';
    } catch (error) {
      console.error('Error generating question:', error);
      throw new Error('Failed to generate question');
    }
  }

  async evaluateAnswer(
    question: string,
    answer: string,
    topic: string,
    difficulty: string
  ): Promise<EvaluationResponse> {
    const systemPrompt = `You are an expert interview evaluator. Evaluate the candidate's answer objectively and provide detailed feedback.

Evaluate based on:
1. Technical Knowledge (0-10): Accuracy, depth, and correctness
2. Communication (0-10): Clarity, structure, and articulation
3. Leadership (0-10): Team management, decision-making (if applicable)
4. Problem Solving (0-10): Analytical thinking and approach
5. Confidence (0-10): Decisiveness and conviction

Provide:
- Strengths: What the candidate did well
- Weaknesses: Areas that need improvement
- Missing Points: Important aspects not covered
- Improvements: Specific suggestions for better answers

Return ONLY valid JSON, no markdown or additional text.`;

    const userPrompt = `Interview Topic: ${topic}
Difficulty: ${difficulty}

Question: "${question}"

Candidate Answer: "${answer}"

Evaluate this answer and return a JSON object with this exact structure:
{
  "technical": <number 0-10>,
  "communication": <number 0-10>,
  "leadership": <number 0-10>,
  "problemSolving": <number 0-10>,
  "confidence": <number 0-10>,
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "missingPoints": ["<missing 1>", "<missing 2>", ...],
  "improvements": ["<improvement 1>", "<improvement 2>", ...]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const evaluation = JSON.parse(content);
      
      // Validate response structure
      if (
        typeof evaluation.technical !== 'number' ||
        typeof evaluation.communication !== 'number' ||
        typeof evaluation.leadership !== 'number' ||
        typeof evaluation.problemSolving !== 'number' ||
        typeof evaluation.confidence !== 'number'
      ) {
        throw new Error('Invalid evaluation format');
      }

      return evaluation;
    } catch (error) {
      console.error('Error evaluating answer:', error);
      throw new Error('Failed to evaluate answer');
    }
  }

  async generateFinalSummary(
    evaluations: EvaluationResponse[]
  ): Promise<{ strengths: string[]; weaknesses: string[]; improvements: string[] }> {
    const allStrengths = evaluations.flatMap(e => e.strengths);
    const allWeaknesses = evaluations.flatMap(e => e.weaknesses);
    const allImprovements = evaluations.flatMap(e => e.improvements);

    const systemPrompt = `You are an expert interview coach. Summarize the candidate's overall performance across multiple questions.
Identify the most important patterns, recurring themes, and actionable insights.`;

    const userPrompt = `Based on multiple interview answers, summarize:

All Strengths: ${JSON.stringify(allStrengths)}
All Weaknesses: ${JSON.stringify(allWeaknesses)}
All Improvements: ${JSON.stringify(allImprovements)}

Provide a concise summary with:
- Top 3-5 key strengths
- Top 3-5 key areas for improvement
- Top 3-5 actionable improvement suggestions

Return ONLY valid JSON:
{
  "strengths": ["<strength 1>", ...],
  "weaknesses": ["<weakness 1>", ...],
  "improvements": ["<improvement 1>", ...]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content);
    } catch (error) {
      console.error('Error generating summary:', error);
      throw new Error('Failed to generate summary');
    }
  }
}

export const openAIService = new OpenAIService();
