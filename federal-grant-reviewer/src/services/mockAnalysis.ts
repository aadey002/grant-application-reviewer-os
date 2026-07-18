// Mock Grant Analysis Engine
// Simulates comprehensive grant evaluation based on HRSA/SAMHSA criteria

export interface DocumentInfo {
  type: string;
  pages: number;
  sections: number;
  tables: number;
  wordCount: number;
}

export interface CriterionScore {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  rating: 'Outstanding' | 'Very Good' | 'Good' | 'Satisfactory' | 'Poor';
  strengths: string[];
  weaknesses: string[];
  comments: string;
}

export interface AnalysisResult {
  documentInfo: DocumentInfo;
  overallScore: number;
  overallRating: string;
  recommendation: 'Highly Recommended' | 'Recommended' | 'Conditionally Recommended' | 'Not Recommended';
  criteriaScores: CriterionScore[];
  executiveSummary: string;
  detailedComments: {
    strengths: string;
    weaknesses: string;
    recommendations: string;
  };
  complianceCheck: {
    formatCompliance: boolean;
    pageLimit: boolean;
    requiredSections: boolean;
    budgetAlignment: boolean;
  };
  riskAssessment: {
    level: 'Low' | 'Medium' | 'High';
    factors: string[];
  };
}

const HRSA_CRITERIA = [
  {
    name: 'Program Design and Implementation',
    weight: 25,
    description: 'Quality and feasibility of the proposed program approach'
  },
  {
    name: 'Organizational Capacity and Experience',
    weight: 20,
    description: 'Organizational qualifications and staff expertise'
  },
  {
    name: 'Evaluation and Performance Measurement',
    weight: 20,
    description: 'Plan for measuring and evaluating program effectiveness'
  },
  {
    name: 'Budget Narrative and Justification',
    weight: 15,
    description: 'Cost-effectiveness and budget reasonableness'
  },
  {
    name: 'Community Engagement and Partnerships',
    weight: 10,
    description: 'Stakeholder involvement and collaborative approach'
  },
  {
    name: 'Sustainability and Continuation',
    weight: 10,
    description: 'Long-term viability beyond grant period'
  }
];

const SAMHSA_CRITERIA = [
  {
    name: 'Statement of Need',
    weight: 20,
    description: 'Evidence-based demonstration of community need'
  },
  {
    name: 'Project Description and Implementation Plan',
    weight: 30,
    description: 'Comprehensive approach and implementation strategy'
  },
  {
    name: 'Evaluation Plan',
    weight: 20,
    description: 'Outcome measurement and evaluation methodology'
  },
  {
    name: 'Staff Qualifications and Organizational Capacity',
    weight: 15,
    description: 'Personnel qualifications and organizational readiness'
  },
  {
    name: 'Budget and Budget Narrative',
    weight: 15,
    description: 'Budget appropriateness and cost-effectiveness'
  }
];

function generateScore(baseScore: number, variance: number = 10): number {
  const randomVariance = (Math.random() - 0.5) * variance;
  return Math.max(0, Math.min(100, baseScore + randomVariance));
}

function getRating(score: number): CriterionScore['rating'] {
  if (score >= 90) return 'Outstanding';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Satisfactory';
  return 'Poor';
}

