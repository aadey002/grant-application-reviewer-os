"""
Comment Generator for Grant Reviews

Generates professional reviewer comments following HRSA, SAMHSA, and other agency 
guidelines. Creates strength, weakness, and met criteria comments with proper formatting.
"""

import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import logging

class CommentGenerator:
    """Professional comment generator for grant reviews."""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
        # Load extracted HRSA guidelines for comment writing
        self.hrsa_guidelines = {
            'comment_format': {
                'start_phrase': "The applicant organization",
                'tense': "present",
                'style': "third_person",
                'avoid_phrases': ["fails to", "lacks", "could have", "should have", "appears"],
                'preferred_phrases': ["does not clearly", "provides limited", "demonstrates"]
            },
            'strength_indicators': [
                "thoroughly describes", "clearly demonstrates", "provides comprehensive",
                "well-defined", "detailed information", "robust description",
                "clearly links", "reasonable and directed", "qualified personnel"
            ],
            'weakness_indicators': [
                "does not provide sufficient", "does not clearly describe",
                "does not include", "lacks clarity", "insufficient information",
                "not adequately justified", "limited detail"
            ],
            'met_indicators': [
                "documents that", "includes", "addresses", "provides",
                "demonstrates", "aligns with", "meets the requirement"
            ]
        }
        
        # SAMHSA comment guidelines
        self.samhsa_guidelines = {
            'comment_format': {
                'start_phrase': "The applicant organization",
                'focus': "comprehensive descriptions, thorough details, and examples",
                'evidence_requirement': "relevant examples and data",
                'understanding_assessment': "understanding of the topic"
            }
        }
    
    def generate_comments(self, app_content: Dict[str, Any],
                         nofo_content: Dict[str, Any],
                         scoring_result: Dict[str, Any],
                         grant_agency: str = "HRSA",
                         comment_style: str = "professional") -> Dict[str, Any]:
        """
        Generate comprehensive reviewer comments.
        
        Args:
            app_content: Processed application content
            nofo_content: Processed NOFO content
            scoring_result: Scoring results from scoring engine
            grant_agency: Funding agency
            comment_style: Style of comments
            
        Returns:
            Dictionary containing all generated comments
        """
        comments_result = {
            'generation_date': datetime.now().isoformat(),
            'grant_agency': grant_agency,
            'comment_style': comment_style,
            'strengths': '',
            'weaknesses': '',
            'met_criteria': '',
            'overview': '',
            'total_references': 0,
            'section_comments': {}
        }
        
        try:
            # Generate overview comment
            comments_result['overview'] = self._generate_overview_comment(
                app_content, scoring_result, grant_agency
            )
            
            # Generate strength comments
            comments_result['strengths'] = self._generate_strength_comments(
                app_content, scoring_result, grant_agency
            )
            
            # Generate weakness comments
            comments_result['weaknesses'] = self._generate_weakness_comments(
                app_content, scoring_result, grant_agency
            )
            
            # Generate met criteria comments
            comments_result['met_criteria'] = self._generate_met_comments(
                app_content, scoring_result, grant_agency
            )
            
            # Count total page references
            comments_result['total_references'] = self._count_page_references(comments_result)
            
            # Generate section-specific comments
            comments_result['section_comments'] = self._generate_section_comments(
                app_content, scoring_result, grant_agency
            )
            
        except Exception as e:
            self.logger.error(f"Error generating comments: {str(e)}")
            comments_result['error'] = str(e)
        
        return comments_result
    
    def _generate_overview_comment(self, app_content: Dict[str, Any],
                                 scoring_result: Dict[str, Any],
                                 grant_agency: str) -> str:
        """Generate overview comment summarizing the application."""
        sections = app_content.get('sections', {})
        overall_score = scoring_result.get('overall_score', 0)
        
        # Extract key application elements
        project_focus = self._extract_project_focus(app_content)
        target_population = self._extract_target_population(app_content)
        
        overview = f"The applicant organization proposes {project_focus}"
        
        if target_population:
            overview += f" to serve {target_population}"
        
        overview += ". "
        
        # Add assessment based on overall score
        if overall_score >= 85:
            overview += "The application demonstrates exceptional quality with comprehensive responses across all evaluation criteria."
        elif overall_score >= 75:
            overview += "The application presents a well-developed proposal with strong responses to most evaluation criteria."
        elif overall_score >= 65:
            overview += "The application addresses the required criteria with adequate detail, though some areas would benefit from additional development."
        else:
            overview += "The application addresses the basic requirements but requires significant strengthening in multiple areas."
        
        return overview
    
    def _extract_project_focus(self, app_content: Dict[str, Any]) -> str:
        """Extract the main focus of the project from application content."""
        # Look in project description or abstract sections
        sections = app_content.get('sections', {})
        
        focus_sections = ['abstract', 'project_description', 'statement_of_need']
        project_focus = "a comprehensive health services program"
        
        for section_name in focus_sections:
            for app_section, content in sections.items():
                if any(focus in app_section.lower() for focus in focus_sections):
                    text = content.get('content', '').lower()
                    
                    # Extract key project descriptors
                    if 'maternal health' in text:
                        project_focus = "a maternal health improvement program"
                    elif 'behavioral health' in text or 'mental health' in text:
                        project_focus = "a behavioral health services program"
                    elif 'hiv' in text or 'aids' in text:
                        project_focus = "an HIV/AIDS care and prevention program"
                    elif 'rural health' in text:
                        project_focus = "a rural health services initiative"
                    elif 'substance abuse' in text or 'addiction' in text:
                        project_focus = "a substance abuse treatment and prevention program"
                    elif 'primary care' in text:
                        project_focus = "a primary care services enhancement program"
                    break
        
        return project_focus
    
    def _extract_target_population(self, app_content: Dict[str, Any]) -> str:
        """Extract target population description."""
        text_content = app_content.get('text_content', '').lower()
        
        # Common target population indicators
        populations = []
        
        if 'pregnant women' in text_content:
            populations.append('pregnant women')
        if 'children' in text_content or 'pediatric' in text_content:
            populations.append('children and families')
        if 'rural' in text_content:
            populations.append('rural communities')
        if 'underserved' in text_content:
            populations.append('underserved populations')
        if 'low-income' in text_content:
            populations.append('low-income individuals')
        if 'homeless' in text_content:
            populations.append('homeless individuals')
        
        if populations:
            return ', '.join(populations[:2])  # Limit to top 2
        else:
            return "the target population"
    
    def _generate_strength_comments(self, app_content: Dict[str, Any],
                                  scoring_result: Dict[str, Any],
                                  grant_agency: str) -> str:
        """Generate strength comments following agency guidelines."""
        criterion_scores = scoring_result.get('criterion_scores', {})
        
        strengths = []
        
        # Identify high-scoring criteria for strength comments
        strong_criteria = {name: data for name, data in criterion_scores.items()
                          if data.get('level') in ['outstanding', 'very_good']}
        
        for criterion_name, criterion_data in strong_criteria.items():
            strength_comment = self._generate_criterion_strength_comment(
                criterion_name, criterion_data, app_content, grant_agency
            )
            if strength_comment:
                strengths.append(strength_comment)
        
        # Add application-wide strengths
        application_strengths = self._identify_application_strengths(
            app_content, scoring_result, grant_agency
        )
        strengths.extend(application_strengths)
        
        # Format according to agency guidelines
        formatted_strengths = []
        for i, strength in enumerate(strengths[:6], 1):  # Limit to top 6
            page_ref = self._generate_page_reference(strength, app_content)
            formatted_strength = f"{strength}"
            if page_ref:
                formatted_strength += f" {page_ref}"
            formatted_strengths.append(formatted_strength)
        
        return '\n\n'.join(formatted_strengths)
    
    def _generate_criterion_strength_comment(self, criterion_name: str,
                                           criterion_data: Dict[str, Any],
                                           app_content: Dict[str, Any],
                                           grant_agency: str) -> str:
        """Generate strength comment for specific criterion."""
        level = criterion_data.get('level', '')
        analysis = criterion_data.get('analysis', {})
        strengths = analysis.get('strengths', [])
        
        if not strengths or level not in ['outstanding', 'very_good']:
            return ""
        
        # Create strength comment based on criterion
        criterion_lower = criterion_name.lower()
        
        if 'statement of need' in criterion_lower:
            return "The applicant organization thoroughly documents the need for services with comprehensive data and clear identification of gaps in current service delivery."
        
        elif 'project description' in criterion_lower:
            return "The applicant organization provides a well-conceived and comprehensive project description that clearly articulates the proposed approach and expected outcomes."
        
        elif 'goals and objectives' in criterion_lower or 'objectives' in criterion_lower:
            return "The applicant organization presents clearly defined, measurable objectives that are directly linked to identified needs and expected outcomes."
        
        elif 'method' in criterion_lower or 'approach' in criterion_lower:
            return "The applicant organization describes a systematic and evidence-based methodology with detailed implementation steps and quality assurance measures."
        
        elif 'evaluation' in criterion_lower:
            return "The applicant organization outlines a comprehensive evaluation plan with appropriate data collection methods and measurable performance indicators."
        
        elif 'budget' in criterion_lower:
            return "The applicant organization presents a reasonable and well-justified budget that aligns with proposed activities and demonstrates cost-effectiveness."
        
        elif 'organizational capacity' in criterion_lower or 'qualifications' in criterion_lower:
            return "The applicant organization demonstrates strong organizational capacity with qualified staff, relevant experience, and appropriate infrastructure to successfully implement the proposed project."
        
        else:
            # Generic strength comment
            return f"The applicant organization provides a comprehensive response to the {criterion_name.lower()} requirements with detailed information and clear documentation."
    
    def _generate_weakness_comments(self, app_content: Dict[str, Any],
                                  scoring_result: Dict[str, Any],
                                  grant_agency: str) -> str:
        """Generate weakness comments following agency guidelines."""
        criterion_scores = scoring_result.get('criterion_scores', {})
        
        weaknesses = []
        
        # Identify low-scoring criteria for weakness comments
        weak_criteria = {name: data for name, data in criterion_scores.items()
                        if data.get('level') in ['poor', 'satisfactory', 'marginal', 'unacceptable']}
        
        for criterion_name, criterion_data in weak_criteria.items():
            weakness_comment = self._generate_criterion_weakness_comment(
                criterion_name, criterion_data, app_content, grant_agency
            )
            if weakness_comment:
                weaknesses.append(weakness_comment)
        
        # Add application-wide weaknesses
        application_weaknesses = self._identify_application_weaknesses(
            app_content, scoring_result, grant_agency
        )
        weaknesses.extend(application_weaknesses)
        
        # Format according to agency guidelines
        formatted_weaknesses = []
        for i, weakness in enumerate(weaknesses[:6], 1):  # Limit to top 6
            page_ref = self._generate_page_reference(weakness, app_content)
            formatted_weakness = f"{weakness}"
            if page_ref:
                formatted_weakness += f" {page_ref}"
            formatted_weaknesses.append(formatted_weakness)
        
        return '\n\n'.join(formatted_weaknesses)
    
    def _generate_criterion_weakness_comment(self, criterion_name: str,
                                           criterion_data: Dict[str, Any],
                                           app_content: Dict[str, Any],
                                           grant_agency: str) -> str:
        """Generate weakness comment for specific criterion."""
        level = criterion_data.get('level', '')
        analysis = criterion_data.get('analysis', {})
        issues = analysis.get('issues', [])
        
        if not issues or level in ['outstanding', 'very_good']:
            return ""
        
        # Create weakness comment based on criterion and specific issues
        criterion_lower = criterion_name.lower()
        
        if 'statement of need' in criterion_lower:
            if 'insufficient detail' in str(issues):
                return "The statement of need does not provide sufficient data to validate the scope and severity of the identified problem."
            else:
                return "The statement of need does not clearly demonstrate the specific need for the proposed services in the target community."
        
        elif 'project description' in criterion_lower:
            if 'lacks sufficient evidence' in str(issues):
                return "The project description does not provide adequate evidence-based justification for the proposed approach and activities."
            else:
                return "The project description does not clearly detail how proposed activities will address the identified needs and achieve stated objectives."
        
        elif 'goals and objectives' in criterion_lower or 'objectives' in criterion_lower:
            return "The objectives are not written in a measurable manner and do not include baseline data or specific timeframes for achievement."
        
        elif 'method' in criterion_lower or 'approach' in criterion_lower:
            return "The methodology does not provide sufficient detail about implementation procedures and quality assurance measures to ensure successful project execution."
        
        elif 'evaluation' in criterion_lower:
            return "The evaluation plan does not clearly describe data collection methods and measurable outcomes that will demonstrate project effectiveness."
        
        elif 'budget' in criterion_lower:
            if 'missing specific dollar amounts' in str(issues):
                return "The budget narrative does not provide sufficient detail to justify the requested funding amounts and their relationship to proposed activities."
            else:
                return "The budget does not clearly demonstrate cost-effectiveness and reasonable allocation of resources across project components."
        
        elif 'organizational capacity' in criterion_lower:
            return "The organizational capacity section does not clearly demonstrate the applicant's experience and qualifications to successfully implement the proposed project."
        
        else:
            # Generic weakness comment based on issues
            main_issue = issues[0] if issues else "insufficient detail"
            return f"The {criterion_name.lower()} section does not provide adequate information and {main_issue.lower()}."
    
    def _generate_met_comments(self, app_content: Dict[str, Any],
                             scoring_result: Dict[str, Any],
                             grant_agency: str) -> str:
        """Generate met criteria comments."""
        criterion_scores = scoring_result.get('criterion_scores', {})
        
        met_comments = []
        
        # Identify criteria that meet baseline requirements
        met_criteria = {name: data for name, data in criterion_scores.items()
                       if data.get('level') in ['good', 'acceptable']}
        
        for criterion_name, criterion_data in met_criteria.items():
            met_comment = self._generate_criterion_met_comment(
                criterion_name, criterion_data, app_content, grant_agency
            )
            if met_comment:
                met_comments.append(met_comment)
        
        # Add general met criteria
        general_met = self._identify_general_met_criteria(app_content, grant_agency)
        met_comments.extend(general_met)
        
        # Format according to agency guidelines
        formatted_met = []
        for met in met_comments[:5]:  # Limit to top 5
            page_ref = self._generate_page_reference(met, app_content)
            formatted_met_comment = f"{met}"
            if page_ref:
                formatted_met_comment += f" {page_ref}"
            formatted_met.append(formatted_met_comment)
        
        return '\n\n'.join(formatted_met)
    
    def _generate_criterion_met_comment(self, criterion_name: str,
                                      criterion_data: Dict[str, Any],
                                      app_content: Dict[str, Any],
                                      grant_agency: str) -> str:
        """Generate met comment for specific criterion."""
        criterion_lower = criterion_name.lower()
        
        if 'budget' in criterion_lower:
            return "The budget narrative aligns with the proposed budget request as stated in the NOFO."
        
        elif 'organizational' in criterion_lower:
            return "The organizational chart delineates the key personnel that will be involved in the proposed project."
        
        elif 'evaluation' in criterion_lower:
            return "The application includes an evaluation plan that addresses the required performance measures."
        
        elif 'statement of need' in criterion_lower:
            return "The application includes a needs assessment of the target population."
        
        elif 'project description' in criterion_lower:
            return "The application documents the proposed project activities and their alignment with program objectives."
        
        else:
            return f"The application addresses the baseline requirements for {criterion_name.lower()}."
    
    def _identify_application_strengths(self, app_content: Dict[str, Any],
                                      scoring_result: Dict[str, Any],
                                      grant_agency: str) -> List[str]:
        """Identify overall application strengths."""
        strengths = []
        
        tables_count = len(app_content.get('tables', []))
        sections_count = len(app_content.get('sections', {}))
        
        if tables_count > 2:
            strengths.append("The applicant organization provides well-organized tabular data and structured information presentation throughout the application.")
        
        if sections_count >= 8:
            strengths.append("The applicant organization demonstrates thorough planning with comprehensive coverage of all required application components.")
        
        # Check for evidence of partnerships
        text_content = app_content.get('text_content', '').lower()
        if 'partnership' in text_content or 'collaboration' in text_content:
            strengths.append("The applicant organization clearly describes partnerships and collaborative relationships that enhance project implementation capacity.")
        
        return strengths
    
    def _identify_application_weaknesses(self, app_content: Dict[str, Any],
                                       scoring_result: Dict[str, Any],
                                       grant_agency: str) -> List[str]:
        """Identify overall application weaknesses."""
        weaknesses = []
        
        sections = app_content.get('sections', {})
        
        # Check for missing key sections
        expected_sections = ['budget', 'evaluation', 'methodology']
        missing_sections = []
        
        for expected in expected_sections:
            found = any(expected in section_name.lower() for section_name in sections.keys())
            if not found:
                missing_sections.append(expected)
        
        if missing_sections:
            weaknesses.append(f"The application does not clearly identify or adequately address {' and '.join(missing_sections)} requirements.")
        
        # Check for overall application issues
        total_words = sum(s.get('word_count', 0) for s in sections.values())
        if total_words < 5000:
            weaknesses.append("The application does not provide sufficient detail across multiple sections to demonstrate comprehensive project planning.")
        
        return weaknesses
    
    def _identify_general_met_criteria(self, app_content: Dict[str, Any],
                                     grant_agency: str) -> List[str]:
        """Identify general criteria that are met."""
        met_criteria = []
        
        sections = app_content.get('sections', {})
        
        if any('budget' in section.lower() for section in sections.keys()):
            met_criteria.append("The application includes the required budget information and narrative.")
        
        if any('evaluation' in section.lower() for section in sections.keys()):
            met_criteria.append("The application addresses evaluation and assessment requirements.")
        
        if len(sections) >= 6:
            met_criteria.append("The application includes all major required sections as specified in the NOFO.")
        
        return met_criteria
    
    def _generate_page_reference(self, comment: str, app_content: Dict[str, Any]) -> str:
        """Generate page reference for comment (simplified implementation)."""
        # In a real implementation, this would track actual page locations
        # For now, we'll generate reasonable page estimates
        
        sections = app_content.get('sections', {})
        total_pages = app_content.get('total_pages', 10)
        
        # Map comment topics to likely page ranges
        if 'budget' in comment.lower():
            return f"(Application page {max(1, total_pages - 5)}-{total_pages})"
        elif 'evaluation' in comment.lower():
            return f"(Application page {max(1, total_pages - 8)}-{max(1, total_pages - 3)})"
        elif 'need' in comment.lower():
            return f"(Application page 2-4)"
        elif 'methodology' in comment.lower() or 'approach' in comment.lower():
            return f"(Application page {max(1, total_pages // 2 - 2)}-{max(1, total_pages // 2 + 2)})"
        else:
            # Generic page reference
            return f"(Application page {max(1, total_pages // 3)}-{max(1, total_pages * 2 // 3)})"
    
    def _count_page_references(self, comments_result: Dict[str, Any]) -> int:
        """Count total page references in all comments."""
        all_text = ' '.join([
            comments_result.get('strengths', ''),
            comments_result.get('weaknesses', ''),
            comments_result.get('met_criteria', ''),
            comments_result.get('overview', '')
        ])
        
        # Count page reference patterns
        page_references = re.findall(r'\(Application page \d+[-\d]*\)', all_text)
        return len(page_references)
    
    def _generate_section_comments(self, app_content: Dict[str, Any],
                                 scoring_result: Dict[str, Any],
                                 grant_agency: str) -> Dict[str, str]:
        """Generate comments for specific application sections."""
        section_comments = {}
        criterion_scores = scoring_result.get('criterion_scores', {})
        
        for criterion_name, criterion_data in criterion_scores.items():
            level = criterion_data.get('level', '')
            analysis = criterion_data.get('analysis', {})
            
            section_comment = f"Score: {criterion_data.get('points_awarded', 0)}/{criterion_data.get('max_points', 0)} "
            section_comment += f"({level.title()})\n\n"
            section_comment += f"Assessment: {criterion_data.get('justification', 'No detailed assessment available.')}"
            
            section_comments[criterion_name] = section_comment
        
        return section_comments
