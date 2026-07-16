# OpenAI Service Refactor - Migration Guide

## 🎯 Overview

The OpenAIService has been completely refactored to support:
- **Dynamic evaluation dimensions** (not fixed 5 scores)
- **Any domain/topic** (not just technical)
- **Interview personality** (welcome, transition messages)
- **Better model** (gpt-4o-mini instead of gpt-3.5-turbo)
- **Security fix** (removed dangerouslyAllowBrowser)
- **Interview styles** (technical, behavioral, HR, etc.)

## 📁 Files

- **OpenAIService.refactored.ts** - New implementation
- **OpenAIService.ts** - Old implementation (backup)

## 🔄 Breaking Changes

### 1. **Evaluation Response Structure**

**OLD:**
```typescript
interface EvaluationResponse {
  technicalScore: number;
  communicationScore: number;
  leadershipScore: number;
  problemSolvingScore: number;
  confidenceScore: number;
  overallScore: number;
}
```

**NEW:**
```typescript
interface DynamicEvaluationResponse {
  dimensions: EvaluationDimension[];
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints: string[];
}

interface EvaluationDimension {
  name: string;
  label: string;
  score: number;
  description: string;
}
```

### 2. **Request Parameters**

**OLD:**
```typescript
generateQuestion({ topic, difficulty, experienceYears })
```

**NEW:**
```typescript
generateQuestion({ sessionConfig: { topic, difficulty, experienceLevel, interviewStyle } })
```

### 3. **Experience Levels**

**OLD:** experienceYears (number)
**NEW:** experienceLevel (enum: student | entry | professional | senior | expert)

## 🗄️ Database Migration Required

### Interview Model Changes

**Add these fields:**
```typescript
{
  interviewStyle: 'technical' | 'behavioral' | 'hr' | 'leadership' | 'situational' | 'general',
  experienceLevel: 'student' | 'entry' | 'professional' | 'senior' | 'expert',
  evaluationDimensions: [{
    name: string,
    label: string,
    score: number,
    description: string
  }]
}
```

**Replace fixed scores with:**
```typescript
{
  evaluation: {
    dimensions: EvaluationDimension[],
    overallScore: number,
    // Remove: technicalScore, communicationScore, etc.
  }
}
```

## 🔧 Migration Steps

### Step 1: Backup Database
```bash
# MongoDB backup
mongodump --db interview-coach --out ./backup
```

### Step 2: Run Migration Script
```bash
node migrate-evaluations.js
```

### Step 3: Update Service Layer
```typescript
// Replace old service calls
const evaluation = await openAIService.evaluateAnswer({
  sessionConfig: {
    topic: interview.topic,
    difficulty: interview.difficulty,
    experienceLevel: mapExperienceYearsToLevel(interview.experienceYears),
    interviewStyle: interview.interviewStyle || 'general',
    totalQuestions: interview.totalQuestions
  },
  question: currentQuestion.questionText,
  answer: answer,
});
```

### Step 4: Update Frontend

**Old score display:**
```typescript
<div>Technical: {evaluation.technicalScore}/10</div>
<div>Communication: {evaluation.communicationScore}/10</div>
```

**New dynamic display:**
```typescript
{evaluation.dimensions.map(dim => (
  <div key={dim.name}>
    {dim.label}: {dim.score}/10
  </div>
))}
```

## 🆕 New Features

### 1. Interview Personality
```typescript
const welcome = await openAIService.generateWelcomeMessage(sessionConfig);
const transition = await openAIService.generateTransitionMessage();
const completion = await openAIService.generateCompletionMessage(sessionConfig);
```

### 2. Interview Styles
```typescript
const sessionConfig = {
  topic: 'Sales Executive',
  difficulty: DifficultyLevel.INTERMEDIATE,
  experienceLevel: ExperienceLevel.PROFESSIONAL,
  interviewStyle: InterviewStyle.BEHAVIORAL,
  totalQuestions: 5
};
```

### 3. Speech Metrics (Future)
```typescript
const evaluation = await openAIService.evaluateAnswer({
  sessionConfig,
  question,
  answer,
  speechMetrics: {
    durationSeconds: 45,
    wordsPerMinute: 120,
    fillerWordCount: 3,
    pauseCount: 5
  }
});
```

## 📊 Model Upgrade

**OLD:** gpt-3.5-turbo-1106
**NEW:** gpt-4o-mini (better quality, similar cost)

Override via environment:
```bash
OPENAI_MODEL=gpt-3.5-turbo-1106  # Use old model
OPENAI_MODEL=gpt-4o-mini         # Use new model (default)
OPENAI_MODEL=gpt-4o              # Use premium model
```

## 🔒 Security Fix

**Removed:** `dangerouslyAllowBrowser: true`
**Impact:** OpenAI service now ONLY runs on backend (as it should)

## 🧪 Testing Checklist

- [ ] Backup database
- [ ] Run migration script
- [ ] Update InterviewService to use new interfaces
- [ ] Update frontend to display dynamic dimensions
- [ ] Test interview flow end-to-end
- [ ] Test all interview styles (technical, behavioral, HR, etc.)
- [ ] Test various topics (tech, sales, teaching, etc.)
- [ ] Verify evaluation dimensions adapt to topic
- [ ] Test personality messages
- [ ] Verify PDF report generation
- [ ] Check admin panel analytics

## 🐛 Rollback Plan

If issues occur:

1. **Restore old service:**
```bash
mv OpenAIService.ts OpenAIService.new.ts
mv OpenAIService.backup.ts OpenAIService.ts
```

2. **Restore database:**
```bash
mongorestore --db interview-coach ./backup/interview-coach
```

3. **Restart services:**
```bash
npm run dev
```

## 📞 Support

For issues or questions during migration, check:
- Interview model schema
- OpenAI API responses
- Frontend evaluation rendering
- Admin panel stats aggregation