function generateCriterionAnalysis(criterion: any, baseScore: number): CriterionScore {
  const score = generateScore(baseScore, 8);
  const percentage = Math.round((score / 100) * criterion.weight);
  const rating = getRating(score);
  
  const strengthPool = [
    'Clear and well-articulated objectives',
    'Evidence-based approach with strong theoretical foundation',
    'Comprehensive implementation timeline',
    'Strong organizational capacity and experience',
    'Effective stakeholder engagement strategy',
    'Innovative methodology and best practices',
    'Detailed evaluation plan with appropriate metrics',
    'Cost-effective budget allocation',
    'Strong partnerships and collaborations',
    'Cultural competency and responsiveness',
    'Sustainability planning beyond grant period',
    'Track record of successful program delivery'
  ];
  
  const weaknessPool = [
    'Limited detail in implementation methodology',
    'Insufficient staff qualifications described',
    'Budget justification lacks specificity',
    'Evaluation plan needs more robust metrics',
    'Partnership roles not clearly defined',
    'Sustainability strategy requires development',
    'Risk mitigation planning insufficient',
    'Timeline appears overly ambitious',
    'Target population definition too broad',
    'Quality assurance measures inadequate',
    'Data collection methods need clarification',
    'Cultural competency approach unclear'
  ];
  
  const numStrengths = rating === 'Outstanding' ? 3 : rating === 'Very Good' ? 2 : 1;
  const numWeaknesses = rating === 'Poor' ? 3 : rating === 'Satisfactory' ? 2 : rating === 'Good' ? 1 : 0;
  
  const strengths = strengthPool.sort(() => 0.5 - Math.random()).slice(0, numStrengths);
  const weaknesses = weaknessPool.sort(() => 0.5 - Math.random()).slice(0, numWeaknesses);
  
  const comments = `The applicant organization demonstrates ${rating.toLowerCase()} performance in ${criterion.name.toLowerCase()}. ${strengths.length > 0 ? 'Key strengths include ' + strengths.join(', ').toLowerCase() + '.' : ''} ${weaknesses.length > 0 ? 'Areas for improvement include ' + weaknesses.join(', ').toLowerCase() + '.' : ''}`;
  
  return {
    name: criterion.name,
    score,
    maxScore: 100,
    percentage,
    rating,
    strengths,
    weaknesses,
    comments
  };
}

function analyzeFileContent(file: File): DocumentInfo {
  // Mock document analysis based on file properties
  const fileSize = file.size;
  const fileName = file.name.toLowerCase();
  
  // Estimate pages based on file size (rough approximation)
  const estimatedPages = Math.max(10, Math.min(50, Math.floor(fileSize / 50000)));
  
  // Estimate sections based on file type and size
  const estimatedSections = Math.max(5, Math.min(12, Math.floor(estimatedPages / 4)));
  
  // Estimate tables
  const estimatedTables = Math.floor(Math.random() * 8) + 2;
  
  // Estimate word count
  const estimatedWordCount = Math.floor(estimatedPages * 250 * (0.8 + Math.random() * 0.4));
  
  let docType = 'PDF';
  if (fileName.includes('.doc')) docType = 'DOC';
  if (fileName.includes('.docx')) docType = 'DOCX';
  if (fileName.includes('.txt')) docType = 'TXT';
  
  return {
    type: docType,
    pages: estimatedPages,
    sections: estimatedSections,
    tables: estimatedTables,
    wordCount: estimatedWordCount
  };
}

function generateExecutiveSummary(overallScore: number, agency: string): string {
  const rating = getRating(overallScore);
  
  if (rating === 'Outstanding') {
    return `This grant application demonstrates exceptional quality and alignment with ${agency} priorities. The proposal presents a comprehensive, evidence-based approach with strong organizational capacity, clear implementation strategies, and robust evaluation plans. The application effectively addresses community needs and shows significant potential for positive impact.`;
  } else if (rating === 'Very Good') {
    return `This grant application shows strong merit and good alignment with ${agency} objectives. The proposal demonstrates solid organizational capacity and a well-conceived approach. While most criteria are adequately addressed, some areas would benefit from additional detail or clarification to strengthen the overall proposal.`;
  } else if (rating === 'Good') {
    return `This grant application presents a reasonable approach to addressing the identified needs. The proposal shows adequate organizational capacity and basic understanding of program requirements. However, several areas require strengthening to meet ${agency} standards for funding consideration.`;
  } else if (rating === 'Satisfactory') {
    return `This grant application addresses the basic requirements but lacks the depth and detail expected for ${agency} funding. Significant improvements are needed in program design, evaluation planning, and organizational capacity demonstration before the proposal would be competitive.`;
  } else {
    return `This grant application does not meet the minimum standards for ${agency} funding consideration. Major deficiencies exist in multiple areas including program design, organizational capacity, budget justification, and evaluation planning. Substantial revision would be required.`;
  }
}

