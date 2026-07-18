/**
 * Document Filters Component
 * 
 * Provides filtering options for documents by agency, status, type, etc.
 */

import React from 'react';
import { X, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DocumentFiltersProps {
  filters: {
    agency: string;
    status: string;
    document_type: string;
  };
  onFilterChange: (filters: {
    agency: string;
    status: string;
    document_type: string;
  }) => void;
  onClose: () => void;
}

const DocumentFilters: React.FC<DocumentFiltersProps> = ({
  filters,
  onFilterChange,
  onClose,
}) => {
  const agencyOptions = [
    { value: '', label: 'All Agencies' },
    { value: 'HRSA', label: 'HRSA' },
    { value: 'SAMHSA', label: 'SAMHSA' },
    { value: 'NIH', label: 'NIH' },
    { value: 'CDC', label: 'CDC' },
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'uploaded', label: 'Uploaded' },
    { value: 'processing', label: 'Processing' },
    { value: 'processed', label: 'Processed' },
    { value: 'evaluated', label: 'Evaluated' },
    { value: 'archived', label: 'Archived' },
  ];

  const documentTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'application', label: 'Grant Application' },
    { value: 'nofo', label: 'NOFO Document' },
    { value: 'supporting', label: 'Supporting Document' },
  ];

  const handleFilterChange = (key: string, value: string) => {
    onFilterChange({
      ...filters,
      [key]: value,
    });
  };

  const clearAllFilters = () => {
    onFilterChange({
      agency: '',
      status: '',
      document_type: '',
    });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {activeFilterCount} active
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Agency Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Agency
          </label>
          <select
            value={filters.agency}
            onChange={(e) => handleFilterChange('agency', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {agencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Document Type Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Document Type
          </label>
          <select
            value={filters.document_type}
            onChange={(e) => handleFilterChange('document_type', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {documentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.agency && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
              Agency: {filters.agency}
              <button
                onClick={() => handleFilterChange('agency', '')}
                className="ml-1 p-0.5 rounded hover:bg-blue-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          
          {filters.status && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
              Status: {statusOptions.find(o => o.value === filters.status)?.label}
              <button
                onClick={() => handleFilterChange('status', '')}
                className="ml-1 p-0.5 rounded hover:bg-green-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          
          {filters.document_type && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800">
              Type: {documentTypeOptions.find(o => o.value === filters.document_type)?.label}
              <button
                onClick={() => handleFilterChange('document_type', '')}
                className="ml-1 p-0.5 rounded hover:bg-purple-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentFilters;
