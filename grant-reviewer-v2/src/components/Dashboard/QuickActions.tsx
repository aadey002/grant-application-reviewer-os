import React from 'react';
import { Link } from 'react-router-dom';
import { Upload, FolderPlus, Search, FileText, CheckSquare } from 'lucide-react';

const QuickActions: React.FC = () => {
  const actions = [
    {
      title: 'Upload Document',
      description: 'Add a new grant application',
      icon: Upload,
      href: '/documents',
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      title: 'Create Folder',
      description: 'Organize your documents',
      icon: FolderPlus,
      href: '/documents',
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      title: 'Start Evaluation',
      description: 'Begin grant assessment',
      icon: CheckSquare,
      href: '/evaluations',
      color: 'bg-purple-500 hover:bg-purple-600',
    },
    {
      title: 'Search Documents',
      description: 'Find specific content',
      icon: Search,
      href: '/search',
      color: 'bg-orange-500 hover:bg-orange-600',
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Quick Actions
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          
          return (
            <Link
              key={index}
              to={action.href}
              className="group p-4 border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white mb-3 ${action.color} group-hover:scale-105 transition-transform`}>
                <Icon className="w-5 h-5" />
              </div>
              
              <h4 className="font-medium text-slate-900 mb-1">
                {action.title}
              </h4>
              
              <p className="text-sm text-slate-600">
                {action.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default QuickActions;
