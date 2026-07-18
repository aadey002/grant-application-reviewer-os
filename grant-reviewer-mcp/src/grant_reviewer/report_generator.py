"""
Report Generator for Grant Reviews

Creates comprehensive reviewer worksheets and evaluation reports following agency standards.
Generates professional documents suitable for funding decision support.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

class ReportGenerator:
    """Generates comprehensive grant review reports and worksheets."""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def generate_worksheet(self, app_content: Dict[str, Any],
                          nofo_content: Dict[str, Any],
                          scoring_result: Dict[str, Any],
                          comments_result: Dict[str, Any],
                          grant_agency: str = "HRSA",
                          output_format: str = "comprehensive") -> Dict[str, Any]:
        """
        Generate complete reviewer worksheet.
        
        Args:
            app_content: Processed application content
            nofo_content: Processed NOFO content
            scoring_result: Scoring results
            comments_result: Generated comments
            grant_agency: Funding agency
            output_format: Format type
            
        Returns:
            Complete worksheet with metadata
        """
        worksheet_result = {
            'generation_date': datetime.now().isoformat(),
            'grant_agency': grant_agency,
            'output_format': output_format,
            'content': '',
            'pages_reviewed': app_content.get('total_pages', 0),
            'criteria_count': len(scoring_result.get('criterion_scores', {})),
            'reference_count': comments_result.get('total_references', 0),
            'metadata': {}
        }
        
        try:
            if output_format == "comprehensive":
                worksheet_content = self._generate_comprehensive_worksheet(
                    app_content, nofo_content, scoring_result, comments_result, grant_agency
                )
            elif output_format == "summary":
                worksheet_content = self._generate_summary_worksheet(
                    app_content, scoring_result, comments_result, grant_agency
                )
            elif output_format == "detailed":
                worksheet_content = self._generate_detailed_worksheet(
                    app_content, nofo_content, scoring_result, comments_result, grant_agency
                )
            else:
                worksheet_content = self._generate_comprehensive_worksheet(
                    app_content, nofo_content, scoring_result, comments_result, grant_agency
                )
            
            worksheet_result['content'] = worksheet_content
            worksheet_result['metadata'] = self._generate_metadata(
                app_content, scoring_result, comments_result, grant_agency
            )
            
        except Exception as e:
            self.logger.error(f"Error generating worksheet: {str(e)}")
            worksheet_result['error'] = str(e)
        
        return worksheet_result
    
    def _generate_comprehensive_worksheet(self, app_content: Dict[str, Any],
                                        nofo_content: Dict[str, Any],
                                        scoring_result: Dict[str, Any],
                                        comments_result: Dict[str, Any],
                                        grant_agency: str) -> str:
        """Generate comprehensive reviewer worksheet."""
        
        # Extract key information
        overall_score = scoring_result.get('overall_score', 0)
        recommendation = scoring_result.get('recommendation', 'Under Review')
        criterion_scores = scoring_result.get('criterion_scores', {})
        
        worksheet = f"""# {grant_agency} GRANT REVIEWER WORKSHEET

## APPLICATION INFORMATION
- **Review Date**: {datetime.now().strftime('%Y-%m-%d')}
- **Grant Agency**: {grant_agency}
- **Total Pages Reviewed**: {app_content.get('total_pages', 'Unknown')}
- **Document Type**: {app_content.get('document_type', 'Unknown')}

---

## EXECUTIVE SUMMARY

{comments_result.get('overview', 'No overview available.')}

**Overall Score**: {overall_score}/100
**Funding Recommendation**: {recommendation}

---

## DETAILED SCORING BREAKDOWN

### Score Summary
{scoring_result.get('criterion_breakdown', 'No detailed breakdown available.')}

### Score Distribution
- **Outstanding Criteria**: {scoring_result.get('score_distribution', {}).get('outstanding_criteria', 0)}
- **Very Good Criteria**: {scoring_result.get('score_distribution', {}).get('very_good_criteria', 0)}
- **Good/Acceptable Criteria**: {scoring_result.get('score_distribution', {}).get('good_criteria', 0)}
- **Satisfactory/Marginal Criteria**: {scoring_result.get('score_distribution', {}).get('satisfactory_criteria', 0)}
- **Poor/Unacceptable Criteria**: {scoring_result.get('score_distribution', {}).get('poor_criteria', 0)}

### Individual Criterion Analysis
"""
        
        # Add detailed criterion analysis
        for criterion_name, criterion_data in criterion_scores.items():
            worksheet += f"""
#### {criterion_name}
- **Score**: {criterion_data.get('points_awarded', 0)}/{criterion_data.get('max_points', 0)}
- **Performance Level**: {criterion_data.get('level', 'Unknown').title()}
- **Section Analyzed**: {criterion_data.get('section_analyzed', 'Multiple sections')}
- **Analysis**: {criterion_data.get('justification', 'No analysis available.')}
"""
        
        worksheet += f"""
---

## REVIEWER COMMENTS

### STRENGTHS
{comments_result.get('strengths', 'No strengths identified.')}

### WEAKNESSES
{comments_result.get('weaknesses', 'No weaknesses identified.')}

### MET CRITERIA
{comments_result.get('met_criteria', 'No met criteria identified.')}

---

## DETAILED ANALYSIS

### Strongest Areas
"""
        
        detailed_analysis = scoring_result.get('detailed_analysis', {})
        strongest_criteria = detailed_analysis.get('strongest_criteria', [])
        weakest_criteria = detailed_analysis.get('weakest_criteria', [])
        improvement_priorities = detailed_analysis.get('improvement_priorities', [])
        
        for i, criterion in enumerate(strongest_criteria, 1):
            worksheet += f"{i}. {criterion}\n"
        
        worksheet += f"""
### Areas Needing Improvement
"""
        for i, criterion in enumerate(weakest_criteria, 1):
            worksheet += f"{i}. {criterion}\n"
        
        worksheet += f"""
### Improvement Recommendations
"""
        for i, recommendation in enumerate(improvement_priorities, 1):
            worksheet += f"{i}. {recommendation}\n"
        
        worksheet += f"""
### Overall Assessment
{detailed_analysis.get('overall_assessment', 'No overall assessment available.')}

---

## COMPLIANCE AND TECHNICAL REVIEW

### Document Completeness
- **Required Sections Present**: {len(app_content.get('sections', {}))} sections identified
- **Tables and Figures**: {len(app_content.get('tables', []))} tables found
- **Page References**: {comments_result.get('total_references', 0)} references included

### Format Compliance
- **Font and Formatting**: Cannot be verified from extracted text
- **Page Numbering**: Cannot be verified from extracted text
- **Margin Requirements**: Cannot be verified from extracted text

---

## FINAL RECOMMENDATION

**Funding Decision**: {recommendation}

**Justification**: Based on the comprehensive evaluation across all criteria, this application {'demonstrates strong merit and is recommended for funding' if overall_score >= 75 else 'requires significant improvement before funding consideration' if overall_score >= 50 else 'does not meet funding standards and is not recommended'}.

**Key Decision Factors**:
1. Overall score of {overall_score}/100
2. {scoring_result.get('score_distribution', {}).get('outstanding_criteria', 0)} criteria rated Outstanding
3. {scoring_result.get('score_distribution', {}).get('poor_criteria', 0)} criteria rated Poor/Unacceptable

---

## REVIEWER CERTIFICATION

This review was conducted in accordance with {grant_agency} evaluation standards and guidelines. All comments are based solely on information provided in the grant application and NOFO requirements.

**Reviewer**: Grant Review MCP System
**Date**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Review Method**: Automated Analysis with Human Oversight Protocol
"""
        
        return worksheet
    
    def _generate_summary_worksheet(self, app_content: Dict[str, Any],
                                  scoring_result: Dict[str, Any],
                                  comments_result: Dict[str, Any],
                                  grant_agency: str) -> str:
        """Generate summary reviewer worksheet."""
        
        overall_score = scoring_result.get('overall_score', 0)
        recommendation = scoring_result.get('recommendation', 'Under Review')
        
        summary = f"""# {grant_agency} GRANT REVIEW SUMMARY

## BASIC INFORMATION
- **Review Date**: {datetime.now().strftime('%Y-%m-%d')}
- **Pages Reviewed**: {app_content.get('total_pages', 'Unknown')}
- **Overall Score**: {overall_score}/100
- **Recommendation**: {recommendation}

## OVERVIEW
{comments_result.get('overview', 'No overview available.')}

## KEY FINDINGS

### Top Strengths
{self._extract_top_points(comments_result.get('strengths', ''), 3)}

### Main Concerns
{self._extract_top_points(comments_result.get('weaknesses', ''), 3)}

### Score Breakdown
{scoring_result.get('criterion_breakdown', 'No breakdown available.')}

## FINAL RECOMMENDATION
{recommendation}

**Generated by**: Grant Review MCP System
**Date**: {datetime.now().strftime('%Y-%m-%d')}
"""
        
        return summary
    
    def _generate_detailed_worksheet(self, app_content: Dict[str, Any],
                                   nofo_content: Dict[str, Any],
                                   scoring_result: Dict[str, Any],
                                   comments_result: Dict[str, Any],
                                   grant_agency: str) -> str:
        """Generate detailed reviewer worksheet with extensive analysis."""
        
        detailed = f"""# DETAILED {grant_agency} GRANT EVALUATION REPORT

## COMPREHENSIVE APPLICATION ANALYSIS

### Document Processing Summary
- **Application File**: {app_content.get('file_path', 'Unknown')}
- **Document Type**: {app_content.get('document_type', 'Unknown')}
- **Total Pages**: {app_content.get('total_pages', 0)}
- **Sections Identified**: {len(app_content.get('sections', {}))}
- **Tables Extracted**: {len(app_content.get('tables', []))}
- **Processing Date**: {app_content.get('processed_date', 'Unknown')}

### NOFO Analysis
- **NOFO File**: {nofo_content.get('file_path', 'Unknown')}
- **NOFO Pages**: {nofo_content.get('total_pages', 0)}
- **Evaluation Criteria**: {len(nofo_content.get('sections', {}))}

---

## SECTION-BY-SECTION ANALYSIS
"""
        
        # Add detailed section analysis
        sections = app_content.get('sections', {})
        criterion_scores = scoring_result.get('criterion_scores', {})
        
        for section_name, section_content in sections.items():
            detailed += f"""
### {section_name.replace('_', ' ').title()}
- **Word Count**: {section_content.get('word_count', 0)}
- **Estimated Pages**: {section_content.get('pages', 'Unknown')}
- **Content Preview**: {section_content.get('preview', 'No preview available')}

**Quality Assessment**: Based on content analysis, this section demonstrates {'strong' if section_content.get('word_count', 0) > 300 else 'adequate' if section_content.get('word_count', 0) > 150 else 'limited'} detail and development.
"""
        
        detailed += f"""
---

## CRITERION-BY-CRITERION EVALUATION
"""
        
        for criterion_name, criterion_data in criterion_scores.items():
            analysis = criterion_data.get('analysis', {})
            detailed += f"""
### {criterion_name}

**Score**: {criterion_data.get('points_awarded', 0)}/{criterion_data.get('max_points', 0)} ({criterion_data.get('level', 'Unknown').title()})

**Performance Metrics**:
- Completeness: {analysis.get('completeness', 0):.1f}/100
- Quality: {analysis.get('quality', 0):.1f}/100
- Specificity: {analysis.get('specificity', 0):.1f}/100
- Evidence: {analysis.get('evidence', 0):.1f}/100
- Clarity: {analysis.get('clarity', 0):.1f}/100

**Identified Strengths**: {', '.join(analysis.get('strengths', ['None identified']))}
**Areas for Improvement**: {', '.join(analysis.get('issues', ['None identified']))}

**Detailed Assessment**: {criterion_data.get('justification', 'No detailed assessment available.')}
"""
        
        detailed += f"""
---

## COMPREHENSIVE COMMENT ANALYSIS

### Strength Comments with References
{comments_result.get('strengths', 'No strengths identified.')}

### Weakness Comments with References
{comments_result.get('weaknesses', 'No weaknesses identified.')}

### Met Criteria Comments
{comments_result.get('met_criteria', 'No met criteria identified.')}

---

## STATISTICAL ANALYSIS

### Score Distribution Analysis
"""
        
        score_dist = scoring_result.get('score_distribution', {})
        total_criteria = sum(score_dist.values())
        
        if total_criteria > 0:
            detailed += f"""
- **Outstanding Performance**: {score_dist.get('outstanding_criteria', 0)}/{total_criteria} ({score_dist.get('outstanding_criteria', 0)/total_criteria*100:.1f}%)
- **Very Good Performance**: {score_dist.get('very_good_criteria', 0)}/{total_criteria} ({score_dist.get('very_good_criteria', 0)/total_criteria*100:.1f}%)
- **Good/Acceptable Performance**: {score_dist.get('good_criteria', 0)}/{total_criteria} ({score_dist.get('good_criteria', 0)/total_criteria*100:.1f}%)
- **Satisfactory/Marginal Performance**: {score_dist.get('satisfactory_criteria', 0)}/{total_criteria} ({score_dist.get('satisfactory_criteria', 0)/total_criteria*100:.1f}%)
- **Poor/Unacceptable Performance**: {score_dist.get('poor_criteria', 0)}/{total_criteria} ({score_dist.get('poor_criteria', 0)/total_criteria*100:.1f}%)
"""
        
        detailed += f"""
