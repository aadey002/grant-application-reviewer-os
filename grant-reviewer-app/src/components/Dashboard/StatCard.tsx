/**
 * Statistics Card Component
 * 
 * Displays a single statistic with icon, value, and trend information.
 */

import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'yellow' | 'purple' | 'red';
  trend?: string;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  color,
  trend,
  className,
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };

  const iconColorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    purple: 'text-purple-600',
    red: 'text-red-600',
  };

  const isPositiveTrend = trend?.startsWith('+');

  return (
    <div className={cn(
      "bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {trend && (
              <div className={cn(
                "ml-2 flex items-center text-sm",
                isPositiveTrend ? "text-green-600" : "text-red-600"
              )}>
                {isPositiveTrend ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {trend}
              </div>
            )}
          </div>
        </div>
        
        <div className={cn(
          "h-12 w-12 rounded-lg flex items-center justify-center",
          colorClasses[color]
        )}>
          <Icon className={cn("h-6 w-6", iconColorClasses[color])} />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
