/**
 * Custom hooks for API operations
 * 
 * Provides React hooks that integrate with the AppContext
 * for data fetching and state management.
 */

import { useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { api, APIError, Document as DocumentType, Folder, Evaluation } from '../services/api';

// Generic error handler
function handleAPIError(error: unknown, dispatch: any, errorKey: string) {
  const message = error instanceof APIError 
    ? error.message 
    : error instanceof Error 
    ? error.message 
    : 'An unexpected error occurred';
  
  dispatch({
    type: 'SET_ERROR',
    payload: { key: errorKey, value: message }
  });
  
  console.error(`API Error (${errorKey}):`, error);
}

// Document hooks
export function useDocumentActions() {
  const { dispatch } = useApp();

  const loadDocuments = useCallback(async (filters?: {
    folder_id?: number;
    agency?: string;
    status?: string;
    search?: string;
  }) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'documents', value: true } });
    dispatch({ type: 'SET_ERROR', payload: { key: 'documents', value: null } });

    try {
      const response = await api.documents.getDocuments(filters);
      dispatch({ type: 'SET_DOCUMENTS', payload: response.documents });
    } catch (error) {
      handleAPIError(error, dispatch, 'documents');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'documents', value: false } });
    }
  }, [dispatch]);

  const uploadDocument = useCallback(async (file: File, metadata: {
    folder_id?: number;
    agency?: string;
    document_type?: string;
    description?: string;
  }) => {
    try {
      const response = await api.documents.uploadDocument(file, metadata);
      dispatch({ type: 'ADD_DOCUMENT', payload: response.document });
      return response.document;
    } catch (error) {
      handleAPIError(error, dispatch, 'documents');
      throw error;
    }
  }, [dispatch]);

  const updateDocument = useCallback(async (id: number, updates: Partial<DocumentType>) => {
    try {
      const response = await api.documents.updateDocument(id, updates);
      dispatch({ type: 'UPDATE_DOCUMENT', payload: response.document });
      return response.document;
    } catch (error) {
      handleAPIError(error, dispatch, 'documents');
      throw error;
    }
  }, [dispatch]);

  const deleteDocument = useCallback(async (id: number) => {
    try {
      await api.documents.deleteDocument(id);
      dispatch({ type: 'REMOVE_DOCUMENT', payload: id });
    } catch (error) {
      handleAPIError(error, dispatch, 'documents');
      throw error;
    }
  }, [dispatch]);

  const downloadDocument = useCallback(async (document: DocumentType) => {
    try {
      const blob = await api.documents.downloadDocument(document.id);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.original_filename;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      handleAPIError(error, dispatch, 'documents');
      throw error;
    }
  }, [dispatch]);

  const selectDocument = useCallback((document: DocumentType | null) => {
    dispatch({ type: 'SELECT_DOCUMENT', payload: document });
  }, [dispatch]);

  return {
    loadDocuments,
    uploadDocument,
    updateDocument,
    deleteDocument,
    downloadDocument,
    selectDocument,
  };
}

// Folder hooks
export function useFolderActions() {
  const { dispatch } = useApp();

  const loadFolders = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'folders', value: true } });
    dispatch({ type: 'SET_ERROR', payload: { key: 'folders', value: null } });

    try {
      const response = await api.folders.getFolders();
      dispatch({ type: 'SET_FOLDERS', payload: response.folders });
    } catch (error) {
      handleAPIError(error, dispatch, 'folders');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'folders', value: false } });
    }
  }, [dispatch]);

  const createFolder = useCallback(async (data: {
    name: string;
    parent_id?: number;
    description?: string;
  }) => {
    try {
      const response = await api.folders.createFolder(data);
      dispatch({ type: 'ADD_FOLDER', payload: response.folder });
      return response.folder;
    } catch (error) {
      handleAPIError(error, dispatch, 'folders');
      throw error;
    }
  }, [dispatch]);

  const updateFolder = useCallback(async (id: number, updates: {
    name?: string;
    description?: string;
  }) => {
    try {
      const response = await api.folders.updateFolder(id, updates);
      dispatch({ type: 'UPDATE_FOLDER', payload: response.folder });
      return response.folder;
    } catch (error) {
      handleAPIError(error, dispatch, 'folders');
      throw error;
    }
  }, [dispatch]);

  const deleteFolder = useCallback(async (id: number, force = false) => {
    try {
      await api.folders.deleteFolder(id, force);
      dispatch({ type: 'REMOVE_FOLDER', payload: id });
    } catch (error) {
      handleAPIError(error, dispatch, 'folders');
      throw error;
    }
  }, [dispatch]);

  const selectFolder = useCallback((folder: Folder | null) => {
    dispatch({ type: 'SELECT_FOLDER', payload: folder });
  }, [dispatch]);

  return {
    loadFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    selectFolder,
  };
}

// Evaluation hooks
export function useEvaluationActions() {
  const { dispatch } = useApp();

  const loadEvaluations = useCallback(async (document_id?: number) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'evaluations', value: true } });
    dispatch({ type: 'SET_ERROR', payload: { key: 'evaluations', value: null } });

    try {
      const response = await api.evaluations.getEvaluations(document_id);
      dispatch({ type: 'SET_EVALUATIONS', payload: response.evaluations });
    } catch (error) {
      handleAPIError(error, dispatch, 'evaluations');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'evaluations', value: false } });
    }
  }, [dispatch]);

  const createEvaluation = useCallback(async (data: {
    document_id: number;
    nofo_document_id?: number;
    evaluation_type: string;
  }) => {
    try {
      const response = await api.evaluations.createEvaluation(data);
      dispatch({ type: 'ADD_EVALUATION', payload: response.evaluation });
      return response.evaluation;
    } catch (error) {
      handleAPIError(error, dispatch, 'evaluations');
      throw error;
    }
  }, [dispatch]);

  const selectEvaluation = useCallback((evaluation: Evaluation | null) => {
    dispatch({ type: 'SELECT_EVALUATION', payload: evaluation });
  }, [dispatch]);

  return {
    loadEvaluations,
    createEvaluation,
    selectEvaluation,
  };
}

// Statistics hooks
export function useStatisticsActions() {
  const { dispatch } = useApp();

  const loadStatistics = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'statistics', value: true } });
    dispatch({ type: 'SET_ERROR', payload: { key: 'statistics', value: null } });

    try {
      const response = await api.stats.getStats();
      dispatch({ type: 'SET_STATISTICS', payload: response.stats });
    } catch (error) {
      handleAPIError(error, dispatch, 'statistics');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'statistics', value: false } });
    }
  }, [dispatch]);

  return {
    loadStatistics,
  };
}

// Search hooks
export function useSearch() {
  const { dispatch } = useApp();

  const search = useCallback(async (params: {
    q: string;
    agency?: string;
    document_type?: string;
    folder_id?: number;
  }) => {
    try {
      const response = await api.search.search(params);
      return response.results;
    } catch (error) {
      handleAPIError(error, dispatch, 'general');
      throw error;
    }
  }, [dispatch]);

  return {
    search,
  };
}

// Navigation hooks
export function useNavigation() {
  const { dispatch } = useApp();

  const setCurrentView = useCallback((view: 'dashboard' | 'documents' | 'evaluations' | 'search') => {
    dispatch({ type: 'SET_CURRENT_VIEW', payload: view });
  }, [dispatch]);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, [dispatch]);

  return {
    setCurrentView,
    toggleSidebar,
  };
}
