/**
 * Employer shortlist workflow (19E) — an immutable audit record of an
 * explicit recruiter decision to shortlist a candidate for a job, backed
 * by the EXISTING 18D application lifecycle (screening -> shortlisted) and
 * the CURRENT applicable 19A screening + 19B explainable score at the
 * moment of the decision. No automatic shortlisting, no scoring formula of
 * its own — this only records that a human recruiter acted.
 */
export enum EmployerCandidateShortlistDecisionValue {
  SHORTLISTED = 'shortlisted',
}
