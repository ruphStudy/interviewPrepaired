/**
 * Shared data-shaping helpers for the Candidate create (`/employer/candidates/new`)
 * and edit (`/employer/candidates/:candidateId`) forms — pure functions/types
 * only, no UI. Kept separate purely to avoid duplicating the numeric-string/
 * array-text conversion logic across the two pages; each page still owns its
 * own JSX. Mirrors jobFormUtils.ts.
 */
import { EmployerCandidate, EmployerCandidatePayload, EmployerCandidateSource } from '../../api/employerApi';

export interface CandidateFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  headline: string;
  currentCompany: string;
  currentTitle: string;
  location: string;
  totalExperienceYears: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  noticePeriodDays: string;
  currentSalary: string;
  expectedSalary: string;
  salaryCurrency: string;
  source: EmployerCandidateSource | '';
  notes: string;
  tagsText: string;
}

export const EMPTY_CANDIDATE_FORM: CandidateFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  headline: '',
  currentCompany: '',
  currentTitle: '',
  location: '',
  totalExperienceYears: '',
  linkedinUrl: '',
  portfolioUrl: '',
  githubUrl: '',
  noticePeriodDays: '',
  currentSalary: '',
  expectedSalary: '',
  salaryCurrency: '',
  source: '',
  notes: '',
  tagsText: '',
};

/** Comma- or newline-separated free text into a clean string list — matches the "simple textarea, no rich editor" requirement. */
export function parseTagsText(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatTagsText(values?: string[]): string {
  return values && values.length > 0 ? values.join(', ') : '';
}

export function candidateToFormState(candidate: EmployerCandidate): CandidateFormState {
  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone || '',
    headline: candidate.headline || '',
    currentCompany: candidate.currentCompany || '',
    currentTitle: candidate.currentTitle || '',
    location: candidate.location || '',
    totalExperienceYears: candidate.totalExperienceYears !== undefined ? String(candidate.totalExperienceYears) : '',
    linkedinUrl: candidate.linkedinUrl || '',
    portfolioUrl: candidate.portfolioUrl || '',
    githubUrl: candidate.githubUrl || '',
    noticePeriodDays: candidate.noticePeriodDays !== undefined ? String(candidate.noticePeriodDays) : '',
    currentSalary: candidate.currentSalary !== undefined ? String(candidate.currentSalary) : '',
    expectedSalary: candidate.expectedSalary !== undefined ? String(candidate.expectedSalary) : '',
    salaryCurrency: candidate.salaryCurrency || '',
    source: candidate.source || '',
    notes: candidate.notes || '',
    tagsText: formatTagsText(candidate.tags),
  };
}

/** Never includes organizationId/createdByMembershipId/status/timestamps — those aren't part of this form at all. */
export function candidateFormToPayload(form: CandidateFormState): EmployerCandidatePayload {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim() || undefined,
    headline: form.headline.trim() || undefined,
    currentCompany: form.currentCompany.trim() || undefined,
    currentTitle: form.currentTitle.trim() || undefined,
    location: form.location.trim() || undefined,
    totalExperienceYears: form.totalExperienceYears === '' ? undefined : Number(form.totalExperienceYears),
    linkedinUrl: form.linkedinUrl.trim() || undefined,
    portfolioUrl: form.portfolioUrl.trim() || undefined,
    githubUrl: form.githubUrl.trim() || undefined,
    noticePeriodDays: form.noticePeriodDays === '' ? undefined : Number(form.noticePeriodDays),
    currentSalary: form.currentSalary === '' ? undefined : Number(form.currentSalary),
    expectedSalary: form.expectedSalary === '' ? undefined : Number(form.expectedSalary),
    salaryCurrency: form.salaryCurrency.trim() || undefined,
    source: form.source || undefined,
    notes: form.notes.trim() || undefined,
    tags: parseTagsText(form.tagsText),
  };
}
