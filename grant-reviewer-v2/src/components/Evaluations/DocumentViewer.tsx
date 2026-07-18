import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ZoomIn, 
  ZoomOut, 
  Download, 
  FileText, 
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Eye
} from 'lucide-react';

interface Document {
  id: number;
  title: string;
  filename: string;
  file_size: number;
  agency: string;
  document_type: string;
  status: string;
  description?: string;
  created_at: string;
  fileContent?: string; // Base64 encoded file content
  contentType?: string; // MIME type
  isUserUpload?: boolean;
}

interface DocumentViewerProps {
  document: Document;
  isLoading?: boolean;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ document, isLoading = false }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [contentType, setContentType] = useState<'pdf' | 'text' | 'unsupported'>('pdf');

  useEffect(() => {
    loadDocumentContent();
  }, [document]);

  const loadDocumentContent = async () => {
    try {
      console.log('📄 Loading document content for:', document.title);
      console.log('📄 Document has fileContent:', !!document.fileContent);
      console.log('📄 Is user upload:', document.isUserUpload);
      
      // Check if this is a user upload with stored content
      if (document.isUserUpload && document.fileContent) {
        console.log('✅ Loading stored user upload content');
        
        // Determine content type
        const extension = document.filename.split('.').pop()?.toLowerCase();
        const mimeType = document.contentType || '';
        
        if (extension === 'pdf' || mimeType === 'application/pdf') {
          setContentType('pdf');
          // Create data URL for PDF viewing
          const dataUrl = `data:${mimeType};base64,${document.fileContent}`;
          setDocumentContent(dataUrl);
          console.log('📄 Set PDF content as data URL');
        } else if (['txt', 'md'].includes(extension || '') || mimeType.startsWith('text/')) {
          setContentType('text');
          // Decode Base64 text content
          try {
            const textContent = atob(document.fileContent);
            setDocumentContent(textContent);
            console.log('📄 Decoded text content, length:', textContent.length);
          } catch (decodeError) {
            console.error('❌ Failed to decode text content:', decodeError);
            setDocumentContent('Error: Could not decode file content');
          }
        } else {
          setContentType('unsupported');
          setDocumentContent(`File type: ${extension || 'unknown'}\nMIME type: ${mimeType}\nFile size: ${document.file_size} bytes\n\nThis file type is not currently supported for viewing.`);
        }
        return;
      }
      
      // Fallback to mock content for default documents
      const extension = document.filename.split('.').pop()?.toLowerCase();
      
      if (extension === 'pdf') {
        setContentType('pdf');
        // For PDF documents, we'll use an iframe or PDF viewer
        setDocumentContent(`/uploads/${document.filename}`);
        setTotalPages(10); // Mock page count - would be extracted from actual PDF
      } else if (['doc', 'docx', 'txt'].includes(extension || '')) {
        setContentType('text');
        // For text documents, we'll show extracted text content
        // In a real implementation, this would extract text from the document
        setDocumentContent(`
# ${document.title}

## Executive Summary

This grant application demonstrates a comprehensive approach to addressing healthcare needs in underserved communities. The proposed program aims to improve access to quality healthcare through innovative service delivery models and strategic partnerships.

## Project Description

### Background and Need

The target community faces significant healthcare disparities, with limited access to primary care services, specialists, and preventive care programs. Recent studies indicate that 65% of residents travel more than 30 miles to access basic healthcare services.

### Proposed Solution

Our organization proposes to implement a multi-faceted approach including:

1. **Mobile Health Units**: Deployment of three mobile health units to provide primary care services directly in underserved areas
2. **Telehealth Integration**: Implementation of telehealth technology to connect patients with specialists
3. **Community Health Workers**: Training and deployment of 15 community health workers
4. **Health Education Programs**: Development of culturally appropriate health education materials

### Goals and Objectives

**Goal 1**: Increase access to primary care services
- Objective 1.1: Serve 2,500 unique patients annually
- Objective 1.2: Reduce average travel time to healthcare from 45 minutes to 15 minutes
- Objective 1.3: Increase preventive care utilization by 40%

**Goal 2**: Improve health outcomes
- Objective 2.1: Reduce emergency department visits by 25%
- Objective 2.2: Improve management of chronic conditions
- Objective 2.3: Increase vaccination rates to 95%

### Methodology

Our evidence-based approach incorporates proven strategies from similar programs. The methodology includes:

1. **Community Engagement**: Extensive outreach to build trust and partnerships
2. **Service Delivery**: Strategic deployment of mobile units based on population density
3. **Technology Integration**: Seamless integration of telehealth capabilities
4. **Quality Assurance**: Comprehensive quality improvement processes

### Evaluation Plan

The evaluation plan includes both process and outcome measures:

**Process Measures**:
- Number of patients served
- Services provided
- Community partnerships established

**Outcome Measures**:
- Health status improvements
- Patient satisfaction scores
- Cost-effectiveness analysis

### Budget Justification

The total project budget of $1,250,000 over three years is allocated as follows:
- Personnel (65%): $812,500
- Equipment (20%): $250,000
- Operations (10%): $125,000
- Evaluation (5%): $62,500

### Organizational Capacity

Our organization has 25 years of experience serving rural and underserved populations. Key staff includes:
- Medical Director: Board-certified family physician with 15 years experience
- Program Manager: MPH with expertise in community health programs
- Financial Manager: CPA with nonprofit financial management experience

### Sustainability

The sustainability plan includes:
- Diversification of funding sources
- Integration with existing healthcare systems
- Fee-for-service arrangements with insurance providers
- Community support and partnerships

### Expected Impact

This program will significantly improve healthcare access and outcomes for 2,500 residents annually. The long-term impact includes reduced health disparities, improved population health, and a more robust healthcare infrastructure.

### Conclusion

This proposal represents a comprehensive, evidence-based approach to addressing healthcare needs in our community. With strong organizational capacity, community support, and a clear implementation plan, we are positioned to achieve significant and sustainable improvements in healthcare access and outcomes.
        `);
        setTotalPages(1);
      } else {
        setContentType('unsupported');
        setDocumentContent(null);
      }
    } catch (error) {
      console.error('Failed to load document content:', error);
      setContentType('unsupported');
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 25, 50));
  };

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <FileText className="h-8 w-8 animate-pulse mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Loading document...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`h-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="h-5 w-5 text-blue-500" />
            <div>
              <CardTitle className="text-lg">{document.title}</CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline">{document.agency}</Badge>
                <Badge variant="secondary">{document.document_type}</Badge>
                <span className="text-sm text-gray-500">{formatFileSize(document.file_size)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
              <Maximize className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {/* Document Controls */}
      <div className="border-b p-3 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoomLevel <= 50}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">{zoomLevel}%</span>
            <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoomLevel >= 200}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          
          {contentType === 'pdf' && (
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search in document..."
                className="pl-8 pr-3 py-1 text-sm border rounded-md w-40"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Document Content */}
      <CardContent className="flex-1 p-0 overflow-auto">
        {contentType === 'pdf' && documentContent ? (
          <div className="h-full" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}>
            <iframe
              src={documentContent}
              className="w-full h-full border-0"
              title={document.title}
            />
          </div>
        ) : contentType === 'text' && documentContent ? (
          <div 
            className="p-6 prose prose-sm max-w-none"
            style={{ fontSize: `${zoomLevel}%` }}
            dangerouslySetInnerHTML={{ 
              __html: documentContent.split('\n').map(line => {
                if (line.startsWith('# ')) {
                  return `<h1 class="text-2xl font-bold mb-4 text-gray-900">${line.substring(2)}</h1>`;
                } else if (line.startsWith('## ')) {
                  return `<h2 class="text-xl font-semibold mb-3 mt-6 text-gray-800">${line.substring(3)}</h2>`;
                } else if (line.startsWith('### ')) {
                  return `<h3 class="text-lg font-medium mb-2 mt-4 text-gray-700">${line.substring(4)}</h3>`;
                } else if (line.startsWith('**') && line.endsWith('**')) {
                  return `<p class="font-semibold mb-2">${line.substring(2, line.length - 2)}</p>`;
                } else if (line.startsWith('- ')) {
                  return `<li class="ml-4 mb-1">${line.substring(2)}</li>`;
                } else if (line.trim() === '') {
                  return '<br />';
                } else {
                  return `<p class="mb-2 text-gray-700">${line}</p>`;
                }
              }).join('') 
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Eye className="h-8 w-8 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">Document preview not available</p>
              <p className="text-sm text-gray-500 mt-1">Unsupported file type or failed to load</p>
              <Button variant="outline" className="mt-4">
                <Download className="h-4 w-4 mr-2" />
                Download to View
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentViewer;