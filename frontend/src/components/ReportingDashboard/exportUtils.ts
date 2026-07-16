/**
 * Export Utilities
 * 
 * Functions for exporting report data to PDF, CSV, and JSON
 */

import type {
  ReportData,
  ExportFormat,
  ExportOptions,
  CSVExportData,
  ScoreBreakdown,
  EvaluationResult,
} from './types';

// ============================================================================
// PDF Export
// ============================================================================

/**
 * Export report as PDF
 * Uses browser print API or jsPDF library
 */
export async function exportToPDF(
  reportData: ReportData,
  options: ExportOptions
): Promise<void> {
  try {
    // Option 1: Use browser print API (simple, no dependencies)
    if (!options.includeCharts) {
      window.print();
      return;
    }

    // Option 2: Use jsPDF for more control (requires library)
    // This is a placeholder - implement with jsPDF in production
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    // Add title
    doc.setFontSize(20);
    doc.text('Interview Report', 20, 20);

    // Add interview details
    doc.setFontSize(12);
    doc.text(`Interview: ${reportData.interview.title}`, 20, 40);
    doc.text(`Type: ${reportData.interview.interviewType}`, 20, 50);
    doc.text(`Date: ${new Date(reportData.interview.startedAt).toLocaleDateString()}`, 20, 60);

    // Add scores
    doc.setFontSize(16);
    doc.text('Scores', 20, 80);
    doc.setFontSize(12);
    const scores = reportData.aggregatedScores;
    let yPos = 95;
    doc.text(`Overall: ${scores.overall.toFixed(1)}/10`, 30, yPos);
    doc.text(`Technical: ${scores.technical.toFixed(1)}/10`, 30, yPos + 10);
    doc.text(`Communication: ${scores.communication.toFixed(1)}/10`, 30, yPos + 20);
    doc.text(`Leadership: ${scores.leadership.toFixed(1)}/10`, 30, yPos + 30);
    doc.text(`Problem Solving: ${scores.problemSolving.toFixed(1)}/10`, 30, yPos + 40);
    doc.text(`Confidence: ${scores.confidence.toFixed(1)}/10`, 30, yPos + 50);

    // Add strengths
    yPos = 180;
    doc.setFontSize(16);
    doc.text('Strengths', 20, yPos);
    doc.setFontSize(10);
    reportData.strengths.forEach((strength, index) => {
      yPos += 10;
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${index + 1}. ${strength}`, 30, yPos);
    });

    // Add weaknesses
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    } else {
      yPos += 20;
    }
    doc.setFontSize(16);
    doc.text('Areas for Improvement', 20, yPos);
    doc.setFontSize(10);
    reportData.weaknesses.forEach((weakness, index) => {
      yPos += 10;
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${index + 1}. ${weakness}`, 30, yPos);
    });

    // Save PDF
    const filename = `interview-report-${reportData.interview.id}-${Date.now()}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error('Failed to export PDF:', error);
    throw new Error('PDF export failed');
  }
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Convert report data to CSV format
 */
function convertToCSV(data: CSVExportData): string {
  const { headers, rows } = data;

  // Escape CSV values
  const escapeValue = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV
  const csvRows = [
    headers.map(escapeValue).join(','),
    ...rows.map((row) => row.map(escapeValue).join(',')),
  ];

  return csvRows.join('\n');
}

/**
 * Prepare scores for CSV export
 */
function prepareScoresCSV(reportData: ReportData): CSVExportData {
  return {
    headers: [
      'Dimension',
      'Score',
      'Grade',
    ],
    rows: [
      ['Overall', reportData.aggregatedScores.overall, reportData.overallGrade],
      ['Technical', reportData.aggregatedScores.technical, ''],
      ['Communication', reportData.aggregatedScores.communication, ''],
      ['Leadership', reportData.aggregatedScores.leadership, ''],
      ['Problem Solving', reportData.aggregatedScores.problemSolving, ''],
      ['Confidence', reportData.aggregatedScores.confidence, ''],
    ],
  };
}

/**
 * Prepare evaluations for CSV export
 */
function prepareEvaluationsCSV(reportData: ReportData): CSVExportData {
  return {
    headers: [
      'Question',
      'Technical',
      'Communication',
      'Leadership',
      'Problem Solving',
      'Confidence',
      'Overall',
      'Grade',
    ],
    rows: reportData.evaluations.map((evaluation) => [
      evaluation.question,
      evaluation.scores.technical,
      evaluation.scores.communication,
      evaluation.scores.leadership,
      evaluation.scores.problemSolving,
      evaluation.scores.confidence,
      evaluation.scores.overall,
      evaluation.grade,
    ]),
  };
}

/**
 * Export report as CSV
 */
export async function exportToCSV(
  reportData: ReportData,
  options: ExportOptions
): Promise<void> {
  try {
    // Prepare data
    const scoresCSV = convertToCSV(prepareScoresCSV(reportData));
    const evaluationsCSV = convertToCSV(prepareEvaluationsCSV(reportData));

    // Combine sections
    let csvContent = '# Interview Report\n\n';
    csvContent += `## Interview Details\n`;
    csvContent += `Interview ID,${reportData.interview.id}\n`;
    csvContent += `Type,${reportData.interview.interviewType}\n`;
    csvContent += `Date,${new Date(reportData.interview.startedAt).toLocaleDateString()}\n`;
    csvContent += `Duration,${Math.floor(reportData.interview.duration / 60)} minutes\n\n`;

    csvContent += `## Scores\n${scoresCSV}\n\n`;
    csvContent += `## Detailed Evaluations\n${evaluationsCSV}\n\n`;

    csvContent += `## Strengths\n`;
    reportData.strengths.forEach((strength, index) => {
      csvContent += `${index + 1},${strength}\n`;
    });
    csvContent += `\n`;

    csvContent += `## Areas for Improvement\n`;
    reportData.weaknesses.forEach((weakness, index) => {
      csvContent += `${index + 1},${weakness}\n`;
    });
    csvContent += `\n`;

    csvContent += `## Suggestions\n`;
    reportData.suggestions.forEach((suggestion, index) => {
      csvContent += `${index + 1},${suggestion}\n`;
    });

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `interview-report-${reportData.interview.id}-${Date.now()}.csv`;
    downloadBlob(blob, filename);
  } catch (error) {
    console.error('Failed to export CSV:', error);
    throw new Error('CSV export failed');
  }
}

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Export report as JSON
 */
