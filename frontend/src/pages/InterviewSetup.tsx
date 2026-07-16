import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { interviewAPI } from '../services/api';
import { useInterviewStore } from '../store';
import { TOPICS, DIFFICULTIES, QUESTION_COUNTS } from '../types';
import toast from 'react-hot-toast';

export default function InterviewSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentInterview, resetInterview } = useInterviewStore();

  const [formData, setFormData] = useState({
    topic: (location.state as any)?.topic || '',
    difficulty: 'Intermediate',
    experience: 3,
    numberOfQuestions: 10,
    jobDescription: '',
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.topic) {
      toast.error('Please select an interview topic');
      return;
    }

    setIsLoading(true);
    try {
      resetInterview();
      const { interview } = await interviewAPI.startInterview(formData);
      setCurrentInterview(interview);
      toast.success('Interview started!');
      navigate(`/interview/${interview.id}`);
    } catch (error) {
      console.error('Error starting interview:', error);
      toast.error('Failed to start interview. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Setup Your Interview
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Configure your interview session to match your preparation needs
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Topic Selection */}
        <div>
          <label className="label">Interview Topic *</label>
          <select
            value={formData.topic}
            onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
            className="input"
            required
          >
            <option value="">Select a topic</option>
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>

        {/* Difficulty */}
        <div>
          <label className="label">Difficulty Level *</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DIFFICULTIES.map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setFormData({ ...formData, difficulty: diff })}
                className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                  formData.difficulty === diff
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        {/* Experience */}
        <div>
          <label className="label">
            Years of Experience: {formData.experience} {formData.experience === 1 ? 'year' : 'years'}
          </label>
          <input
            type="range"
            min="0"
            max="20"
            value={formData.experience}
            onChange={(e) => setFormData({ ...formData, experience: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
            <span>0 years</span>
            <span>20+ years</span>
          </div>
        </div>

        {/* Number of Questions */}
        <div>
          <label className="label">Number of Questions *</label>
          <div className="grid grid-cols-4 gap-3">
            {QUESTION_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setFormData({ ...formData, numberOfQuestions: count })}
                className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                  formData.numberOfQuestions === count
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Job Description (Optional) */}
        <div>
          <label className="label">Job Description (Optional)</label>
          <textarea
            value={formData.jobDescription}
            onChange={(e) => setFormData({ ...formData, jobDescription: e.target.value })}
            placeholder="Paste the job description to get more relevant questions..."
            rows={6}
            className="input"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Adding a job description will help generate more targeted interview questions
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary flex items-center space-x-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <span>Start Interview</span>
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
