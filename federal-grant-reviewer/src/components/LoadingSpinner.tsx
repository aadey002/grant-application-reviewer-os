import React, { useState, useEffect } from 'react';
import { Brain, FileText, BarChart3, MessageSquare, CheckCircle } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Loading...' }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  
  const analysisSteps = [
    { icon: FileText, text: 'Processing document structure...', duration: 1000 },
    { icon: BarChart3, text: 'Analyzing content against criteria...', duration: 1500 },
    { icon: Brain, text: 'Generating AI-powered insights...', duration: 2000 },
    { icon: MessageSquare, text: 'Creating detailed comments...', duration: 1200 },
    { icon: CheckCircle, text: 'Finalizing comprehensive report...', duration: 800 }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          return 100;
        }
        return prev + 2;
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let stepTimer: NodeJS.Timeout;
    
    if (currentStep < analysisSteps.length - 1) {
      stepTimer = setTimeout(() => {
        setCurrentStep(prev => prev + 1);
      }, analysisSteps[currentStep].duration);
    }

    return () => clearTimeout(stepTimer);
  }, [currentStep, analysisSteps]);

  const CurrentIcon = analysisSteps[currentStep].icon;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
      <div className="flex flex-col items-center justify-center">
        {/* AI Brain Animation */}
        <div className="relative mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
            <Brain className="w-10 h-10 text-white animate-pulse" />
          </div>
          <div className="absolute inset-0 w-20 h-20 border-4 border-blue-200 rounded-full animate-ping" />
          <div className="absolute -top-2 -right-2">
            <CurrentIcon className="w-8 h-8 text-blue-600 bg-white rounded-full p-1.5 shadow-md animate-bounce" />
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full max-w-md mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Analyzing...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        {/* Current Step */}
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">{message}</p>
          <p className="text-sm text-gray-600 mb-4">{analysisSteps[currentStep].text}</p>
        </div>
        
        {/* Step Indicators */}
        <div className="flex space-x-2">
          {analysisSteps.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <div
                key={index}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  index <= currentStep
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                <StepIcon className="w-4 h-4" />
              </div>
            );
          })}
        </div>
        
        {/* Analysis Features */}
        <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-gray-600">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>HRSA/SAMHSA Standards</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
            <span>Comprehensive Scoring</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
            <span>Professional Comments</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '600ms' }} />
            <span>Detailed Report</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner;