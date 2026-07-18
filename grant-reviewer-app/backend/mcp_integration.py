"""
MCP Integration Module

Provides integration with the existing Grant Reviewing MCP Agent.
Handles document processing, evaluation, scoring, and comment generation.
"""

import sys
import json
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path

# Add grant-reviewer-mcp to Python path
sys.path.insert(0, '/workspace/grant-reviewer-mcp/src')

try:
    from grant_reviewer.document_processor import DocumentProcessor
    from grant_reviewer.evaluator import GrantEvaluator
    from grant_reviewer.scoring_engine import ScoringEngine
    from grant_reviewer.comment_generator import CommentGenerator
    from grant_reviewer.report_generator import ReportGenerator
except ImportError as e:
    logging.error(f"Failed to import MCP components: {e}")
    # Fallback implementations will be used

class MCPIntegration:
    """Integration layer with Grant Reviewing MCP Agent."""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
        try:
            # Initialize MCP components
            self.document_processor = DocumentProcessor()
            self.grant_evaluator = GrantEvaluator()
            self.scoring_engine = ScoringEngine()
            self.comment_generator = CommentGenerator()
            self.report_generator = ReportGenerator()
            self.mcp_available = True
            self.logger.info("MCP Agent integration initialized successfully")
        except Exception as e:
            self.logger.error(f"Failed to initialize MCP components: {e}")
            self.mcp_available = False
    
    def process_document(self, file_path: str) -> Dict[str, Any]:
        """Process document using MCP Agent document processor."""
        if not self.mcp_available:
            return self._fallback_document_processing(file_path)
        
        try:
            result = self.document_processor.process_document(file_path)
            
            # Enhance result with additional metadata
            result['processing_timestamp'] = self._get_current_timestamp()
            result['processor_version'] = 'MCP-1.0'
            result['processing_status'] = 'success'
            
            return result
            
        except Exception as e:
            self.logger.error(f"Error processing document {file_path}: {e}")
            return {
                'error': str(e),
                'processing_status': 'failed',
                'processing_timestamp': self._get_current_timestamp(),
                'file_path': file_path
            }
    
    def evaluate_comprehensive(self, app_file_path: str, 
                             nofo_file_path: Optional[str] = None,
                             agency: str = 'HRSA') -> Dict[str, Any]:
        """Perform comprehensive evaluation using MCP Agent."""
        if not self.mcp_available:
            return self._fallback_evaluation(app_file_path, nofo_file_path, agency)
        
        try:
            # Process both documents
            app_content = self.document_processor.process_document(app_file_path)
            nofo_content = None
            
            if nofo_file_path:
                nofo_content = self.document_processor.process_document(nofo_file_path)
            else:
                # Use default NOFO content based on agency
                nofo_content = self._get_default_nofo_content(agency)
            
            # Perform evaluation
            evaluation_result = self.grant_evaluator.evaluate_application(
                app_content, nofo_content, agency
            )
            
            # Generate scores
            scoring_result = self.scoring_engine.score_application(
                app_content, nofo_content, agency, 'comprehensive'
            )
            
            # Generate comments
            comments_result = self.comment_generator.generate_comments(
                app_content, nofo_content, scoring_result, agency, 'professional'
            )
            
            # Combine all results
            comprehensive_result = {
                'evaluation_type': 'comprehensive',
                'agency': agency,
                'timestamp': self._get_current_timestamp(),
                'status': 'completed',
                'application_analysis': app_content,
                'evaluation': evaluation_result,
                'scoring': scoring_result,
                'comments': comments_result,
                'summary': self._generate_evaluation_summary(evaluation_result, scoring_result)
            }
            
            return comprehensive_result
            
        except Exception as e:
            self.logger.error(f"Error in comprehensive evaluation: {e}")
            return {
                'error': str(e),
                'evaluation_type': 'comprehensive',
                'status': 'failed',
                'timestamp': self._get_current_timestamp()
            }
    
    def score_application(self, app_file_path: str,
                         nofo_file_path: Optional[str] = None,
                         agency: str = 'HRSA',
                         scoring_method: str = 'standard') -> Dict[str, Any]:
        """Score application using MCP Agent scoring engine."""
        if not self.mcp_available:
            return self._fallback_scoring(app_file_path, agency)
        
        try:
            # Process documents
            app_content = self.document_processor.process_document(app_file_path)
            nofo_content = None
            
            if nofo_file_path:
                nofo_content = self.document_processor.process_document(nofo_file_path)
            else:
                nofo_content = self._get_default_nofo_content(agency)
            
            # Generate scores
            scoring_result = self.scoring_engine.score_application(
                app_content, nofo_content, agency, scoring_method
            )
            
            scoring_result.update({
                'evaluation_type': 'scoring',
                'scoring_method': scoring_method,
                'timestamp': self._get_current_timestamp(),
                'status': 'completed'
            })
            
            return scoring_result
            
        except Exception as e:
            self.logger.error(f"Error in scoring application: {e}")
            return {
                'error': str(e),
                'evaluation_type': 'scoring',
                'status': 'failed',
                'timestamp': self._get_current_timestamp()
            }
    
    def generate_comments(self, app_file_path: str,
                         nofo_file_path: Optional[str] = None,
                         agency: str = 'HRSA',
                         comment_style: str = 'professional') -> Dict[str, Any]:
        """Generate reviewer comments using MCP Agent."""
        if not self.mcp_available:
            return self._fallback_comments(app_file_path, agency)
        
        try:
            # Process documents
            app_content = self.document_processor.process_document(app_file_path)
            nofo_content = None
            
            if nofo_file_path:
                nofo_content = self.document_processor.process_document(nofo_file_path)
            else:
                nofo_content = self._get_default_nofo_content(agency)
            
            # Generate initial scoring for context
            scoring_result = self.scoring_engine.score_application(
                app_content, nofo_content, agency
            )
            
            # Generate comments
            comments_result = self.comment_generator.generate_comments(
                app_content, nofo_content, scoring_result, agency, comment_style
            )
            
            comments_result.update({
                'evaluation_type': 'comments',
                'comment_style': comment_style,
                'timestamp': self._get_current_timestamp(),
                'status': 'completed'
            })
            
            return comments_result
            
        except Exception as e:
            self.logger.error(f"Error generating comments: {e}")
            return {
                'error': str(e),
                'evaluation_type': 'comments',
                'status': 'failed',
                'timestamp': self._get_current_timestamp()
            }
    
    def generate_worksheet(self, app_file_path: str,
                          nofo_file_path: Optional[str] = None,
                          agency: str = 'HRSA',
                          output_format: str = 'comprehensive') -> Dict[str, Any]:
        """Generate complete reviewer worksheet."""
        if not self.mcp_available:
            return self._fallback_worksheet(app_file_path, agency)
        
        try:
            # Perform comprehensive evaluation first
            comprehensive_result = self.evaluate_comprehensive(
                app_file_path, nofo_file_path, agency
            )
            
            if comprehensive_result.get('status') == 'failed':
                return comprehensive_result
            
            # Generate final worksheet
            worksheet = self.report_generator.generate_worksheet(
                comprehensive_result['application_analysis'],
                comprehensive_result.get('nofo_content'),
                comprehensive_result['scoring'],
                comprehensive_result['comments'],
                agency,
                output_format
            )
            
            worksheet.update({
                'evaluation_type': 'worksheet',
                'output_format': output_format,
                'timestamp': self._get_current_timestamp(),
                'status': 'completed'
            })
            
            return worksheet
            
        except Exception as e:
            self.logger.error(f"Error generating worksheet: {e}")
            return {
                'error': str(e),
                'evaluation_type': 'worksheet',
                'status': 'failed',
                'timestamp': self._get_current_timestamp()
            }
    
    def extract_sections(self, file_path: str, 
                        section_types: Optional[List[str]] = None) -> Dict[str, Any]:
        """Extract specific sections from document."""
        if not self.mcp_available:
            return self._fallback_section_extraction(file_path)
        
        try:
            content = self.document_processor.process_document(file_path)
            
            if section_types:
                sections = self.document_processor.extract_specific_sections(
                    content, section_types
                )
            else:
                sections = content.get('sections', {})
            
            return {
                'extracted_sections': sections,
                'timestamp': self._get_current_timestamp(),
                'status': 'completed'
            }
            
        except Exception as e:
            self.logger.error(f"Error extracting sections: {e}")
            return {
                'error': str(e),
                'status': 'failed',
                'timestamp': self._get_current_timestamp()
            }
    
    def validate_completeness(self, app_file_path: str,
                             nofo_file_path: Optional[str] = None,
                             agency: str = 'HRSA') -> Dict[str, Any]:
        """Validate application completeness."""
        if not self.mcp_available:
            return self._fallback_validation(app_file_path, agency)
        
        try:
            # Process documents
            app_content = self.document_processor.process_document(app_file_path)
            nofo_content = None
            
            if nofo_file_path:
                nofo_content = self.document_processor.process_document(nofo_file_path)
            else:
                nofo_content = self._get_default_nofo_content(agency)
            
            # Validate completeness
            validation_result = self.grant_evaluator.validate_completeness(
                app_content, nofo_content, agency
            )
            
            validation_result.update({
                'evaluation_type': 'validation',
                'timestamp': self._get_current_timestamp(),
                'status': 'completed'
            })
            
            return validation_result
            
        except Exception as e:
            self.logger.error(f"Error validating completeness: {e}")
            return {
                'error': str(e),
                'evaluation_type': 'validation',
                'status': 'failed',
                'timestamp': self._get_current_timestamp()
            }
    
    def _get_default_nofo_content(self, agency: str) -> Dict[str, Any]:
        """Get default NOFO content for agency when no specific NOFO is provided."""
        # This would typically load from pre-configured NOFO templates
        default_nofos = {
            'HRSA': {
                'document_type': 'NOFO',
                'agency': 'HRSA',
                'criteria': [
                    'Statement of Need',
                    'Project Description',
                    'Goals and Objectives',
                    'Methods',
                    'Evaluation',
                    'Budget Narrative',
                    'Organizational Capacity'
                ],
                'text_content': 'Standard HRSA NOFO criteria and requirements'
            },
            'SAMHSA': {
                'document_type': 'NOFO',
                'agency': 'SAMHSA',
                'criteria': [
                    'Project Narrative - Question 1',
                    'Project Narrative - Question 2',
                    'Project Narrative - Question 3',
                    'Action Plan - Question 4',
                    'Project Narrative - Question 5'
                ],
                'text_content': 'Standard SAMHSA NOFO criteria and requirements'
            }
        }
        
        return default_nofos.get(agency, default_nofos['HRSA'])
    
    def _generate_evaluation_summary(self, evaluation_result: Dict, 
                                   scoring_result: Dict) -> Dict[str, Any]:
        """Generate executive summary of evaluation."""
        return {
            'overall_assessment': evaluation_result.get('overall_assessment', 'Under Review'),
            'overall_score': scoring_result.get('overall_score', 0),
            'recommendation': scoring_result.get('recommendation', 'Under Review'),
            'key_strengths': evaluation_result.get('strengths', [])[:3],
            'key_concerns': evaluation_result.get('concerns', [])[:3],
            'completeness_score': evaluation_result.get('completeness_score', 0)
        }
    
    def _get_current_timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.now().isoformat()
    
    # Fallback implementations when MCP Agent is not available
    def _fallback_document_processing(self, file_path: str) -> Dict[str, Any]:
        """Fallback document processing when MCP is unavailable."""
        return {
            'file_path': file_path,
            'document_type': Path(file_path).suffix.upper()[1:],
            'total_pages': 1,
            'text_content': 'Document processing unavailable - MCP Agent not loaded',
            'sections': {},
            'tables': [],
            'error': 'MCP Agent not available',
            'processing_status': 'fallback'
        }
    
    def _fallback_evaluation(self, app_file_path: str, nofo_file_path: Optional[str], 
                           agency: str) -> Dict[str, Any]:
        """Fallback evaluation when MCP is unavailable."""
        return {
            'error': 'MCP Agent not available - cannot perform evaluation',
            'evaluation_type': 'comprehensive',
            'status': 'unavailable',
            'timestamp': self._get_current_timestamp()
        }
    
    def _fallback_scoring(self, app_file_path: str, agency: str) -> Dict[str, Any]:
        """Fallback scoring when MCP is unavailable."""
        return {
            'error': 'MCP Agent not available - cannot perform scoring',
            'evaluation_type': 'scoring',
            'status': 'unavailable',
            'timestamp': self._get_current_timestamp()
        }
    
    def _fallback_comments(self, app_file_path: str, agency: str) -> Dict[str, Any]:
        """Fallback comments when MCP is unavailable."""
        return {
            'error': 'MCP Agent not available - cannot generate comments',
            'evaluation_type': 'comments',
            'status': 'unavailable',
            'timestamp': self._get_current_timestamp()
        }
    
    def _fallback_worksheet(self, app_file_path: str, agency: str) -> Dict[str, Any]:
        """Fallback worksheet when MCP is unavailable."""
        return {
            'error': 'MCP Agent not available - cannot generate worksheet',
            'evaluation_type': 'worksheet',
            'status': 'unavailable',
            'timestamp': self._get_current_timestamp()
        }
    
    def _fallback_section_extraction(self, file_path: str) -> Dict[str, Any]:
        """Fallback section extraction when MCP is unavailable."""
        return {
            'error': 'MCP Agent not available - cannot extract sections',
            'status': 'unavailable',
            'timestamp': self._get_current_timestamp()
        }
    
    def _fallback_validation(self, app_file_path: str, agency: str) -> Dict[str, Any]:
        """Fallback validation when MCP is unavailable."""
        return {
            'error': 'MCP Agent not available - cannot validate completeness',
            'evaluation_type': 'validation',
            'status': 'unavailable',
            'timestamp': self._get_current_timestamp()
        }
