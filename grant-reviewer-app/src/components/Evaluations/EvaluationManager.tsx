/**
 * Evaluation Manager Component
 * 
 * Main interface for managing grant evaluations.
 * Displays evaluations, their status, and results.
 */

import React, { useEffect } from 'react';
import { ClipboardList, Plus, Filter, Search } from 'lucide-react';
import { useEvaluationActions } from '../../hooks/useAPI';
import { useEvaluations } from '../../contexts/AppContext';

const EvaluationManager: React.FC = () => {
  const { loadEvaluations } = useEvaluationActions();
  const { evaluations, loading, error } = useEvaluations();

  useEffect(() => {
    loadEvaluations();
  }, [loadEvaluations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Grant Evaluations
        </h2>
        <p className="text-gray-600">
          Review and track the progress of grant application evaluations.
        </p>
      </div>

      {evaluations.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No evaluations yet
          </h3>
          <p className="text-gray-500 mb-6">
            Start evaluating documents to see them here.
          </p>
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Start Evaluation
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Recent Evaluations ({evaluations.length})
              </h3>
              <div className="flex space-x-2">
                <button className="p-2 border border-gray-300 rounded-md hover:bg-gray-50">
                  <Filter className="h-4 w-4" />
                </button>
                <button className="p-2 border border-gray-300 rounded-md hover:bg-gray-50">
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {evaluations.map((evaluation) => (
              <div key={evaluation.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {evaluation.document_name}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {evaluation.evaluation_type} evaluation
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      evaluation.status === 'completed' ? 'bg-green-100 text-green-800' :
                      evaluation.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      evaluation.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {evaluation.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(evaluation.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaluationManager;
