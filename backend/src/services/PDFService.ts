import puppeteer from 'puppeteer';

/** Same adaptive-precision rule used by the report frontend — a real nonzero cost must never print as "$0.00". */
function formatCostUsd(value: number): string {
  if (!value) return '$0.00';
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
}

// USD is the actual billed currency — this is only a reference conversion
// for display, not a second "actual" figure. Approximate rate, update
// periodically; kept in sync with the same rate used in ReportDashboard.tsx.
const USD_TO_INR_RATE = 83;

function formatCostInr(usdValue: number): string {
  const inr = (usdValue || 0) * USD_TO_INR_RATE;
  if (inr === 0) return '₹0.00';
  if (inr >= 1) return `₹${inr.toFixed(2)}`;
  if (inr >= 0.01) return `₹${inr.toFixed(4)}`;
  return `₹${inr.toFixed(6)}`;
}

/** Same validity rule used by the report API/frontend — the PDF must never print the literal text "undefined"/"null" or an empty value. */
function isValidModelAnswer(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null' &&
    value !== 'Model answer generation unavailable.'
  );
}

export class PDFService {
  /**
   * Generate PDF from interview report
   */
  async generateReportPDF(report: any): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      
      // Set content with HTML template
      const html = this.generateHTML(report);
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate PDF export of an employer hiring assessment report (22D).
   * Reuses the SAME puppeteer pipeline as `generateReportPDF` — never a
   * parallel PDF engine. `data` is the exact immutable 22C report content
   * (executiveSummary/scores/competencySummary/etc.) plus its own
   * `createdAt` — never candidate contact info, raw resume/JD, screening
   * internals, invitation tokens, or recruiter review notes.
   */
  async generateHiringReportPDF(data: {
    overallScore: number;
    averageRubricScore: number;
    competencyCoveragePercent: number;
    executiveSummary: string;
    competencySummary: Array<{ competencyName: string; importance: string; score: number; evidenceStatus: string; summary: string }>;
    demonstratedStrengths: string[];
    evidenceGaps: string[];
    followUpPriorities: string[];
    interviewerNotes: string[];
    createdAt: Date;
  }): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const html = this.generateHiringReportHTML(data);
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private generateHiringReportHTML(data: {
    overallScore: number;
    averageRubricScore: number;
    competencyCoveragePercent: number;
    executiveSummary: string;
    competencySummary: Array<{ competencyName: string; importance: string; score: number; evidenceStatus: string; summary: string }>;
    demonstratedStrengths: string[];
    evidenceGaps: string[];
    followUpPriorities: string[];
    interviewerNotes: string[];
    createdAt: Date;
  }): string {
    const esc = (v: string) => this.escapeHtml(v);
    const list = (items: string[]) => (items.length > 0 ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background: #fff; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #4F46E5; padding-bottom: 20px; }
          .header h1 { color: #4F46E5; font-size: 26px; margin-bottom: 8px; }
          .header p { color: #666; font-size: 13px; }
          .scores { display: flex; justify-content: center; gap: 24px; margin: 20px 0; }
          .score-box { text-align: center; }
          .score-box .value { font-size: 22px; font-weight: bold; color: #4F46E5; }
          .score-box .label { font-size: 11px; color: #666; }
          .section { margin: 24px 0; }
          .section-title { font-size: 16px; color: #4F46E5; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .competency { margin-bottom: 14px; padding: 10px; background: #f8f9fb; border-radius: 6px; }
          .competency .name { font-weight: bold; }
          .competency .meta { font-size: 12px; color: #666; margin: 2px 0; }
          ul { margin-left: 20px; font-size: 13px; }
          .muted { color: #999; font-size: 13px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Employer Hiring Assessment Report</h1>
          <p>Generated ${new Date(data.createdAt).toLocaleString()}</p>
        </div>

        <div class="scores">
          <div class="score-box"><div class="value">${data.overallScore}/100</div><div class="label">Overall Score</div></div>
          <div class="score-box"><div class="value">${data.averageRubricScore}/5</div><div class="label">Avg Rubric Score</div></div>
          <div class="score-box"><div class="value">${data.competencyCoveragePercent}%</div><div class="label">Competency Coverage</div></div>
        </div>

        <div class="section">
          <h2 class="section-title">Executive Summary</h2>
          <p>${esc(data.executiveSummary) || '<span class="muted">No summary available.</span>'}</p>
        </div>

        <div class="section">
          <h2 class="section-title">Competency Summary</h2>
          ${data.competencySummary
            .map(
              (c) => `
            <div class="competency">
              <div class="name">${esc(c.competencyName)} (${esc(c.importance)})</div>
              <div class="meta">Score: ${c.score}/5 &middot; Evidence status: ${esc(c.evidenceStatus)}</div>
              ${c.summary ? `<div>${esc(c.summary)}</div>` : ''}
            </div>
          `
            )
            .join('')}
        </div>

        <div class="section">
          <h2 class="section-title">Demonstrated Strengths</h2>
          ${list(data.demonstratedStrengths)}
        </div>

        <div class="section">
          <h2 class="section-title">Evidence Gaps</h2>
          ${list(data.evidenceGaps)}
        </div>

        <div class="section">
          <h2 class="section-title">Follow-up Priorities</h2>
          ${list(data.followUpPriorities)}
        </div>

        <div class="section">
          <h2 class="section-title">Interviewer Notes</h2>
          ${list(data.interviewerNotes)}
        </div>

        <div class="footer">
          <p>Employer Hiring Assessment Report — internal use only.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate HTML template for PDF
   */
  private generateHTML(report: any): string {
    const { interview, questions, finalReport, statistics, aiCost } = report;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #4F46E5;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #4F46E5;
            font-size: 32px;
            margin-bottom: 10px;
          }
          .header p {
            color: #666;
            font-size: 14px;
          }
          .section {
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 20px;
            color: #4F46E5;
            margin-bottom: 15px;
            border-bottom: 2px solid #E5E7EB;
            padding-bottom: 8px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 20px;
          }
          .info-item {
            background: #F9FAFB;
            padding: 12px;
            border-radius: 8px;
          }
          .info-label {
            font-size: 12px;
            color: #6B7280;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .info-value {
            font-size: 16px;
            font-weight: 600;
            color: #111827;
          }
          .score-card {
            background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
            color: white;
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 30px;
          }
          .score-card h2 {
            font-size: 48px;
            margin-bottom: 8px;
          }
          .score-card p {
            font-size: 18px;
            opacity: 0.9;
          }
          .scores-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 20px;
          }
          .score-box {
            background: #F3F4F6;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
          }
          .score-box-title {
            font-size: 12px;
            color: #6B7280;
            margin-bottom: 8px;
            text-transform: uppercase;
          }
          .score-box-value {
            font-size: 24px;
            font-weight: bold;
            color: #4F46E5;
          }
          .question-block {
            background: #F9FAFB;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .question-header {
            display: flex;
            justify-between;
            align-items: center;
            margin-bottom: 15px;
          }
          .question-number {
            background: #4F46E5;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
          }
          .question-score {
            font-size: 20px;
            font-weight: bold;
            color: #4F46E5;
          }
          .question-text {
            font-size: 16px;
            font-weight: 600;
            color: #111827;
            margin-bottom: 12px;
          }
          .answer-text {
            background: white;
            padding: 15px;
            border-radius: 6px;
            font-size: 14px;
            color: #374151;
            margin-bottom: 15px;
            border-left: 3px solid #4F46E5;
          }
          .expected-answer-section {
            background: #EFF6FF;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            border-left: 4px solid #3B82F6;
          }
          .expected-answer-title {
            font-size: 14px;
            font-weight: 600;
            color: #1E40AF;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
          }
          .expected-answer-title:before {
            content: '📚';
            margin-right: 8px;
            font-size: 16px;
          }
          .expected-answer-label {
            font-size: 12px;
            font-style: italic;
            color: #3B82F6;
            margin-bottom: 8px;
          }
          .expected-answer-text {
            font-size: 14px;
            color: #1E3A8A;
            line-height: 1.6;
            white-space: pre-wrap;
          }
          .feedback-section {
            margin-top: 15px;
          }
          .feedback-title {
            font-size: 13px;
            font-weight: 600;
            color: #6B7280;
            margin-bottom: 8px;
            text-transform: uppercase;
          }
          .feedback-list {
            list-style: none;
            padding-left: 0;
          }
          .feedback-list li {
            padding: 6px 0 6px 20px;
            position: relative;
            font-size: 14px;
            color: #4B5563;
          }
          .feedback-list li:before {
            content: '•';
            position: absolute;
            left: 0;
            color: #4F46E5;
            font-weight: bold;
            font-size: 16px;
          }
          .strengths li:before { color: #10B981; }
          .weaknesses li:before { color: #EF4444; }
          .suggestions li:before { color: #3B82F6; }
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #E5E7EB;
            color: #6B7280;
            font-size: 12px;
          }
          @media print {
            body { padding: 0; }
            .section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <h1>Interview Report</h1>
          <p>Generated on ${new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</p>
        </div>

        <!-- Interview Info -->
        <div class="section">
          <h2 class="section-title">Interview Information</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Topic</div>
              <div class="info-value">${interview.topic}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Difficulty</div>
              <div class="info-value">${interview.difficulty}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Date</div>
              <div class="info-value">${new Date(interview.createdAt).toLocaleDateString()}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Questions</div>
              <div class="info-value">${interview.totalQuestions}</div>
            </div>
          </div>
        </div>

        <!-- Overall Score -->
        ${finalReport ? `
          <div class="score-card">
            <h2>${finalReport.overallScore?.toFixed(1) || '0.0'}</h2>
            <p>Overall Score (out of 10.0)</p>
          </div>

          <!-- AI Usage & Cost -->
          <div class="section">
            <h2 class="section-title">AI Usage & Cost</h2>
            ${aiCost ? `
              <p style="font-size:11px;color:#6b7280;margin-bottom:8px;">INR is an approximate reference conversion (1 USD &asymp; &#8377;${USD_TO_INR_RATE}), not a second actual figure — USD is the real billed currency.</p>
              <div class="scores-grid">
                <div class="score-box">
                  <div class="score-box-title">AI Cost</div>
                  <div class="score-box-value">${formatCostUsd(aiCost.totalCostUsd)}</div>
                  <div style="font-size:11px;color:#9ca3af;">&asymp; ${formatCostInr(aiCost.totalCostUsd)}</div>
                </div>
                <div class="score-box">
                  <div class="score-box-title">Total Tokens</div>
                  <div class="score-box-value">${aiCost.totalTokens.toLocaleString()}</div>
                </div>
                <div class="score-box">
                  <div class="score-box-title">AI Calls</div>
                  <div class="score-box-value">${aiCost.callCount}</div>
                </div>
              </div>
              ${!aiCost.pricingComplete ? '<p style="font-size:12px;color:#b45309;margin-top:8px;">Partial cost — pricing unavailable for one or more model calls.</p>' : ''}
            ` : '<p style="font-size:13px;color:#6b7280;">AI usage was not tracked for this interview.</p>'}
          </div>

          <!-- Category Scores -->
          <div class="section">
            <h2 class="section-title">Performance Breakdown</h2>
            <div class="scores-grid">
              <div class="score-box">
                <div class="score-box-title">Technical</div>
                <div class="score-box-value">${finalReport.averageTechnicalScore?.toFixed(1) || '0.0'}</div>
              </div>
              <div class="score-box">
                <div class="score-box-title">Communication</div>
                <div class="score-box-value">${finalReport.averageCommunicationScore?.toFixed(1) || '0.0'}</div>
              </div>
              <div class="score-box">
                <div class="score-box-title">Leadership</div>
                <div class="score-box-value">${finalReport.averageLeadershipScore?.toFixed(1) || '0.0'}</div>
              </div>
              <div class="score-box">
                <div class="score-box-title">Problem Solving</div>
                <div class="score-box-value">${finalReport.averageProblemSolvingScore?.toFixed(1) || '0.0'}</div>
              </div>
              <div class="score-box">
                <div class="score-box-title">Confidence</div>
                <div class="score-box-value">${finalReport.averageConfidenceScore?.toFixed(1) || '0.0'}</div>
              </div>
              <div class="score-box">
                <div class="score-box-title">Average</div>
                <div class="score-box-value">${statistics.averageScore?.toFixed(1) || '0.0'}</div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Questions and Answers -->
        <div class="section">
          <h2 class="section-title">Questions & Answers</h2>
          ${questions.map((q: any, index: number) => `
            <div class="question-block">
              <div class="question-header">
                <span class="question-number">Question ${index + 1}</span>
                ${q.evaluation ? `<span class="question-score">${q.evaluation.overallScore.toFixed(1)}/10</span>` : ''}
              </div>
              <div class="question-text">${q.questionText}</div>
              ${q.answerText ? `
                <div class="answer-text">${q.answerText}</div>
              ` : '<div class="answer-text" style="color: #9CA3AF;">No answer provided</div>'}
              
              ${isValidModelAnswer(q.modelAnswer) ? `
                <div class="expected-answer-section">
                  <div class="expected-answer-title">Expected Interview Answer</div>
                  <div class="expected-answer-label">Company-standard answer a strong candidate should provide:</div>
                  <div class="expected-answer-text">${q.modelAnswer}</div>
                </div>
              ` : ''}
              
              ${q.evaluation ? `
                <div class="feedback-section">
                  ${q.evaluation.strengths && q.evaluation.strengths.length > 0 ? `
                    <div class="feedback-title" style="color: #10B981;">✓ Strengths</div>
                    <ul class="feedback-list strengths">
                      ${q.evaluation.strengths.map((s: string) => `<li>${s}</li>`).join('')}
                    </ul>
                  ` : ''}
                  
                  ${q.evaluation.weaknesses && q.evaluation.weaknesses.length > 0 ? `
                    <div class="feedback-title" style="color: #EF4444;">✗ Areas for Improvement</div>
                    <ul class="feedback-list weaknesses">
                      ${q.evaluation.weaknesses.map((w: string) => `<li>${w}</li>`).join('')}
                    </ul>
                  ` : ''}
                  
                  ${q.evaluation.suggestions && q.evaluation.suggestions.length > 0 ? `
                    <div class="feedback-title" style="color: #3B82F6;">💡 Suggestions</div>
                    <ul class="feedback-list suggestions">
                      ${q.evaluation.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
                    </ul>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <!-- Final Summary -->
        ${finalReport?.summary ? `
          <div class="section">
            <h2 class="section-title">Summary</h2>
            <p style="line-height: 1.8; color: #374151;">${finalReport.summary}</p>
          </div>
        ` : ''}

        <!-- Recommendations -->
        ${finalReport?.recommendations && finalReport.recommendations.length > 0 ? `
          <div class="section">
            <h2 class="section-title">Recommendations</h2>
            <ul class="feedback-list">
              ${finalReport.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Footer -->
        <div class="footer">
          <p>AI Interview Coach - Powered by OpenAI</p>
          <p>This report was automatically generated. For questions or feedback, please contact support.</p>
        </div>
      </body>
      </html>
    `;
  }
}
