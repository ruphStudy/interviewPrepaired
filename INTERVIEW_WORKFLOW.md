# Interview Workflow Architecture - AI Voice Interview Coach

## Overview

Complete production-ready workflow architecture for AI-powered voice interview coaching system with state management, error handling, and scalability.

**Date**: June 9, 2026  
**Version**: 1.0  
**Status**: Production Ready

---

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [Sequence Diagram](#sequence-diagram)
3. [State Machine Diagram](#state-machine-diagram)
4. [Event Flow](#event-flow)
5. [API Calls](#api-calls)
6. [Frontend Flow](#frontend-flow)
7. [Backend Flow](#backend-flow)
8. [Failure Recovery Strategy](#failure-recovery-strategy)
9. [Retry Logic](#retry-logic)
10. [Implementation Guide](#implementation-guide)

---

## Workflow Overview

### Complete Interview Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERVIEW WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────┘

Step 1: Setup Interview
├─ User selects: Topic, Difficulty, Experience, Number of Questions
├─ Create interview session
└─ Initialize state machine

Step 2: Generate Question
├─ Call OpenAI Question Generation API
├─ Store question in database
└─ Update interview progress

Step 3: Present Question
├─ Display question text on screen
├─ Convert text to speech (TTS)
└─ Play audio to user

Step 4: Record Answer
├─ Activate microphone
├─ Record audio stream
├─ Monitor recording state
└─ Stop on user action or timeout

Step 5: Transcribe Audio
├─ Send audio to Speech-to-Text service
├─ Receive transcript
└─ Store transcript with answer

Step 6: Evaluate Answer
├─ Call OpenAI Evaluation API
├─ Receive scores and feedback
└─ Store evaluation in database

Step 7: Decision Point
├─ If more questions needed → Generate follow-up or next question (goto Step 2)
├─ If interview complete → Proceed to Step 8
└─ If error → Handle failure recovery

Step 8: Complete Interview
├─ Update interview status to 'completed'
└─ Trigger report generation

Step 9: Generate Report
├─ Call OpenAI Report Generation API
├─ Store report in database
└─ Display results to user

┌─────────────────────────────────────────────────────────────────────┐
│                         SUCCESS                                      │
│                    User receives report                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

### Complete Interview Sequence

```
User          Frontend         API Gateway      Backend Service      OpenAI API      Database
 │                │                  │                  │                │             │
 │  1. Start     │                  │                  │                │             │
 │   Interview   │                  │                  │                │             │
 ├──────────────>│                  │                  │                │             │
 │               │                  │                  │                │             │
 │               │ 2. POST          │                  │                │             │
 │               │ /interviews      │                  │                │             │
 │               ├─────────────────>│                  │                │             │
 │               │                  │ 3. Create        │                │             │
 │               │                  │  Interview       │                │             │
 │               │                  ├─────────────────>│                │             │
 │               │                  │                  │ 4. INSERT      │             │
 │               │                  │                  ├───────────────────────────>│
 │               │                  │                  │                │             │
 │               │                  │                  │<───────────────────────────┤
 │               │                  │                  │ 5. interviewId │             │
 │               │                  │                  │                │             │
 │               │                  │                  │ 6. Generate    │             │
 │               │                  │                  │   Question     │             │
 │               │                  │                  ├───────────────>│             │
 │               │                  │                  │                │             │
 │               │                  │                  │<───────────────┤             │
 │               │                  │                  │ 7. Question    │             │
 │               │                  │                  │                │             │
 │               │                  │                  │ 8. SAVE        │             │
 │               │                  │                  ├───────────────────────────>│
 │               │                  │<─────────────────┤                │             │
 │               │<─────────────────┤ 9. Response      │                │             │
 │               │ {interviewId,    │                  │                │             │
 │               │  question}       │                  │                │             │
 │               │                  │                  │                │             │
 │ 10. Display   │                  │                  │                │             │
 │    Question   │                  │                  │                │             │
 │<──────────────┤                  │                  │                │             │
 │               │                  │                  │                │             │
 │ 11. TTS       │                  │                  │                │             │
 │   (Speak)     │                  │                  │                │             │
 │<──────────────┤                  │                  │                │             │
 │               │                  │                  │                │             │
 │ 12. Start     │                  │                  │                │             │
 │   Recording   │                  │                  │                │             │
 ├──────────────>│                  │                  │                │             │
 │               │                  │                  │                │             │
 │ [User speaks] │                  │                  │                │             │
 │               │                  │                  │                │             │
 │ 13. Stop      │                  │                  │                │             │
 │   Recording   │                  │                  │                │             │
 ├──────────────>│                  │                  │                │             │
 │               │                  │                  │                │             │
 │               │ 14. Transcribe   │                  │                │             │
 │               │    (Web Speech   │                  │                │             │
 │               │     API)         │                  │                │             │
 │               │                  │                  │                │             │
 │               │ 15. POST         │                  │                │             │
 │               │ /answers         │                  │                │             │
 │               ├─────────────────>│                  │                │             │
 │               │ {transcript}     │ 16. Save Answer  │                │             │
 │               │                  ├─────────────────>│                │             │
 │               │                  │                  │ 17. INSERT     │             │
 │               │                  │                  ├───────────────────────────>│
 │               │                  │                  │                │             │
 │               │                  │                  │ 18. Evaluate   │             │
 │               │                  │                  │    Answer      │             │
 │               │                  │                  ├───────────────>│             │
 │               │                  │                  │                │             │
 │               │                  │                  │<───────────────┤             │
 │               │                  │                  │ 19. Evaluation │             │
 │               │                  │                  │                │             │
 │               │                  │                  │ 20. SAVE       │             │
 │               │                  │                  ├───────────────────────────>│
 │               │                  │<─────────────────┤                │             │
 │               │<─────────────────┤ 21. Response     │                │             │
 │               │ {evaluation,     │                  │                │             │
 │               │  nextQuestion}   │                  │                │             │
 │               │                  │                  │                │             │
 │ 22. Display   │                  │                  │                │             │
 │    Score      │                  │                  │                │             │
 │<──────────────┤                  │                  │                │             │
 │               │                  │                  │                │             │
 │               │ [LOOP: Repeat Steps 10-22 for each question]          │             │
 │               │                  │                  │                │             │
 │               │ 23. POST         │                  │                │             │
 │               │ /reports         │                  │                │             │
 │               ├─────────────────>│                  │                │             │
 │               │                  │ 24. Generate     │                │             │
 │               │                  │    Report        │                │             │
 │               │                  ├─────────────────>│                │             │
 │               │                  │                  │ 25. Generate   │             │
 │               │                  │                  │    Report      │             │
 │               │                  │                  ├───────────────>│             │
 │               │                  │                  │                │             │
 │               │                  │                  │<───────────────┤             │
 │               │                  │                  │ 26. Report     │             │
 │               │                  │                  │                │             │
 │               │                  │                  │ 27. SAVE       │             │
 │               │                  │                  ├───────────────────────────>│
 │               │                  │<─────────────────┤                │             │
 │               │<─────────────────┤ 28. Response     │                │             │
 │               │ {report}         │                  │                │             │
 │               │                  │                  │                │             │
 │ 29. Display   │                  │                  │                │             │
 │    Report     │                  │                  │                │             │
 │<──────────────┤                  │                  │                │             │
 │               │                  │                  │                │             │
```

---

## State Machine Diagram

### Interview State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INTERVIEW STATE MACHINE                           │
└─────────────────────────────────────────────────────────────────────┘

                            ┌──────────┐
                            │  IDLE    │
                            └────┬─────┘
                                 │
                      [User clicks "Start Interview"]
                                 │
                                 ▼
                         ┌───────────────┐
                         │  CONFIGURING  │◄─────────┐
                         └───────┬───────┘          │
                                 │                  │
                    [Submit configuration]      [Edit]
                                 │                  │
                                 ▼                  │
                         ┌───────────────┐          │
                         │   CREATING    │──────────┘
                         └───────┬───────┘
                                 │
                         [Interview created]
                                 │
                                 ▼
                      ┌──────────────────┐
                      │ GENERATING_       │
                      │   QUESTION        │
                      └──────┬────────────┘
                             │
                   [Question generated]
                             │
                             ▼
                   ┌──────────────────┐
                   │  PRESENTING_      │
                   │   QUESTION        │
                   └──────┬────────────┘
                          │
                  [TTS complete]
                          │
                          ▼
                 ┌──────────────────┐
                 │   RECORDING       │
                 └──────┬────────────┘
                        │
              [Stop recording]
                        │
                        ▼
              ┌──────────────────┐
              │  TRANSCRIBING     │
              └──────┬────────────┘
                     │
           [Transcript ready]
                     │
                     ▼
            ┌──────────────────┐
            │   EVALUATING      │
            └──────┬────────────┘
                   │
         [Evaluation complete]
                   │
                   ▼
          ┌──────────────────────┐
          │  DECISION_POINT      │
          └───┬──────────┬───────┘
              │          │
    [More Q's]│          │[Complete]
              │          │
              ▼          ▼
     ┌────────────┐  ┌──────────────┐
     │  NEXT_     │  │  COMPLETING   │
     │  QUESTION  │  └───────┬───────┘
     └─────┬──────┘          │
           │            [Report trigger]
           │                 │
           │                 ▼
           │        ┌──────────────────┐
           │        │  GENERATING_      │
           │        │    REPORT         │
           │        └───────┬───────────┘
           │                │
           │        [Report generated]
           │                │
           │                ▼
           │        ┌──────────────────┐
           │        │   COMPLETED       │
           │        └───────────────────┘
           │
           └──────────────┐
                          │
                          ▼
              [Return to GENERATING_QUESTION]


┌─────────────────────────────────────────────────────────────────────┐
│                         ERROR STATES                                 │
└─────────────────────────────────────────────────────────────────────┘

Any State ──[Error]──> ┌──────────────┐
                        │    ERROR     │
                        └──────┬───────┘
                               │
                      ┌────────┴────────┐
                      │                 │
              [Retry possible]   [Fatal error]
                      │                 │
                      ▼                 ▼
            ┌──────────────┐    ┌──────────────┐
            │   RETRYING   │    │   ABANDONED   │
            └──────┬───────┘    └───────────────┘
                   │
            [Retry success]
                   │
                   └──> [Return to previous state]


┌─────────────────────────────────────────────────────────────────────┐
│                      PAUSE/RESUME STATES                             │
└─────────────────────────────────────────────────────────────────────┘

Active States ──[User pause]──> ┌──────────────┐
                                 │    PAUSED    │
                                 └──────┬───────┘
                                        │
                                 [User resume]
                                        │
                                        └──> [Return to previous state]
```

### State Transitions Table

| From State | Event | To State | Actions |
|-----------|-------|----------|---------|
| IDLE | Start Interview | CONFIGURING | Show config form |
| CONFIGURING | Submit | CREATING | POST /interviews |
| CREATING | Success | GENERATING_QUESTION | Call Question API |
| GENERATING_QUESTION | Success | PRESENTING_QUESTION | Display + TTS |
| PRESENTING_QUESTION | TTS Complete | RECORDING | Activate mic |
| RECORDING | Stop | TRANSCRIBING | Send to STT |
| TRANSCRIBING | Success | EVALUATING | POST /answers |
| EVALUATING | Success | DECISION_POINT | Check progress |
| DECISION_POINT | More questions | GENERATING_QUESTION | Loop |
| DECISION_POINT | Complete | COMPLETING | Update status |
| COMPLETING | Success | GENERATING_REPORT | POST /reports |
| GENERATING_REPORT | Success | COMPLETED | Display report |
| Any State | Error (retryable) | RETRYING | Execute retry |
| RETRYING | Success | Previous State | Continue |
| Any State | Error (fatal) | ABANDONED | Show error |
| Active State | Pause | PAUSED | Save state |
| PAUSED | Resume | Previous State | Restore state |

---

## Event Flow

### Event Types and Handlers

```typescript
// Event type definitions
type InterviewEvent =
  | { type: 'START_INTERVIEW'; payload: InterviewConfig }
  | { type: 'INTERVIEW_CREATED'; payload: { interviewId: string } }
  | { type: 'QUESTION_GENERATED'; payload: GeneratedQuestion }
  | { type: 'QUESTION_PRESENTED'; payload: void }
  | { type: 'START_RECORDING'; payload: void }
  | { type: 'STOP_RECORDING'; payload: { audioBlob: Blob } }
  | { type: 'TRANSCRIPT_READY'; payload: { transcript: string } }
  | { type: 'EVALUATION_COMPLETE'; payload: AnswerEvaluation }
  | { type: 'NEXT_QUESTION'; payload: void }
  | { type: 'COMPLETE_INTERVIEW'; payload: void }
  | { type: 'REPORT_GENERATED'; payload: InterviewReport }
  | { type: 'ERROR'; payload: { error: Error; retryable: boolean } }
  | { type: 'RETRY'; payload: void }
  | { type: 'PAUSE'; payload: void }
  | { type: 'RESUME'; payload: void }
  | { type: 'ABANDON'; payload: void };
```

### Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EVENT FLOW                                   │
└─────────────────────────────────────────────────────────────────────┘

User Actions               System Events              Backend Events
─────────────────────────────────────────────────────────────────────

[Click Start]
    │
    ├──> START_INTERVIEW ──────────────> POST /interviews
    │                                          │
    │                                          ▼
    │                              INTERVIEW_CREATED
    │                                          │
    │                                          ├──> Generate Question
    │                                          │
    │                                          ▼
    │                              QUESTION_GENERATED
    │                                          │
    ▼                                          ▼
[View Question] <────────────── QUESTION_PRESENTED
    │                                          │
    │                                          ├──> Text-to-Speech
    │                                          │
    ▼                                          ▼
[Hear Question] <────────────── TTS_COMPLETE
    │
    ▼
[Click Record]
    │
    ├──> START_RECORDING ──────────────> Initialize Audio
    │
[Speak Answer]
    │
    ▼
[Click Stop]
    │
    ├──> STOP_RECORDING ───────────────> Speech-to-Text
    │                                          │
    │                                          ▼
    │                              TRANSCRIPT_READY
    │                                          │
    │                                          ├──> POST /answers
    │                                          │
    │                                          ▼
    │                              EVALUATION_STARTED
    │                                          │
    │                                          ├──> OpenAI Evaluate
    │                                          │
    │                                          ▼
    │                              EVALUATION_COMPLETE
    │                                          │
    ▼                                          │
[View Score] <────────────────────────────────┤
    │                                          │
    │                                          ▼
    │                              PROGRESS_CHECK
    │                                          │
    │                              ┌───────────┴─────────┐
    │                              │                     │
    │                        [More Q's]            [Complete]
    │                              │                     │
    │                              ▼                     ▼
    │                        NEXT_QUESTION      COMPLETE_INTERVIEW
    │                              │                     │
    │                              │                     ├──> POST /reports
    │                              │                     │
    └──────────────────────────────┘                     ▼
           [Loop to next Q]                  REPORT_GENERATION_STARTED
                                                         │
                                                         ├──> OpenAI Report
                                                         │
                                                         ▼
                                             REPORT_GENERATED
                                                         │
                                                         ▼
[View Report] <──────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                         ERROR EVENTS                                 │
└─────────────────────────────────────────────────────────────────────┘

Any Event
    │
    ├──> [Error Occurs]
    │         │
    │         ▼
    │    ERROR_EVENT
    │         │
    │    ┌────┴────┐
    │    │         │
    │ [Retryable] [Fatal]
    │    │         │
    │    ▼         ▼
    │  RETRY    ABANDON
    │    │         │
    │    ├──> Retry Logic
    │    │         │
    │    ▼         ▼
    │ [Success] [Show Error]
    │    │
    │    └──> Resume from previous state
    │
    └──────────────────────────────────────────────────────────────────
```

---

## API Calls

### Complete API Specification

#### 1. Create Interview

**Request:**
```http
POST /api/v1/interviews
Content-Type: application/json
Authorization: Bearer <token>

{
  "userId": "user123",
  "topic": "React",
  "difficulty": "Intermediate",
  "experienceYears": 3,
  "totalQuestions": 10,
  "interviewType": "technical",
  "jobDescription": "Senior React Developer..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interviewId": "int_abc123",
    "status": "in-progress",
    "currentQuestion": {
      "questionId": "q_1",
      "questionText": "Explain React hooks...",
      "sequenceNumber": 1,
      "expectedKeywords": ["useState", "useEffect"]
    },
    "progress": {
      "questionsAsked": 1,
      "questionsAnswered": 0,
      "totalQuestions": 10
    }
  }
}
```

**Errors:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid difficulty level",
    "details": {...}
  }
}
```

---

#### 2. Submit Answer

**Request:**
```http
POST /api/v1/interviews/:interviewId/answers
Content-Type: application/json
Authorization: Bearer <token>

{
  "questionId": "q_1",
  "transcript": "React hooks are functions that...",
  "answerDuration": 120,
  "recordingMetadata": {
    "language": "en-US",
    "transcriptionConfidence": 0.95
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "answerId": "ans_xyz789",
    "evaluation": {
      "scores": {
        "technical": 8,
        "communication": 7,
        "leadership": 6,
        "problemSolving": 8,
        "confidence": 7,
        "overall": 7.2
      },
      "feedback": {
        "strengths": ["Clear explanation", "Good examples"],
        "weaknesses": ["Could mention hooks rules"],
        "suggestions": ["Study useEffect dependencies"]
      },
      "grade": "Good"
    },
    "nextQuestion": {
      "questionId": "q_2",
      "questionText": "How does useEffect work?",
      "sequenceNumber": 2
    },
    "progress": {
      "questionsAsked": 2,
      "questionsAnswered": 1,
      "questionsEvaluated": 1,
      "totalQuestions": 10,
      "completionPercentage": 10
    }
  }
}
```

---

#### 3. Generate Follow-up Question

**Request:**
```http
POST /api/v1/interviews/:interviewId/follow-up
Content-Type: application/json
Authorization: Bearer <token>

{
  "questionId": "q_1",
  "answerId": "ans_xyz789"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "questionId": "q_1a",
    "questionText": "Can you explain the dependency array in useEffect?",
    "questionType": "follow-up",
    "parentQuestionId": "q_1",
    "reason": "Answer showed good understanding, probing deeper"
  }
}
```

---

#### 4. Get Interview Status

**Request:**
```http
GET /api/v1/interviews/:interviewId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interviewId": "int_abc123",
    "status": "in-progress",
    "progress": {
      "questionsAsked": 5,
      "questionsAnswered": 4,
      "questionsEvaluated": 4,
      "currentQuestionNumber": 5,
      "totalQuestions": 10,
      "completionPercentage": 40
    },
    "currentQuestion": {
      "questionId": "q_5",
      "questionText": "...",
      "sequenceNumber": 5
    },
    "createdAt": "2026-06-09T10:00:00Z",
    "updatedAt": "2026-06-09T10:15:00Z"
  }
}
```

---

#### 5. Complete Interview

**Request:**
```http
POST /api/v1/interviews/:interviewId/complete
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interviewId": "int_abc123",
    "status": "completed",
    "completedAt": "2026-06-09T10:30:00Z",
    "summary": {
      "totalQuestions": 10,
      "totalAnswered": 10,
      "totalEvaluated": 10,
      "averageScore": 7.5
    }
  }
}
```

---

#### 6. Generate Report

**Request:**
```http
POST /api/v1/interviews/:interviewId/report
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reportId": "rep_def456",
    "interviewId": "int_abc123",
    "report": {
      "summary": {
        "overallScore": 7.5,
        "totalQuestions": 10,
        "averageResponseTime": 120,
        "interviewDuration": 1800
      },
      "scoreBreakdown": {
        "technical": 8.0,
        "communication": 7.5,
        "leadership": 6.8,
        "problemSolving": 7.8,
        "confidence": 7.2
      },
      "insights": {
        "topStrengths": ["Technical knowledge", "Clear communication"],
        "topWeaknesses": ["Edge cases", "Performance optimization"],
        "improvementAreas": ["Advanced hooks", "Testing strategies"],
        "overallAssessment": "Strong candidate with solid React knowledge..."
      },
      "recommendations": {
        "studyTopics": ["Custom hooks", "React performance", "Testing"],
        "practiceAreas": ["Complex state management", "Performance optimization"],
        "resources": [...]
      }
    },
    "generatedAt": "2026-06-09T10:31:00Z"
  }
}
```

---

#### 7. Pause Interview

**Request:**
```http
POST /api/v1/interviews/:interviewId/pause
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interviewId": "int_abc123",
    "status": "paused",
    "pausedAt": "2026-06-09T10:20:00Z",
    "state": {
      "currentQuestionNumber": 5,
      "lastAction": "recording_stopped"
    }
  }
}
```

---

#### 8. Resume Interview

**Request:**
```http
POST /api/v1/interviews/:interviewId/resume
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interviewId": "int_abc123",
    "status": "in-progress",
    "resumedAt": "2026-06-09T10:25:00Z",
    "currentQuestion": {
      "questionId": "q_5",
      "questionText": "...",
      "sequenceNumber": 5
    }
  }
}
```

---

## Frontend Flow

### React Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────┘

App.tsx
 │
 ├─> InterviewSetupPage.tsx
 │   ├─> TopicSelector
 │   ├─> DifficultySelector
 │   ├─> ExperienceInput
 │   └─> QuestionCountSelector
 │
 ├─> ActiveInterviewPage.tsx
 │   ├─> InterviewHeader (progress, timer)
 │   ├─> QuestionDisplay (text + TTS)
 │   ├─> VoiceRecorder (mic control)
 │   ├─> TranscriptDisplay (real-time)
 │   └─> EvaluationFeedback (scores, feedback)
 │
 └─> InterviewReportPage.tsx
     ├─> ReportSummary (scores, charts)
     ├─> DetailedFeedback (strengths, weaknesses)
     └─> Recommendations (study topics, resources)
```

