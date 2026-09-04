import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi, { OrganizationType, INSTITUTE_KINDS, COMPANY_SIZES } from '../api/organizationApi';
import { Building2, GraduationCap, AlertCircle } from 'lucide-react';

const CreateOrganizationPage: React.FC = () => {
  const navigate = useNavigate();
  const { setActiveOrganization, refreshOrganizations } = useOrganization();

  const [name, setName] = useState('');
  const [type, setType] = useState<OrganizationType>('company');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [instituteKind, setInstituteKind] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Organization name is required';
    else if (name.trim().length > 120) errors.name = 'Name must be 120 characters or fewer';
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) errors.contactEmail = 'Enter a valid email address';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await organizationApi.createOrganization({
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        instituteProfile:
          type === 'institute' && (instituteKind || affiliation)
            ? { instituteKind: instituteKind || undefined, affiliation: affiliation.trim() || undefined }
            : undefined,
        companyProfile:
          type === 'company' && (industry || companySize)
            ? { industry: industry.trim() || undefined, companySize: companySize || undefined }
            : undefined,
      });

      const organization = response.data.organization;
      await refreshOrganizations();
      await setActiveOrganization(organization.id);
      navigate(`/organizations/${organization.id}/dashboard`);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-2xl">
        <div className="page-header">
          <h1 className="page-title">Create Organization</h1>
          <p className="page-subtitle">Set up an institute or company workspace for your team.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
              <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
              <p className="text-sm text-mentor-error">{error}</p>
            </div>
          )}

          {/* Type selector */}
          <div>
            <label className="label">Organization Type</label>
            <div className="grid grid-cols-2 gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => setType('company')}
                className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors ${
                  type === 'company'
                    ? 'border-primary-600 bg-mentor-soft dark:border-future-violet dark:bg-future-elevated'
                    : 'border-mentor-border dark:border-future-border hover:bg-mentor-surface dark:hover:bg-future-elevated'
                }`}
              >
                <Building2 size={18} className="text-primary-600 dark:text-future-violet shrink-0" />
                <span className="text-sm font-medium text-mentor-text">Company</span>
              </button>
              <button
                type="button"
                onClick={() => setType('institute')}
                className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors ${
                  type === 'institute'
                    ? 'border-primary-600 bg-mentor-soft dark:border-future-violet dark:bg-future-elevated'
                    : 'border-mentor-border dark:border-future-border hover:bg-mentor-surface dark:hover:bg-future-elevated'
                }`}
              >
                <GraduationCap size={18} className="text-primary-600 dark:text-future-violet shrink-0" />
                <span className="text-sm font-medium text-mentor-text">Institute</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="name" className="label">
              Organization Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`input ${fieldErrors.name ? 'input-error' : ''}`}
              placeholder="e.g. Acme Corp or ABC Institute of Technology"
              maxLength={120}
            />
            {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="description" className="label">
              Description <span className="text-mentor-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={3}
              maxLength={1000}
              placeholder="A short description of your organization"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="website" className="label">
                Website <span className="text-mentor-text-muted font-normal">(optional)</span>
              </label>
              <input
                id="website"
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="input"
                maxLength={300}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className="label">
                Contact Email <span className="text-mentor-text-muted font-normal">(optional)</span>
              </label>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={`input ${fieldErrors.contactEmail ? 'input-error' : ''}`}
                maxLength={254}
                placeholder="contact@example.com"
              />
              {fieldErrors.contactEmail && <p className="field-error">{fieldErrors.contactEmail}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="contactPhone" className="label">
              Contact Phone <span className="text-mentor-text-muted font-normal">(optional)</span>
            </label>
            <input
              id="contactPhone"
              type="text"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="input"
              maxLength={30}
              placeholder="+91 98765 43210"
            />
          </div>

          {type === 'institute' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-mentor-border">
              <div>
                <label htmlFor="instituteKind" className="label">
                  Institute Type <span className="text-mentor-text-muted font-normal">(optional)</span>
                </label>
                <select
                  id="instituteKind"
                  value={instituteKind}
                  onChange={(e) => setInstituteKind(e.target.value)}
                  className="input"
                >
                  <option value="">Select type</option>
                  {INSTITUTE_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="affiliation" className="label">
                  Affiliation <span className="text-mentor-text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="affiliation"
                  type="text"
                  value={affiliation}
                  onChange={(e) => setAffiliation(e.target.value)}
                  className="input"
                  maxLength={200}
                  placeholder="e.g. Affiliated university/board"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-mentor-border">
              <div>
                <label htmlFor="industry" className="label">
                  Industry <span className="text-mentor-text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="industry"
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="input"
                  maxLength={120}
                  placeholder="e.g. Software, Finance, Healthcare"
                />
              </div>
              <div>
                <label htmlFor="companySize" className="label">
                  Company Size <span className="text-mentor-text-muted font-normal">(optional)</span>
                </label>
                <select
                  id="companySize"
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="input"
                >
                  <option value="">Select size</option>
                  {COMPANY_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Creating...' : 'Create Organization'}
            </button>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary" disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </main>
    </AuthenticatedLayout>
  );
};

export default CreateOrganizationPage;
