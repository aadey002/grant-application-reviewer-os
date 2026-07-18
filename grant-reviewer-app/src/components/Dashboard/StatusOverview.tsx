/**
 * Status Overview Component
 * 
 * Displays the status distribution of documents (uploaded, processing, evaluated, etc.)
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CheckCircle, Clock, Upload, AlertCircle } from 'lucide-react';

interface StatusOverviewProps {
  data: Record<string, number>;
}

const StatusOverview: React.FC<StatusOverviewProps> = ({ data }) => {
  // Convert data to chart format
  const chartData = Object.entries(data).map(([status, count]) => ({
    status: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    count,
    originalStatus: status,
  }));

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return Upload;
      case 'processing':
        return Clock;
      case 'evaluated':
        return CheckCircle;
      case 'archived':
        return AlertCircle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return '#3B82F6'; // Blue
      case 'processing':
        return '#F59E0B'; // Yellow
      case 'evaluated':
        return '#10B981'; // Green
      case 'archived':
        return '#6B7280'; // Gray
      default:
        return '#6B7280';
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-gray-600">
            {payload[0].value} documents
          </p>
        </div>
      );
    }
    return null;
  };

  const totalDocuments = Object.values(data).reduce((sum, count) => sum + count, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Document Status Overview
        </h3>
        <span className="text-sm text-gray-500">
          Total: {totalDocuments.toLocaleString()}
        </span>
      </div>
      
      {totalDocuments > 0 ? (
        <>
          {/* Chart */}
          <div className="h-48 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="status" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="count" 
                  radius={[4, 4, 0, 0]}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.originalStatus)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Status Legend */}
          <div className="grid grid-cols-2 gap-3">
            {chartData.map((item, index) => {
              const Icon = getStatusIcon(item.originalStatus);
              return (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                  <div className="flex items-center space-x-2">
                    <Icon 
                      className="h-4 w-4" 
                      style={{ color: getStatusColor(item.originalStatus) }}
                    />
                    <span className="text-sm text-gray-700">{item.status}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="h-48 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm">No documents yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Upload documents to see status overview
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusOverview;
