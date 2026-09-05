import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAssessmentReportService } from '../services/EmployerHiringAssessmentReportService';
import { PDFService } from '../services/PDFService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

const pdfService = new PDFService();

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringAssessmentReportController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/report — requires INTERVIEWS_MANAGE. */
  public createReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const hiringReport = await employerHiringAssessmentReportService.createReport(context.organizationId, context.role, applicationId);

    res.status(201).json(successResponse('Hiring report generated successfully', { hiringReport }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/report — requires ORGANIZATION_VIEW. */
  public getReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const hiringReport = await employerHiringAssessmentReportService.getReport(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Hiring report retrieved successfully', { hiringReport }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/report/export
   * — requires ORGANIZATION_VIEW. Authenticated, exact-tenant download of
   * the existing immutable 22C report as a PDF — no invitation token, no
   * candidate contact info, no recruiter review notes.
   */
  public exportReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const hiringReport = await employerHiringAssessmentReportService.getReport(context.organizationId, context.role, applicationId);
    if (!hiringReport || (hiringReport as any).status !== 'completed' || !(hiringReport as any).report) {
      throw new ApiError(404, 'Hiring report not found');
    }

    const report = (hiringReport as any).report;
    const pdfBuffer = await pdfService.generateHiringReportPDF({
      overallScore: report.overallScore,
      averageRubricScore: report.averageRubricScore,
      competencyCoveragePercent: report.competencyCoveragePercent,
      executiveSummary: report.executiveSummary,
      competencySummary: report.competencySummary,
      demonstratedStrengths: report.demonstratedStrengths,
      evidenceGaps: report.evidenceGaps,
      followUpPriorities: report.followUpPriorities,
      interviewerNotes: report.interviewerNotes,
      createdAt: (hiringReport as any).createdAt,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="hiring-report-${applicationId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  });
}

export default new EmployerHiringAssessmentReportController();
