# Evaluation Engine - Validation Rules

## 📋 Overview

Comprehensive validation rules for evaluation system to prevent hallucinations, ensure consistency, and maintain quality.

---

## 🔐 Core Validation Rules

### 1. Score Validation Rules

#### Rule 1.1: Score Range
```typescript
// All scores must be between 0 and 10
score >= 0 && score <= 10

// Scores must have at most one decimal place
Math.round(score * 10) === score * 10
```

#### Rule 1.2: Score Consistency
```typescript
// Overall score must match weighted calculation within tolerance
const calculatedOverall = 
  (technical * weightTech) +
  (communication * weightComm) +
  (leadership * weightLead) +
  (problemSolving * weightPS) +
  (confidence * weightConf);

Math.abs(calculatedOverall - overall) <= 0.2
```

#### Rule 1.3: Grade Consistency
```typescript
// Grade must match overall score range
if (overall >= 9.0) → grade = 'Excellent'
if (overall >= 7.5) → grade = 'Good'
if (overall >= 6.0) → grade = 'Average'
if (overall >= 4.5) → grade = 'Below Average'
if (overall <  4.5) → grade = 'Poor'
```

---

### 2. Feedback Validation Rules

#### Rule 2.1: Minimum Length
```typescript
// Strengths: at least 10 characters each
strength.length >= 10

// Weaknesses: at least 10 characters each
weakness.length >= 10

// Suggestions: at least 15 characters each
suggestion.length >= 15

// Detailed analysis: 50-500 characters
detailedAnalysis.length >= 50 && detailedAnalysis.length <= 500
```

#### Rule 2.2: Array Size
```typescript
// Strengths: 2-4 items
strengths.length >= 2 && strengths.length <= 4

// Weaknesses: 2-4 items
weaknesses.length >= 2 && weaknesses.length <= 4

// Suggestions: 3-5 items
suggestions.length >= 3 && suggestions.length <= 5
```

#### Rule 2.3: No Vague Phrases
```typescript
// Forbidden phrases in feedback
const vaguePhrases = [
  'good answer',
  'bad answer',
  'nice',
  'poor',
  'knows ... well',
  'doesn\'t know',
  'great',
  'terrible',
  'okay',
  'fine',
];

// Feedback must not contain vague phrases
!vaguePhrases.some(phrase => feedback.toLowerCase().includes(phrase))
```

#### Rule 2.4: Actionable Suggestions
```typescript
// Suggestions must be actionable (contain action verbs)
const actionVerbs = [
  'study', 'practice', 'review', 'learn', 'read',
  'implement', 'build', 'explore', 'understand', 'master',
];

actionVerbs.some(verb => suggestion.toLowerCase().includes(verb))
```

---

### 3. Anti-Hallucination Rules

#### Rule 3.1: Evidence Requirement
```typescript
// All strengths must have evidence from candidate answer
// Extract key terms from strength
const strengthTerms = strength.toLowerCase()
  .split(/\s+/)
  .filter(word => word.length > 4);

// Check if terms appear in answer
const answerLower = answer.toLowerCase();
const matchCount = strengthTerms.filter(term => 
  answerLower.includes(term)
).length;

const matchRatio = matchCount / strengthTerms.length;

// At least 30% of terms must appear in answer
matchRatio >= 0.3
```

#### Rule 3.2: No Technical Term Hallucination
```typescript
// Technical terms mentioned in feedback must exist in answer
const technicalTerms = extractTechnicalTerms(feedback);

technicalTerms.every(term => 
  answer.toLowerCase().includes(term.toLowerCase())
)
```

#### Rule 3.3: No Assumption of Knowledge
```typescript
// Cannot claim candidate knows something not demonstrated
const forbiddenPhrases = [
  'clearly understands',
  'obviously knows',
  'must know',
  'likely knows',
  'probably understands',
  'seems to know',
];

!forbiddenPhrases.some(phrase => 
  feedback.toLowerCase().includes(phrase)
)
```

#### Rule 3.4: Specific Examples Required
```typescript
// Strengths should reference specific parts of answer
// Use quotes or specific concepts
const hasQuote = feedback.includes('"') || feedback.includes("'");
const hasSpecificConcept = feedback.match(/mentioned|explained|described|discussed/i);

hasQuote || hasSpecificConcept
```

