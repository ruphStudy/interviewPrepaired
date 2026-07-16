/**
 * OpenAI Service - Usage Examples
 * 
 * Complete examples demonstrating all OpenAI service methods
 * with real-world scenarios and best practices.
 */

import { getOpenAIService, InterviewTopic, DifficultyLevel } from './OpenAIService';

// ============================================================================
// Example 1: Basic Question Generation
// ============================================================================

async function example1_BasicQuestionGeneration() {
  console.log('Example 1: Basic Question Generation\n');
  
  const aiService = getOpenAIService();
  
  try {
    const question = await aiService.generateQuestion({
      topic: 'React',
      difficulty: 'intermediate',
      experienceYears: 3
    });
    
    console.log('Question:', question.question);
    console.log('\nExpected Points:');
    question.expectedPoints.forEach((point, i) => {
      console.log(`${i + 1}. ${point}`);
    });
    console.log('\nFollow-up Topics:');
    question.followUpTopics.forEach((topic, i) => {
      console.log(`${i + 1}. ${topic}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Example 2: Question with Context
// ============================================================================

async function example2_QuestionWithContext() {
  console.log('\nExample 2: Question with Context\n');
  
  const aiService = getOpenAIService();
  
  try {
    const question = await aiService.generateQuestion({
      topic: 'Node.js',
      difficulty: 'advanced',
      experienceYears: 5,
      previousQuestions: [
        'Explain the Node.js event loop',
        'What are streams in Node.js?'
      ],
      jobDescription: 'Senior Backend Engineer role focusing on microservices architecture with Express, MongoDB, and Redis. Must have experience with high-traffic APIs and real-time systems.'
    });
    
    console.log('Generated Question:', question.question);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Example 3: Answer Evaluation
// ============================================================================

async function example3_AnswerEvaluation() {
  console.log('\nExample 3: Answer Evaluation\n');
  
  const aiService = getOpenAIService();
  
  const question = 'Explain the difference between useMemo and useCallback in React';
  const answer = `useMemo and useCallback are both React Hooks used for performance optimization.

useMemo returns a memoized value - it recalculates the value only when one of its dependencies changes. It's useful for expensive calculations that you don't want to run on every render.

useCallback returns a memoized callback function. It's useful when passing callbacks to optimized child components that rely on reference equality to prevent unnecessary renders.

Both take a dependency array as their second argument. The key difference is useMemo returns the result of the function, while useCallback returns the function itself.`;

  try {
    const evaluation = await aiService.evaluateAnswer({
      topic: 'React',
      difficulty: 'intermediate',
      question,
      answer,
      experienceYears: 3
    });
    
    console.log('Evaluation Scores:');
    console.log(`Technical: ${evaluation.technicalScore}/10`);
    console.log(`Communication: ${evaluation.communicationScore}/10`);
    console.log(`Leadership: ${evaluation.leadershipScore}/10`);
    console.log(`Problem Solving: ${evaluation.problemSolvingScore}/10`);
    console.log(`Confidence: ${evaluation.confidenceScore}/10`);
    console.log(`Overall: ${evaluation.overallScore}/10`);
    
    console.log('\nStrengths:');
    evaluation.strengths.forEach((s, i) => console.log(`${i + 1}. ${s}`));
    
    console.log('\nWeaknesses:');
    evaluation.weaknesses.forEach((w, i) => console.log(`${i + 1}. ${w}`));
    
    console.log('\nSuggestions:');
    evaluation.suggestions.forEach((s, i) => console.log(`${i + 1}. ${s}`));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Example 4: Follow-Up Question
// ============================================================================

async function example4_FollowUpQuestion() {
  console.log('\nExample 4: Follow-Up Question\n');
  
  const aiService = getOpenAIService();
  
  try {
    const followUp = await aiService.generateFollowUpQuestion({
      topic: 'TypeScript',
      difficulty: 'advanced',
      originalQuestion: 'Explain TypeScript generics',
      answer: 'Generics allow you to create reusable components that can work with multiple types. They provide type safety while maintaining flexibility. For example, Array<T> is a generic where T can be any type.',
      experienceYears: 4
    });
    
    console.log('Follow-up Question:', followUp.question);
    console.log('Reason:', followUp.reason);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Example 5: Final Report Generation
// ============================================================================

async function example5_FinalReportGeneration() {
  console.log('\nExample 5: Final Report Generation\n');
  
  const aiService = getOpenAIService();
  
  // Simulated evaluations from multiple questions
  const evaluations = [
    {
      question: 'Explain MongoDB indexing',
      answer: 'Indexes improve query performance by creating data structures...',
      evaluation: {
        technicalScore: 8.5,
        communicationScore: 9.0,
        leadershipScore: 7.0,
        problemSolvingScore: 8.0,
        confidenceScore: 8.5,
        overallScore: 8.2,
        strengths: ['Clear explanation', 'Good understanding'],
        weaknesses: ['Could mention compound indexes'],
        suggestions: ['Study index strategies'],
        missingPoints: ['Index intersection']
      }
    },
    {
      question: 'When to use embedded vs referenced documents?',
      answer: 'Embedded documents are good for 1-to-few relationships...',
      evaluation: {
        technicalScore: 9.0,
        communicationScore: 8.5,
        leadershipScore: 7.5,
        problemSolvingScore: 8.5,
        confidenceScore: 8.0,
        overallScore: 8.3,
        strengths: ['Excellent trade-off analysis'],
        weaknesses: ['Missing atomicity discussion'],
        suggestions: ['Review transactions'],
        missingPoints: ['Document size limits']
      }
    },
    {
      question: 'Explain MongoDB aggregation pipeline',
      answer: 'The aggregation pipeline processes documents through stages...',
      evaluation: {
        technicalScore: 8.0,
        communicationScore: 8.0,
        leadershipScore: 7.0,
        problemSolvingScore: 7.5,
        confidenceScore: 7.5,
        overallScore: 7.6,
        strengths: ['Good stage examples'],
        weaknesses: ['Limited optimization knowledge'],
        suggestions: ['Practice complex pipelines'],
        missingPoints: ['$lookup performance']
      }
    }
  ];

  try {
    const report = await aiService.generateFinalReport({
      topic: 'MongoDB',
      difficulty: 'intermediate',
      experienceYears: 4,
      evaluations
    });
    
    console.log(`Overall Score: ${report.overallScore}/10`);
    console.log(`\nSummary:\n${report.summary}`);
    
    console.log('\nKey Strengths:');
    report.strengthsOverview.forEach((s, i) => console.log(`${i + 1}. ${s}`));
    
    console.log('\nAreas for Improvement:');
    report.weaknessesOverview.forEach((w, i) => console.log(`${i + 1}. ${w}`));
    
    console.log('\nRecommendations:');
    report.recommendations.forEach((r, i) => console.log(`${i + 1}. ${r}`));
    
    console.log('\nNext Steps:');
    report.nextSteps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Example 6: Complete Interview Flow
// ============================================================================

async function example6_CompleteInterviewFlow() {
  console.log('\nExample 6: Complete Interview Flow\n');
  
  const aiService = getOpenAIService();
  
  // Interview configuration
  const config = {
    topic: 'React' as InterviewTopic,
    difficulty: 'intermediate' as DifficultyLevel,
    experienceYears: 3,
    totalQuestions: 3
  };
  
  console.log(`Starting ${config.topic} interview at ${config.difficulty} level...`);
  
  try {
    // Step 1: Test connection
    const connected = await aiService.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to OpenAI');
    }
    console.log('✓ Connected to OpenAI');
    
    const previousQuestions: string[] = [];
    const evaluations: any[] = [];
    
    // Step 2: Conduct interview
    for (let i = 0; i < config.totalQuestions; i++) {
      console.log(`\n--- Question ${i + 1} ---`);
      
      // Generate question
      const questionResult = await aiService.generateQuestion({
        topic: config.topic,
        difficulty: config.difficulty,
        experienceYears: config.experienceYears,
        previousQuestions
      });
      
      console.log(`Q: ${questionResult.question}`);
      previousQuestions.push(questionResult.question);
      
      // Simulate answer (in real app, get from user)
      const answer = `This is a simulated answer for question ${i + 1}. In a real application, this would come from the candidate's voice recording and transcription.`;
      console.log(`A: ${answer}`);
      
      // Evaluate answer
      const evaluation = await aiService.evaluateAnswer({
        topic: config.topic,
        difficulty: config.difficulty,
        question: questionResult.question,
        answer,
        experienceYears: config.experienceYears
      });
      
      console.log(`Score: ${evaluation.overallScore}/10`);
      
      evaluations.push({
        question: questionResult.question,
        answer,
        evaluation
      });
      
      // Optional: Generate follow-up
      if (i === 0) {
        const followUp = await aiService.generateFollowUpQuestion({
          topic: config.topic,
          difficulty: config.difficulty,
          originalQuestion: questionResult.question,
          answer,
          experienceYears: config.experienceYears
        });
        console.log(`Follow-up: ${followUp.question}`);
      }
    }
    
    // Step 3: Generate final report
    console.log('\n--- Generating Final Report ---');
    const report = await aiService.generateFinalReport({
      topic: config.topic,
      difficulty: config.difficulty,
      experienceYears: config.experienceYears,
      evaluations
    });
    
    console.log(`\nFinal Score: ${report.overallScore}/10`);
    console.log(`Summary: ${report.summary.substring(0, 150)}...`);
    
  } catch (error) {
    console.error('Interview failed:', error.message);
  }
}

// ============================================================================
// Example 7: Error Handling
// ============================================================================

async function example7_ErrorHandling() {
  console.log('\nExample 7: Error Handling\n');
  
  const aiService = getOpenAIService();
  
  // Example 1: Invalid API key (will fail)
  try {
    // This would fail if API key is invalid
    const question = await aiService.generateQuestion({
      topic: 'React',
      difficulty: 'intermediate',
      experienceYears: 3
    });
  } catch (error) {
    if (error.message.includes('authentication')) {
      console.error('Authentication error: Check your OPENAI_API_KEY');
    } else if (error.message.includes('rate limit')) {
      console.error('Rate limit exceeded: Wait and retry');
    } else if (error.message.includes('unavailable')) {
      console.error('Service unavailable: Try again later');
    } else {
      console.error('Unknown error:', error.message);
    }
  }
  
  // Example 2: With retry logic
  async function generateWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const question = await aiService.generateQuestion({
          topic: 'Node.js',
          difficulty: 'advanced',
          experienceYears: 5
        });
        return question;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.log(`Attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
}

// ============================================================================
// Example 8: Multi-Topic Interview
// ============================================================================

async function example8_MultiTopicInterview() {
  console.log('\nExample 8: Multi-Topic Interview\n');
  
  const aiService = getOpenAIService();
  
  const topics: InterviewTopic[] = ['React', 'TypeScript', 'Node.js'];
  
  console.log('Generating questions for multiple topics...\n');
  
  try {
    const questions = await Promise.all(
      topics.map(topic =>
        aiService.generateQuestion({
          topic,
          difficulty: 'intermediate',
          experienceYears: 3
        })
      )
    );
    
    topics.forEach((topic, i) => {
      console.log(`${topic}:`);
      console.log(questions[i].question);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Example 9: Configuration Management
// ============================================================================

async function example9_ConfigurationManagement() {
  console.log('\nExample 9: Configuration Management\n');
  
  const aiService = getOpenAIService();
  
  // Get current config
  const config = aiService.getConfig();
  console.log('Current Configuration:');
  console.log(`Model: ${config.model}`);
  console.log(`Temperature: ${config.temperature}`);
  console.log(`Max Retries: ${config.maxRetries}`);
  console.log(`Timeout: ${config.timeout}ms`);
  
  // Use GPT-3.5 for cost savings
  console.log('\nSwitching to GPT-3.5-turbo for questions...');
  aiService.setModel('gpt-3.5-turbo');
  
  const question = await aiService.generateQuestion({
    topic: 'React',
    difficulty: 'beginner',
    experienceYears: 1
  });
  
  console.log('Question generated with GPT-3.5');
  
  // Switch back to GPT-4 for evaluations
  console.log('\nSwitching to GPT-4 for evaluation...');
  aiService.setModel('gpt-4');
  
  const evaluation = await aiService.evaluateAnswer({
    topic: 'React',
    difficulty: 'beginner',
    question: question.question,
    answer: 'Sample answer',
    experienceYears: 1
  });
  
  console.log('Evaluation done with GPT-4');
  console.log(`Score: ${evaluation.overallScore}/10`);
}

// ============================================================================
// Example 10: Leadership Interview
// ============================================================================

async function example10_LeadershipInterview() {
  console.log('\nExample 10: Leadership Interview\n');
  
  const aiService = getOpenAIService();
  
  try {
    const question = await aiService.generateQuestion({
      topic: 'Team Lead',
      difficulty: 'advanced',
      experienceYears: 7,
      jobDescription: 'Technical Team Lead for a team of 8 engineers. Responsible for technical decisions, mentoring, code reviews, and sprint planning.'
    });
    
    console.log('Leadership Question:', question.question);
    console.log('\nExpected Discussion Points:');
    question.expectedPoints.forEach((point, i) => {
      console.log(`${i + 1}. ${point}`);
    });
    
    // Evaluate a leadership answer
    const answer = `I believe in collaborative decision-making. When facing a technical decision, I gather input from the team, present the options with trade-offs, and facilitate a discussion. I ensure everyone's voice is heard, especially junior members. Once we reach consensus, I document the decision and rationale. If there's no consensus, I make the final call based on technical merit and business impact, while explaining my reasoning to the team.`;
    
    const evaluation = await aiService.evaluateAnswer({
      topic: 'Team Lead',
      difficulty: 'advanced',
      question: question.question,
      answer,
      experienceYears: 7
    });
    
    console.log('\nLeadership Evaluation:');
    console.log(`Leadership Score: ${evaluation.leadershipScore}/10`);
    console.log(`Communication Score: ${evaluation.communicationScore}/10`);
    console.log(`Problem Solving Score: ${evaluation.problemSolvingScore}/10`);
    console.log(`Overall: ${evaluation.overallScore}/10`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   OpenAI Service - Usage Examples             ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Run examples sequentially
  await example1_BasicQuestionGeneration();
  await example2_QuestionWithContext();
  await example3_AnswerEvaluation();
  await example4_FollowUpQuestion();
  await example5_FinalReportGeneration();
  await example6_CompleteInterviewFlow();
  await example7_ErrorHandling();
  await example8_MultiTopicInterview();
  await example9_ConfigurationManagement();
  await example10_LeadershipInterview();
  
  console.log('\n✓ All examples completed!');
}

// Export examples
export {
  example1_BasicQuestionGeneration,
  example2_QuestionWithContext,
  example3_AnswerEvaluation,
  example4_FollowUpQuestion,
  example5_FinalReportGeneration,
  example6_CompleteInterviewFlow,
  example7_ErrorHandling,
  example8_MultiTopicInterview,
  example9_ConfigurationManagement,
  example10_LeadershipInterview,
  runAllExamples
};

// Run if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
