/**
 * Agency Distribution Chart Component
 * 
 * Displays the distribution of documents by agency (HRSA, SAMHSA, etc.)
 */

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface AgencyDistributionProps {
  data: Record<string, number>;
}

const AgencyDistribution: React.FC<AgencyDistributionProps> = ({ data }) => {
  // Convert data to chart format
  const chartData = Object.entries(data).map(([agency, count]) => ({
    name: agency,
    value: count,
  }));

  const colors = {
    HRSA: '#3B82F6',    // Blue
    SAMHSA: '#10B981',  // Green
    NIH: '#8B5CF6',     // Purple
    CDC: '#F59E0B',     // Yellow
    Other: '#6B7280',   // Gray
  };

  const getColor = (agency: string) => {
    return colors[agency as keyof typeof colors] || colors.Other;
  };

  const totalDocuments = Object.values(data).reduce((sum, count) => sum + count, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-gray-600">
            {data.value} documents ({((data.value / totalDocuments) * 100).toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Documents by Agency
        </h3>
        <span className="text-sm text-gray-500">
          Total: {totalDocuments.toLocaleString()}
        </span>
      </div>
      
      {totalDocuments > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <PieChart className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm">No documents yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Upload documents to see agency distribution
            </p>
          </div>
        </div>
      )}
      
      {/* Legend */}
      {totalDocuments > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {chartData.map((entry, index) => (
            <div key={index} className="flex items-center space-x-2">
              <div 
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: getColor(entry.name) }}
              />
              <span className="text-sm text-gray-600">
                {entry.name} ({entry.value})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgencyDistribution;