---

### 4. Keyword Coverage Rules

#### Rule 4.1: Expected Keywords
```typescript
// Expected keywords must be relevant to question type
const expectedKeywords = {
  NodeJS: ['event loop', 'async', 'callback', 'promise', 'stream'],
  React: ['component', 'hook', 'state', 'props', 'virtual DOM'],
  MongoDB: ['document', 'collection', 'index', 'aggregation', 'replica'],
  // ... etc
};

keywordCoverage.expected.every(keyword => 
  expectedKeywords[interviewType].includes(keyword)
)
```

#### Rule 4.2: Covered Keywords Validation
```typescript
// Covered keywords must actually appear in answer
keywordCoverage.covered.every(keyword =>
  answer.toLowerCase().includes(keyword.toLowerCase())
)
```

#### Rule 4.3: Missing Keywords Calculation
```typescript
// Missing keywords = expected - covered
const missing = keywordCoverage.expected.filter(keyword =>
  !keywordCoverage.covered.includes(keyword)
);

JSON.stringify(missing.sort()) === 
JSON.stringify(keywordCoverage.missing.sort())
```

---

### 5. Context-Specific Rules

#### Rule 5.1: Technical Interview Rules
```typescript
// For technical interviews (Node, React, Angular, MongoDB, TypeScript)
if (isTechnicalInterview(interviewType)) {
  // Technical score must be primary factor
  technical >= (overall - 1.0)
  
  // Must mention at least 3 technical concepts
  keywordCoverage.covered.length >= 3
  
  // Strengths should focus on technical accuracy
  strengths.some(s => 
    s.includes('technical') || 
    s.includes('correct') || 
    s.includes('accurate')
  )
}
```

#### Rule 5.2: Leadership Interview Rules
```typescript
// For leadership interviews (Team Lead, Engineering Manager)
if (isLeadershipInterview(interviewType)) {
  // Leadership score must be significant
  leadership >= 5.0
  
  // Must demonstrate people skills
  keywordCoverage.covered.some(k => 
    ['team', 'mentor', 'coaching', 'collaboration', 'management'].includes(k)
  )
  
  // Suggestions should include leadership resources
  suggestions.some(s => 
    s.includes('leadership') || 
    s.includes('management') || 
    s.includes('team')
  )
}
```

#### Rule 5.3: System Design Rules
```typescript
// For system design interviews
if (interviewType === 'SystemDesign') {
  // Problem solving must be strong
  problemSolving >= 6.0
  
  // Must discuss trade-offs
  answer.toLowerCase().includes('trade-off') || 
  answer.toLowerCase().includes('tradeoff') ||
  strengths.some(s => s.includes('trade-off'))
  
  // Communication is critical (explaining design)
  communication >= 6.0
}
```

---

## 🔍 Validation Implementation

### Complete Validation Pipeline

