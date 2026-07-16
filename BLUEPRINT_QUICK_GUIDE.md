# Blueprint Refactoring - Quick Implementation Guide

## 🎯 WHAT'S BEEN DONE

### Core Architecture ✅
1. **InterviewBlueprint Model** - Complete with all fields, validation, caching
2. **BlueprintService** - Generation, caching, statistics tracking
3. **OpenAIService.generateInterviewBlueprint()** - AI-powered competency generation
4. **Interview Model** - Updated with blueprintId, blueprintVersion, roleName, industry
5. **InterviewService.startInterview()** - Integrated blueprint generation/retrieval

### Key Features Working ✅
- ✅ Blueprint hash-based caching (topic + roleName + industry + difficulty + experienceLevel + interviewStyle)
- ✅ Smart reuse of existing blueprints
- ✅ Expiration management (180 days configurable)
- ✅ ML-ready statistics (usageCount, averageScore, successRate)
- ✅ Validation with retry logic
- ✅ Weight normalization
- ✅ Backward compatibility

---

## 🚧 REMAINING WORK - STEP BY STEP

### STEP 1: Modify Evaluation to Use Blueprint Competencies

**File:** `backend/src/services/OpenAIService.ts`

**Current Method:**
```typescript
async evaluateAnswer(request: EvaluationRequest): Promise<DynamicEvaluationResponse>
```

**Add Blueprint Parameter:**
```typescript
async evaluateAnswer(
  request: EvaluationRequest,
  blueprint: IInterviewBlueprint  // NEW PARAMETER
): Promise<DynamicEvaluationResponse>
```

**Modify Prompt:**
```typescript
// OLD: Hard-coded dimensions
const dimensions = [
  { name: "technical", label: "Technical Skills" },
  { name: "communication", label: "Communication" },
  // ...
];

// NEW: Use blueprint competencies
const competencies = blueprint.competencies.map(c => ({
  name: c.name,
  description: c.description,
  weight: c.weight
}));

const prompt = `
Evaluate this answer against the following competencies:
${competencies.map(c => `- ${c.name} (${c.weight}%): ${c.description}`).join('\n')}

Evaluation Rules:
${blueprint.evaluationRules}

Return JSON:
{
  "competencyScores": [
    { "name": "Competency Name", "score": 8, "feedback": "..." }
  ],
  "overallScore": 7.5,  // Weighted average
  "strengths": [...],
  "weaknesses": [...],
  "missingCompetencies": [...]
}
`;
```

**Calculate Weighted Score:**
```typescript
// After AI response
let weightedScore = 0;
response.competencyScores.forEach(score => {
  const competency = blueprint.competencies.find(c => c.name === score.name);
  if (competency) {
    weightedScore += (score.score * competency.weight) / 100;
  }
});
response.overallScore = Math.round(weightedScore * 10) / 10;
```

---

**File:** `backend/src/services/InterviewService.ts`

**Modify submitAnswer():**
```typescript
async submitAnswer(params: SubmitAnswerParams) {
  // ... existing code ...
  
  // BEFORE evaluateAnswer call:
  
  // Retrieve blueprint
  if (!interview.blueprintId) {
    throw new ApiError(500, 'Interview missing blueprint reference');
  }
  
  const blueprint = await blueprintService.getBlueprintById(
    interview.blueprintId.toString()
  );
  
  // Evaluate answer using blueprint
  const evaluation = await this.openAIService.evaluateAnswer(
    {
      sessionConfig,
      question: currentQuestion.questionText,
      answer,
    },
    blueprint  // Pass blueprint
  );
  
  // Store evaluation with competency scores
  await interview.evaluateQuestion(currentQuestionIndex, {
    competencyScores: evaluation.competencyScores.map(cs => ({
      name: cs.name,
      score: cs.score,
      feedback: cs.feedback
    })),
    overallScore: evaluation.overallScore,
    strengths: evaluation.strengths,
    weaknesses: evaluation.weaknesses,
    suggestions: evaluation.suggestions,
    missingPoints: evaluation.missingPoints || [],
  });
  
  // ... rest of code ...
}
```

---

**File:** `backend/src/models/Interview.model.ts`

**Update IEvaluation Interface:**
```typescript
export interface ICompetencyScore {
  name: string;
  score: number;
  feedback?: string;
}

export interface IEvaluation {
  // NEW: Dynamic competency scores
  competencyScores?: ICompetencyScore[];
  
  // Keep old fields for backward compatibility
  dimensions?: IEvaluationDimension[];
  technicalScore?: number;
  communicationScore?: number;
  leadershipScore?: number;
  problemSolvingScore?: number;
  confidenceScore?: number;
  
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints?: string[];
}
```

