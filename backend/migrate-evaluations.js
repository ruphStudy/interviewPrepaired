const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'interview-coach';

// Map experience years to new experience levels
function mapExperienceLevel(years) {
  if (years === 0) return 'student';
  if (years <= 2) return 'entry';
  if (years <= 5) return 'professional';
  if (years <= 10) return 'senior';
  return 'expert';
}

// Convert old fixed scores to new dynamic dimensions
function convertEvaluationToDynamic(oldEvaluation, topic) {
  const topicLower = topic.toLowerCase();
  
  // Determine dimensions based on topic
  let dimensions;
  
  if (isTechnicalTopic(topicLower)) {
    dimensions = [
      { name: 'technical', label: 'Technical Knowledge', score: oldEvaluation.technicalScore || 0, description: 'Accuracy and depth of technical knowledge' },
      { name: 'problemSolving', label: 'Problem Solving', score: oldEvaluation.problemSolvingScore || 0, description: 'Analytical thinking and solution approach' },
      { name: 'communication', label: 'Communication', score: oldEvaluation.communicationScore || 0, description: 'Clarity in explaining concepts' },
      { name: 'confidence', label: 'Confidence', score: oldEvaluation.confidenceScore || 0, description: 'Professional presentation' },
    ];
  } else if (isLeadershipTopic(topicLower)) {
    dimensions = [
      { name: 'leadership', label: 'Leadership', score: oldEvaluation.leadershipScore || 0, description: 'Decision-making and team guidance' },
      { name: 'communication', label: 'Communication', score: oldEvaluation.communicationScore || 0, description: 'Clarity and persuasiveness' },
      { name: 'problemSolving', label: 'Problem Solving', score: oldEvaluation.problemSolvingScore || 0, description: 'Strategic thinking' },
      { name: 'confidence', label: 'Confidence', score: oldEvaluation.confidenceScore || 0, description: 'Professional presence' },
    ];
  } else {
    // Generic
    dimensions = [
      { name: 'domainKnowledge', label: 'Domain Knowledge', score: oldEvaluation.technicalScore || 0, description: `Knowledge of ${topic}` },
      { name: 'communication', label: 'Communication', score: oldEvaluation.communicationScore || 0, description: 'Clarity and structure' },
      { name: 'problemSolving', label: 'Problem Solving', score: oldEvaluation.problemSolvingScore || 0, description: 'Analytical approach' },
      { name: 'confidence', label: 'Confidence', score: oldEvaluation.confidenceScore || 0, description: 'Professional presentation' },
    ];
  }

  return {
    dimensions,
    overallScore: oldEvaluation.overallScore || 0,
    strengths: oldEvaluation.strengths || [],
    weaknesses: oldEvaluation.weaknesses || [],
    suggestions: oldEvaluation.suggestions || [],
    missingPoints: oldEvaluation.missingPoints || [],
  };
}

function isTechnicalTopic(topic) {
  const techKeywords = ['developer', 'engineer', 'programmer', 'software', 'web', 'mobile', 'node', 'react', 'angular', 'python', 'java', 'testing'];
  return techKeywords.some(keyword => topic.includes(keyword));
}

function isLeadershipTopic(topic) {
  const leaderKeywords = ['manager', 'lead', 'director', 'executive', 'ceo', 'cto', 'head'];
  return leaderKeywords.some(keyword => topic.includes(keyword));
}

async function migrateDatabase() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(dbName);
    const interviews = db.collection('interviews');
    
    // Find all interviews
    const allInterviews = await interviews.find({}).toArray();
    console.log(`📊 Found ${allInterviews.length} interviews to migrate`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const interview of allInterviews) {
      try {
        // Add experienceLevel if not exists
        const experienceLevel = interview.experienceLevel || mapExperienceLevel(interview.experienceYears || 0);
        
        // Add interviewStyle if not exists
        const interviewStyle = interview.interviewStyle || 'general';
        
        // Convert question evaluations
        const updatedQuestions = interview.questions?.map(question => {
          if (question.evaluation) {
            // Check if already migrated
            if (question.evaluation.dimensions) {
              return question; // Already migrated
            }
            
            // Convert old evaluation to new format
            const newEvaluation = convertEvaluationToDynamic(question.evaluation, interview.topic);
            return {
              ...question,
              evaluation: newEvaluation
            };
          }
          return question;
        });
        
        // Convert final report if exists
        let finalReport = interview.finalReport;
        if (finalReport && !finalReport.interviewReadinessScore) {
          finalReport = {
            ...finalReport,
            interviewReadinessScore: finalReport.overallScore || 0,
            suggestedLearningPath: finalReport.recommendations || [],
            recommendedNextTopics: [],
          };
        }
        
        // Update interview
        await interviews.updateOne(
          { _id: interview._id },
          {
            $set: {
              experienceLevel,
              interviewStyle,
              questions: updatedQuestions,
              finalReport,
              migratedAt: new Date(),
              migrationVersion: '2.0'
            }
          }
        );
        
        migratedCount++;
        console.log(`✅ Migrated interview ${interview._id}`);
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating interview ${interview._id}:`, error.message);
      }
    }
    
    console.log('\n🎉 Migration Complete!');
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${allInterviews.length}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('👋 Database connection closed');
  }
}

// Run migration
console.log('🚀 Starting database migration...\n');
migrateDatabase()
  .then(() => {
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
