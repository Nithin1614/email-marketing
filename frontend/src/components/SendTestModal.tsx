'use client';

import React, { useState, useEffect } from 'react';
import Button from './Button';
import { Mail, Plus, Trash2, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface SendTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: number | null;
  campaignName: string;
}

export default function SendTestModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
}: SendTestModalProps) {
  const [emails, setEmails] = useState<string[]>(['webdesign.team24@gmail.com']);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmails(['webdesign.team24@gmail.com']);
      setMessage(null);
      setIsSending(false);
    }
  }, [isOpen]);

  if (!isOpen || !campaignId) return null;

  const handleEmailChange = (index: number, value: string) => {
    const updated = [...emails];
    updated[index] = value;
    setEmails(updated);
  };

  const handleAddEmail = () => {
    if (emails.length < 3) {
      setEmails([...emails, '']);
    }
  };

  const handleRemoveEmail = (index: number) => {
    if (emails.length > 1) {
      setEmails(emails.filter((_, i) => i !== index));
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const validEmails = emails.map(e => e.trim()).filter(e => e.includes('@'));
    if (validEmails.length === 0) {
      setMessage({ type: 'error', text: 'Please enter at least one valid email address.' });
      return;
    }

    setIsSending(true);
    try {
      const res = await apiClient.post(`/api/v1/campaigns/${campaignId}/send-test/`, {
        emails: validEmails,
      });

      setMessage({
        type: 'success',
        text: res.message || `Test email sent successfully to ${validEmails.length} recipient(s)! Check your inbox.`,
      });
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to send test email. Check SMTP settings.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-surface text-foreground border border-card-border rounded-xl shadow-2xl max-w-md w-full p-6 relative space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
          disabled={isSending}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Mail size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Send Test Email</h2>
            <p className="text-xs text-foreground/50 mt-0.5 line-clamp-1">
              Preview <span className="font-semibold text-foreground/70">"{campaignName}"</span> before blasting
            </p>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`p-3 rounded-md text-xs font-medium flex items-center gap-2 border ${
              message.type === 'success'
                ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/30'
                : 'bg-red-950/20 text-red-400 border-red-800/30'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSendTest} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/70 block">
              Test Recipients (up to 3 emails)
            </label>
            {emails.map((email, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="email"
                  required
                  placeholder="your-email@example.com"
                  value={email}
                  onChange={(e) => handleEmailChange(idx, e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                  disabled={isSending}
                />
                {emails.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(idx)}
                    className="p-2 text-foreground/30 hover:text-red-500 transition-colors"
                    title="Remove recipient"
                    disabled={isSending}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            {emails.length < 3 && (
              <button
                type="button"
                onClick={handleAddEmail}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium pt-1"
                disabled={isSending}
              >
                <Plus size={13} />
                <span>Add another email</span>
              </button>
            )}
          </div>

          <div className="p-3 bg-foreground/5 rounded-lg border border-border/50 text-[11px] text-foreground/60 leading-relaxed">
            💡 <strong>Safe Sandbox:</strong> Test emails prepend <code className="bg-foreground/10 px-1 py-0.5 rounded font-mono">[TEST]</code> to the subject line and will <strong>not</strong> affect your campaign statistics or subscriber lists.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSending}
              className="text-xs py-1.5 px-3"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSending}
              className="text-xs py-1.5 px-4 font-semibold"
            >
              {isSending ? (
                <>
                  <Loader2 size={13} className="animate-spin mr-1.5" />
                  Sending Test...
                </>
              ) : (
                'Send Test Now'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
