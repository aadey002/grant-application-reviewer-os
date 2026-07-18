#!/usr/bin/env python3
"""
Grant Reviewer MCP Server

A comprehensive MCP server for evaluating HRSA, SAMHSA, and other federal health grant applications.
Provides autonomous AI-driven evaluation with fairness, rigor, and transparency.
"""

import sys
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastmcp import FastMCP

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from grant_reviewer.document_processor import DocumentProcessor
from grant_reviewer.evaluator import GrantEvaluator
from grant_reviewer.scoring_engine import ScoringEngine
from grant_reviewer.comment_generator import CommentGenerator
from grant_reviewer.report_generator import ReportGenerator

# Initialize MCP server
mcp = FastMCP("Grant Reviewer MCP")

# Initialize core components
document_processor = DocumentProcessor()
grant_evaluator = GrantEvaluator()
scoring_engine = ScoringEngine()
comment_generator = CommentGenerator()
report_generator = ReportGenerator()

@mcp.tool
def process_grant_application(
    application_file_path: str,
    nofo_file_path: str,
    grant_agency: str = "HRSA",
    evaluation_criteria: Optional[str] = None
) -> str:
    """
    Process and analyze a complete grant application against NOFO requirements.
    
    Args:
        application_file_path: Absolute path to the grant application file (PDF or Word)
        nofo_file_path: Absolute path to the NOFO (Notice of Funding Opportunity) file
        grant_agency: The funding agency (HRSA, SAMHSA, etc.)
        evaluation_criteria: Optional specific evaluation criteria to focus on
        
    Returns:
        Comprehensive analysis report with extracted content and initial assessment
    """
    try:
        # Process application document
        app_content = document_processor.process_document(application_file_path)
        
        # Process NOFO document  
        nofo_content = document_processor.process_document(nofo_file_path)
        
        # Perform initial evaluation
        evaluation_result = grant_evaluator.evaluate_application(
            app_content, nofo_content, grant_agency, evaluation_criteria
        )
        
        return f"""Grant Application Processing Complete:

📄 Application Analysis:
- Document Type: {app_content.get('document_type', 'Unknown')}
- Pages Processed: {app_content.get('total_pages', 0)}
- Sections Identified: {len(app_content.get('sections', []))}
- Tables Found: {len(app_content.get('tables', []))}

📋 NOFO Analysis:
- Document Type: {nofo_content.get('document_type', 'Unknown')}
- Pages Processed: {nofo_content.get('total_pages', 0)}
- Evaluation Criteria: {len(nofo_content.get('criteria', []))}

🎯 Initial Evaluation:
- Agency: {grant_agency}
- Completeness Score: {evaluation_result.get('completeness_score', 0)}/100
- Key Strengths: {len(evaluation_result.get('strengths', []))}
- Areas of Concern: {len(evaluation_result.get('concerns', []))}

Next: Use 'score_grant_application' for detailed scoring and 'generate_reviewer_comments' for feedback."""
        
    except Exception as e:
        return f"Error processing grant application: {str(e)}"

@mcp.tool
def score_grant_application(
    application_file_path: str,
    nofo_file_path: str,
    grant_agency: str = "HRSA",
    scoring_method: str = "standard"
) -> str:
    """
    Generate quantitative scores for grant application based on agency-specific rubrics.
    
    Args:
        application_file_path: Absolute path to the grant application file
        nofo_file_path: Absolute path to the NOFO file
        grant_agency: The funding agency (HRSA, SAMHSA, etc.)
        scoring_method: Scoring methodology ('standard', 'detailed', 'comparative')
        
    Returns:
        Detailed scoring report with numerical scores and justifications
    """
    try:
        # Process documents
        app_content = document_processor.process_document(application_file_path)
        nofo_content = document_processor.process_document(nofo_file_path)
        
        # Generate scores
        scoring_result = scoring_engine.score_application(
            app_content, nofo_content, grant_agency, scoring_method
        )
        
        return f"""Grant Application Scoring Complete:

🎯 Overall Score: {scoring_result.get('overall_score', 0)}/100
📊 Funding Recommendation: {scoring_result.get('recommendation', 'Under Review')}

📋 Criterion Scores:
{scoring_result.get('criterion_breakdown', '')}

📈 Score Distribution:
- Outstanding (90-100): {scoring_result.get('outstanding_criteria', 0)} criteria
- Very Good (80-89): {scoring_result.get('very_good_criteria', 0)} criteria  
- Good (70-79): {scoring_result.get('good_criteria', 0)} criteria
- Satisfactory (60-69): {scoring_result.get('satisfactory_criteria', 0)} criteria
- Poor (<60): {scoring_result.get('poor_criteria', 0)} criteria

🔍 Scoring Methodology: {scoring_method.title()}
🏛️ Agency Standards: {grant_agency}

Next: Use 'generate_reviewer_comments' for detailed feedback or 'generate_reviewer_worksheet' for complete report."""
        
    except Exception as e:
        return f"Error scoring grant application: {str(e)}"

