import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Volume2, VolumeX, SkipForward, Pause, Play, Loader2 } from 'lucide-react';
import { useInterviewStore } from '../store';
import { interviewAPI } from '../services/api';
import { voiceService } from '../services/voice.service';
import toast from 'react-hot-toast';

export default function ActiveInterview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentInterview,
    currentQuestion,
    currentAnswer,
    isRecording,
    isProcessing,
    isSpeaking,
    questions,
    setCurrentInterview,
    setCurrentQuestion,
    setCurrentAnswer,
    setIsRecording,
    setIsProcessing,
    setIsSpeaking,
    addQuestion,
    addAnswer,
    addEvaluation,
  } = useInterviewStore();

  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (id && !currentInterview) {
      loadInterview();
    } else if (currentInterview && !currentQuestion) {
      generateNextQuestion();
    }
  }, [id, currentInterview]);

  const loadInterview = async () => {
    try {
      // In a real app, you might want to load the interview from the server
      // For now, we'll just generate the first question
      if (id) {
        generateNextQuestion();
      }
    } catch (error) {
      console.error('Error loading interview:', error);
      toast.error('Failed to load interview');
      navigate('/');
    }
  };

  const generateNextQuestion = async () => {
    if (!id) return;

    setIsLoadingQuestion(true);
    try {
      const { question } = await interviewAPI.generateQuestion(
        id,
        questions.map(q => q.questionText),
        currentAnswer,
        false
      );
      
      addQuestion(question);
      setCurrentQuestion(question);
      setCurrentAnswer('');
      setTranscript('');

      // Speak the question
      speakQuestion(question.questionText);
    } catch (error) {
      console.error('Error generating question:', error);
      toast.error('Failed to generate question');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const speakQuestion = (text: string) => {
    setIsSpeaking(true);
    voiceService.speak(text, () => {
      setIsSpeaking(false);
    });
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      voiceService.stopSpeaking();
      setIsSpeaking(false);
    } else if (currentQuestion) {
      speakQuestion(currentQuestion.questionText);
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setTranscript('');
    
    voiceService.startListening(
      (text, isFinal) => {
        setTranscript(text);
        if (isFinal) {
          setCurrentAnswer(prev => (prev + ' ' + text).trim());
        }
      },
      (error) => {
        console.error('Recording error:', error);
        toast.error('Failed to start recording');
        setIsRecording(false);
      }
    );
  };

  const stopRecording = () => {
    voiceService.stopListening();
    setIsRecording(false);
    if (transcript) {
      setCurrentAnswer(prev => (prev + ' ' + transcript).trim());
    }
  };

  const submitAnswer = async () => {
    if (!currentQuestion || !currentAnswer.trim()) {
      toast.error('Please provide an answer');
      return;
    }

    setIsProcessing(true);
    try {
      // Submit answer
      const { answer } = await interviewAPI.submitAnswer(currentQuestion.id, currentAnswer);
      addAnswer(currentQuestion.id, answer);

      // Evaluate answer
      const { evaluation } = await interviewAPI.evaluateAnswer(answer.id);
      addEvaluation(answer.id, evaluation);

      toast.success('Answer submitted and evaluated!');

      // Check if interview is complete
      if (questions.length >= (currentInterview?.numberOfQuestions || 10)) {
        toast.success('Interview completed!');
        navigate(`/report/${id}`);
      } else {
        // Generate next question
        setTimeout(() => generateNextQuestion(), 1000);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast.error('Failed to submit answer');
    } finally {
      setIsProcessing(false);
    }
  };

  const skipQuestion = () => {
    if (questions.length >= (currentInterview?.numberOfQuestions || 10)) {
      navigate(`/report/${id}`);
    } else {
      generateNextQuestion();
    }
  };

  if (!currentInterview || !currentQuestion) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin mx-auto text-primary-600" size={48} />
          <p className="text-gray-600 dark:text-gray-400">Loading interview...</p>
        </div>
      </div>
    );
  }

  const progress = ((questions.length) / currentInterview.numberOfQuestions) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {currentInterview.topic} Interview
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {currentInterview.difficulty} • {currentInterview.experience} years experience
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
            <p className="text-2xl font-bold text-primary-600">
              {questions.length} / {currentInterview.numberOfQuestions}
            </p>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="card">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Question {currentQuestion.questionNumber}
          </h3>
          <button
            onClick={toggleSpeech}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            disabled={isLoadingQuestion}
          >
            {isSpeaking ? (
              <VolumeX className="text-primary-600" size={24} />
            ) : (
              <Volume2 className="text-gray-600 dark:text-gray-400" size={24} />
            )}
          </button>
        </div>
        
        <p className="text-xl text-gray-800 dark:text-gray-200 leading-relaxed">
          {currentQuestion.questionText}
        </p>
      </div>

      {/* Answer Input */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Your Answer
        </h3>

        <textarea
          value={currentAnswer}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          placeholder="Click the microphone to start recording your answer, or type here..."
          rows={8}
          className="input mb-4"
          disabled={isRecording || isProcessing}
        />

        {/* Live Transcript */}
        {transcript && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">Recording: </span>
              {transcript}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          {/* Record Button */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="btn btn-primary flex items-center space-x-2"
              disabled={isProcessing || isSpeaking}
            >
              <Mic size={20} />
              <span>Start Recording</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="btn bg-red-600 text-white hover:bg-red-700 flex items-center space-x-2 recording-pulse"
            >
              <MicOff size={20} />
              <span>Stop Recording</span>
            </button>
          )}

          {/* Submit Button */}
          <button
            onClick={submitAnswer}
            className="btn btn-primary"
            disabled={!currentAnswer.trim() || isProcessing || isRecording}
          >
            {isProcessing ? (
              <span className="flex items-center space-x-2">
                <Loader2 className="animate-spin" size={20} />
                <span>Processing...</span>
              </span>
            ) : (
              'Submit Answer'
            )}
          </button>

          {/* Skip Button */}
          <button
            onClick={skipQuestion}
            className="btn btn-secondary flex items-center space-x-2"
            disabled={isProcessing || isRecording}
          >
            <SkipForward size={20} />
            <span>Skip Question</span>
          </button>

          {/* End Interview */}
          <button
            onClick={() => navigate(`/report/${id}`)}
            className="btn btn-danger ml-auto"
            disabled={isProcessing || isRecording}
          >
            End Interview
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="text-center text-sm text-gray-600 dark:text-gray-400">
        <p>💡 Tip: Speak clearly and provide detailed answers for better evaluation</p>
      </div>
    </div>
  );
}
