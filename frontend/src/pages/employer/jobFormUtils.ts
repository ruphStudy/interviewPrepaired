/**
 * Shared data-shaping helpers for the Job create (`/employer/jobs/new`) and
 * edit (`/employer/jobs/:jobId`) forms — pure functions/types only, no UI.
 * Kept separate purely to avoid duplicating the numeric-string/array-text
 * conversion logic across the two pages; each page still owns its own JSX.
 */
import { EmployerJob, EmployerJobPayload, EmployerJobWorkplaceType, EmployerJobEmploymentType } from '../../api/employerApi';

export interface JobFormState {
  title: string;
  jobCode: string;
  department: string;
  location: string;
  workplaceType: EmployerJobWorkplaceType | '';
  employmentType: EmployerJobEmploymentType | '';
  experienceMinYears: string;
  experienceMaxYears: string;
  openings: string;
  description: string;
  responsibilitiesText: string;
  requiredSkillsText: string;
  preferredSkillsText: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  applicationDeadline: string;
}

export const EMPTY_JOB_FORM: JobFormState = {
  title: '',
  jobCode: '',
  department: '',
  location: '',
  workplaceType: '',
  employmentType: '',
  experienceMinYears: '',
  experienceMaxYears: '',
  openings: '',
  description: '',
  responsibilitiesText: '',
  requiredSkillsText: '',
  preferredSkillsText: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: '',
  applicationDeadline: '',
};

/** Comma- or newline-separated free text into a clean string list — matches the "simple textarea, no rich editor" requirement. */
export function parseListText(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatListText(values?: string[]): string {
  return values && values.length > 0 ? values.join('\n') : '';
}

export function jobToFormState(job: EmployerJob): JobFormState {
  return {
    title: job.title,
    jobCode: job.jobCode || '',
    department: job.department || '',
    location: job.location || '',
    workplaceType: job.workplaceType || '',
    employmentType: job.employmentType || '',
    experienceMinYears: job.experienceMinYears !== undefined ? String(job.experienceMinYears) : '',
    experienceMaxYears: job.experienceMaxYears !== undefined ? String(job.experienceMaxYears) : '',
    openings: job.openings !== undefined ? String(job.openings) : '',
    description: job.description || '',
    responsibilitiesText: formatListText(job.responsibilities),
    requiredSkillsText: formatListText(job.requiredSkills),
    preferredSkillsText: formatListText(job.preferredSkills),
    salaryMin: job.salaryMin !== undefined ? String(job.salaryMin) : '',
    salaryMax: job.salaryMax !== undefined ? String(job.salaryMax) : '',
    salaryCurrency: job.salaryCurrency || '',
    applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 10) : '',
  };
}

/** Never includes organizationId/createdByMembershipId/status/timestamps — those aren't part of this form at all. */
export function jobFormToPayload(form: JobFormState): EmployerJobPayload {
  return {
    title: form.title.trim(),
    jobCode: form.jobCode.trim() || undefined,
    department: form.department.trim() || undefined,
    location: form.location.trim() || undefined,
    workplaceType: form.workplaceType || undefined,
    employmentType: form.employmentType || undefined,
    experienceMinYears: form.experienceMinYears === '' ? undefined : Number(form.experienceMinYears),
    experienceMaxYears: form.experienceMaxYears === '' ? undefined : Number(form.experienceMaxYears),
    openings: form.openings === '' ? undefined : Number(form.openings),
    description: form.description.trim() || undefined,
    responsibilities: parseListText(form.responsibilitiesText),
    requiredSkills: parseListText(form.requiredSkillsText),
    preferredSkills: parseListText(form.preferredSkillsText),
    salaryMin: form.salaryMin === '' ? undefined : Number(form.salaryMin),
    salaryMax: form.salaryMax === '' ? undefined : Number(form.salaryMax),
    salaryCurrency: form.salaryCurrency.trim() || undefined,
    applicationDeadline: form.applicationDeadline || undefined,
  };
}