@mcp.tool
def generate_reviewer_comments(
    application_file_path: str,
    nofo_file_path: str,
    grant_agency: str = "HRSA",
    comment_style: str = "professional"
) -> str:
    """
    Generate detailed reviewer comments including strengths, weaknesses, and met criteria.
    
    Args:
        application_file_path: Absolute path to the grant application file
        nofo_file_path: Absolute path to the NOFO file
        grant_agency: The funding agency (HRSA, SAMHSA, etc.)
        comment_style: Style of comments ('professional', 'detailed', 'constructive')
        
    Returns:
        Professional reviewer comments with proper page references
    """
    try:
        # Process documents
        app_content = document_processor.process_document(application_file_path)
        nofo_content = document_processor.process_document(nofo_file_path)
        
        # Generate scores for context
        scoring_result = scoring_engine.score_application(
            app_content, nofo_content, grant_agency
        )
        
        # Generate comments
        comments_result = comment_generator.generate_comments(
            app_content, nofo_content, scoring_result, grant_agency, comment_style
        )
        
        return f"""Reviewer Comments Generated:

📝 STRENGTHS:
{comments_result.get('strengths', '')}

⚠️ WEAKNESSES:
{comments_result.get('weaknesses', '')}

✅ MET CRITERIA:
{comments_result.get('met_criteria', '')}

📋 OVERVIEW:
{comments_result.get('overview', '')}

📄 Page References: {comments_result.get('total_references', 0)}
🎯 Comment Style: {comment_style.title()}
🏛️ Agency Guidelines: {grant_agency}

Comments follow {grant_agency} guidelines starting with "The applicant organization" and include accurate page references."""
        
    except Exception as e:
        return f"Error generating reviewer comments: {str(e)}"

@mcp.tool
def generate_reviewer_worksheet(
    application_file_path: str,
    nofo_file_path: str,
    grant_agency: str = "HRSA",
    output_format: str = "comprehensive"
) -> str:
    """
    Generate a complete reviewer worksheet with scores, comments, and recommendations.
    
    Args:
        application_file_path: Absolute path to the grant application file
        nofo_file_path: Absolute path to the NOFO file
        grant_agency: The funding agency (HRSA, SAMHSA, etc.)
        output_format: Format type ('comprehensive', 'summary', 'detailed')
        
    Returns:
        Complete reviewer worksheet ready for submission
    """
    try:
        # Process documents
        app_content = document_processor.process_document(application_file_path)
        nofo_content = document_processor.process_document(nofo_file_path)
        
        # Generate comprehensive evaluation
        scoring_result = scoring_engine.score_application(
            app_content, nofo_content, grant_agency
        )
        
        comments_result = comment_generator.generate_comments(
            app_content, nofo_content, scoring_result, grant_agency
        )
        
        # Generate final report
        worksheet = report_generator.generate_worksheet(
            app_content, nofo_content, scoring_result, comments_result, 
            grant_agency, output_format
        )
        
        return f"""Complete Reviewer Worksheet Generated:

{worksheet.get('content', '')}

📊 Document Summary:
- Total Pages Reviewed: {worksheet.get('pages_reviewed', 0)}
- Criteria Evaluated: {worksheet.get('criteria_count', 0)}
- References Included: {worksheet.get('reference_count', 0)}
- Format: {output_format.title()}

📋 Worksheet Sections:
✅ Executive Summary
✅ Detailed Scoring
✅ Strength Comments  
✅ Weakness Comments
✅ Met Criteria Comments
✅ Overall Recommendation
✅ Page References

🏛️ Agency: {grant_agency}
📝 Status: Ready for Review

The worksheet follows {grant_agency} standards and includes all required sections for funding decision support."""
        
    except Exception as e:
        return f"Error generating reviewer worksheet: {str(e)}"

