import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  Save, 
  FileText, 
  CheckCircle,
  Clock,
  TrendingUp,
  MessageSquare,
  Star,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { api } from '@/services/api';

interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  score?: number;
  comments?: string;
}

interface EvaluationFormProps {
  documentId: number;
  documentTitle: string;
  agency: string;
  onEvaluationComplete?: (results: any) => void;
}

const EvaluationForm: React.FC<EvaluationFormProps> = ({ 
  documentId, 
  documentTitle, 
  agency, 
  onEvaluationComplete 
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('setup');
  const [evaluationType, setEvaluationType] = useState<'comprehensive' | 'scoring' | 'comments'>('comprehensive');
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [evaluationResults, setEvaluationResults] = useState<any>(null);
  const [comments, setComments] = useState<{
    strengths: string[];
    weaknesses: string[];
    met_criteria: string[];
  }>({ strengths: [], weaknesses: [], met_criteria: [] });

  useEffect(() => {
    initializeCriteria();
  }, [agency]);

  const initializeCriteria = () => {
    // Initialize criteria based on agency
    const agencyCriteria: Record<string, EvaluationCriterion[]> = {
      HRSA: [
        {
          id: 'relevance',
          name: 'Relevance to HRSA Priorities',
          description: 'Alignment with HRSA strategic priorities and program goals',
          weight: 20
        },
        {
          id: 'feasibility',
          name: 'Project Feasibility',
          description: 'Likelihood of successful project implementation',
          weight: 20
        },
        {
          id: 'impact',
          name: 'Community Impact',
          description: 'Potential for positive community health outcomes',
          weight: 25
        },
        {
          id: 'sustainability',
          name: 'Sustainability',
          description: 'Long-term viability and continuation of services',
          weight: 15
        },
        {
          id: 'capacity',
          name: 'Organizational Capacity',
          description: 'Ability to manage and execute the proposed program',
          weight: 20
        }
      ],
      SAMHSA: [
        {
          id: 'alignment',
          name: 'SAMHSA Goal Alignment',
          description: 'Consistency with SAMHSA mission and strategic objectives',
          weight: 20
        },
        {
          id: 'evidence',
          name: 'Evidence-Based Practices',
          description: 'Use of proven methods and interventions',
          weight: 25
        },
        {
          id: 'population',
          name: 'Target Population Focus',
          description: 'Clear identification and focus on target population',
          weight: 20
        },
        {
          id: 'outcomes',
          name: 'Measurable Outcomes',
          description: 'Clear, realistic, and measurable project outcomes',
          weight: 20
        },
        {
          id: 'cultural',
          name: 'Cultural Competency',
          description: 'Responsiveness to cultural needs of target population',
          weight: 15
        }
      ]
    };
    
    setCriteria(agencyCriteria[agency] || agencyCriteria.HRSA);
  };

  const startEvaluation = async () => {
    setIsEvaluating(true);
    setEvaluationProgress(0);
    setCurrentStep('processing');
    
    try {
      // Step 1: Create evaluation
      setCurrentStep('Initializing evaluation...');
      setEvaluationProgress(10);
      
      const evaluationData = {
        document_id: documentId,
        evaluation_type: evaluationType,
        evaluation_criteria: criteria.map(c => c.name).join(', ')
      };
      
      const evaluationResponse = await api.evaluations.create(evaluationData) as any;
      
      // Step 2: Process document (simulate MCP Agent processing)
      setCurrentStep('Processing document content...');
      setEvaluationProgress(30);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 3: Generate scores
      setCurrentStep('Generating scores...');
      setEvaluationProgress(60);
      
      // Simulate scoring (in real implementation, this would be MCP Agent results)
      const scores = criteria.reduce((acc, criterion) => {
        acc[criterion.id] = Math.floor(Math.random() * 30) + 70; // 70-100 range
        return acc;
      }, {} as Record<string, number>);
      
      const weightedScore = criteria.reduce((total, criterion) => {
        return total + (scores[criterion.id] * criterion.weight / 100);
      }, 0);
      
      setOverallScore(Math.round(weightedScore));
      
      // Update criteria with scores
      setCriteria(prev => prev.map(c => ({
        ...c,
        score: scores[c.id]
      })));
      
      // Step 4: Generate comments
      setCurrentStep('Generating reviewer comments...');
      setEvaluationProgress(85);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const generatedComments = {
        strengths: [
          "The applicant organization demonstrates strong organizational capacity with experienced leadership team and proven track record in similar programs.",
          "The proposed methodology is well-structured, evidence-based, and includes appropriate evaluation measures.",
          "Clear alignment with agency priorities and demonstrates understanding of target population needs.",
          "Budget is reasonable, well-justified, and includes appropriate cost-sharing arrangements."
        ],
        weaknesses: [
          "The sustainability plan needs more detail regarding specific funding sources beyond the grant period.",
          "The evaluation plan could benefit from more specific outcome measures and data collection procedures.",
          "Limited discussion of potential barriers to implementation and mitigation strategies."
        ],
        met_criteria: [
          "The applicant organization meets all eligibility requirements as specified in the NOFO.",
          "The project scope and activities align with program priorities and allowable activities.",
          "Required documentation and supporting materials are complete and properly formatted.",
          "The application demonstrates compliance with applicable federal regulations and requirements."
        ]
      };
      
      setComments(generatedComments);
      
      // Step 5: Finalize
      setCurrentStep('Finalizing evaluation...');
      setEvaluationProgress(100);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalResults = {
        evaluation_id: evaluationResponse.evaluation?.id || Date.now(),
        overall_score: Math.round(weightedScore),
        criterion_scores: scores,
        comments: generatedComments,
        recommendation: Math.round(weightedScore) >= 80 ? 'Fund' : 
                       Math.round(weightedScore) >= 70 ? 'Consider' : 'Do Not Fund'
      };
      
      setEvaluationResults(finalResults);
      setCurrentStep('completed');
      
      if (onEvaluationComplete) {
        onEvaluationComplete(finalResults);
      }
      
    } catch (error) {
      console.error('Evaluation failed:', error);
      setCurrentStep('error');
    } finally {
      setIsEvaluating(false);
    }
  };

  const pauseEvaluation = () => {
    setIsEvaluating(false);
    setCurrentStep('paused');
  };

  const resumeEvaluation = () => {
    setIsEvaluating(true);
    setCurrentStep('processing');
  };

  const resetEvaluation = () => {
    setIsEvaluating(false);
    setEvaluationProgress(0);
    setCurrentStep('setup');
    setOverallScore(null);
    setEvaluationResults(null);
    setComments({ strengths: [], weaknesses: [], met_criteria: [] });
    setCriteria(prev => prev.map(c => ({ ...c, score: undefined, comments: undefined })));
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Outstanding';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Satisfactory';
    return 'Poor';
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Grant Evaluation</CardTitle>
            <p className="text-sm text-gray-600 mt-1">{documentTitle}</p>
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant="outline">{agency}</Badge>
              <Badge variant="secondary">{evaluationType}</Badge>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {currentStep === 'setup' && (
              <Button onClick={startEvaluation} disabled={isEvaluating}>
                <Play className="h-4 w-4 mr-2" />
                Start Evaluation
              </Button>
            )}
            {isEvaluating && (
              <Button variant="outline" onClick={pauseEvaluation}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {currentStep === 'paused' && (
              <Button onClick={resumeEvaluation}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            {currentStep === 'completed' && (
              <Button variant="outline" onClick={resetEvaluation}>
                <RefreshCw className="h-4 w-4 mr-2" />
                New Evaluation
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-6 overflow-auto">
        {/* Evaluation Setup */}
        {currentStep === 'setup' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">Evaluation Type</h3>
              <div className="grid grid-cols-3 gap-3">
                {(['comprehensive', 'scoring', 'comments'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEvaluationType(type)}
                    className={`p-3 text-left border rounded-lg transition-colors ${
                      evaluationType === type 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium capitalize">{type}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {type === 'comprehensive' && 'Complete evaluation with scores and comments'}
                      {type === 'scoring' && 'Generate scores only'}
                      {type === 'comments' && 'Generate comments only'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Evaluation Criteria</h3>
              <div className="space-y-3">
                {criteria.map((criterion) => (
                  <div key={criterion.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{criterion.name}</div>
                      <Badge variant="outline">{criterion.weight}%</Badge>
                    </div>
                    <div className="text-sm text-gray-600">{criterion.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Evaluation Progress */}
        {(isEvaluating || currentStep === 'paused') && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-4">
                {isEvaluating ? (
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                ) : (
                  <Pause className="h-8 w-8 text-yellow-500" />
                )}
              </div>
              <h3 className="text-lg font-medium mb-2">
                {isEvaluating ? 'Evaluation in Progress' : 'Evaluation Paused'}
              </h3>
              <p className="text-gray-600 mb-4">{currentStep}</p>
              
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${evaluationProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">{evaluationProgress}% Complete</p>
            </div>
          </div>
        )}

        {/* Evaluation Results */}
        {currentStep === 'completed' && evaluationResults && (
          <div className="space-y-6">
            {/* Overall Score */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-blue-500" />
                  Overall Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className={`text-4xl font-bold ${getScoreColor(overallScore!)}`}>
                    {overallScore}%
                  </div>
                  <div className={`text-lg ${getScoreColor(overallScore!)}`}>
                    {getScoreLabel(overallScore!)}
                  </div>
                  <Badge 
                    variant={evaluationResults.recommendation === 'Fund' ? 'default' : 
                            evaluationResults.recommendation === 'Consider' ? 'secondary' : 'destructive'}
                    className="mt-3"
                  >
                    Recommendation: {evaluationResults.recommendation}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Criterion Scores */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Star className="h-5 w-5 mr-2 text-yellow-500" />
                  Detailed Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {criteria.map((criterion) => (
                  <div key={criterion.id} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{criterion.name}</div>
                      <div className="text-sm text-gray-500">Weight: {criterion.weight}%</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getScoreColor(criterion.score!)}`}>
                        {criterion.score}%
                      </div>
                      <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${criterion.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Comments */}
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center text-green-700">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {comments.strengths.map((strength, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center text-yellow-700">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {comments.weaknesses.map((weakness, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center text-blue-700">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Met Criteria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {comments.met_criteria.map((met, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                        {met}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Error State */}
        {currentStep === 'error' && (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-700 mb-2">Evaluation Failed</h3>
            <p className="text-gray-600 mb-4">There was an error processing the evaluation.</p>
            <Button onClick={resetEvaluation}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EvaluationForm;