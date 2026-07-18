"""
Usage Examples for Grant Reviewer MCP Server

Demonstrates how to use the various tools provided by the MCP server
for comprehensive grant application evaluation.
"""

import asyncio
from fastmcp import Client
import os
import sys

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

async def main():
    """Main example function demonstrating MCP server usage."""
    
    # Import the MCP server
    from server import mcp
    
    # Example file paths (replace with actual paths)
    example_application = "/path/to/sample_application.pdf"
    example_nofo = "/path/to/sample_nofo.pdf"
    
    print("Grant Reviewer MCP Server Usage Examples")
    print("=" * 50)
    
    # Connect to the MCP server
    async with Client(mcp) as client:
        
        print("\n1. Listing Available Tools")
        print("-" * 30)
        tools = await client.list_tools()
        for tool in tools:
            print(f"Tool: {tool.name}")
            print(f"Description: {tool.description}")
            print()
        
        print("\n2. Example: Process Grant Application")
        print("-" * 40)
        print("This would process a complete grant application...")
        
        # Example tool call (commented out since we don't have real files)
        """
        result = await client.call_tool("process_grant_application", {
            "application_file_path": example_application,
            "nofo_file_path": example_nofo,
            "grant_agency": "HRSA"
        })
        print(result.text)
        """
        
        print("\n3. Example: Score Application")
        print("-" * 30)
        print("This would generate quantitative scores...")
        
        """
        result = await client.call_tool("score_grant_application", {
            "application_file_path": example_application,
            "nofo_file_path": example_nofo,
            "grant_agency": "HRSA",
            "scoring_method": "comprehensive"
        })
        print(result.text)
        """
        
        print("\n4. Example: Generate Comments")
        print("-" * 30)
        print("This would create professional reviewer comments...")
        
        """
        result = await client.call_tool("generate_reviewer_comments", {
            "application_file_path": example_application,
            "nofo_file_path": example_nofo,
            "grant_agency": "HRSA",
            "comment_style": "professional"
        })
        print(result.text)
        """
        
        print("\n5. Example: Complete Worksheet")
        print("-" * 32)
        print("This would generate a complete reviewer worksheet...")
        
        """
        result = await client.call_tool("generate_reviewer_worksheet", {
            "application_file_path": example_application,
            "nofo_file_path": example_nofo,
            "grant_agency": "HRSA",
            "output_format": "comprehensive"
        })
        print(result.text)
        """
        
        print("\n6. Example: Validate Completeness")
        print("-" * 34)
        print("This would validate application completeness...")
        
        """
        result = await client.call_tool("validate_application_completeness", {
            "application_file_path": example_application,
            "nofo_file_path": example_nofo,
            "grant_agency": "HRSA"
        })
        print(result.text)
        """
        
        print("\nExample Workflow Complete!")
        print("=" * 50)

def example_workflow_description():
    """Describe typical workflow for using the Grant Reviewer MCP."""
    
    workflow = """
    TYPICAL GRANT REVIEW WORKFLOW
    ============================
    
    1. INITIAL PROCESSING
       - Use 'process_grant_application' to analyze documents
       - Review document structure and completeness
       - Get initial assessment and overview
    
    2. DETAILED EVALUATION
       - Use 'score_grant_application' for quantitative scoring
       - Review criterion-by-criterion breakdown
       - Analyze score distribution and performance levels
    
    3. PROFESSIONAL FEEDBACK
       - Use 'generate_reviewer_comments' for detailed feedback
       - Generate strength, weakness, and met criteria comments
       - Ensure proper page references and professional language
    
    4. COMPREHENSIVE REPORTING
       - Use 'generate_reviewer_worksheet' for final document
       - Create complete evaluation ready for submission
       - Include all scores, comments, and recommendations
    
    5. QUALITY ASSURANCE
       - Use 'validate_application_completeness' for final check
       - Verify all NOFO requirements are addressed
       - Confirm compliance with agency standards
    
    6. COMPARATIVE ANALYSIS (Optional)
       - Use 'compare_with_successful_applications' for benchmarking
       - Identify areas for improvement
       - Assess competitive positioning
    
    BEST PRACTICES
    ==============
    
    - Always use absolute file paths for documents
    - Specify the correct grant agency (HRSA, SAMHSA, etc.)
    - Review generated comments for accuracy and appropriateness
    - Use human oversight for final funding decisions
    - Maintain confidentiality of application materials
    
    SUPPORTED AGENCIES
    ==================
    
    Primary Support:
    - HRSA (Health Resources and Services Administration)
    - SAMHSA (Substance Abuse and Mental Health Services Administration)
    
    The system can be adapted for other federal health agencies
    with similar evaluation frameworks.
    """
    
    return workflow

if __name__ == "__main__":
    print("Grant Reviewer MCP Usage Examples")
    print(example_workflow_description())
    
    # Run the async example
    # asyncio.run(main())
    print("\nTo run the interactive examples, uncomment the asyncio.run(main()) line")
    print("and provide actual file paths to grant applications and NOFOs.")