**Update Schema:**
```typescript
const competencyScoreSchema = new Schema<ICompetencyScore>(
  {
    name: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 10 },
    feedback: { type: String }
  },
  { _id: false }
);

const evaluationSchema = new Schema<IEvaluation>(
  {
    // NEW
    competencyScores: {
      type: [competencyScoreSchema],
    },
    // Keep old fields...
    dimensions: { type: [evaluationDimensionSchema] },
    // ...
  },
  { _id: false }
);
```

---

### STEP 2: Modify Question Generation to Use Blueprint

**File:** `backend/src/services/OpenAIService.ts`

**Modify generateQuestion():**
```typescript
async generateQuestion(
  request: QuestionRequest,
  blueprint?: IInterviewBlueprint  // NEW PARAMETER
): Promise<QuestionResponse>
```

**Update Prompt:**
```typescript
const prompt = `
Generate an interview question.

${blueprint ? `
COMPETENCIES TO ASSESS:
${blueprint.competencies.map(c => `- ${c.name} (${c.weight}%): ${c.description}`).join('\n')}

QUESTION STRATEGY:
${blueprint.questionStrategy}

Focus on assessing these specific competencies.
` : ''}

Return JSON: { "question": "...", "expectedPoints": [...] }
`;
```

**File:** `backend/src/services/InterviewService.ts`

**Update startInterview():**
```typescript
const questionResponse = await this.openAIService.generateQuestion(
  {
    sessionConfig,
  },
  blueprint  // Pass blueprint
);
```

**Update submitAnswer():**
```typescript
nextQuestion = await this.openAIService.generateQuestion(
  {
    sessionConfig,
    previousQuestions,
  },
  blueprint  // Pass blueprint
);
```

---

### STEP 3: Update Final Report Generation

**File:** `backend/src/services/OpenAIService.ts`

**Modify generateFinalReport():**
```typescript
async generateFinalReport(
  request: FinalReportRequest,
  blueprint: IInterviewBlueprint  // NEW PARAMETER
): Promise<FinalReportResponse>
```

**Update Prompt:**
```typescript
const prompt = `
Generate final interview report.

COMPETENCIES ASSESSED:
${blueprint.competencies.map(c => `- ${c.name} (${c.weight}%)`).join('\n')}

REPORT STRATEGY:
${blueprint.reportStrategy}

Generate competency breakdown, strengths, weaknesses, recommendations.
`;
```

**File:** `backend/src/services/InterviewService.ts`

**Update generateFinalReport():**
```typescript
private async generateFinalReport(interview: IInterview): Promise<void> {
  // Retrieve blueprint
  const blueprint = await blueprintService.getBlueprintById(
    interview.blueprintId!.toString()
  );
  
  // Generate report
  const finalReport = await this.openAIService.generateFinalReport(
    {
      sessionConfig,
      evaluations,
    },
    blueprint  // Pass blueprint
  );
  
  // Update blueprint statistics
  const passed = finalReport.overallScore >= 6; // Or your threshold
  await blueprintService.updateBlueprintStats(
    blueprint._id.toString(),
    finalReport.overallScore,
    passed
  );
  
  // ... rest of code ...
}
```

---

### STEP 4: Update Frontend Types

**File:** `frontend/src/api/interviewApi.ts`

**Add New Interfaces:**
```typescript
export interface CompetencyScore {
  name: string;
  score: number;
  feedback?: string;
}

export interface EvaluationResult {
  // NEW
  competencyScores?: CompetencyScore[];
  
  // OLD (keep for backward compatibility)
  dimensions?: EvaluationDimension[];
  technicalScore?: number;
  communicationScore?: number;
  // ...
  
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints?: string[];
}
```

**Update StartInterviewRequest:**
```typescript
export interface StartInterviewRequest {
  topic: string;
  difficulty: string;
  experienceYears: number;
  totalQuestions?: number;
  interviewStyle?: string;
  experienceLevel?: string;
  roleName?: string;     // NEW
  industry?: string;     // NEW
}
```

---

### STEP 5: Update Report Dashboard

**File:** `frontend/src/pages/ReportDashboard.tsx`

**Update Radar Chart Data:**
```typescript
const getRadarChartData = (): ScoreData[] => {
  if (!report?.finalReport) return [];

  const firstQuestion = report.questions?.[0];
  
  // Check for NEW format (competencyScores)
  if (firstQuestion?.evaluation?.competencyScores) {
    const competencyMap = new Map<string, { sum: number; count: number }>();
    
    report.questions.forEach(q => {
      if (q.evaluation?.competencyScores) {
        q.evaluation.competencyScores.forEach(cs => {
          const existing = competencyMap.get(cs.name) || { sum: 0, count: 0 };
          existing.sum += cs.score;
          existing.count += 1;
          competencyMap.set(cs.name, existing);
        });
      }
    });

    return Array.from(competencyMap.entries()).map(([name, data]) => ({
      subject: name,
      score: data.count > 0 ? data.sum / data.count : 0,
      fullMark: 10,
    }));
  }
  
  // OLD format (dimensions) - keep for backward compatibility
  if (firstQuestion?.evaluation?.dimensions) {
    // ... existing code ...
  }
  
  return [];
};
```