export async function exportToJSON(
  reportData: ReportData,
  options: ExportOptions
): Promise<void> {
  try {
    // Create export object
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        format: 'json',
      },
      interview: reportData.interview,
      scores: reportData.aggregatedScores,
      grade: reportData.overallGrade,
      strengths: reportData.strengths,
      weaknesses: reportData.weaknesses,
      suggestions: reportData.suggestions,
      recommendedTopics: options.includeRecommendations
        ? reportData.recommendedTopics
        : undefined,
      evaluations: reportData.evaluations,
      trend: options.includeHistory ? reportData.historicalTrend : undefined,
      topicPerformance: options.includeHistory
        ? reportData.performanceByTopic
        : undefined,
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Download file
    const blob = new Blob([jsonString], { type: 'application/json' });
    const filename = `interview-report-${reportData.interview.id}-${Date.now()}.json`;
    downloadBlob(blob, filename);
  } catch (error) {
    console.error('Failed to export JSON:', error);
    throw new Error('JSON export failed');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Download blob as file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Main export function
 */
export async function exportReport(
  reportData: ReportData,
  format: ExportFormat,
  options: ExportOptions
): Promise<void> {
  switch (format) {
    case 'pdf':
      return exportToPDF(reportData, options);
    case 'csv':
      return exportToCSV(reportData, options);
    case 'json':
      return exportToJSON(reportData, options);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Check if export format is supported
 */
export function isExportFormatSupported(format: ExportFormat): boolean {
  return ['pdf', 'csv', 'json'].includes(format);
}

/**
 * Get export format display name
 */
export function getExportFormatName(format: ExportFormat): string {
  const names: Record<ExportFormat, string> = {
    pdf: 'PDF Document',
    csv: 'CSV Spreadsheet',
    json: 'JSON Data',
  };
  return names[format];
}

/**
 * Get export format file extension
 */
export function getExportFormatExtension(format: ExportFormat): string {
  return format;
}

/**
 * Estimate export file size (in KB)
 */
export function estimateExportSize(reportData: ReportData, format: ExportFormat): number {
  const dataSize = JSON.stringify(reportData).length;

  switch (format) {
    case 'json':
      return Math.ceil(dataSize / 1024);
    case 'csv':
      return Math.ceil(dataSize / 1024 / 2); // CSV is roughly half the size
    case 'pdf':
      return Math.ceil(dataSize / 1024 / 3); // PDF compression
    default:
      return 0;
  }
}

export default exportReport;
