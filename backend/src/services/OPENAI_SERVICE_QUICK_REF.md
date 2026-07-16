# OpenAI Service - Quick Reference

## Import

```typescript
import { OpenAIService, getOpenAIService } from './services/OpenAIService';

const aiService = getOpenAIService(); // Singleton
```

---

## Environment Setup

```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4  # Optional
```

---

## Methods

### 1. Generate Question

```typescript
const question = await aiService.generateQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  experienceYears: 3,
  previousQuestions: ['...'], // Optional
  jobDescription: '...'        // Optional
});

// Returns: { question, expectedPoints[], followUpTopics[] }
```

### 2. Generate Follow-Up

```typescript
const followUp = await aiService.generateFollowUpQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  originalQuestion: '...',
  answer: '...',
  experienceYears: 3
});

// Returns: { question, reason }
```

### 3. Evaluate Answer

```typescript
const evaluation = await aiService.evaluateAnswer({
  topic: 'React',
  difficulty: 'intermediate',
  question: '...',
  answer: '...',
  experienceYears: 3
});

// Returns: {
//   technicalScore, communicationScore, leadershipScore,
//   problemSolvingScore, confidenceScore, overallScore,
//   strengths[], weaknesses[], suggestions[], missingPoints[]
// }
```

### 4. Generate Final Report

```typescript
const report = await aiService.generateFinalReport({
  topic: 'React',
  difficulty: 'intermediate',
  experienceYears: 3,
  evaluations: [
    { question, answer, evaluation },
    // ... more
  ]
});

// Returns: {
//   overallScore, summary, recommendations[],
//   strengthsOverview[], weaknessesOverview[], nextSteps[]
// }
```

---

## Interview Topics

```typescript
type InterviewTopic = 
  | 'Node.js'
  | 'Angular'
  | 'React'
  | 'MongoDB'
  | 'TypeScript'
  | 'System Design'
  | 'Team Lead'
  | 'Engineering Manager'
  | 'HR Interview';
```

---

## Difficulty Levels

```typescript
type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
```

---

## Complete Workflow

```typescript
// 1. Test connection
const connected = await aiService.testConnection();

// 2. Generate question
const q1 = await aiService.generateQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  experienceYears: 3
});

// 3. Get answer (from user)
const answer1 = "...";

// 4. Evaluate answer
const eval1 = await aiService.evaluateAnswer({
  topic: 'React',
  difficulty: 'intermediate',
  question: q1.question,
  answer: answer1,
  experienceYears: 3
});

// 5. Generate follow-up (optional)
const followUp = await aiService.generateFollowUpQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  originalQuestion: q1.question,
  answer: answer1,
  experienceYears: 3
});

// 6. Repeat for all questions...

// 7. Generate final report
const report = await aiService.generateFinalReport({
  topic: 'React',
  difficulty: 'intermediate',
  experienceYears: 3,
  evaluations: [
    { question: q1.question, answer: answer1, evaluation: eval1 },
    // ... more
  ]
});
```

---

## Error Handling

```typescript
try {
  const result = await aiService.generateQuestion(request);
} catch (error) {
  console.error('OpenAI error:', error.message);
  // Handle: authentication, rate limit, service unavailable
}
```

---

## Configuration

```typescript
// Change model
aiService.setModel('gpt-3.5-turbo'); // Cheaper
aiService.setModel('gpt-4');         // Better quality

// Change temperature
aiService.setTemperature(0.5); // More deterministic
aiService.setTemperature(0.8); // More creative

// Get config
const config = aiService.getConfig();
```

---

## Scoring (0-10 scale)

- **Technical Score**: Accuracy, depth, correctness
- **Communication Score**: Clarity, structure, articulation
- **Leadership Score**: Decision-making, influence
- **Problem Solving Score**: Analytical approach, reasoning
- **Confidence Score**: Conviction, decisiveness
- **Overall Score**: Weighted average

---

## Response Times

| Method | Time |
|--------|------|
| generateQuestion | 2-4s |
| generateFollowUpQuestion | 1-3s |
| evaluateAnswer | 3-6s |
| generateFinalReport | 4-8s |

---

## Costs (GPT-4)

| Method | Cost |
|--------|------|
| generateQuestion | ~$0.03 |
| generateFollowUpQuestion | ~$0.02 |
| evaluateAnswer | ~$0.05 |
| generateFinalReport | ~$0.08 |