```typescript
function validateEvaluation(
  result: EvaluationResult,
  request: EvaluationRequest
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Step 1: Schema Validation
  try {
    EvaluationResultSchema.parse(result);
  } catch (error) {
    errors.push({
      type: 'SCHEMA_VALIDATION',
      message: 'Schema validation failed',
      details: error.errors,
    });
  }

  // Step 2: Score Validation
  const scoreValidation = validateScores(result, request.interviewType);
  errors.push(...scoreValidation.errors);
  warnings.push(...scoreValidation.warnings);

  // Step 3: Feedback Validation
  const feedbackValidation = validateFeedback(result);
  errors.push(...feedbackValidation.errors);
  warnings.push(...feedbackValidation.warnings);

  // Step 4: Anti-Hallucination Validation
  const hallucinationValidation = validateNoHallucinations(
    result,
    request.answer
  );
  errors.push(...hallucinationValidation.errors);

  // Step 5: Evidence Validation
  const evidenceValidation = validateEvidence(result, request.answer);
  errors.push(...evidenceValidation.errors);
  warnings.push(...evidenceValidation.warnings);

  // Step 6: Keyword Coverage Validation
  const keywordValidation = validateKeywordCoverage(
    result.keywordCoverage,
    request.answer,
    request.interviewType
  );
  errors.push(...keywordValidation.errors);

  // Step 7: Context-Specific Validation
  const contextValidation = validateContext(result, request.interviewType);
  warnings.push(...contextValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 📊 Validation Error Types

### Error Severity Levels

1. **CRITICAL**: Evaluation cannot be used
   - Schema validation failure
   - Score outside valid range
   - Missing required fields
   - Technical hallucinations detected

2. **ERROR**: Evaluation quality compromised
   - Score inconsistency
   - Grade mismatch
   - Vague feedback
   - Missing evidence

3. **WARNING**: Quality could be improved
   - Low keyword coverage
   - Suggestions not specific enough
   - Analysis too brief
   - Unbalanced scores

### Error Response Format

```typescript
interface ValidationError {
  type: ErrorType;
  severity: 'CRITICAL' | 'ERROR' | 'WARNING';
  message: string;
  field?: string;
  expected?: any;
  actual?: any;
  suggestion?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  suggestions: string[];
}
```

---

## 🛡️ Anti-Hallucination Checklist

### Before Accepting Evaluation

- [ ] All scores are within 0-10 range
- [ ] Overall score matches weighted calculation (±0.2)
- [ ] Grade matches overall score range
- [ ] Each strength has evidence in answer
- [ ] No technical terms mentioned that aren't in answer
- [ ] No claims about knowledge not demonstrated
- [ ] Feedback is specific, not vague
- [ ] Suggestions are actionable
- [ ] Keyword coverage is accurate
- [ ] Expected keywords are relevant
- [ ] Covered keywords actually appear in answer
- [ ] Missing keywords = expected - covered

### Red Flags

❌ **Immediate Rejection**:
- Score outside 0-10 range
- Overall score mismatch > 0.5
- Technical term in feedback not in answer
- Empty feedback arrays
- Vague phrases ("good answer", "nice", etc.)

⚠️ **Review Required**:
- Overall score mismatch 0.2-0.5
- Low keyword coverage (<50%)
- Short strengths/weaknesses (<15 chars)
- Non-actionable suggestions
- Analysis too brief (<50 chars)

---

## 🧪 Testing Validation Rules

### Test Cases

#### Test Case 1: Valid Evaluation
```json
{
  "technical": 8.5,
  "communication": 7.0,
  "leadership": 6.0,
  "problemSolving": 8.0,
  "confidence": 7.5,
  "overall": 7.7,
  "grade": "Good",
  "strengths": [
    "Correctly explained React hooks including useState and useEffect",
    "Provided clear example of component lifecycle"
  ],
  "weaknesses": [
    "Did not mention useCallback or useMemo for optimization",
    "Could improve explanation of virtual DOM reconciliation"
  ],
  "suggestions": [
    "Study React optimization hooks (useMemo, useCallback)",
    "Practice explaining virtual DOM algorithm",
    "Review React documentation on reconciliation"
  ],
  "detailedAnalysis": "Solid understanding of React fundamentals with good grasp of hooks. Could benefit from deeper knowledge of optimization techniques.",
  "keywordCoverage": {
    "expected": ["hooks", "components", "state", "props", "lifecycle"],
    "covered": ["hooks", "useState", "useEffect", "lifecycle"],
    "missing": ["props"]
  }
}
```
**Expected**: ✅ Pass all validations

#### Test Case 2: Score Inconsistency
```json
{
  "technical": 9.0,
  "communication": 8.0,
  "leadership": 7.0,
  "problemSolving": 8.5,
  "confidence": 7.5,
  "overall": 6.0, // WRONG - should be ~8.3
  ...
}
```
**Expected**: ❌ Fail - Score inconsistency error

#### Test Case 3: Hallucinated Technical Term
```json
{
  ...
  "strengths": [
    "Excellent explanation of Redux middleware" // Redux not in answer
  ],
  ...
}
```
**Expected**: ❌ Fail - Hallucination detected

#### Test Case 4: Vague Feedback
```json
{
  ...
  "strengths": [
    "Good answer", // Too vague
    "Knows React well" // Too vague
  ],
  ...
}
```
**Expected**: ❌ Fail - Vague feedback error

---

## 🔧 Configuration

### Validation Strictness Levels

```typescript
interface ValidationConfig {
  strictness: 'STRICT' | 'MODERATE' | 'LENIENT';
  tolerances: {
    scoreInconsistency: number;      // STRICT: 0.1, MODERATE: 0.2, LENIENT: 0.5
    evidenceMatch: number;            // STRICT: 0.5, MODERATE: 0.3, LENIENT: 0.2
    keywordCoverage: number;          // STRICT: 0.7, MODERATE: 0.5, LENIENT: 0.3
  };
  required: {
    specificExamples: boolean;        // STRICT: true, MODERATE: true, LENIENT: false
    actionableKeywords: boolean;      // STRICT: true, MODERATE: true, LENIENT: false
    noVaguePhrases: boolean;          // STRICT: true, MODERATE: false, LENIENT: false
  };
}
```

### Default Configuration

```typescript
const DEFAULT_CONFIG: ValidationConfig = {
  strictness: 'STRICT',
  tolerances: {
    scoreInconsistency: 0.2,
    evidenceMatch: 0.3,
    keywordCoverage: 0.5,
  },
  required: {
    specificExamples: true,
    actionableKeywords: true,
    noVaguePhrases: true,
  },
};
```

---

## 📈 Quality Metrics

### Validation Quality Score

```typescript
interface QualityMetrics {
  scoreConsistency: number;      // 0-100
  evidenceStrength: number;      // 0-100
  feedbackSpecificity: number;   // 0-100
  keywordAccuracy: number;       // 0-100
  overallQuality: number;        // 0-100 (average)
}

