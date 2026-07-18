/**
 * Recent Activity Component
 * 
 * Displays recent activities like document uploads and evaluations.
 */

import React from 'react';
import { FileText, ClipboardList, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Activity {
  type: string;
  name: string;
  timestamp: string;
}

interface RecentActivityProps {
  activities: Activity[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ activities }) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'document':
        return FileText;
      case 'evaluation':
        return ClipboardList;
      default:
        return Clock;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'document':
        return 'text-blue-600 bg-blue-100';
      case 'evaluation':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Recent Activity
        </h3>
        <Clock className="h-5 w-5 text-gray-400" />
      </div>
      
      <div className="space-y-4">
        {activities.length > 0 ? (
          activities.slice(0, 8).map((activity, index) => {
            const Icon = getActivityIcon(activity.type);
            const colorClasses = getActivityColor(activity.type);
            
            return (
              <div key={index} className="flex items-start space-x-3">
                <div className={cn(
                  "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                  colorClasses
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {activity.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500">
                      {activity.type === 'document' ? 'Document uploaded' : 'Evaluation created'}
                    </p>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(activity.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-sm">No recent activity</p>
            <p className="text-gray-400 text-xs mt-1">
              Activity will appear here as you use the system
            </p>
          </div>
        )}
      </div>
      
      {activities.length > 8 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            View all activity
          </button>
        </div>
      )}
    </div>
  );
};

export default RecentActivity;
