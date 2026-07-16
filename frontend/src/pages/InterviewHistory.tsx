import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Trash2, Eye, Loader2, AlertCircle } from 'lucide-react';
import { interviewAPI } from '../services/api';
import { Interview } from '../types';
import toast from 'react-hot-toast';

export default function InterviewHistory() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const { interviews: data } = await interviewAPI.getHistory();
      setInterviews(data);
    } catch (error) {
      console.error('Error loading history:', error);
      toast.error('Failed to load interview history');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this interview?')) {
      return;
    }

    try {
      await interviewAPI.deleteInterview(id);
      setInterviews(interviews.filter(i => i.id !== id));
      toast.success('Interview deleted successfully');
    } catch (error) {
      console.error('Error deleting interview:', error);
      toast.error('Failed to delete interview');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin mx-auto text-primary-600" size={48} />
          <p className="text-gray-600 dark:text-gray-400">Loading history...</p>
        </div>
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto text-gray-400 mb-4" size={64} />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          No Interviews Yet
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Start your first interview to build your practice history
        </p>
        <Link to="/setup" className="btn btn-primary">
          Start New Interview
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Interview History
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {interviews.length} {interviews.length === 1 ? 'interview' : 'interviews'} completed
          </p>
        </div>
        <Link to="/setup" className="btn btn-primary">
          New Interview
        </Link>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          title="Total Interviews"
          value={interviews.length.toString()}
          color="bg-blue-500"
        />
        <StatCard
          title="This Month"
          value={interviews.filter(i => {
            const date = new Date(i.createdAt);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
          }).length.toString()}
          color="bg-green-500"
        />
        <StatCard
          title="Completed"
          value={interviews.filter(i => i.status === 'completed').length.toString()}
          color="bg-purple-500"
        />
      </div>

      {/* Interview List */}
      <div className="space-y-4">
        {interviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

function InterviewCard({
  interview,
  onDelete,
}: {
  interview: Interview;
  onDelete: (id: string) => void;
}) {
  const statusColors = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    'in-progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    paused: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
  };

  return (
    <div className="card hover:shadow-xl transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {interview.topic}
            </h3>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[interview.status]}`}
            >
              {interview.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center space-x-1">
              <Clock size={16} />
              <span>
                {new Date(interview.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </span>
            <span>•</span>
            <span>{interview.difficulty}</span>
            <span>•</span>
            <span>{interview.experience} years experience</span>
            <span>•</span>
            <span>{interview.numberOfQuestions} questions</span>
          </div>
        </div>

        <div className="flex space-x-2 ml-4">
          {interview.status === 'completed' && (
            <Link
              to={`/report/${interview.id}`}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="View Report"
            >
              <Eye size={20} className="text-primary-600" />
            </Link>
          )}
          <button
            onClick={() => onDelete(interview.id)}
            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete"
          >
            <Trash2 size={20} className="text-red-600" />
          </button>
        </div>
      </div>

      {interview.jobDescription && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {interview.jobDescription}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="card">
      <div className="flex items-center space-x-4">
        <div
          className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center text-white font-bold text-xl`}
        >
          {value}
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
