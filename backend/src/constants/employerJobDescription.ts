/** How a JD source's raw text was captured (17A) — file upload is not implemented yet. */
export enum EmployerJobDescriptionSourceType {
  PASTED = 'pasted',
  MANUAL = 'manual',
}

export const JD_RAW_TEXT_MIN_LENGTH = 50;
export const JD_RAW_TEXT_MAX_LENGTH = 50000;