@mcp.tool
def extract_grant_sections(
    application_file_path: str,
    section_types: Optional[str] = None
) -> str:
    """
    Extract specific sections from grant application for targeted analysis.
    
    Args:
        application_file_path: Absolute path to the grant application file
        section_types: Comma-separated list of sections to extract (e.g., "abstract,methodology,budget")
        
    Returns:
        Extracted sections with page references and content analysis
    """
    try:
        content = document_processor.process_document(application_file_path)
        
        if section_types:
            requested_sections = [s.strip().lower() for s in section_types.split(',')]
            sections = document_processor.extract_specific_sections(content, requested_sections)
        else:
            sections = content.get('sections', {})
        
        result = "Grant Application Sections Extracted:\n\n"
        
        for section_name, section_content in sections.items():
            result += f"📋 {section_name.upper()}:\n"
            result += f"Pages: {section_content.get('pages', 'N/A')}\n"
            result += f"Word Count: {section_content.get('word_count', 0)}\n"
            result += f"Content Preview: {section_content.get('preview', 'N/A')[:200]}...\n\n"
        
        return result
        
    except Exception as e:
        return f"Error extracting grant sections: {str(e)}"

@mcp.tool
def compare_with_successful_applications(
    application_file_path: str,
    grant_agency: str = "HRSA",
    comparison_type: str = "structural"
) -> str:
    """
    Compare application against patterns from successful grant applications.
    
    Args:
        application_file_path: Absolute path to the grant application file
        grant_agency: The funding agency for appropriate comparison benchmarks
        comparison_type: Type of comparison ('structural', 'content', 'comprehensive')
        
    Returns:
        Comparative analysis report with recommendations for improvement
    """
    try:
        content = document_processor.process_document(application_file_path)
        
        comparison_result = grant_evaluator.compare_with_benchmarks(
            content, grant_agency, comparison_type
        )
        
        return f"""Comparative Analysis Complete:

🎯 Overall Similarity to Successful Applications: {comparison_result.get('similarity_score', 0)}%

📊 Structural Comparison:
- Section Organization: {comparison_result.get('structure_score', 0)}%
- Required Elements: {comparison_result.get('completeness_score', 0)}%
- Professional Formatting: {comparison_result.get('format_score', 0)}%

📋 Content Quality Indicators:
- Clarity & Specificity: {comparison_result.get('clarity_score', 0)}%
- Evidence & Support: {comparison_result.get('evidence_score', 0)}%
- Innovation Factor: {comparison_result.get('innovation_score', 0)}%

🔍 Key Recommendations:
{comparison_result.get('recommendations', '')}

📈 Competitive Positioning: {comparison_result.get('competitive_position', 'Under Analysis')}
🏛️ Benchmark Agency: {grant_agency}
📊 Comparison Type: {comparison_type.title()}

This analysis helps identify areas for strengthening your application based on successful funding patterns."""
        
    except Exception as e:
        return f"Error performing comparative analysis: {str(e)}"

@mcp.tool
def validate_application_completeness(
    application_file_path: str,
    nofo_file_path: str,
    grant_agency: str = "HRSA"
) -> str:
    """
    Validate that grant application meets all NOFO requirements and completeness criteria.
    
    Args:
        application_file_path: Absolute path to the grant application file
        nofo_file_path: Absolute path to the NOFO file
        grant_agency: The funding agency for specific validation rules
        
    Returns:
        Comprehensive validation report with missing elements and compliance status
    """
    try:
        app_content = document_processor.process_document(application_file_path)
        nofo_content = document_processor.process_document(nofo_file_path)
        
        validation_result = grant_evaluator.validate_completeness(
            app_content, nofo_content, grant_agency
        )
        
        return f"""Application Completeness Validation:

✅ VALIDATION STATUS: {validation_result.get('overall_status', 'Under Review')}
📊 Completeness Score: {validation_result.get('completeness_percentage', 0)}%

📋 Required Elements Status:
{validation_result.get('required_elements', '')}

⚠️ Missing Elements:
{validation_result.get('missing_elements', 'None identified')}

🔍 Format Compliance:
- Page Limits: {validation_result.get('page_limit_status', 'Unknown')}
- Font Requirements: {validation_result.get('font_compliance', 'Unknown')}
- Section Organization: {validation_result.get('organization_status', 'Unknown')}

📄 Administrative Requirements:
{validation_result.get('admin_requirements', '')}

🚨 Critical Issues: {validation_result.get('critical_issues', 0)}
⚠️ Minor Issues: {validation_result.get('minor_issues', 0)}

🏛️ Agency: {grant_agency}
📅 Validation Date: {validation_result.get('validation_date', 'Unknown')}

Recommendation: {'PROCEED TO SUBMISSION' if validation_result.get('completeness_percentage', 0) >= 90 else 'ADDRESS ISSUES BEFORE SUBMISSION'}"""
        
    except Exception as e:
        return f"Error validating application completeness: {str(e)}"

if __name__ == "__main__":
    mcp.run()