### State Management (Zustand)

```typescript
// stores/interviewStore.ts

interface InterviewStore {
  // State
  interview: Interview | null;
  currentState: InterviewState;
  currentQuestion: Question | null;
  isRecording: boolean;
  transcript: string;
  evaluation: Evaluation | null;
  error: Error | null;
  progress: Progress;

  // Actions
  startInterview: (config: InterviewConfig) => Promise<void>;
  nextQuestion: () => Promise<void>;
  startRecording: () => void;
  stopRecording: () => Promise<void>;
  submitAnswer: (transcript: string) => Promise<void>;
  completeInterview: () => Promise<void>;
  pauseInterview: () => Promise<void>;
  resumeInterview: () => Promise<void>;
  retryLastAction: () => Promise<void>;
  resetInterview: () => void;
}
```

### Component Flow

```typescript
// ActiveInterviewPage.tsx

import { useInterviewStore } from '@/stores/interviewStore';
import { useEffect } from 'react';

export function ActiveInterviewPage() {
  const {
    currentState,
    currentQuestion,
    isRecording,
    transcript,
    evaluation,
    progress,
    startRecording,
    stopRecording,
    nextQuestion,
    completeInterview,
  } = useInterviewStore();

  // Auto-play TTS when question is presented
  useEffect(() => {
    if (currentState === 'PRESENTING_QUESTION' && currentQuestion) {
      speakQuestion(currentQuestion.questionText);
    }
  }, [currentState, currentQuestion]);

  // Handle recording state
  const handleRecord = async () => {
    if (!isRecording) {
      await startRecording();
    } else {
      await stopRecording();
    }
  };

  // Handle next question
  const handleNext = async () => {
    if (progress.questionsAnswered < progress.totalQuestions) {
      await nextQuestion();
    } else {
      await completeInterview();
    }
  };

  return (
    <div className="interview-container">
      {/* Progress Bar */}
      <InterviewHeader progress={progress} />

      {/* Question Display */}
      {currentState === 'PRESENTING_QUESTION' && (
        <QuestionDisplay question={currentQuestion} />
      )}

      {/* Recording Controls */}
      {(currentState === 'RECORDING' || currentState === 'TRANSCRIBING') && (
        <VoiceRecorder
          isRecording={isRecording}
          onToggle={handleRecord}
          transcript={transcript}
        />
      )}

      {/* Evaluation Feedback */}
      {currentState === 'EVALUATING' && <LoadingSpinner />}
      {evaluation && (
        <EvaluationFeedback evaluation={evaluation} onNext={handleNext} />
      )}

      {/* Error State */}
      {currentState === 'ERROR' && (
        <ErrorDisplay error={error} onRetry={retryLastAction} />
      )}
    </div>
  );
}
```

Continue to Backend Flow...
