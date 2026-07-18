import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Filter, 
  FileText, 
  Calendar,
  Building,
  Tag,
  Download,
  Eye,
  Clock
} from 'lucide-react';

interface SearchResult {
  id: number;
  title: string;
  filename: string;
  agency: string;
  document_type: string;
  status: string;
  description: string;
  tags: string[];
  created_at: string;
  file_size: number;
  relevance_score: number;
}

interface SearchFilters {
  agency: string;
  document_type: string;
  status: string;
  date_range: string;
}

const SearchView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    agency: '',
    document_type: '',
    status: '',
    date_range: ''
  });
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    if (query.trim()) {
      handleSearch();
    } else {
      setResults([]);
      setTotalResults(0);
    }
  }, [query, filters]);

  const handleSearch = async () => {
    try {
      setLoading(true);
      
      // Mock search results
      const mockResults: SearchResult[] = [
        {
          id: 1,
          title: "Rural Health Initiative Proposal",
          filename: "rural_health_initiative_2025.pdf",
          agency: "HRSA",
          document_type: "application",
          status: "reviewed",
          description: "Comprehensive proposal for expanding rural health services in underserved communities",
          tags: ["rural health", "primary care", "telehealth", "community"],
          created_at: "2025-01-15T09:30:00Z",
          file_size: 2.5 * 1024 * 1024,
          relevance_score: 95
        },
        {
          id: 2,
          title: "Mental Health Services Grant Application",
          filename: "mental_health_services_grant.docx",
          agency: "SAMHSA",
          document_type: "application",
          status: "under_review",
          description: "Grant application for expanding mental health services and substance abuse treatment programs",
          tags: ["mental health", "substance abuse", "treatment", "prevention"],
          created_at: "2025-01-18T14:20:00Z",
          file_size: 1.8 * 1024 * 1024,
          relevance_score: 87
        },
        {
          id: 3,
          title: "Community Health Center Expansion NOFO",
          filename: "chc_expansion_nofo_2025.pdf",
          agency: "HRSA",
          document_type: "nofo",
          status: "published",
          description: "Notice of Funding Opportunity for Community Health Center capital development",
          tags: ["NOFO", "community health centers", "capital development", "infrastructure"],
          created_at: "2025-01-10T11:00:00Z",
          file_size: 3.2 * 1024 * 1024,
          relevance_score: 78
        }
      ];
      
      // Filter results based on search query and filters
      let filteredResults = mockResults.filter(result =>
        result.title.toLowerCase().includes(query.toLowerCase()) ||
        result.description.toLowerCase().includes(query.toLowerCase()) ||
        result.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      );
      
      if (filters.agency) {
        filteredResults = filteredResults.filter(result => result.agency === filters.agency);
      }
      
      if (filters.document_type) {
        filteredResults = filteredResults.filter(result => result.document_type === filters.document_type);
      }
      
      if (filters.status) {
        filteredResults = filteredResults.filter(result => result.status === filters.status);
      }
      
      setResults(filteredResults);
      setTotalResults(filteredResults.length);
      
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reviewed':
        return 'default';
      case 'under_review':
        return 'secondary';
      case 'published':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'application':
        return <FileText className="h-4 w-4" />;
      case 'nofo':
        return <Building className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Search</h1>
        <p className="text-gray-600">Search and filter through your grant documents and evaluations</p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents, descriptions, tags..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
          
          {/* Quick Filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            <select 
              value={filters.agency} 
              onChange={(e) => setFilters({...filters, agency: e.target.value})}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="">All Agencies</option>
              <option value="HRSA">HRSA</option>
              <option value="SAMHSA">SAMHSA</option>
            </select>
            
            <select 
              value={filters.document_type} 
              onChange={(e) => setFilters({...filters, document_type: e.target.value})}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="">All Types</option>
              <option value="application">Applications</option>
              <option value="nofo">NOFOs</option>
              <option value="supporting_doc">Supporting Documents</option>
            </select>
            
            <select 
              value={filters.status} 
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="">All Statuses</option>
              <option value="uploaded">Uploaded</option>
              <option value="under_review">Under Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="published">Published</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {query && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Search Results {totalResults > 0 && `(${totalResults})`}
            </h2>
            {loading && <Clock className="h-4 w-4 animate-spin text-blue-500" />}
          </div>
          
          {results.length > 0 ? (
            <div className="space-y-4">
              {results.map((result) => (
                <Card key={result.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {getTypeIcon(result.document_type)}
                        <div className="flex-1">
                          <CardTitle className="text-base">{result.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {result.description}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500 mb-1">
                          Relevance: {result.relevance_score}%
                        </div>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${result.relevance_score}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{result.agency}</Badge>
                          <Badge variant={getStatusColor(result.status) as any}>
                            {result.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(result.created_at)}</span>
                          </div>
                          <span>{formatFileSize(result.file_size)}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    {result.tags.length > 0 && (
                      <div className="mt-3 flex items-center space-x-2">
                        <Tag className="h-3 w-3 text-gray-400" />
                        <div className="flex flex-wrap gap-1">
                          {result.tags.map((tag, index) => (
                            <span 
                              key={index}
                              className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            !loading && (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center text-gray-500">
                    <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No documents found matching your search criteria</p>
                    <p className="text-sm mt-1">Try adjusting your search terms or filters</p>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
      
      {!query && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">
              <Search className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">Search Your Documents</h3>
              <p>Enter keywords to find grant applications, NOFOs, and supporting documents</p>
              <p className="text-sm mt-2">You can search by title, description, tags, or document content</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SearchView;
