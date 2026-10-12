import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

/**
 * Real, routable Privacy Policy page (`/privacy`, fully public — no auth
 * required) — the actual destination `PRIVACY_POLICY_URL` now points to by
 * default (see environment.ts). Content is a clear, maintainable
 * placeholder structure marked as pending final legal review, but
 * deliberately describes the product's REAL existing privacy behavior
 * (data export, account deletion/anonymization, AI processing, hiring-
 * assessment consent, proctoring disclosure) rather than generic
 * boilerplate — never a fabricated compliance claim. Version number is read
 * live from GET /privacy/policy-config (PRIVACY_POLICY_VERSION).
 */
const PrivacyPolicyPage: React.FC = () => {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/privacy/policy-config`)
      .then((response) => setVersion(response.data?.data?.privacyPolicyVersion ?? null))
      .catch(() => {
        // Non-fatal — the page still renders correctly without the version badge.
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-700">
          ← Back to EnterSkill
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8 mt-4 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
            {version && <p className="text-xs text-gray-500 mt-1">Version {version}</p>}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            <strong>Draft placeholder.</strong> This page is a clear, maintainable content structure pending final
            review by qualified legal counsel. It does not constitute legal advice and must not be treated as a
            finished, legally-binding document until reviewed and approved.
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">1. Information We Collect</h2>
            <p className="text-sm text-gray-700">
              Account information (name, email, password hash), interview responses and evaluations, and — for
              institute/employer organization members — the profile and activity data relevant to that organization
              (e.g. student enrollment details, candidate application/interview data).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">2. AI Processing</h2>
            <p className="text-sm text-gray-700">
              Your interview responses are processed by AI models to generate questions, feedback, scores, and
              evaluations. This processing is core to the product and cannot be disabled while using interview
              features.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">3. Hiring Assessments (Candidates)</h2>
            <p className="text-sm text-gray-700">
              If you are invited to a hiring assessment by an employer, your responses and the resulting AI-assisted
              evaluation are shared with that employer to assess your candidacy. You are shown this disclosure and
              asked to acknowledge it before the assessment begins. If the employer has enabled proctoring, certain
              browser events (such as tab changes or fullscreen exits) may be recorded — never your camera,
              microphone, clipboard content, or screen.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">4. How We Use Information</h2>
            <p className="text-sm text-gray-700">
              To provide and improve the service, generate interview questions/feedback, process payments and
              enterprise billing, communicate with you (e.g. verification and transactional emails), and maintain
              security/audit records.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">5. Data Sharing</h2>
            <p className="text-sm text-gray-700">
              We do not sell your personal data. Data is shared only: within your own organization context (e.g.
              your institute or the employer who invited you), with service providers who process data on our
              behalf (e.g. email delivery, AI processing, payment processing), or where required by law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">6. Your Rights: Export &amp; Deletion</h2>
            <p className="text-sm text-gray-700">
              You can request a downloadable export of your account, interview, and billing data, and you can
              request account deletion at any time from Settings. Deletion revokes access immediately and
              anonymizes your personal data (name/email/interview content); financial/audit records required for
              legal or accounting purposes are retained separately.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">7. Data Retention</h2>
            <p className="text-sm text-gray-700">
              We retain account and interview data for as long as your account is active, or as needed to provide
              the service, comply with legal obligations, and resolve disputes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">8. Cookies &amp; Local Storage</h2>
            <p className="text-sm text-gray-700">
              We use local storage/session tokens to keep you signed in and to remember lightweight preferences.
              We do not use third-party advertising trackers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">9. Children's Privacy</h2>
            <p className="text-sm text-gray-700">
              EnterSkill is not directed at children under 16, and we do not knowingly collect personal data from
              them.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">10. Changes to This Policy</h2>
            <p className="text-sm text-gray-700">
              We may update this policy from time to time. Material changes will be reflected by a new version
              number; your prior acceptance record is never overwritten, and a new version may require re-acceptance.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">11. Contact</h2>
            <p className="text-sm text-gray-700">
              Questions about this policy, or requests regarding your personal data, can be directed to your
              account administrator or EnterSkill support.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
