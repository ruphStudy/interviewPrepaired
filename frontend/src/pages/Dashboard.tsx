import { Link } from 'react-router-dom';
import { PlayCircle, Clock, TrendingUp, Award } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
          AI Interview Coach
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Practice technical, leadership, and managerial interviews with AI-powered voice interaction.
          Get instant feedback and improve your interview skills.
        </p>
        <Link
          to="/setup"
          className="inline-flex items-center space-x-2 bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-700 transition-colors shadow-lg hover:shadow-xl"
        >
          <PlayCircle size={24} />
          <span>Start New Interview</span>
        </Link>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
        <FeatureCard
          icon={<PlayCircle className="text-primary-600" size={32} />}
          title="Voice Interview"
          description="Practice with realistic AI interviewer using voice interaction"
        />
        <FeatureCard
          icon={<Clock className="text-green-600" size={32} />}
          title="Instant Feedback"
          description="Get immediate evaluation and scores after each answer"
        />
        <FeatureCard
          icon={<TrendingUp className="text-blue-600" size={32} />}
          title="Track Progress"
          description="Monitor your improvement over multiple interview sessions"
        />
        <FeatureCard
          icon={<Award className="text-purple-600" size={32} />}
          title="Expert Analysis"
          description="Receive detailed insights and improvement suggestions"
        />
      </div>

      {/* Interview Categories */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Interview Categories
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <CategoryCard key={category.name} {...category} />
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-12 grid md:grid-cols-3 gap-6">
        <StatCard title="Total Interviews" value="0" color="bg-blue-500" />
        <StatCard title="Average Score" value="N/A" color="bg-green-500" />
        <StatCard title="Improvement" value="N/A" color="bg-purple-500" />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card text-center space-y-3">
      <div className="flex justify-center">{icon}</div>
      <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}

function CategoryCard({ name, description, icon }: { name: string; description: string; icon: string }) {
  return (
    <Link
      to="/setup"
      state={{ topic: name }}
      className="card hover:shadow-xl transition-shadow cursor-pointer group"
    >
      <div className="flex items-start space-x-3">
        <div className="text-3xl">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors">
            {name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="card">
      <div className="flex items-center space-x-4">
        <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center text-white font-bold text-xl`}>
          {value === 'N/A' ? '?' : value}
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

const categories = [
  { name: 'Node.js', description: 'Backend development interviews', icon: '🟢' },
  { name: 'React', description: 'Frontend framework interviews', icon: '⚛️' },
  { name: 'System Design', description: 'Architecture and scalability', icon: '🏗️' },
  { name: 'TypeScript', description: 'Type-safe JavaScript interviews', icon: '🔷' },
  { name: 'Team Lead', description: 'Leadership and management', icon: '👥' },
  { name: 'Engineering Manager', description: 'Technical management', icon: '📊' },
];
