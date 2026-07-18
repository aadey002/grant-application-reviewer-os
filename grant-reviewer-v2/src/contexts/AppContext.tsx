import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { Document, Folder as ApiFolder, Evaluation as ApiEvaluation } from '@/types/api-responses';

// Re-export types for convenience
export type { Document } from '@/types/api-responses';
export type Folder = ApiFolder;
export type Evaluation = ApiEvaluation;

interface AppState {
  documents: Document[];
  folders: Folder[];
  evaluations: Evaluation[];
  selectedDocument: Document | null;
  selectedFolder: Folder | null;
  selectedEvaluation: Evaluation | null;
  currentView: 'dashboard' | 'documents' | 'evaluations' | 'search';
  sidebarCollapsed: boolean;
  loading: {
    documents: boolean;
    folders: boolean;
    evaluations: boolean;
    upload: boolean;
  };
  errors: {
    general: string | null;
    documents: string | null;
    folders: string | null;
    evaluations: string | null;
  };
}

type AppAction =
  | { type: 'SET_DOCUMENTS'; payload: Document[] }
  | { type: 'ADD_DOCUMENT'; payload: Document }
  | { type: 'UPDATE_DOCUMENT'; payload: Document }
  | { type: 'REMOVE_DOCUMENT'; payload: number }
  | { type: 'SET_FOLDERS'; payload: Folder[] }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'SET_EVALUATIONS'; payload: Evaluation[] }
  | { type: 'ADD_EVALUATION'; payload: Evaluation }
  | { type: 'SELECT_DOCUMENT'; payload: Document | null }
  | { type: 'SELECT_FOLDER'; payload: Folder | null }
  | { type: 'SET_CURRENT_VIEW'; payload: AppState['currentView'] }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_LOADING'; payload: { key: keyof AppState['loading']; value: boolean } }
  | { type: 'SET_ERROR'; payload: { key: keyof AppState['errors']; value: string | null } };

const initialState: AppState = {
  documents: [],
  folders: [],
  evaluations: [],
  selectedDocument: null,
  selectedFolder: null,
  selectedEvaluation: null,
  currentView: 'dashboard',
  sidebarCollapsed: false,
  loading: {
    documents: false,
    folders: false,
    evaluations: false,
    upload: false,
  },
  errors: {
    general: null,
    documents: null,
    folders: null,
    evaluations: null,
  },
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
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
      };
    case 'REMOVE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.filter(doc => doc.id !== action.payload),
      };
    case 'SET_FOLDERS':
      return { ...state, folders: action.payload };
    case 'ADD_FOLDER':
      return { ...state, folders: [action.payload, ...state.folders] };
    case 'SET_EVALUATIONS':
      return { ...state, evaluations: action.payload };
    case 'ADD_EVALUATION':
      return { ...state, evaluations: [action.payload, ...state.evaluations] };
    case 'SELECT_DOCUMENT':
      return { ...state, selectedDocument: action.payload };
    case 'SELECT_FOLDER':
      console.log('🗂️ AppContext: SELECT_FOLDER action received:', action.payload?.name, 'ID:', action.payload?.id);
      console.log('🗂️ AppContext: Previous selected folder:', state.selectedFolder?.name, 'ID:', state.selectedFolder?.id);
      const newState = { ...state, selectedFolder: action.payload };
      console.log('🗂️ AppContext: New selected folder:', newState.selectedFolder?.name, 'ID:', newState.selectedFolder?.id);
      return newState;
    case 'SET_CURRENT_VIEW':
      return { ...state, currentView: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.payload.key]: action.payload.value },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.payload.key]: action.payload.value },
      };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
