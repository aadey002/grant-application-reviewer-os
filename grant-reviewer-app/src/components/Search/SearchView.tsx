/**
 * Search View Component
 * 
 * Provides search interface for documents and evaluations
 * with filtering and result display.
 */

import React, { useState } from 'react';
import { Search, Filter, FileText, ClipboardList } from 'lucide-react';
import { useSearch } from '../../hooks/useAPI';
import { SearchResult } from '../../services/api';

const SearchView: React.FC = () => {
  const { search } = useSearch();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState({
    agency: '',
    document_type: '',
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const searchResults = await search({
        q: query,
        agency: filters.agency || undefined,
        document_type: filters.document_type || undefined,
      });
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getResultIcon = (type: string) => {
    return type === 'document' ? FileText : ClipboardList;
  };

  const getResultColor = (type: string) => {
    return type === 'document' ? 'text-blue-600' : 'text-green-600';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Search Documents & Evaluations
        </h2>
        <p className="text-gray-600">
          Find grant applications, evaluations, and related content across your workspace.
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for documents, evaluations, or content..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agency
              </label>
              <select
                value={filters.agency}
                onChange={(e) => setFilters(prev => ({ ...prev, agency: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Agencies</option>
                <option value="HRSA">HRSA</option>
                <option value="SAMHSA">SAMHSA</option>
                <option value="NIH">NIH</option>
                <option value="CDC">CDC</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Type
              </label>
              <select
                value={filters.document_type}
                onChange={(e) => setFilters(prev => ({ ...prev, document_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Types</option>
                <option value="application">Grant Application</option>
                <option value="nofo">NOFO Document</option>
                <option value="supporting">Supporting Document</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Search Results
              {results.length > 0 && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({results.length} found)
                </span>
              )}
            </h3>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {results.map((result, index) => {
                const Icon = getResultIcon(result.search_type);
                const iconColor = getResultColor(result.search_type);
                
                return (
                  <div key={index} className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 mt-1 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-900 truncate">
                            {result.original_filename || `${result.search_type} result`}
                          </h4>
                          <span className="text-xs text-gray-500 ml-2">
                            {new Date(result.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                            {result.search_type}
                          </span>
                          {result.agency && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                              {result.agency}
                            </span>
                          )}
                          {result.document_type && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                              {result.document_type}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-600 mt-2" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            Relevance: {Math.round(result.relevance_score * 100)}%
                          </span>
                          {result.folder_name && (
                            <span className="text-xs text-gray-500">
                              in {result.folder_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No results found
              </h3>
              <p className="text-gray-500">
                Try adjusting your search terms or filters.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Search Tips */}
      {!hasSearched && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            Search Tips
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Use specific keywords related to grant content</li>
            <li>• Filter by agency or document type to narrow results</li>
            <li>• Search includes document content, descriptions, and evaluation results</li>
            <li>• Use quotes for exact phrase matching</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchView;
