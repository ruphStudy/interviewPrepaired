/**
 * Shared API Configuration
 * 
 * Central configuration for all API calls to ensure consistency
 */

/**
 * Base URL for all API calls
 * Default: http://localhost:5000/api/v1
 * Override with VITE_API_BASE_URL environment variable
 */
export const API_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL || 
  'http://localhost:5000/api/v1';

/**
 * API timeout in milliseconds (60 seconds)
 */
export const API_TIMEOUT = 60000;

/**
 * Get auth token from localStorage
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

/**
 * Set auth token in localStorage
 */
export const setAuthToken = (token: string): void => {
  localStorage.setItem('authToken', token);
};

/**
 * Remove auth token from localStorage
 */
export const removeAuthToken = (): void => {
  localStorage.removeItem('authToken');
};
