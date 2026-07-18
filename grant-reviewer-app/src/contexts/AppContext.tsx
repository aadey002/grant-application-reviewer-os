/**
 * Application Context for Grant Reviewer
 * 
 * Provides global state management for the application including
 * documents, folders, evaluations, and user interface state.
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Document, Folder, Evaluation, Statistics } from '../services/api';

// Types
interface AppState {
  // Data
  documents: Document[];
  folders: Folder[];
  evaluations: Evaluation[];
  statistics: Statistics | null;
  
  // UI State
  selectedDocument: Document | null;
  selectedFolder: Folder | null;
  selectedEvaluation: Evaluation | null;
  currentView: 'dashboard' | 'documents' | 'evaluations' | 'search';
  sidebarCollapsed: boolean;
  
  // Loading States
  loading: {
    documents: boolean;
    folders: boolean;
    evaluations: boolean;
    statistics: boolean;
  };
  
  // Error States
  errors: {
    documents: string | null;
    folders: string | null;
    evaluations: string | null;
    statistics: string | null;
    general: string | null;
  };
}

type AppAction =
  // Data Actions
  | { type: 'SET_DOCUMENTS'; payload: Document[] }
  | { type: 'ADD_DOCUMENT'; payload: Document }
  | { type: 'UPDATE_DOCUMENT'; payload: Document }
  | { type: 'REMOVE_DOCUMENT'; payload: number }
  | { type: 'SET_FOLDERS'; payload: Folder[] }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'UPDATE_FOLDER'; payload: Folder }
  | { type: 'REMOVE_FOLDER'; payload: number }
  | { type: 'SET_EVALUATIONS'; payload: Evaluation[] }
  | { type: 'ADD_EVALUATION'; payload: Evaluation }
  | { type: 'UPDATE_EVALUATION'; payload: Evaluation }
  | { type: 'SET_STATISTICS'; payload: Statistics }
  
  // Selection Actions
  | { type: 'SELECT_DOCUMENT'; payload: Document | null }
  | { type: 'SELECT_FOLDER'; payload: Folder | null }
  | { type: 'SELECT_EVALUATION'; payload: Evaluation | null }
  
  // UI Actions
  | { type: 'SET_CURRENT_VIEW'; payload: AppState['currentView'] }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_COLLAPSED'; payload: boolean }
  
  // Loading Actions
  | { type: 'SET_LOADING'; payload: { key: keyof AppState['loading']; value: boolean } }
  
  // Error Actions
  | { type: 'SET_ERROR'; payload: { key: keyof AppState['errors']; value: string | null } }
  | { type: 'CLEAR_ERRORS' };

// Initial State
const initialState: AppState = {
  documents: [],
  folders: [],
  evaluations: [],
  statistics: null,
  
  selectedDocument: null,
  selectedFolder: null,
  selectedEvaluation: null,
  currentView: 'dashboard',
  sidebarCollapsed: false,
  
  loading: {
    documents: false,
    folders: false,
    evaluations: false,
    statistics: false,
  },
  
  errors: {
    documents: null,
    folders: null,
    evaluations: null,
    statistics: null,
    general: null,
  },
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Data Actions
    case 'SET_DOCUMENTS':
      return { ...state, documents: action.payload };
    
    case 'ADD_DOCUMENT':
      return { ...state, documents: [action.payload, ...state.documents] };
    
    case 'UPDATE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.map(doc => 
          doc.id === action.payload.id ? action.payload : doc
        ),
        selectedDocument: state.selectedDocument?.id === action.payload.id 
          ? action.payload : state.selectedDocument,
      };
    
    case 'REMOVE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.filter(doc => doc.id !== action.payload),
        selectedDocument: state.selectedDocument?.id === action.payload 
          ? null : state.selectedDocument,
      };
    
    case 'SET_FOLDERS':
      return { ...state, folders: action.payload };
    
    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.payload] };
    
    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map(folder => 
          folder.id === action.payload.id ? action.payload : folder
        ),
        selectedFolder: state.selectedFolder?.id === action.payload.id 
          ? action.payload : state.selectedFolder,
      };
    
    case 'REMOVE_FOLDER':
      return {
        ...state,
        folders: state.folders.filter(folder => folder.id !== action.payload),
        selectedFolder: state.selectedFolder?.id === action.payload 
          ? null : state.selectedFolder,
      };
    
    case 'SET_EVALUATIONS':
      return { ...state, evaluations: action.payload };
    
    case 'ADD_EVALUATION':
      return { ...state, evaluations: [action.payload, ...state.evaluations] };
    
    case 'UPDATE_EVALUATION':
      return {
        ...state,
        evaluations: state.evaluations.map(evaluation => 
          evaluation.id === action.payload.id ? action.payload : evaluation
        ),
        selectedEvaluation: state.selectedEvaluation?.id === action.payload.id 
          ? action.payload : state.selectedEvaluation,
      };
    
    case 'SET_STATISTICS':
      return { ...state, statistics: action.payload };
    
    // Selection Actions
    case 'SELECT_DOCUMENT':
      return { ...state, selectedDocument: action.payload };
    
    case 'SELECT_FOLDER':
      return { ...state, selectedFolder: action.payload };
    
    case 'SELECT_EVALUATION':
      return { ...state, selectedEvaluation: action.payload };
    
    // UI Actions
    case 'SET_CURRENT_VIEW':
      return { ...state, currentView: action.payload };
    
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    
    case 'SET_SIDEBAR_COLLAPSED':
      return { ...state, sidebarCollapsed: action.payload };
    
    // Loading Actions
    case 'SET_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.key]: action.payload.value,
        },
      };
    
    // Error Actions
    case 'SET_ERROR':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.key]: action.payload.value,
        },
      };
    
    case 'CLEAR_ERRORS':
      return {
        ...state,
        errors: {
          documents: null,
          folders: null,
          evaluations: null,
          statistics: null,
          general: null,
        },
      };
    
    default:
      return state;
  }
}

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load sidebar state from localStorage
  useEffect(() => {
    const savedSidebarState = localStorage.getItem('sidebarCollapsed');
    if (savedSidebarState !== null) {
      dispatch({
        type: 'SET_SIDEBAR_COLLAPSED',
        payload: JSON.parse(savedSidebarState),
      });
    }
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(state.sidebarCollapsed));
  }, [state.sidebarCollapsed]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Utility hooks for specific data
export function useDocuments() {
  const { state } = useApp();
  return {
    documents: state.documents,
    selectedDocument: state.selectedDocument,
    loading: state.loading.documents,
    error: state.errors.documents,
  };
}

export function useFolders() {
  const { state } = useApp();
  return {
    folders: state.folders,
    selectedFolder: state.selectedFolder,
    loading: state.loading.folders,
    error: state.errors.folders,
  };
}

export function useEvaluations() {
  const { state } = useApp();
  return {
    evaluations: state.evaluations,
    selectedEvaluation: state.selectedEvaluation,
    loading: state.loading.evaluations,
    error: state.errors.evaluations,
  };
}

export function useStatistics() {
  const { state } = useApp();
  return {
    statistics: state.statistics,
    loading: state.loading.statistics,
    error: state.errors.statistics,
  };
}

export default AppContext;
