"""
Grant Evaluator Module

Core evaluation logic for grant applications based on HRSA, SAMHSA, and other federal 
agency standards. Provides comprehensive analysis and assessment capabilities.
"""

import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import logging

class GrantEvaluator:
    """Main evaluator for grant applications."""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
        # Agency-specific evaluation criteria
        self.agency_criteria = {
            'HRSA': {
                'key_focus_areas': [
                    'maternal_health', 'rural_health', 'hiv_aids_services', 
                    'behavioral_health', 'health_workforce', 'primary_care'
                ],
                'evaluation_standards': [
                    'relevance_to_hrsa_priorities', 'program_feasibility', 
                    'innovation', 'community_impact', 'sustainability', 
                    'organizational_capacity'
                ],
                'required_sections': [
                    'project_description', 'statement_of_need', 'goals_objectives',
                    'methodology', 'evaluation', 'budget', 'organizational_capacity'
                ]
            },
            'SAMHSA': {
                'key_focus_areas': [
                    'substance_abuse', 'mental_health', 'behavioral_health',
                    'prevention', 'treatment', 'recovery_support'
                ],
                'evaluation_standards': [
                    'alignment_with_samhsa_goals', 'evidence_based_practices',
                    'target_population_focus', 'measurable_outcomes',
                    'cultural_competency', 'sustainability'
                ],
                'required_sections': [
                    'project_narrative', 'statement_of_need', 'project_description',
                    'goals_objectives', 'methods', 'evaluation', 'budget'
                ]
            }
        }
    
    def evaluate_application(self, app_content: Dict[str, Any], 
                           nofo_content: Dict[str, Any],
                           grant_agency: str = "HRSA",
                           evaluation_criteria: Optional[str] = None) -> Dict[str, Any]:
        """
        Perform comprehensive evaluation of grant application.
        
        Args:
            app_content: Processed application document content
            nofo_content: Processed NOFO document content
            grant_agency: Funding agency
            evaluation_criteria: Specific criteria to focus on
            
        Returns:
            Comprehensive evaluation results
        """
        evaluation_result = {
            'evaluation_date': datetime.now().isoformat(),
            'grant_agency': grant_agency,
            'overall_assessment': 'Under Review',
            'completeness_score': 0,
            'strengths': [],
            'concerns': [],
            'recommendations': [],
            'missing_elements': [],
            'compliance_status': {}
        }
        
        try:
            # Check document completeness
            completeness = self._assess_completeness(app_content, nofo_content, grant_agency)
            evaluation_result['completeness_score'] = completeness['score']
            evaluation_result['missing_elements'] = completeness['missing']
            
            # Evaluate content quality
            content_quality = self._assess_content_quality(app_content, grant_agency)
            evaluation_result['content_quality'] = content_quality
            
            # Check alignment with agency priorities
            alignment = self._assess_agency_alignment(app_content, grant_agency)
            evaluation_result['agency_alignment'] = alignment
            
            # Identify strengths and concerns
            strengths, concerns = self._identify_strengths_concerns(
                app_content, nofo_content, grant_agency
            )
            evaluation_result['strengths'] = strengths
            evaluation_result['concerns'] = concerns
            
            # Generate recommendations
            evaluation_result['recommendations'] = self._generate_recommendations(
                evaluation_result, app_content, grant_agency
            )
            
            # Determine overall assessment
            evaluation_result['overall_assessment'] = self._determine_overall_assessment(
                evaluation_result
            )
            
        except Exception as e:
            self.logger.error(f"Error in evaluation: {str(e)}")
            evaluation_result['error'] = str(e)
        
        return evaluation_result
    
    def _assess_completeness(self, app_content: Dict[str, Any],
                           nofo_content: Dict[str, Any],
                           grant_agency: str) -> Dict[str, Any]:
        """Assess completeness of application against NOFO requirements."""
        required_sections = self.agency_criteria.get(grant_agency, {}).get('required_sections', [])
        app_sections = set(app_content.get('sections', {}).keys())
        
        # Check for required sections
        missing_sections = []
        present_sections = []
        
        for required in required_sections:
            found = False
            for app_section in app_sections:
                if self._sections_match(required, app_section):
                    present_sections.append(required)
                    found = True
                    break
            if not found:
                missing_sections.append(required)
        
        # Calculate completeness score
        total_required = len(required_sections)
        total_present = len(present_sections)
        completeness_score = (total_present / total_required * 100) if total_required > 0 else 0
        
        return {
            'score': round(completeness_score, 1),
            'missing': missing_sections,
            'present': present_sections,
            'total_required': total_required,
            'total_present': total_present
        }
    
    def _sections_match(self, required: str, app_section: str) -> bool:
        """Check if application section matches required section."""
        # Normalize names for comparison
        required_normalized = required.lower().replace('_', ' ')
        app_normalized = app_section.lower().replace('_', ' ')
        
        # Check for exact match or partial match
        return (required_normalized in app_normalized or 
                app_normalized in required_normalized or
                any(word in app_normalized for word in required_normalized.split()))
    
    def _assess_content_quality(self, app_content: Dict[str, Any], 
                              grant_agency: str) -> Dict[str, Any]:
        """Assess quality of content in application."""
        sections = app_content.get('sections', {})
        quality_indicators = {
            'clarity_score': 0,
            'specificity_score': 0,
            'evidence_score': 0,
            'innovation_score': 0,
            'detail_scores': {}
        }
        
        total_word_count = 0
        section_count = 0
        
        for section_name, section_content in sections.items():
            section_quality = self._evaluate_section_quality(section_content, grant_agency)
            quality_indicators['detail_scores'][section_name] = section_quality
            
            total_word_count += section_content.get('word_count', 0)
            section_count += 1
        
        # Calculate overall scores
        if section_count > 0:
            quality_indicators['clarity_score'] = sum(
                s.get('clarity', 0) for s in quality_indicators['detail_scores'].values()
            ) / section_count
            
            quality_indicators['specificity_score'] = sum(
                s.get('specificity', 0) for s in quality_indicators['detail_scores'].values()
            ) / section_count
            
            quality_indicators['evidence_score'] = sum(
                s.get('evidence', 0) for s in quality_indicators['detail_scores'].values()
            ) / section_count
        
        quality_indicators['total_word_count'] = total_word_count
        quality_indicators['average_section_length'] = total_word_count / section_count if section_count > 0 else 0
        
        return quality_indicators
    
    def _evaluate_section_quality(self, section_content: Dict[str, Any], 
                                grant_agency: str) -> Dict[str, Any]:
        """Evaluate quality of individual section."""
        content = section_content.get('content', '')
        word_count = section_content.get('word_count', 0)
        
        # Analyze content characteristics
        quality_scores = {
            'clarity': self._assess_clarity(content),
            'specificity': self._assess_specificity(content),
            'evidence': self._assess_evidence_base(content),
            'completeness': self._assess_section_completeness(content, word_count)
        }
        
        return quality_scores
    
    def _assess_clarity(self, content: str) -> float:
        """Assess clarity of writing in content."""
        # Simple metrics for clarity assessment
        sentences = re.split(r'[.!?]+', content)
        if not sentences:
            return 0.0
        
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)
        
        # Penalize very long sentences (unclear) and very short ones (incomplete)
        if 10 <= avg_sentence_length <= 25:
            clarity_score = 85.0
        elif 8 <= avg_sentence_length <= 30:
            clarity_score = 70.0
        else:
            clarity_score = 50.0
        
        # Check for clarity indicators
        clarity_words = ['specifically', 'clearly', 'precisely', 'exactly', 'namely']
        clarity_count = sum(1 for word in clarity_words if word in content.lower())
        clarity_score += min(clarity_count * 2, 15)  # Bonus for clarity words
        
        return min(clarity_score, 100.0)
    
    def _assess_specificity(self, content: str) -> float:
        """Assess specificity and detail level."""
        # Look for specific indicators
        numbers = len(re.findall(r'\b\d+(?:[.,]\d+)?\b', content))
        percentages = len(re.findall(r'\b\d+(?:[.,]\d+)?%', content))
        dates = len(re.findall(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', content))
        specific_terms = len(re.findall(r'\b(?:will|shall|must|specifically|exactly)\b', content.lower()))
        
        specificity_score = min((numbers + percentages * 2 + dates * 2 + specific_terms) * 2, 100)
        
        return specificity_score
    
    def _assess_evidence_base(self, content: str) -> float:
        """Assess evidence-based approach."""
        evidence_indicators = [
            'research', 'study', 'evidence', 'data', 'evaluation',
            'published', 'peer-reviewed', 'citation', 'reference'
        ]
        
        evidence_count = sum(1 for indicator in evidence_indicators 
                           if indicator in content.lower())
        
        evidence_score = min(evidence_count * 8, 100)
        
        return evidence_score
    
    def _assess_section_completeness(self, content: str, word_count: int) -> float:
        """Assess if section has adequate detail."""
        # Basic completeness based on length and content
        if word_count < 50:
            return 20.0
        elif word_count < 100:
            return 50.0
        elif word_count < 200:
            return 75.0
        else:
            return 90.0
    
    def _assess_agency_alignment(self, app_content: Dict[str, Any], 
                               grant_agency: str) -> Dict[str, Any]:
        """Assess alignment with agency priorities."""
        focus_areas = self.agency_criteria.get(grant_agency, {}).get('key_focus_areas', [])
        text_content = app_content.get('text_content', '').lower()
        
        alignment_scores = {}
        total_alignment = 0
        
        for focus_area in focus_areas:
            # Convert focus area to searchable terms
            search_terms = focus_area.replace('_', ' ').split()
            mentions = sum(1 for term in search_terms if term in text_content)
            alignment_score = min(mentions * 20, 100)
            alignment_scores[focus_area] = alignment_score
            total_alignment += alignment_score
        
        average_alignment = total_alignment / len(focus_areas) if focus_areas else 0
        
        return {
            'overall_alignment': round(average_alignment, 1),
            'focus_area_scores': alignment_scores,
            'high_alignment_areas': [area for area, score in alignment_scores.items() if score >= 60],
            'low_alignment_areas': [area for area, score in alignment_scores.items() if score < 40]
        }
    
    def _identify_strengths_concerns(self, app_content: Dict[str, Any],
                                   nofo_content: Dict[str, Any],
                                   grant_agency: str) -> Tuple[List[str], List[str]]:
        """Identify key strengths and areas of concern."""
        strengths = []
        concerns = []
        
        sections = app_content.get('sections', {})
        
        # Analyze each section for strengths and concerns
        for section_name, section_content in sections.items():
            section_strengths, section_concerns = self._analyze_section_strengths_concerns(
                section_name, section_content, grant_agency
            )
            strengths.extend(section_strengths)
            concerns.extend(section_concerns)
        
        # Add overall application strengths/concerns
        overall_strengths, overall_concerns = self._analyze_overall_application(
            app_content, grant_agency
        )
        strengths.extend(overall_strengths)
        concerns.extend(overall_concerns)
        
        return strengths[:10], concerns[:10]  # Limit to top 10 each
    
    def _analyze_section_strengths_concerns(self, section_name: str,
                                          section_content: Dict[str, Any],
                                          grant_agency: str) -> Tuple[List[str], List[str]]:
        """Analyze individual section for strengths and concerns."""
        strengths = []
        concerns = []
        
        word_count = section_content.get('word_count', 0)
        content = section_content.get('content', '')
        
        # Word count analysis
        if word_count > 500:
            strengths.append(f"Comprehensive {section_name.replace('_', ' ')} section with detailed information")
        elif word_count < 100:
            concerns.append(f"Brief {section_name.replace('_', ' ')} section may lack sufficient detail")
        
        # Content-specific analysis
        if 'methodology' in section_name.lower():
            if any(term in content.lower() for term in ['systematic', 'evidence-based', 'validated']):
                strengths.append("Methodology demonstrates evidence-based approach")
            if 'timeline' not in content.lower():
                concerns.append("Methodology section lacks clear timeline")
        
        if 'budget' in section_name.lower():
            if any(term in content.lower() for term in ['cost-effective', 'reasonable', 'justified']):
                strengths.append("Budget appears well-justified and cost-effective")
            if not re.search(r'\$[\d,]+', content):
                concerns.append("Budget section lacks specific dollar amounts")
        
        return strengths, concerns
    
    def _analyze_overall_application(self, app_content: Dict[str, Any],
                                   grant_agency: str) -> Tuple[List[str], List[str]]:
        """Analyze overall application characteristics."""
        strengths = []
        concerns = []
        
        total_pages = app_content.get('total_pages', 0)
        sections_count = len(app_content.get('sections', {}))
        tables_count = len(app_content.get('tables', []))
        
        # Overall structure analysis
        if sections_count >= 7:
            strengths.append("Well-organized application with comprehensive section structure")
        elif sections_count < 5:
            concerns.append("Application may be missing key required sections")
        
        if tables_count > 0:
            strengths.append("Includes tables and structured data presentation")
        
        if total_pages > 50:
            concerns.append("Application may exceed typical page limits")
        elif total_pages < 10:
            concerns.append("Application appears unusually brief for grant proposal")
        
        return strengths, concerns
    
    def _generate_recommendations(self, evaluation_result: Dict[str, Any],
                                app_content: Dict[str, Any],
                                grant_agency: str) -> List[str]:
        """Generate actionable recommendations for improvement."""
        recommendations = []
        
        # Completeness-based recommendations
        if evaluation_result['completeness_score'] < 80:
            missing = evaluation_result.get('missing_elements', [])
            if missing:
                recommendations.append(f"Address missing sections: {', '.join(missing)}")
        
        # Content quality recommendations
        content_quality = evaluation_result.get('content_quality', {})
        if content_quality.get('clarity_score', 0) < 70:
            recommendations.append("Improve clarity and readability of content")
        
        if content_quality.get('evidence_score', 0) < 60:
            recommendations.append("Strengthen evidence base with more research citations and data")
        
        # Agency alignment recommendations
        alignment = evaluation_result.get('agency_alignment', {})
        low_alignment_areas = alignment.get('low_alignment_areas', [])
        if low_alignment_areas:
            recommendations.append(f"Better align with {grant_agency} priorities in: {', '.join(low_alignment_areas)}")
        
        # Specific concerns-based recommendations
        concerns = evaluation_result.get('concerns', [])
        if any('timeline' in concern.lower() for concern in concerns):
            recommendations.append("Include detailed project timeline with milestones")
        
        if any('budget' in concern.lower() for concern in concerns):
            recommendations.append("Provide more detailed budget justification")
        
        return recommendations[:8]  # Limit to top 8 recommendations
    
    def _determine_overall_assessment(self, evaluation_result: Dict[str, Any]) -> str:
        """Determine overall assessment category."""
        completeness = evaluation_result.get('completeness_score', 0)
        content_quality = evaluation_result.get('content_quality', {})
        avg_quality = (
            content_quality.get('clarity_score', 0) +
            content_quality.get('specificity_score', 0) +
            content_quality.get('evidence_score', 0)
        ) / 3
        
        agency_alignment = evaluation_result.get('agency_alignment', {}).get('overall_alignment', 0)
        
        # Weighted overall score
        overall_score = (completeness * 0.4 + avg_quality * 0.35 + agency_alignment * 0.25)
        
        if overall_score >= 85:
            return "Highly Competitive"
        elif overall_score >= 75:
            return "Competitive"
        elif overall_score >= 65:
            return "Moderately Competitive"
        elif overall_score >= 50:
            return "Needs Improvement"
        else:
            return "Requires Significant Revision"
    
    def compare_with_benchmarks(self, app_content: Dict[str, Any],
                              grant_agency: str,
                              comparison_type: str = "structural") -> Dict[str, Any]:
        """Compare application with successful application benchmarks."""
        # This would typically use a database of successful applications
        # For now, we'll use heuristic benchmarks
        
        benchmarks = {
            'word_count_range': (8000, 15000),
            'section_count_range': (7, 12),
            'table_count_range': (2, 8),
            'evidence_references': 15,
            'methodology_detail_level': 80
        }
        
        comparison_result = {
            'similarity_score': 0,
            'structure_score': 0,
            'completeness_score': 0,
            'format_score': 0,
            'recommendations': [],
            'competitive_position': 'Under Analysis'
        }
        
        # Structural comparison
        sections_count = len(app_content.get('sections', {}))
        tables_count = len(app_content.get('tables', []))
        total_words = sum(s.get('word_count', 0) for s in app_content.get('sections', {}).values())
        
        # Calculate scores
        structure_factors = []
        
        # Word count comparison
        min_words, max_words = benchmarks['word_count_range']
        if min_words <= total_words <= max_words:
            structure_factors.append(100)
        else:
            structure_factors.append(max(0, 100 - abs(total_words - (min_words + max_words) / 2) / 100))
        
        # Section count comparison
        min_sections, max_sections = benchmarks['section_count_range']
        if min_sections <= sections_count <= max_sections:
            structure_factors.append(100)
        else:
            structure_factors.append(max(0, 100 - abs(sections_count - (min_sections + max_sections) / 2) * 10))
        
        comparison_result['structure_score'] = round(sum(structure_factors) / len(structure_factors), 1)
        comparison_result['similarity_score'] = comparison_result['structure_score']  # Simplified
        
        # Generate recommendations based on benchmarks
        if total_words < min_words:
            comparison_result['recommendations'].append(f"Consider expanding content (current: {total_words}, benchmark: {min_words}-{max_words} words)")
        elif total_words > max_words:
            comparison_result['recommendations'].append(f"Consider condensing content (current: {total_words}, benchmark: {min_words}-{max_words} words)")
        
        if sections_count < min_sections:
            comparison_result['recommendations'].append(f"Add more detailed sections (current: {sections_count}, benchmark: {min_sections}-{max_sections})")
        
        # Determine competitive position
        if comparison_result['similarity_score'] >= 80:
            comparison_result['competitive_position'] = "Strong"
        elif comparison_result['similarity_score'] >= 60:
            comparison_result['competitive_position'] = "Moderate"
        else:
            comparison_result['competitive_position'] = "Needs Improvement"
        
        return comparison_result
    
    def validate_completeness(self, app_content: Dict[str, Any],
                            nofo_content: Dict[str, Any],
                            grant_agency: str) -> Dict[str, Any]:
        """Validate application completeness against NOFO requirements."""
        validation_result = {
            'overall_status': 'Under Review',
            'completeness_percentage': 0,
            'required_elements': '',
            'missing_elements': 'None identified',
            'admin_requirements': '',
            'critical_issues': 0,
            'minor_issues': 0,
            'validation_date': datetime.now().strftime('%Y-%m-%d')
        }
        
        # Get required elements for agency
        required_sections = self.agency_criteria.get(grant_agency, {}).get('required_sections', [])
        app_sections = set(app_content.get('sections', {}).keys())
        
        # Check completeness
        completeness_check = self._assess_completeness(app_content, nofo_content, grant_agency)
        validation_result['completeness_percentage'] = completeness_check['score']
        
        # Format required elements status
        required_status = []
        missing_elements = []
        
        for required in required_sections:
            found = any(self._sections_match(required, app_section) for app_section in app_sections)
            status = "✅" if found else "❌"
            required_status.append(f"{status} {required.replace('_', ' ').title()}")
            if not found:
                missing_elements.append(required.replace('_', ' ').title())
        
        validation_result['required_elements'] = '\n'.join(required_status)
        
        if missing_elements:
            validation_result['missing_elements'] = '\n'.join([f"• {elem}" for elem in missing_elements])
            validation_result['critical_issues'] = len(missing_elements)
        
        # Administrative requirements check
        admin_checks = [
            ("Page numbering", "✅ Assumed present"),
            ("Table of contents", "✅ Assumed present"),
            ("Font compliance", "⚠️ Cannot verify from text"),
            ("Margin requirements", "⚠️ Cannot verify from text")
        ]
        
        validation_result['admin_requirements'] = '\n'.join([f"{check}: {status}" for check, status in admin_checks])
        
        # Determine overall status
        if validation_result['completeness_percentage'] >= 95:
            validation_result['overall_status'] = "✅ COMPLETE - Ready for submission"
        elif validation_result['completeness_percentage'] >= 80:
            validation_result['overall_status'] = "⚠️ MOSTLY COMPLETE - Minor issues to address"
        else:
            validation_result['overall_status'] = "❌ INCOMPLETE - Major issues require attention"
        
        return validation_result
