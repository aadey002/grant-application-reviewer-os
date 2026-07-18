/**
 * Dashboard Component
 * 
 * Provides overview of grant review activities including statistics,
 * recent activity, and quick actions.
 */

import React, { useEffect } from 'react';
import {
  FileText,
  ClipboardList,
  Folder,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStatisticsActions, useDocumentActions, useEvaluationActions } from '../../hooks/useAPI';
import { useStatistics } from '../../contexts/AppContext';
import StatCard from './StatCard';
import RecentActivity from './RecentActivity';
import QuickActions from './QuickActions';
import AgencyDistribution from './AgencyDistribution';
import StatusOverview from './StatusOverview';

const Dashboard: React.FC = () => {
  const { loadStatistics } = useStatisticsActions();
  const { loadDocuments } = useDocumentActions();
  const { loadEvaluations } = useEvaluationActions();
  const { statistics, loading, error } = useStatistics();

  useEffect(() => {
    // Load dashboard data
    loadStatistics();
    loadDocuments();
    loadEvaluations();
  }, [loadStatistics, loadDocuments, loadEvaluations]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-24 rounded-lg"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-200 h-64 rounded-lg"></div>
            <div className="bg-gray-200 h-64 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error loading dashboard
              </h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stats = statistics || {
    total_documents: 0,
    total_evaluations: 0,
    total_folders: 0,
    documents_by_agency: {},
    documents_by_status: {},
    recent_activity: [],
  };

  const statCards = [
    {
      title: 'Total Documents',
      value: stats.total_documents,
      icon: FileText,
      color: 'blue' as const,
      trend: '+12%',
    },
    {
      title: 'Active Evaluations',
      value: stats.total_evaluations,
      icon: ClipboardList,
      color: 'green' as const,
      trend: '+8%',
    },
    {
      title: 'Folders',
      value: stats.total_folders,
      icon: Folder,
      color: 'yellow' as const,
      trend: '+3%',
    },
    {
      title: 'Completion Rate',
      value: '87%',
      icon: TrendingUp,
      color: 'purple' as const,
      trend: '+5%',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Section */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back to Grant Reviewer
        </h2>
        <p className="text-gray-600">
          Here's an overview of your grant review activities and recent progress.
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Agency Distribution */}
          <AgencyDistribution data={stats.documents_by_agency} />
          
          {/* Status Overview */}
          <StatusOverview data={stats.documents_by_status} />
        </div>

        {/* Right Column - Activity & Actions */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <QuickActions />
          
          {/* Recent Activity */}
          <RecentActivity activities={stats.recent_activity} />
        </div>
      </div>

      {/* Recent Documents */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Recent Documents
          </h3>
          <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            View all
          </button>
        </div>
        
        <div className="space-y-3">
          {stats.recent_activity.slice(0, 5).map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {activity.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {activity.type === 'document' ? 'Document uploaded' : 'Evaluation created'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(activity.timestamp).toLocaleDateString()}
              </span>
            </div>
          ))}
          
          {stats.recent_activity.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No recent activity</p>
              <p className="text-sm">Upload documents to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