**Total per interview (5 questions)**: ~$0.25-$0.35

---

## Retry Logic

- **Max Attempts**: 3
- **Backoff**: 1s → 2s → 4s (exponential)
- **Retries on**: 429, 500, 502, 503, ETIMEDOUT, ECONNRESET

---

## Validation

All responses are automatically validated:
- ✅ JSON format enforced
- ✅ Required fields checked
- ✅ Score ranges (0-10) validated
- ✅ Array fields verified
- ✅ Type safety guaranteed

---

## Best Practices

1. Use singleton: `getOpenAIService()`
2. Test connection first
3. Handle errors with try-catch
4. Pass previousQuestions to avoid duplicates
5. Use GPT-3.5 for questions, GPT-4 for evaluations
6. Monitor API costs in production
7. Implement client-side rate limiting
8. Cache results when possible

---

## Testing

```typescript
// Test connection
const connected = await aiService.testConnection();
expect(connected).toBe(true);

// Test question generation
const question = await aiService.generateQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  experienceYears: 3
});
expect(question.question).toBeDefined();
```

---

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `authentication failed` | Invalid API key | Check OPENAI_API_KEY |
| `rate limit exceeded` | Too many requests | Wait and retry |
| `temporarily unavailable` | OpenAI down | Try again later |
| `Invalid question format` | Bad response | Check model supports JSON |

---

## Example Responses

### Question Response
```json
{
  "question": "Explain the difference between useMemo and useCallback in React",
  "expectedPoints": [
    "useMemo returns a memoized value",
    "useCallback returns a memoized function",
    "Both prevent unnecessary re-renders"
  ],
  "followUpTopics": [
    "Performance optimization",
    "React.memo"
  ]
}
```

### Evaluation Response
```json
{
  "technicalScore": 8.5,
  "communicationScore": 9.0,
  "leadershipScore": 7.0,
  "problemSolvingScore": 8.0,
  "confidenceScore": 8.5,
  "overallScore": 8.2,
  "strengths": [
    "Clear explanation",
    "Good examples"
  ],
  "weaknesses": [
    "Missing edge cases"
  ],
  "suggestions": [
    "Study performance profiling"
  ],
  "missingPoints": [
    "Dependency array importance"
  ]
}
```

### Final Report Response
```json
{
  "overallScore": 8.3,
  "summary": "Strong performance with solid technical knowledge...",
  "recommendations": [
    "Deep dive into React internals",
    "Practice performance optimization"
  ],
  "strengthsOverview": [
    "Clear communication",
    "Good problem-solving"
  ],
  "weaknessesOverview": [
    "Could improve on edge cases"
  ],
  "nextSteps": [
    "Complete React advanced course",
    "Build performance-critical app"
  ]
}
```

---

## Utility Methods

```typescript
// Test connection
await aiService.testConnection(); // Returns boolean

// Get configuration
aiService.getConfig(); // Returns OpenAIConfig

// Update model
aiService.setModel('gpt-4');

// Update temperature
aiService.setTemperature(0.7);
```

---

## Files Generated

- ✅ `OpenAIService.ts` (750+ lines)
- ✅ `OPENAI_SERVICE_DOCS.md` (complete documentation)
- ✅ `OPENAI_SERVICE_QUICK_REF.md` (this file)

---

## Integration Example

```typescript
// In your interview controller
import { getOpenAIService } from './services/OpenAIService';

export class InterviewController {
  private aiService = getOpenAIService();

  async startInterview(req, res) {
    const { topic, difficulty, experienceYears } = req.body;
    
    try {
      const question = await this.aiService.generateQuestion({
        topic,
        difficulty,
        experienceYears
      });
      
      res.json({ success: true, data: question });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  async evaluateAnswer(req, res) {
    const { topic, difficulty, question, answer, experienceYears } = req.body;
    
    try {
      const evaluation = await this.aiService.evaluateAnswer({
        topic,
        difficulty,
        question,
        answer,
        experienceYears
      });
      
      res.json({ success: true, data: evaluation });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
}
```

---

## Summary

**Features**: 4 methods, 9 topics, retry logic, error handling  
**Response Format**: JSON only with validation  
**Type Safety**: Complete TypeScript interfaces  
**Production Ready**: Error handling, retries, configuration  
**Performance**: 1-8s per call depending on method  
**Cost**: ~$0.25-$0.35 per 5-question interview (GPT-4)