**Update Score Cards:**
```typescript
{getRadarChartData().map((data, index) => {
  // Dynamic emoji mapping based on competency name
  const emoji = getCompetencyEmoji(data.subject);
  
  return (
    <ScoreCard
      key={index}
      title={data.subject}
      score={data.score}
      icon={emoji}
    />
  );
})}
```

**Display Competency Scores in Details:**
```typescript
{question.evaluation?.competencyScores && (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
    {question.evaluation.competencyScores.map(cs => (
      <div key={cs.name} className="text-center">
        <div className="text-2xl font-bold text-gray-900">
          {cs.score.toFixed(1)}
        </div>
        <div className="text-xs text-gray-600">{cs.name}</div>
        {cs.feedback && (
          <p className="text-xs text-gray-500 mt-1">{cs.feedback}</p>
        )}
      </div>
    ))}
  </div>
)}

{/* Fallback to dimensions if competencyScores not available */}
{!question.evaluation?.competencyScores && question.evaluation?.dimensions && (
  // ... existing dimensions display ...
)}
```

---

### STEP 6: Optional - Add Role & Industry Inputs

**File:** `frontend/src/pages/SetupInterview.tsx` (or wherever interview setup is)

**Add Optional Fields:**
```typescript
<div>
  <label>Role Title (Optional)</label>
  <input
    type="text"
    placeholder="e.g., Senior Developer, Sales Manager"
    value={roleName}
    onChange={(e) => setRoleName(e.target.value)}
  />
</div>

<div>
  <label>Industry (Optional)</label>
  <input
    type="text"
    placeholder="e.g., Healthcare, Finance, SaaS"
    value={industry}
    onChange={(e) => setIndustry(e.target.value)}
  />
</div>
```

**Update API Call:**
```typescript
await interviewApi.startInterview({
  topic,
  difficulty,
  experienceYears,
  totalQuestions,
  interviewStyle,
  experienceLevel,
  roleName,    // NEW
  industry,    // NEW
});
```

---

## ✅ TESTING CHECKLIST

1. **Blueprint Generation**
   - [ ] Test with Node.js Developer
   - [ ] Test with Nurse
   - [ ] Test with Sales Executive
   - [ ] Verify 4-6 competencies generated
   - [ ] Verify weights total 100

2. **Blueprint Caching**
   - [ ] Same params = same blueprint (cached)
   - [ ] Different params = different blueprint
   - [ ] Verify lastUsedAt updates

3. **Interview Flow**
   - [ ] Interview starts with blueprint
   - [ ] blueprintId stored in interview
   - [ ] Questions generated with blueprint context
   - [ ] Evaluation uses blueprint competencies

4. **Evaluation**
   - [ ] Competency scores returned
   - [ ] Weighted overall score correct
   - [ ] Missing competencies identified

5. **Frontend**
   - [ ] Dynamic competencies displayed
   - [ ] Radar chart shows competencies
   - [ ] Score cards show competencies
   - [ ] Backward compatibility with old reports

6. **Statistics**
   - [ ] usageCount increments
   - [ ] averageScore updates
   - [ ] successRate updates

---

## 🔧 CONFIGURATION

**Environment Variables:**
```env
BLUEPRINT_EXPIRY_DAYS=180  # Default: 180 days
OPENAI_MODEL=gpt-4o-mini  # Model for blueprint generation
```

---

## 📊 EXAMPLE WORKFLOW

```
User starts interview:
  topic: "Sales"
  roleName: "Senior Account Executive"
  industry: "SaaS"
  difficulty: "advanced"
  experienceLevel: "senior"

↓

Blueprint generated/cached:
  competencies: [
    "Enterprise Sales Methodology" (25%),
    "C-Level Stakeholder Management" (25%),
    "SaaS Product Demonstration" (20%),
    "Deal Negotiation" (15%),
    "Customer Success Planning" (15%)
  ]

↓

Questions target these competencies:
  Q1: "Describe your approach to selling to Fortune 500..."
  Q2: "How do you engage C-level executives..."

↓

Answers evaluated against competencies:
  Enterprise Sales: 8/10
  C-Level Management: 7/10
  Product Demo: 9/10
  Deal Negotiation: 6/10
  Customer Success: 8/10

↓

Overall Score: Weighted average
  = (8×25 + 7×25 + 9×20 + 6×15 + 8×15) / 100
  = 7.65/10

↓

Final report uses blueprint strategy
```

---

**READY TO COMPLETE THE IMPLEMENTATION!** 🚀
