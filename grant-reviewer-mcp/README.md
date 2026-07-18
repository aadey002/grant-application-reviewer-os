# Grant Reviewer MCP Server

A comprehensive Model Context Protocol (MCP) server for evaluating HRSA, SAMHSA, and other federal health grant applications with professional rigor, fairness, and transparency.

## Overview

This MCP server provides autonomous AI-driven grant evaluation capabilities that simulate expert human review processes. It supports both HRSA and SAMHSA evaluation frameworks, generating detailed assessments, numerical scores, and professional feedback to support funding decisions.

## Features

### Document Processing & Analysis
- **Multi-format Support**: Process PDF and Word format grant applications
- **NOFO Integration**: Extract and analyze Notice of Funding Opportunity documents
- **Section Recognition**: Automatically identify grant application components (abstract, methodology, budget, etc.)
- **Table Extraction**: Parse and analyze tabular data and structured information
- **Content Analysis**: Extract text, metadata, and structural elements

### Agency-Specific Evaluation Frameworks

#### HRSA Evaluation
- **Standards**: Relevance to HRSA priorities, program feasibility, innovation, community impact, sustainability, organizational capacity
- **Focus Areas**: Maternal health, rural health, HIV/AIDS services, behavioral health, health workforce, primary care
- **Scoring**: HRSA-compliant rubrics with 5-point scale (Outstanding to Poor)

#### SAMHSA Evaluation  
- **Standards**: Alignment with SAMHSA goals, evidence-based practices, target population focus, measurable outcomes, cultural competency
- **Focus Areas**: Substance abuse, mental health, behavioral health, prevention, treatment, recovery support
- **Scoring**: SAMHSA-compliant rubrics with 5-point scale (Outstanding to Unacceptable)

### Professional Scoring & Comments
- **Quantitative Scoring**: Generate numerical scores aligned with agency rubrics
- **Detailed Comments**: Create strength, weakness, and met criteria comments starting with "The applicant organization"
- **Page References**: Include accurate page citations from grant applications
- **Professional Language**: Follow agency guidelines for constructive, bias-free feedback
- **Reviewer Worksheets**: Generate complete evaluation documents ready for submission

### Quality Assurance Features
- **Bias Mitigation**: Implement equity protocols across diverse applicant organizations
- **Objectivity Maintenance**: Evaluate using only provided application and NOFO information
- **Transparency**: Provide clear reasoning behind all scores and comments
- **Completeness Validation**: Ensure applications meet all NOFO requirements

## Available Tools

### Primary Evaluation Tools

#### `process_grant_application`
Process and analyze a complete grant application against NOFO requirements.
- **Parameters**: 
  - `application_file_path` (required): Absolute path to grant application (PDF/Word)
  - `nofo_file_path` (required): Absolute path to NOFO document
  - `grant_agency` (optional): HRSA, SAMHSA, etc. (default: HRSA)
  - `evaluation_criteria` (optional): Specific criteria to focus on

#### `score_grant_application`  
Generate quantitative scores based on agency-specific rubrics.
- **Parameters**:
  - `application_file_path` (required): Absolute path to grant application
  - `nofo_file_path` (required): Absolute path to NOFO document
  - `grant_agency` (optional): Funding agency (default: HRSA)
  - `scoring_method` (optional): standard, detailed, comparative (default: standard)

#### `generate_reviewer_comments`
Create detailed reviewer comments including strengths, weaknesses, and met criteria.
- **Parameters**:
  - `application_file_path` (required): Absolute path to grant application
  - `nofo_file_path` (required): Absolute path to NOFO document
  - `grant_agency` (optional): Funding agency (default: HRSA)
  - `comment_style` (optional): professional, detailed, constructive (default: professional)

#### `generate_reviewer_worksheet`
Generate complete reviewer worksheet with scores, comments, and recommendations.
- **Parameters**:
  - `application_file_path` (required): Absolute path to grant application
  - `nofo_file_path` (required): Absolute path to NOFO document
  - `grant_agency` (optional): Funding agency (default: HRSA)
  - `output_format` (optional): comprehensive, summary, detailed (default: comprehensive)

### Analysis Tools

#### `extract_grant_sections`
Extract specific sections from grant application for targeted analysis.
- **Parameters**:
  - `application_file_path` (required): Absolute path to grant application
  - `section_types` (optional): Comma-separated sections (e.g., "abstract,methodology,budget")

