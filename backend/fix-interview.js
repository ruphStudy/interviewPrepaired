const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'interview-coach';
const interviewId = '6a292f276032df1b9e9653ee';

async function fixInterview() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(dbName);
    const interviews = db.collection('interviews');
    
    const interview = await interviews.findOne({ _id: new ObjectId(interviewId) });
    
    if (!interview) {
      console.error('❌ Interview not found');
      return;
    }
    
    console.log(`📝 Found interview: ${interview.topic}`);
    
    const evaluatedQuestions = interview.questions.filter(q => q.evaluation);
    console.log(`📝 Evaluated questions: ${evaluatedQuestions.length}`);
    
    if (evaluatedQuestions.length === 0) {
      console.error('❌ No evaluated questions');
      return;
    }
    
    const totalScores = evaluatedQuestions.reduce((acc, q) => {
      const e = q.evaluation;
      return {
        technical: acc.technical + (e.technicalScore || 0),
        communication: acc.communication + (e.communicationScore || 0),
        leadership: acc.leadership + (e.leadershipScore || 0),
        problemSolving: acc.problemSolving + (e.problemSolvingScore || 0),
        confidence: acc.confidence + (e.confidenceScore || 0),
        overall: acc.overall + (e.overallScore || 0),
      };
    }, { technical: 0, communication: 0, leadership: 0, problemSolving: 0, confidence: 0, overall: 0 });
    
    const count = evaluatedQuestions.length;
    const avgScores = {
      averageTechnicalScore: parseFloat((totalScores.technical / count).toFixed(2)),
      averageCommunicationScore: parseFloat((totalScores.communication / count).toFixed(2)),
      averageLeadershipScore: parseFloat((totalScores.leadership / count).toFixed(2)),
      averageProblemSolvingScore: parseFloat((totalScores.problemSolving / count).toFixed(2)),
      averageConfidenceScore: parseFloat((totalScores.confidence / count).toFixed(2)),
      averageOverallScore: parseFloat((totalScores.overall / count).toFixed(2)),
    };
    
    console.log('📊 Calculated scores:', avgScores);
    
    const result = await interviews.updateOne(
      { _id: new ObjectId(interviewId) },
      { 
        $set: { 
          'finalReport.averageTechnicalScore': avgScores.averageTechnicalScore,
          'finalReport.averageCommunicationScore': avgScores.averageCommunicationScore,
          'finalReport.averageLeadershipScore': avgScores.averageLeadershipScore,
          'finalReport.averageProblemSolvingScore': avgScores.averageProblemSolvingScore,
          'finalReport.averageConfidenceScore': avgScores.averageConfidenceScore,
          'finalReport.averageOverallScore': avgScores.averageOverallScore,
        } 
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} interview(s)`);
    console.log('✅ FIXED! Refresh browser (Cmd+R) to see scores.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

fixInterview();
