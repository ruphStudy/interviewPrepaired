import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import billingApi, { Receipt } from '../api/billingApi';
import { ArrowLeft, AlertCircle, Loader2, Printer } from 'lucide-react';

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

const formatPurchase = (receipt: Receipt) =>
  receipt.purchase.type === 'subscription' ? `Subscription plan: ${receipt.purchase.planCode}` : `Credit pack: ${receipt.purchase.creditPackCode}`;

/**
 * A printable "Payment Receipt" (never a GST/tax invoice — no tax
 * registration is configured). "Download" is intentionally the browser's
 * own print-to-PDF (window.print()) rather than a bundled PDF-generation
 * package — no new dependency for a simple, safe artifact.
 */
const ReceiptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipt = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await billingApi.getReceipt(id);
      setReceipt(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-2xl mx-auto">
        <div className="page-header print:hidden">
          <button
            onClick={() => navigate('/billing/history')}
            className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-3"
          >
            <ArrowLeft size={16} />
            Back to Billing History
          </button>
          <h1 className="page-title">Receipt</h1>
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading receipt...</p>
          </div>
        ) : error || !receipt ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load receipt</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'Receipt not found'}</p>
            <button onClick={fetchReceipt} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-6 pb-6 border-b border-mentor-border">
              <div>
                <h2 className="text-xl font-bold text-mentor-text">{receipt.merchant.name}</h2>
                <p className="text-sm text-mentor-text-muted mt-0.5">{receipt.documentLabel}</p>
              </div>
              <button onClick={() => window.print()} className="btn btn-secondary print:hidden inline-flex items-center gap-1.5">
                <Printer size={16} />
                Print / Save PDF
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <p className="text-xs text-mentor-text-muted mb-0.5">Receipt Number</p>
                <p className="font-medium text-mentor-text">{receipt.receiptNumber}</p>
              </div>
              <div>
                <p className="text-xs text-mentor-text-muted mb-0.5">Payment Date</p>
                <p className="font-medium text-mentor-text">{formatDate(receipt.paymentDate)}</p>
              </div>
              <div>
                <p className="text-xs text-mentor-text-muted mb-0.5">Billed To</p>
                <p className="font-medium text-mentor-text">{receipt.customer.name || '—'}</p>
                <p className="text-xs text-mentor-text-muted">{receipt.customer.email}</p>
              </div>
              <div>
                <p className="text-xs text-mentor-text-muted mb-0.5">Payment Reference</p>
                <p className="font-medium text-mentor-text">{receipt.paymentReference || '—'}</p>
              </div>
            </div>

            <div className="surface-muted p-4 mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-mentor-text-secondary">{formatPurchase(receipt)}</span>
                <span className="font-semibold text-mentor-text">
                  {receipt.currency} {(receipt.amountPaise / 100).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-mentor-border">
                <span className="text-mentor-text-secondary">Payment Status</span>
                <span className="font-semibold text-mentor-text capitalize">{receipt.paymentStatus.replace(/_/g, ' ')}</span>
              </div>
            </div>

            {!receipt.gstConfigured && (
              <p className="text-xs text-mentor-text-muted">
                This is a payment receipt, not a GST tax invoice. No tax registration is configured for this purchase.
              </p>
            )}
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default ReceiptPage;
