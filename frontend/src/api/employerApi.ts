/**
 * Employer / Company Profile API Service (Sprint 16A)
 *
 * Handles calls to the backend's dedicated company-profile endpoints.
 * Mirrors instituteApi.ts's conventions exactly (auth-token interceptor,
 * per-method try/catch with a fallback message). Maps 1:1 to the existing
 * `GET/PUT /organizations/:organizationId/company-profile` routes — no
 * endpoint is invented, and this is entirely separate from the generic
 * `companyProfile` fragment nested inside organizationApi.ts's
 * OrganizationDetail (that stays read-only/legacy; this is the editable,
 * company/hiring-specific profile surface).
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

export const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-1000', label: '201-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

export interface CompanyProfile {
  industry?: string;
  companySize?: string;
  establishedYear?: number;
  officialName?: string;
  companyCode?: string;
  description?: string;
  website?: string;
  careersUrl?: string;
  headquarters?: string;
  linkedinUrl?: string;
  hiringEmail?: string;
  hiringPhone?: string;
}

export interface CompanyProfileResult {
  organization: { id: string; name: string; slug: string; status: string };
  profile: CompanyProfile;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type GetCompanyProfileResponse = ApiEnvelope<CompanyProfileResult>;
export type UpdateCompanyProfileResponse = ApiEnvelope<CompanyProfileResult>;

class EmployerApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT,
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const message = error.response.data?.message || 'An error occurred';
          throw new Error(message);
        } else if (error.request) {
          throw new Error('No response from server. Please check your connection.');
        } else {
          throw new Error(error.message || 'Failed to make request');
        }
      }
    );
  }

  async getCompanyProfile(organizationId: string): Promise<GetCompanyProfileResponse> {
    try {
      const response = await this.api.get<GetCompanyProfileResponse>(`/organizations/${organizationId}/company-profile`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load company profile');
    }
  }

  /** PATCH-like merge (despite being a PUT) — omitted fields keep their current value. At least one field required. */
  async updateCompanyProfile(organizationId: string, payload: CompanyProfile): Promise<UpdateCompanyProfileResponse> {
    try {
      const response = await this.api.put<UpdateCompanyProfileResponse>(
        `/organizations/${organizationId}/company-profile`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update company profile');
    }
  }
}

export const employerApi = new EmployerApiService();
export default employerApi;
