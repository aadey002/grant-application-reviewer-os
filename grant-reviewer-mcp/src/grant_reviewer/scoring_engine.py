"""
Scoring Engine for Grant Applications

Implements agency-specific scoring rubrics and methodologies for HRSA, SAMHSA, 
and other federal health grant evaluations.
"""

import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import logging

class ScoringEngine:
    """Scoring engine implementing agency-specific rubrics."""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
        # HRSA Scoring Rubric (based on extracted guidelines)
        self.hrsa_rubric = {
            'point_scales': {
                10: {'outstanding': (10, 9), 'very_good': (8, 6), 'good': (5, 4), 'satisfactory': (3, 2), 'poor': (1, 0)},
                15: {'outstanding': (15, 14), 'very_good': (13, 12), 'good': (11, 10), 'satisfactory': (9, 8), 'poor': (7, 0)},
                20: {'outstanding': (20, 19), 'very_good': (18, 17), 'good': (16, 15), 'satisfactory': (14, 13), 'poor': (12, 0)},
                25: {'outstanding': (25, 24), 'very_good': (23, 22), 'good': (21, 19), 'satisfactory': (18, 17), 'poor': (16, 0)},
                30: {'outstanding': (30, 29), 'very_good': (28, 27), 'good': (26, 24), 'satisfactory': (23, 21), 'poor': (20, 0)},
                35: {'outstanding': (35, 34), 'very_good': (33, 32), 'good': (31, 28), 'satisfactory': (27, 25), 'poor': (24, 0)},
                40: {'outstanding': (40, 39), 'very_good': (38, 36), 'good': (35, 32), 'satisfactory': (31, 28), 'poor': (27, 0)},
                45: {'outstanding': (45, 43), 'very_good': (42, 41), 'good': (40, 36), 'satisfactory': (35, 32), 'poor': (31, 0)},
                55: {'outstanding': (55, 53), 'very_good': (52, 50), 'good': (49, 44), 'satisfactory': (43, 39), 'poor': (38, 0)}
            },
            'criteria_definitions': {
                'outstanding': 'All elements clearly addressed, well-conceived, thoroughly developed, and well supported. No deficiencies.',
                'very_good': 'Elements clearly addressed with necessary detail. Minor weaknesses with minimal impact.',
                'good': 'Elements addressed but some lack detail. Some strengths with moderate impact weaknesses.',
                'satisfactory': 'Most elements addressed but lack detail. Few strengths, some weaknesses, one major weakness.',
                'poor': 'Few elements addressed. Very few strengths, numerous major weaknesses preventing success.'
            }
        }
        
        # SAMHSA Scoring Rubric (based on extracted criteria)
        self.samhsa_rubric = {
            'point_scales': {
                15: {'outstanding': (15, 14), 'very_good': (13, 12), 'acceptable': (11, 10), 'marginal': (9, 8), 'unacceptable': (7, 0)},
                20: {'outstanding': (20, 18), 'very_good': (17, 16), 'acceptable': (15, 14), 'marginal': (13, 12), 'unacceptable': (11, 0)},
                30: {'outstanding': (30, 27), 'very_good': (26, 24), 'acceptable': (23, 21), 'marginal': (20, 18), 'unacceptable': (17, 0)}
            },
            'criteria_definitions': {
                'outstanding': 'Explicitly addresses all requirements with comprehensive descriptions, thorough details, and examples.',
                'very_good': 'Provides significant descriptions and relevant details but not fully comprehensive.',
                'acceptable': 'Provides basic response but lacks sufficient detail or pertinent examples.',
                'marginal': 'Provides minimal details and insufficient descriptions. Major gaps in information.',
                'unacceptable': 'Does not explicitly address requirements. Completely deficient response.'
            }
        }
        
        # Standard evaluation criteria for different agencies
        self.evaluation_criteria = {
            'HRSA': [
                {'name': 'Statement of Need', 'points': 20, 'weight': 0.15},
                {'name': 'Project Description', 'points': 35, 'weight': 0.25},
                {'name': 'Goals and Objectives', 'points': 15, 'weight': 0.12},
                {'name': 'Methods', 'points': 25, 'weight': 0.18},
                {'name': 'Evaluation', 'points': 15, 'weight': 0.12},
                {'name': 'Budget Narrative', 'points': 10, 'weight': 0.08},
                {'name': 'Organizational Capacity', 'points': 20, 'weight': 0.10}
            ],
            'SAMHSA': [
                {'name': 'Project Narrative - Question 1', 'points': 15, 'weight': 0.15},
                {'name': 'Project Narrative - Question 2', 'points': 20, 'weight': 0.20},
                {'name': 'Project Narrative - Question 3', 'points': 20, 'weight': 0.20},
                {'name': 'Action Plan - Question 4', 'points': 30, 'weight': 0.30},
                {'name': 'Project Narrative - Question 5', 'points': 15, 'weight': 0.15}
            ]
        }
    
    def score_application(self, app_content: Dict[str, Any],
                         nofo_content: Dict[str, Any],
                         grant_agency: str = "HRSA",
                         scoring_method: str = "standard") -> Dict[str, Any]:
        """
        Score grant application using agency-specific rubrics.
        
        Args:
            app_content: Processed application content
            nofo_content: Processed NOFO content
            grant_agency: Funding agency
            scoring_method: Scoring methodology
            
        Returns:
            Comprehensive scoring results
        """
        scoring_result = {
            'scoring_date': datetime.now().isoformat(),
            'grant_agency': grant_agency,
            'scoring_method': scoring_method,
            'overall_score': 0,
            'total_possible': 0,
            'criterion_scores': {},
            'criterion_breakdown': '',
            'recommendation': 'Under Review',
            'score_distribution': {},
            'detailed_analysis': {}
        }
        
        try:
            # Get criteria for agency
            criteria = self.evaluation_criteria.get(grant_agency, self.evaluation_criteria['HRSA'])
            rubric = self.hrsa_rubric if grant_agency == 'HRSA' else self.samhsa_rubric
            
            total_score = 0
            total_possible = sum(criterion['points'] for criterion in criteria)
            criterion_scores = {}
            criterion_details = []
            
            # Score each criterion
            for criterion in criteria:
                criterion_score = self._score_criterion(
                    criterion, app_content, rubric, grant_agency
                )
                criterion_scores[criterion['name']] = criterion_score
                total_score += criterion_score['points_awarded']
                
                # Format criterion breakdown
                criterion_details.append(
                    f"📋 {criterion['name']}: {criterion_score['points_awarded']}/{criterion['points']} "
                    f"({criterion_score['level'].title()}) - {criterion_score['justification'][:100]}..."
                )
            
            # Calculate overall score and percentage
            overall_percentage = (total_score / total_possible * 100) if total_possible > 0 else 0
            
            scoring_result.update({
                'overall_score': round(overall_percentage, 1),
                'total_possible': total_possible,
                'points_earned': total_score,
                'criterion_scores': criterion_scores,
                'criterion_breakdown': '\n'.join(criterion_details)
            })
            
            # Calculate score distribution
            scoring_result['score_distribution'] = self._calculate_score_distribution(
                criterion_scores, grant_agency
            )
            
            # Generate recommendation
            scoring_result['recommendation'] = self._generate_funding_recommendation(
                overall_percentage, criterion_scores, grant_agency
            )
            
            # Add detailed analysis
            scoring_result['detailed_analysis'] = self._generate_detailed_analysis(
                criterion_scores, app_content, grant_agency
            )
            
        except Exception as e:
            self.logger.error(f"Error in scoring: {str(e)}")
            scoring_result['error'] = str(e)
        
        return scoring_result
    
    def _score_criterion(self, criterion: Dict[str, Any],
                        app_content: Dict[str, Any],
                        rubric: Dict[str, Any],
                        grant_agency: str) -> Dict[str, Any]:
        """Score individual evaluation criterion."""
        criterion_name = criterion['name']
        max_points = criterion['points']
        
        # Find relevant application section
        relevant_section = self._find_relevant_section(criterion_name, app_content)
        
        # Analyze section content
        analysis = self._analyze_criterion_content(relevant_section, criterion_name, grant_agency)
        
        # Determine performance level
        performance_level = self._determine_performance_level(analysis, grant_agency)
        
        # Calculate points based on rubric
        points_awarded = self._calculate_points(max_points, performance_level, rubric)
        
        return {
            'criterion_name': criterion_name,
            'max_points': max_points,
            'points_awarded': points_awarded,
            'level': performance_level,
            'analysis': analysis,
            'justification': self._generate_criterion_justification(analysis, performance_level),
            'section_analyzed': relevant_section.get('section_name', 'Multiple sections') if relevant_section else 'Not found'
        }
    
    def _find_relevant_section(self, criterion_name: str,
                              app_content: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find application section most relevant to criterion."""
        sections = app_content.get('sections', {})
        
        # Mapping criterion names to likely section names
        section_mappings = {
            'statement of need': ['statement_of_need', 'needs_assessment', 'problem_statement'],
            'project description': ['project_description', 'program_description', 'approach'],
            'goals and objectives': ['goals_objectives', 'objectives', 'aims'],
            'methods': ['methodology', 'methods', 'approach', 'implementation'],
            'evaluation': ['evaluation', 'assessment', 'outcomes', 'monitoring'],
            'budget': ['budget', 'financial', 'cost'],
            'organizational capacity': ['organizational_capacity', 'qualifications', 'experience'],
            'action plan': ['timeline', 'work_plan', 'action_plan']
        }
        
        criterion_lower = criterion_name.lower()
        
        # Direct mapping lookup
        for key_term, possible_sections in section_mappings.items():
            if key_term in criterion_lower:
                for section_name, section_content in sections.items():
                    if any(possible in section_name.lower() for possible in possible_sections):
                        return {
                            'section_name': section_name,
                            'content': section_content.get('content', ''),
                            'word_count': section_content.get('word_count', 0)
                        }
        
        # Fallback: search by keywords in criterion name
        criterion_words = criterion_lower.replace('project narrative - ', '').split()
        best_match = None
        best_score = 0
        
        for section_name, section_content in sections.items():
            section_lower = section_name.lower()
            match_score = sum(1 for word in criterion_words if word in section_lower)
            if match_score > best_score:
                best_score = match_score
                best_match = {
                    'section_name': section_name,
                    'content': section_content.get('content', ''),
                    'word_count': section_content.get('word_count', 0)
                }
        
        return best_match
    
    def _analyze_criterion_content(self, section: Optional[Dict[str, Any]],
                                 criterion_name: str,
                                 grant_agency: str) -> Dict[str, Any]:
        """Analyze content against criterion requirements."""
        if not section:
            return {
                'completeness': 0,
                'quality': 0,
                'specificity': 0,
                'evidence': 0,
                'clarity': 0,
                'total_score': 0,
                'issues': ['Section not found or identified'],
                'strengths': []
            }
        
        content = section.get('content', '')
        word_count = section.get('word_count', 0)
        
        analysis = {
            'completeness': self._assess_completeness_score(content, word_count, criterion_name),
            'quality': self._assess_content_quality_score(content, criterion_name),
            'specificity': self._assess_specificity_score(content),
            'evidence': self._assess_evidence_score(content),
            'clarity': self._assess_clarity_score(content),
            'issues': [],
            'strengths': []
        }
        
        # Calculate total score
        weights = {'completeness': 0.3, 'quality': 0.25, 'specificity': 0.2, 'evidence': 0.15, 'clarity': 0.1}
        analysis['total_score'] = sum(analysis[key] * weight for key, weight in weights.items())
        
        # Identify specific issues and strengths
        analysis['issues'], analysis['strengths'] = self._identify_content_issues_strengths(
            content, criterion_name, analysis
        )
        
        return analysis
    
    def _assess_completeness_score(self, content: str, word_count: int, criterion_name: str) -> float:
        """Assess completeness of response to criterion."""
        # Minimum word count expectations by criterion type
        min_word_expectations = {
            'statement of need': 300,
            'project description': 500,
            'goals and objectives': 200,
            'methods': 400,
            'evaluation': 250,
            'budget': 150,
            'organizational capacity': 200
        }
        
        criterion_lower = criterion_name.lower()
        expected_words = 300  # Default
        
        for key, min_words in min_word_expectations.items():
            if key in criterion_lower:
                expected_words = min_words
                break
        
        # Score based on word count relative to expectation
        if word_count >= expected_words:
            completeness_score = min(100, 80 + (word_count - expected_words) / expected_words * 20)
        else:
            completeness_score = (word_count / expected_words) * 80
        
        return max(0, min(100, completeness_score))
    
    def _assess_content_quality_score(self, content: str, criterion_name: str) -> float:
        """Assess quality of content for specific criterion."""
        quality_score = 50  # Base score
        
        # Look for criterion-specific quality indicators
        quality_indicators = {
            'statement of need': ['data', 'statistics', 'evidence', 'research', 'documented'],
            'project description': ['comprehensive', 'detailed', 'systematic', 'approach'],
            'methods': ['methodology', 'systematic', 'evidence-based', 'validated', 'protocol'],
            'evaluation': ['measurable', 'outcomes', 'indicators', 'assessment', 'data'],
            'budget': ['justified', 'reasonable', 'cost-effective', 'detailed']
        }
        
        criterion_lower = criterion_name.lower()
        relevant_indicators = []
        
        for key, indicators in quality_indicators.items():
            if key in criterion_lower:
                relevant_indicators = indicators
                break
        
        # Count quality indicators
        indicator_count = sum(1 for indicator in relevant_indicators 
                            if indicator in content.lower())
        
        quality_score += min(indicator_count * 8, 40)  # Bonus for quality indicators
        
        # Penalize if content appears copied/templated
        if self._detect_template_language(content):
            quality_score -= 15
        
        return max(0, min(100, quality_score))
    
    def _assess_specificity_score(self, content: str) -> float:
        """Assess specificity and detail level."""
        # Count specific indicators
        numbers = len(re.findall(r'\b\d+(?:[.,]\d+)?\b', content))
        percentages = len(re.findall(r'\b\d+(?:[.,]\d+)?%', content))
        dates = len(re.findall(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', content))
        specific_terms = len(re.findall(r'\b(?:specifically|exactly|precisely|will|shall)\b', content.lower()))
        
        specificity_score = min((numbers + percentages * 2 + dates * 2 + specific_terms) * 1.5, 100)
        
        return specificity_score
    
    def _assess_evidence_score(self, content: str) -> float:
        """Assess evidence-based approach."""
        evidence_terms = [
            'research', 'study', 'evidence', 'data', 'evaluation',
            'published', 'peer-reviewed', 'citation', 'reference',
            'literature', 'findings', 'results', 'analysis'
        ]
        
        evidence_count = sum(1 for term in evidence_terms if term in content.lower())
        evidence_score = min(evidence_count * 6, 100)
        
        return evidence_score
    
    def _assess_clarity_score(self, content: str) -> float:
        """Assess clarity of writing."""
        sentences = re.split(r'[.!?]+', content)
        if not sentences:
            return 0
        
        avg_sentence_length = sum(len(s.split()) for s in sentences if s.strip()) / len([s for s in sentences if s.strip()])
        
        # Optimal sentence length range
        if 12 <= avg_sentence_length <= 22:
            clarity_score = 85
        elif 8 <= avg_sentence_length <= 28:
            clarity_score = 70
        else:
            clarity_score = 50
        
        # Bonus for clarity indicators
        clarity_terms = ['clearly', 'specifically', 'precisely', 'namely', 'that is']
        clarity_bonus = min(sum(1 for term in clarity_terms if term in content.lower()) * 3, 15)
        
        return min(clarity_score + clarity_bonus, 100)
    
    def _detect_template_language(self, content: str) -> bool:
        """Detect if content appears to be template/boilerplate language."""
        template_phrases = [
            'insert text here', 'to be determined', 'tbd', 'xxx',
            'placeholder', 'template', 'example text'
        ]
        
        return any(phrase in content.lower() for phrase in template_phrases)
    
    def _determine_performance_level(self, analysis: Dict[str, Any], grant_agency: str) -> str:
        """Determine performance level based on analysis."""
        total_score = analysis.get('total_score', 0)
        
        if grant_agency == 'HRSA':
            if total_score >= 90:
                return 'outstanding'
            elif total_score >= 80:
                return 'very_good'
            elif total_score >= 70:
                return 'good'
            elif total_score >= 60:
                return 'satisfactory'
            else:
                return 'poor'
        else:  # SAMHSA
            if total_score >= 90:
                return 'outstanding'
            elif total_score >= 80:
                return 'very_good'
            elif total_score >= 70:
                return 'acceptable'
            elif total_score >= 60:
                return 'marginal'
            else:
                return 'unacceptable'
    
    def _calculate_points(self, max_points: int, performance_level: str,
                         rubric: Dict[str, Any]) -> int:
        """Calculate points awarded based on performance level and rubric."""
        point_scales = rubric.get('point_scales', {})
        
        # Find appropriate scale
        scale = point_scales.get(max_points)
        if not scale:
            # Find closest scale
            available_scales = sorted(point_scales.keys())
            closest_scale = min(available_scales, key=lambda x: abs(x - max_points))
            scale = point_scales[closest_scale]
            # Adjust points proportionally
            scale_factor = max_points / closest_scale
            scale = {level: (int(range_val[0] * scale_factor), int(range_val[1] * scale_factor))
                    for level, range_val in scale.items()}
        
        # Get point range for performance level
        point_range = scale.get(performance_level, (0, 0))
        
        # Return midpoint of range
        return (point_range[0] + point_range[1]) // 2
    
    def _generate_criterion_justification(self, analysis: Dict[str, Any],
                                        performance_level: str) -> str:
        """Generate justification for criterion score."""
        total_score = analysis.get('total_score', 0)
        strengths = analysis.get('strengths', [])
        issues = analysis.get('issues', [])
        
        justification = f"Performance level: {performance_level.title()} (score: {total_score:.1f}/100). "
        
        if strengths:
            justification += f"Strengths: {', '.join(strengths[:2])}. "
        
        if issues:
            justification += f"Areas for improvement: {', '.join(issues[:2])}."
        
        return justification
    
    def _identify_content_issues_strengths(self, content: str, criterion_name: str,
                                         analysis: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        """Identify specific issues and strengths in content."""
        issues = []
        strengths = []
        
        # Length-based assessment
        word_count = len(content.split())
        if word_count < 100:
            issues.append("Insufficient detail provided")
        elif word_count > 800:
            strengths.append("Comprehensive and detailed response")
        
        # Quality-based assessment
        if analysis.get('evidence', 0) > 60:
            strengths.append("Well-supported with evidence and research")
        elif analysis.get('evidence', 0) < 30:
            issues.append("Lacks sufficient evidence or research support")
        
        if analysis.get('specificity', 0) > 70:
            strengths.append("Includes specific data, timelines, and metrics")
        elif analysis.get('specificity', 0) < 40:
            issues.append("Needs more specific details and quantifiable information")
        
        # Criterion-specific checks
        criterion_lower = criterion_name.lower()
        
        if 'budget' in criterion_lower:
            if '$' not in content:
                issues.append("Missing specific dollar amounts")
            if 'justified' in content.lower() or 'reasonable' in content.lower():
                strengths.append("Includes budget justification")
        
        if 'evaluation' in criterion_lower:
            if 'measurable' in content.lower() or 'outcome' in content.lower():
                strengths.append("Includes measurable outcomes")
            if 'baseline' not in content.lower():
                issues.append("May lack baseline data or measurements")
        
        return issues[:3], strengths[:3]  # Limit to top 3 each
    
    def _calculate_score_distribution(self, criterion_scores: Dict[str, Any],
                                    grant_agency: str) -> Dict[str, int]:
        """Calculate distribution of scores across performance levels."""
        distribution = {
            'outstanding_criteria': 0,
            'very_good_criteria': 0,
            'good_criteria': 0,
            'satisfactory_criteria': 0,
            'poor_criteria': 0
        }
        
        # Map SAMHSA levels to HRSA equivalents for consistency
        level_mapping = {
            'outstanding': 'outstanding_criteria',
            'very_good': 'very_good_criteria',
            'good': 'good_criteria',
            'acceptable': 'good_criteria',
            'satisfactory': 'satisfactory_criteria',
            'marginal': 'satisfactory_criteria',
            'poor': 'poor_criteria',
            'unacceptable': 'poor_criteria'
        }
        
        for criterion_data in criterion_scores.values():
            level = criterion_data.get('level', 'poor')
            mapped_level = level_mapping.get(level, 'poor_criteria')
            distribution[mapped_level] += 1
        
        return distribution
    
    def _generate_funding_recommendation(self, overall_percentage: float,
                                       criterion_scores: Dict[str, Any],
                                       grant_agency: str) -> str:
        """Generate funding recommendation based on scores."""
        # Count critical failures
        poor_criteria = sum(1 for score_data in criterion_scores.values() 
                          if score_data.get('level') in ['poor', 'unacceptable'])
        
        total_criteria = len(criterion_scores)
        poor_percentage = (poor_criteria / total_criteria * 100) if total_criteria > 0 else 0
        
        # Recommendation logic
        if overall_percentage >= 85 and poor_criteria == 0:
            return "STRONGLY RECOMMENDED FOR FUNDING"
        elif overall_percentage >= 75 and poor_criteria <= 1:
            return "RECOMMENDED FOR FUNDING"
        elif overall_percentage >= 65 and poor_percentage <= 20:
            return "CONDITIONALLY RECOMMENDED - Address noted concerns"
        elif overall_percentage >= 50:
            return "NOT RECOMMENDED - Significant improvements needed"
        else:
            return "NOT RECOMMENDED - Major deficiencies identified"
    
    def _generate_detailed_analysis(self, criterion_scores: Dict[str, Any],
                                  app_content: Dict[str, Any],
                                  grant_agency: str) -> Dict[str, Any]:
        """Generate detailed analysis of scoring results."""
        analysis = {
            'strongest_criteria': [],
            'weakest_criteria': [],
            'improvement_priorities': [],
            'overall_assessment': ''
        }
        
        # Sort criteria by score
        sorted_criteria = sorted(criterion_scores.items(), 
                               key=lambda x: x[1].get('points_awarded', 0), reverse=True)
        
        # Identify strongest (top 3) and weakest (bottom 3)
        analysis['strongest_criteria'] = [
            f"{name}: {data.get('points_awarded', 0)}/{data.get('max_points', 0)} ({data.get('level', 'unknown').title()})"
            for name, data in sorted_criteria[:3]
        ]
        
        analysis['weakest_criteria'] = [
            f"{name}: {data.get('points_awarded', 0)}/{data.get('max_points', 0)} ({data.get('level', 'unknown').title()})"
            for name, data in sorted_criteria[-3:]
        ]
        
        # Generate improvement priorities
        low_scoring_criteria = [name for name, data in sorted_criteria 
                              if data.get('level') in ['poor', 'unacceptable', 'satisfactory', 'marginal']]
        
        analysis['improvement_priorities'] = [
            f"Strengthen {name.lower()} section with more detailed evidence and specific examples"
            for name in low_scoring_criteria[:3]
        ]
        
        # Overall assessment
        total_criteria = len(criterion_scores)
        strong_criteria = sum(1 for data in criterion_scores.values() 
                            if data.get('level') in ['outstanding', 'very_good'])
        
        if strong_criteria / total_criteria >= 0.75:
            analysis['overall_assessment'] = "Strong application with comprehensive responses across most criteria."
        elif strong_criteria / total_criteria >= 0.5:
            analysis['overall_assessment'] = "Solid application with room for improvement in key areas."
        else:
            analysis['overall_assessment'] = "Application needs significant strengthening across multiple criteria."
        
        return analysis