export async function analyzeDocument(file: File, agency: 'HRSA' | 'SAMHSA' = 'HRSA'): Promise<AnalysisResult> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
  
  const documentInfo = analyzeFileContent(file);
  const criteria = agency === 'HRSA' ? HRSA_CRITERIA : SAMHSA_CRITERIA;
  
  // Generate base score influenced by file characteristics
  let baseScore = 75; // Default good score
  
  // Adjust based on document characteristics
  if (documentInfo.pages < 15) baseScore -= 10; // Too short
  if (documentInfo.pages > 40) baseScore -= 5;  // Might be too long
  if (documentInfo.sections < 6) baseScore -= 8; // Missing sections
  if (documentInfo.wordCount < 8000) baseScore -= 12; // Insufficient detail
  
  // Add some randomness for realism
  baseScore += (Math.random() - 0.5) * 20;
  baseScore = Math.max(45, Math.min(95, baseScore));
  
  const criteriaScores = criteria.map(criterion => 
    generateCriterionAnalysis(criterion, baseScore + (Math.random() - 0.5) * 15)
  );
  
  const overallScore = Math.round(
    criteriaScores.reduce((sum, criterion, index) => 
      sum + (criterion.score * criteria[index].weight / 100), 0
    )
  );
  
  const overallRating = getRating(overallScore);
  
  let recommendation: AnalysisResult['recommendation'];
  if (overallScore >= 85) recommendation = 'Highly Recommended';
  else if (overallScore >= 75) recommendation = 'Recommended';
  else if (overallScore >= 65) recommendation = 'Conditionally Recommended';
  else recommendation = 'Not Recommended';
  
  const allStrengths = criteriaScores.flatMap(c => c.strengths);
  const allWeaknesses = criteriaScores.flatMap(c => c.weaknesses);
  
  const detailedComments = {
    strengths: `The applicant organization demonstrates several notable strengths: ${allStrengths.slice(0, 5).join('; ').toLowerCase()}. These elements contribute to a solid foundation for program implementation and success.`,
    weaknesses: allWeaknesses.length > 0 ? 
      `Areas requiring attention include: ${allWeaknesses.slice(0, 4).join('; ').toLowerCase()}. Addressing these issues would strengthen the proposal significantly.` :
      'No significant weaknesses identified in the current proposal.',
    recommendations: overallScore >= 75 ?
      'This proposal shows strong potential and is recommended for funding consideration. Minor clarifications may enhance the overall quality.' :
      'This proposal requires significant revision before it can be considered competitive for funding. Focus on strengthening the identified weak areas.'
  };
  
  const complianceCheck = {
    formatCompliance: Math.random() > 0.1,
    pageLimit: documentInfo.pages <= 40,
    requiredSections: documentInfo.sections >= 6,
    budgetAlignment: Math.random() > 0.15
  };
  
  const riskLevel = overallScore >= 80 ? 'Low' : overallScore >= 65 ? 'Medium' : 'High';
  const riskFactors = riskLevel === 'High' ? 
    ['Limited organizational experience', 'Ambitious timeline', 'Complex implementation'] :
    riskLevel === 'Medium' ?
    ['Some implementation challenges expected', 'Moderate complexity'] :
    ['Well-planned approach', 'Experienced organization'];
  
  return {
    documentInfo,
    overallScore,
    overallRating,
    recommendation,
    criteriaScores,
    executiveSummary: generateExecutiveSummary(overallScore, agency),
    detailedComments,
    complianceCheck,
    riskAssessment: {
      level: riskLevel,
      factors: riskFactors
    }
  };
}