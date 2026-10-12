import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

/**
 * Real, routable Terms of Service page (`/terms`, fully public — no auth
 * required) — the actual destination `TERMS_URL` now points to by default
 * (see environment.ts). The content below is a clear, maintainable
 * placeholder structure explicitly marked as pending final legal review —
 * never a fabricated legal guarantee or compliance claim. Version number is
 * read live from GET /privacy/policy-config (TERMS_VERSION), never
 * hardcoded, so a future version bump here stays in sync automatically.
 */
const TermsOfServicePage: React.FC = () => {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/privacy/policy-config`)
      .then((response) => setVersion(response.data?.data?.termsVersion ?? null))
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
            <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
            {version && <p className="text-xs text-gray-500 mt-1">Version {version}</p>}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            <strong>Draft placeholder.</strong> This page is a clear, maintainable content structure pending final
            review by qualified legal counsel. It does not constitute legal advice and must not be treated as a
            finished, legally-binding document until reviewed and approved.
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">1. Acceptance of Terms</h2>
            <p className="text-sm text-gray-700">
              By creating an account or using EnterSkill, you agree to be bound by these Terms of Service and our
              Privacy Policy. If you do not agree, you may not use the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">2. Description of Service</h2>
            <p className="text-sm text-gray-700">
              EnterSkill provides AI-assisted interview practice, employer hiring-assessment tooling, and related
              institute/employer administration features. Features available to you depend on your account type
              (individual, institute member, or employer organization member).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">3. Accounts &amp; Responsibilities</h2>
            <p className="text-sm text-gray-700">
              You are responsible for maintaining the confidentiality of your account credentials and for all
              activity under your account. You must provide accurate information and promptly update it if it
              changes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">4. Acceptable Use</h2>
            <p className="text-sm text-gray-700">
              You agree not to misuse the service — including attempting to circumvent access controls, submitting
              unlawful or infringing content, or interfering with other users' or organizations' data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">5. AI-Generated Content</h2>
            <p className="text-sm text-gray-700">
              Interview questions, feedback, scores, and evaluations are generated with the assistance of AI models
              and are provided for practice and assessment purposes. They are not a guarantee of employment outcomes
              and may contain errors.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">6. Subscriptions &amp; Payments</h2>
            <p className="text-sm text-gray-700">
              Paid plans, credit packs, and organization billing (including enterprise contracts and manual
              payments) are described at the time of purchase. Fees are non-refundable except where required by law
              or explicitly stated otherwise.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">7. Termination</h2>
            <p className="text-sm text-gray-700">
              We may suspend or terminate access for violation of these terms. You may request deletion of your
              account at any time from Settings; see our Privacy Policy for what happens to your data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">8. Disclaimers &amp; Limitation of Liability</h2>
            <p className="text-sm text-gray-700">
              The service is provided "as is" without warranties of any kind. To the maximum extent permitted by
              law, EnterSkill is not liable for indirect, incidental, or consequential damages arising from your use
              of the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">9. Changes to These Terms</h2>
            <p className="text-sm text-gray-700">
              We may update these terms from time to time. Material changes will be reflected by a new version
              number, and your continued use after a change constitutes acceptance of the updated terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">10. Contact</h2>
            <p className="text-sm text-gray-700">
              Questions about these terms can be directed to your account administrator or EnterSkill support.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