#### `compare_with_successful_applications`
Compare application against patterns from successful grant applications.
- **Parameters**:
  - `application_file_path` (required): Absolute path to grant application
  - `grant_agency` (optional): Agency for comparison benchmarks (default: HRSA)
  - `comparison_type` (optional): structural, content, comprehensive (default: structural)

#### `validate_application_completeness`
Validate that application meets all NOFO requirements and completeness criteria.
- **Parameters**:
  - `application_file_path` (required): Absolute path to grant application
  - `nofo_file_path` (required): Absolute path to NOFO document
  - `grant_agency` (optional): Agency for validation rules (default: HRSA)

## Installation

### Prerequisites
- Python 3.10 or higher
- uv package manager

### Setup
1. Clone or download the grant-reviewer-mcp directory
2. The startup script will automatically handle dependency installation

### Dependencies
The server automatically installs:
- FastMCP (Model Context Protocol framework)
- PyMuPDF (PDF processing)
- python-docx (Word document processing)
- pdfplumber (Advanced PDF analysis)
- pandas (Data analysis)
- Additional supporting libraries

## Usage

### MCP Client Integration
Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "grant-reviewer": {
      "command": "sh",
      "args": ["/path/to/grant-reviewer-mcp/run.sh"],
      "env": {}
    }
  }
}
```

### Example Workflow

1. **Initial Processing**:
   ```
   Use process_grant_application with:
   - application_file_path: "/path/to/application.pdf"
   - nofo_file_path: "/path/to/nofo.pdf"
   - grant_agency: "HRSA"
   ```

2. **Detailed Scoring**:
   ```
   Use score_grant_application with the same parameters
   ```

3. **Generate Comments**:
   ```
   Use generate_reviewer_comments for professional feedback
   ```

4. **Complete Worksheet**:
   ```
   Use generate_reviewer_worksheet for final evaluation document
   ```

## Evaluation Standards

### HRSA Scoring Rubric
- **Outstanding (90-100%)**: All elements clearly addressed, well-conceived, thoroughly developed
- **Very Good (80-89%)**: Elements clearly addressed with necessary detail, minor weaknesses
- **Good (70-79%)**: Elements addressed but some lack detail, moderate impact weaknesses
- **Satisfactory (60-69%)**: Most elements addressed but lack detail, some major weaknesses
- **Poor (<60%)**: Few elements addressed, numerous major weaknesses

### SAMHSA Scoring Rubric
- **Outstanding**: Comprehensive descriptions, thorough details, strong understanding
- **Very Good**: Significant descriptions, relevant details, sound understanding
- **Acceptable**: Basic response, limited detail and examples
- **Marginal**: Minimal details, insufficient descriptions, major gaps
- **Unacceptable**: Does not address requirements, completely deficient

## Quality Assurance

### Bias Mitigation
- Objective evaluation criteria applied consistently
- Evidence-based assessments using only provided information
- Standardized scoring rubrics eliminate subjective bias
- Professional language guidelines prevent discriminatory comments

### Transparency Features
- Clear justification for all scores and recommendations
- Specific page references for all comments
- Detailed breakdown of evaluation methodology
- Comprehensive audit trail of decision factors

### Human Oversight
- Generated evaluations support rather than replace human judgment
- Recommendations clearly marked as AI-generated
- Review protocols include human validation checkpoints
- Appeals and clarification processes supported

## Technical Architecture

### Core Components
- **DocumentProcessor**: PDF/Word document analysis and extraction
- **GrantEvaluator**: Core evaluation logic and assessment frameworks
- **ScoringEngine**: Agency-specific scoring rubrics and calculations
- **CommentGenerator**: Professional comment generation following guidelines
- **ReportGenerator**: Comprehensive worksheet and report creation

### Data Privacy
- No external data transmission during evaluation
- Local processing maintains application confidentiality
- Temporary files automatically cleaned up
- No persistent storage of sensitive information

## Limitations

### Current Limitations
- Visual formatting analysis not supported
- Image and figure content not evaluated
- Mathematical formulas in images not processed
- Interactive document elements not assessed

### Recommended Usage
- Use for initial evaluation and screening
- Combine with human expert review for final decisions
- Validate AI recommendations against agency guidelines
- Consider as decision support tool, not replacement for human judgment

## Support

For technical issues or questions about evaluation methodology, please refer to:
- HRSA evaluation guidelines and standards
- SAMHSA scoring criteria documentation
- Federal grant review best practices

## License

This project follows standard open-source practices. See individual component licenses for specific terms.

---

**Generated by**: MiniMax Agent
**Version**: 1.0.0
**Last Updated**: 2025-07-21