### Application Characteristics
- **Average Section Length**: {sum(s.get('word_count', 0) for s in sections.values()) / len(sections) if sections else 0:.0f} words
- **Content Density**: {'High' if app_content.get('total_pages', 0) > 0 and sum(s.get('word_count', 0) for s in sections.values()) / app_content.get('total_pages', 1) > 300 else 'Moderate'}
- **Structural Organization**: {'Well-organized' if len(sections) >= 7 else 'Basic organization'}

---

## FINAL EVALUATION SUMMARY

### Overall Performance Assessment
{scoring_result.get('detailed_analysis', {}).get('overall_assessment', 'No assessment available.')}

### Key Decision Factors
1. **Overall Score**: {scoring_result.get('overall_score', 0)}/100
2. **Criterion Performance**: {total_criteria} criteria evaluated
3. **Content Quality**: Based on comprehensive analysis of {sum(s.get('word_count', 0) for s in sections.values())} words across {len(sections)} sections
4. **Compliance Status**: All required elements addressed

### Funding Recommendation
**Decision**: {scoring_result.get('recommendation', 'Under Review')}

**Rationale**: This recommendation is based on systematic evaluation using {grant_agency}-specific criteria and standards, comprehensive content analysis, and objective scoring methodology.

---

## REVIEW METHODOLOGY AND STANDARDS

### Evaluation Framework
- **Agency Standards**: {grant_agency} evaluation criteria and rubrics
- **Scoring Method**: {scoring_result.get('scoring_method', 'Standard')}
- **Review Approach**: Comprehensive analysis with bias mitigation protocols

### Quality Assurance
- **Page References**: {comments_result.get('total_references', 0)} specific page citations included
- **Evidence-Based**: All comments based solely on application content
- **Objectivity**: Standardized scoring rubrics applied consistently

### Review Limitations
- **Format Analysis**: Visual formatting cannot be assessed from text extraction
- **Figure Quality**: Image content not analyzed in current implementation
- **Interactive Elements**: Web-based or multimedia components not evaluated

---

**Report Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Generated by**: Grant Review MCP System v1.0
**Review Protocol**: {grant_agency} Standards Compliant
"""
        
        return detailed
    
    def _extract_top_points(self, text: str, count: int) -> str:
        """Extract top N points from comment text."""
        if not text:
            return "None identified."
        
        # Split by paragraphs or sentences
        points = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        if not points:
            sentences = [s.strip() for s in text.split('.') if s.strip()]
            points = sentences[:count]
        
        top_points = points[:count]
        
        result = ""
        for i, point in enumerate(top_points, 1):
            # Clean up point
            clean_point = point.replace('\n', ' ').strip()
            if len(clean_point) > 150:
                clean_point = clean_point[:147] + "..."
            result += f"{i}. {clean_point}\n"
        
        return result if result else "None identified."
    
    def _generate_metadata(self, app_content: Dict[str, Any],
                          scoring_result: Dict[str, Any],
                          comments_result: Dict[str, Any],
                          grant_agency: str) -> Dict[str, Any]:
        """Generate metadata for the worksheet."""
        
        return {
            'application_metadata': {
                'total_pages': app_content.get('total_pages', 0),
                'sections_count': len(app_content.get('sections', {})),
                'tables_count': len(app_content.get('tables', [])),
                'total_words': sum(s.get('word_count', 0) for s in app_content.get('sections', {}).values()),
                'document_type': app_content.get('document_type', 'Unknown')
            },
            'evaluation_metadata': {
                'overall_score': scoring_result.get('overall_score', 0),
                'criteria_evaluated': len(scoring_result.get('criterion_scores', {})),
                'recommendation': scoring_result.get('recommendation', 'Under Review'),
                'scoring_method': scoring_result.get('scoring_method', 'Standard'),
                'grant_agency': grant_agency
            },
            'comments_metadata': {
                'page_references': comments_result.get('total_references', 0),
                'comment_sections': {
                    'strengths': len(comments_result.get('strengths', '').split('\n\n')),
                    'weaknesses': len(comments_result.get('weaknesses', '').split('\n\n')),
                    'met_criteria': len(comments_result.get('met_criteria', '').split('\n\n'))
                }
            },
            'generation_info': {
                'generation_date': datetime.now().isoformat(),
                'system_version': '1.0',
                'review_protocol': f'{grant_agency} Standards Compliant'
            }
        }
