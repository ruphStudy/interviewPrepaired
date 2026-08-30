/**
 * Backfill script to add expected answers to existing interview questions
 * Run with: node add-expected-answers.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function connectDB() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/interview-coach';
  await mongoose.connect(mongoURI);
  console.log('✓ Connected to MongoDB');
}

// Get Interview model
const interviewSchema = new mongoose.Schema({}, { strict: false });
const Interview = mongoose.model('Interview', interviewSchema, 'interviews');

async function backfillExpectedAnswers() {
  try {
    await connectDB();
    
    // Find all interviews that have questions without modelAnswer
    const interviews = await Interview.find({
      'questions.evaluation': { $exists: true },
      'questions.modelAnswer': { $exists: false }
    });
    
    console.log(`\nFound ${interviews.length} interviews to update\n`);
    
    for (const interview of interviews) {
      let updated = false;
      
      for (let i = 0; i < interview.questions.length; i++) {
        const q = interview.questions[i];
        
        // Skip if already has modelAnswer
        if (q.modelAnswer) continue;
        
        // Skip if no question text
        if (!q.questionText) continue;
        
        // Generate a basic expected answer based on question type
        const modelAnswer = generateExpectedAnswer(
          q.questionText,
          q.questionType || 'technical-concept',
          interview.experienceLevel || 'professional',
          interview.topic
        );
        
        interview.questions[i].modelAnswer = modelAnswer;
        updated = true;
        
        console.log(`  ✓ Added expected answer to question ${i + 1}: "${q.questionText.substring(0, 60)}..."`);
      }
      
      if (updated) {
        await interview.save();
        console.log(`✓ Saved interview ${interview._id}\n`);
      }
    }
    
    console.log('✓ Backfill complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

function generateExpectedAnswer(question, questionType, level, topic) {
  const isAdvanced = level === 'senior' || level === 'expert';
  const isBeginner = level === 'student' || level === 'entry';
  
  // Generate answer based on question type
  if (questionType === 'behavioral' || questionType === 'leadership') {
    return `**Expected Answer (STAR Format):**

**Situation:** Describe a specific context where you faced this challenge. Include relevant details about the team, project, or environment.

**Task:** Clearly explain your role and responsibility in that situation. What was expected of you?

**Action:** Detail the specific steps you took to address the challenge. Focus on your individual contributions and decision-making process.

**Result:** Share measurable outcomes and impact. Include metrics, team feedback, or lessons learned.

${isAdvanced ? '**Advanced Insight:** As a senior professional, also discuss how this experience shaped your leadership approach, what you would do differently now, and how you\'ve applied these lessons in subsequent situations.' : ''}`;
  }
  
  if (questionType === 'system-design' || questionType === 'architecture') {
    return `**Expected Answer:**

**Requirements:** Clarify functional and non-functional requirements. Ask about scale, users, and constraints.

**High-Level Design:** Propose a scalable architecture with main components (e.g., load balancer, API gateway, microservices, database, cache).

**Data Flow:** Explain how data moves through the system. Identify critical paths.

**Scalability:** Discuss horizontal scaling, sharding, replication, and caching strategies.

**Trade-offs:** ${isAdvanced ? 'Analyze CAP theorem implications, consistency models, and when to choose different database types (SQL vs NoSQL). Discuss service mesh, event-driven architecture, and observability.' : 'Mention basic trade-offs like consistency vs availability, SQL vs NoSQL based on use case.'}

**Failure Handling:** ${isAdvanced ? 'Cover circuit breakers, retry policies with exponential backoff, idempotency, distributed tracing, and disaster recovery.' : 'Discuss basic retry logic, error handling, and logging.'}`;
  }
  
  if (questionType === 'coding' || questionType === 'debugging') {
    return `**Expected Answer:**

**Understanding:** Restate the problem in your own words. Clarify input/output and edge cases.

**Approach:** ${isBeginner ? 'Outline a simple, working solution. Explain your logic step-by-step.' : 'Discuss 2-3 possible approaches and choose the optimal one based on time/space complexity.'}

**Implementation:** Write clean, readable code with meaningful variable names. ${isAdvanced ? 'Apply design patterns where appropriate. Consider extensibility and maintainability.' : ''}

**Example:**
\`\`\`javascript
// Provide working code with comments
function solve(input) {
  // Step 1: Handle edge cases
  if (!input) return null;
  
  // Step 2: Main logic
  // ...
  
  // Step 3: Return result
  return result;
}
\`\`\`

**Complexity:** ${isBeginner ? 'Mention basic time and space complexity (e.g., O(n)).' : `Provide detailed complexity analysis. Time: O(...), Space: O(...). ${isAdvanced ? 'Discuss amortized complexity if applicable.' : ''}`}

**Testing:** ${isAdvanced ? 'Cover unit tests, integration tests, edge cases, and boundary conditions. Mention testing frameworks and mocking strategies.' : 'Describe basic test cases including edge cases like empty input, single element, and large input.'}`;
  }
  
  // Default for technical/fundamentals/comparison questions
  return `**Expected Answer:**

**What:** ${isBeginner ? 'Provide a clear, simple definition of the concept.' : `Define the concept with technical accuracy. ${isAdvanced ? 'Include historical context or RFC/specification references if relevant.' : ''}`}

**Why:** Explain the purpose and benefits. ${isAdvanced ? 'Discuss the problem it solves in real-world systems and why alternatives might not be suitable.' : 'Mention where and why it\'s commonly used.'}

**How:** ${isBeginner ? 'Describe how it works in simple terms with a basic example.' : `Explain the internal mechanism or algorithm. ${isAdvanced ? 'Cover implementation details, performance characteristics, and gotchas.' : ''}`}

**Where/When:** ${isBeginner ? 'Give 1-2 examples of where you\'d use this.' : `Provide specific use cases. ${isAdvanced ? 'Compare with alternatives and explain trade-offs in different scenarios (e.g., microservices vs monolith, REST vs GraphQL).' : ''}`}

**Example:** 
${isBeginner ? 'Show a simple, practical code snippet or real-world scenario.' : `Provide a realistic production example. ${isAdvanced ? 'Include error handling, edge cases, and best practices.' : ''}`}

**Common Pitfalls:** ${isAdvanced ? 'Discuss common mistakes, anti-patterns, performance issues, and debugging strategies. Mention how to avoid memory leaks, race conditions, or security vulnerabilities.' : 'Mention 1-2 common mistakes developers make.'}

${isAdvanced ? '\n**Industry Best Practices:** Reference established patterns (e.g., Gang of Four, 12-Factor App), performance optimization techniques, and how this fits into enterprise architecture.' : ''}`;
}

// Run the script
backfillExpectedAnswers();
