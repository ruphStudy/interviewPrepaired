/** Assignment lifecycle — 12D creates only the `ASSIGNED` state; transitions to in_progress/completed/cancelled belong to 12E (actual interview creation) and are not implemented yet. */
export enum InstituteStudentInterviewAssignmentStatus {
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