function calculateQualityScore(
  result: EvaluationResult,
  answer: string,
  interviewType: InterviewType
): QualityMetrics {
  return {
    scoreConsistency: calculateScoreConsistency(result, interviewType),
    evidenceStrength: calculateEvidenceStrength(result, answer),
    feedbackSpecificity: calculateFeedbackSpecificity(result),
    keywordAccuracy: calculateKeywordAccuracy(result.keywordCoverage, answer),
    overallQuality: calculateOverallQuality(result, answer, interviewType),
  };
}
```

---

## 🎯 Usage Examples

### Example 1: Validate Evaluation
```typescript
import { validateEvaluation } from './evaluation.validator';

const result = await evaluateAnswer(question, answer, interviewType);

const validation = validateEvaluation(result, {
  question,
  answer,
  interviewType,
});

if (!validation.valid) {
  console.error('Validation failed:', validation.errors);
  throw new EvaluationValidationError('Invalid evaluation', validation.errors);
}

console.log('Validation passed!');
if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}
```

### Example 2: Validate and Fix
```typescript
const result = await evaluateAnswer(question, answer, interviewType);

const validation = validateEvaluation(result, { question, answer, interviewType });

if (!validation.valid) {
  // Attempt to fix common issues
  const fixed = autoFixEvaluation(result, validation.errors);
  
  // Re-validate
  const revalidation = validateEvaluation(fixed, { question, answer, interviewType });
  
  if (revalidation.valid) {
    console.log('Auto-fixed evaluation');
    return fixed;
  } else {
    throw new Error('Could not fix evaluation');
  }
}
```

### Example 3: Quality Reporting
```typescript
const result = await evaluateAnswer(question, answer, interviewType);
const validation = validateEvaluation(result, { question, answer, interviewType });
const quality = calculateQualityScore(result, answer, interviewType);

console.log('Validation Report:');
console.log('- Valid:', validation.valid);
console.log('- Errors:', validation.errors.length);
console.log('- Warnings:', validation.warnings.length);
console.log('\nQuality Metrics:');
console.log('- Score Consistency:', quality.scoreConsistency);
console.log('- Evidence Strength:', quality.evidenceStrength);
console.log('- Feedback Specificity:', quality.feedbackSpecificity);
console.log('- Keyword Accuracy:', quality.keywordAccuracy);
console.log('- Overall Quality:', quality.overallQuality);
```

---

**Version**: 1.0  
**Date**: June 9, 2026  
**Status**: ✅ Production Ready
