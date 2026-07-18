import React from 'react';
import { FileText, CheckSquare, Upload, Clock } from 'lucide-react';

import type { RecentActivity as Activity } from '@/types/api-responses';

interface RecentActivityProps {
  activities: Activity[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ activities }) => {
  const getActivityIcon = (agency: string) => {
    switch (agency) {
      case 'HRSA':
        return FileText;
      case 'SAMHSA':
        return FileText;
      default:
        return Upload;
    }
  };

  const getActivityColor = (agency: string) => {
    switch (agency) {
      case 'HRSA':
        return 'text-blue-600 bg-blue-100';
      case 'SAMHSA':
        return 'text-green-600 bg-green-100';
      case 'NIH':
        return 'text-purple-600 bg-purple-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimestamp = (created_at: string) => {
    const date = new Date(created_at);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Recent Activity
        </h3>
        <div className="text-center py-8 text-slate-500">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No recent activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Recent Activity
      </h3>
      
      <div className="space-y-4">
        {activities.slice(0, 5).map((activity, index) => {
          const Icon = getActivityIcon(activity.agency);
          const colorClass = getActivityColor(activity.agency);
          
          return (
            <div key={activity.id || index} className="flex items-start space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {activity.title}
                </p>
                <p className="text-xs text-slate-500">
                  {activity.agency} • {formatTimestamp(activity.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      
      {activities.length > 5 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all activity
          </button>
        </div>
      )}
    </div>
  );
};

export default RecentActivity;
