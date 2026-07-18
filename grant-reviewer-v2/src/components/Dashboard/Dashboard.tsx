import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, 
  FolderOpen, 
  CheckSquare, 
  TrendingUp,
  Clock,
  AlertCircle,
  Upload,
  Search
} from 'lucide-react';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';
import type { Statistics } from '@/types/api-responses';
import StatCard from './StatCard';
import RecentActivity from './RecentActivity';
import QuickActions from './QuickActions';

const Dashboard: React.FC = () => {
  const { state, dispatch } = useApp();

  // Fetch statistics
  const { data: statistics, isLoading, error } = useQuery<Statistics>({
    queryKey: ['statistics'],
    queryFn: api.getStatistics,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_VIEW', payload: 'dashboard' });
  }, [dispatch]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
              <div className="w-12 h-12 bg-slate-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-slate-200 rounded mb-2"></div>
              <div className="h-6 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
          <span className="text-red-800">Failed to load dashboard data</span>
        </div>
      </div>
    );
  }

  const stats: Statistics = statistics || {
    total_documents: 0,
    total_folders: 0,
    total_evaluations: 0,
    documents_by_agency: {},
    documents_by_status: {},
    recent_activity: []
  };

  const statCards = [
    {
      title: 'Total Documents',
      value: stats.total_documents.toLocaleString(),
      icon: FileText,
      color: 'blue' as const,
      trend: '+12%',
    },
    {
      title: 'Active Evaluations',
      value: stats.total_evaluations.toLocaleString(),
      icon: CheckSquare,
      color: 'green' as const,
      trend: '+8%',
    },
    {
      title: 'Folders',
      value: stats.total_folders.toLocaleString(),
      icon: FolderOpen,
      color: 'purple' as const,
      trend: '+3%',
    },
    {
      title: 'Completion Rate',
      value: '94%',
      icon: TrendingUp,
      color: 'emerald' as const,
      trend: '+5%',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">
          Welcome to Grant Reviewer V2
        </h2>
        <p className="text-blue-100 mb-4">
          Professional federal grant review and document management system
        </p>
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
            <span>System Online</span>
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Quick Actions & Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <QuickActions />
          
          {/* Agency Distribution */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Document Distribution by Agency
            </h3>
            
            <div className="space-y-3">
              {Object.entries(stats.documents_by_agency).map(([agency, count]) => {
                const total = Object.values(stats.documents_by_agency).reduce((a: number, b: number) => a + b, 0);
                const percentage = total > 0 ? (((count as number) / total) * 100).toFixed(1) : '0';
                
                return (
                  <div key={agency} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${
                        agency === 'HRSA' ? 'bg-blue-500' :
                        agency === 'SAMHSA' ? 'bg-green-500' :
                        agency === 'NIH' ? 'bg-purple-500' :
                        agency === 'CDC' ? 'bg-yellow-500' : 'bg-gray-500'
                      }`}></div>
                      <span className="text-sm font-medium text-slate-700">{agency}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-slate-600">{count as number} documents</span>
                      <span className="text-xs text-slate-500">({percentage}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Overview */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Document Status Overview
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(stats.documents_by_status).map(([status, count]) => (
                <div key={status} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 capitalize">
                      {status.replace('_', ' ')}
                    </span>
                    <span className="text-lg font-bold text-slate-900">{count as number}</span>
                  </div>
                  <div className={`mt-2 h-2 rounded-full ${
                    status === 'evaluated' ? 'bg-green-200' :
                    status === 'processing' ? 'bg-blue-200' :
                    status === 'uploaded' ? 'bg-yellow-200' :
                    status === 'error' ? 'bg-red-200' : 'bg-gray-200'
                  }`}>
                    <div className={`h-full rounded-full transition-all duration-300 ${
                      status === 'evaluated' ? 'bg-green-500' :
                      status === 'processing' ? 'bg-blue-500' :
                      status === 'uploaded' ? 'bg-yellow-500' :
                      status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                    }`} style={{ width: '75%' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Recent Activity */}
        <div className="space-y-6">
          <RecentActivity activities={stats.recent_activity} />
          
          {/* System Health */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              System Health
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">API Status</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Online</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Database</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">MCP Agent</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
