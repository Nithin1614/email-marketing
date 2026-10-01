'use client';

import React, { useState, useEffect } from 'react';
import Button from './Button';
import { Calendar, Clock, X, AlertCircle, CheckCircle2, Loader2, Undo2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: number | null;
  campaignName: string;
  currentScheduledAt?: string | null;
  onScheduledSuccess?: (updatedCampaign: any) => void;
}

export default function ScheduleModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  currentScheduledAt,
  onScheduledSuccess,
}: ScheduleModalProps) {
  const [datetimeInput, setDatetimeInput] = useState('');
  const [minDateTime, setMinDateTime] = useState('');
  const [timezoneName, setTimezoneName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper to format Date into YYYY-MM-DDTHH:mm in local time
  const formatToLocalISO = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setIsSubmitting(false);
      setIsCancelling(false);

      const now = new Date();
      setMinDateTime(formatToLocalISO(now));

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const offset = -now.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offset) / 60);
        const offsetMins = Math.abs(offset) % 60;
        const sign = offset >= 0 ? '+' : '-';
        const formattedOffset = `GMT${sign}${offsetHours}${offsetMins ? `:${offsetMins.toString().padStart(2, '0')}` : ''}`;
        setTimezoneName(`${tz} (${formattedOffset})`);
      } catch (e) {
        setTimezoneName('Local Time');
      }

      if (currentScheduledAt) {
        const scheduledDate = new Date(currentScheduledAt);
        if (!isNaN(scheduledDate.getTime())) {
          setDatetimeInput(formatToLocalISO(scheduledDate));
          return;
        }
      }

      // Default to 1 hour from now rounded to next 5 minutes
      const defaultDate = new Date(now.getTime() + 60 * 60 * 1000);
      defaultDate.setMinutes(Math.ceil(defaultDate.getMinutes() / 5) * 5, 0, 0);
      setDatetimeInput(formatToLocalISO(defaultDate));
    }
  }, [isOpen, currentScheduledAt]);

  if (!isOpen || !campaignId) return null;

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!datetimeInput) {
      setMessage({ type: 'error', text: 'Please select a date and time.' });
      return;
    }

    const selectedDate = new Date(datetimeInput);
    if (isNaN(selectedDate.getTime())) {
      setMessage({ type: 'error', text: 'Invalid date format.' });
      return;
    }

    if (selectedDate.getTime() <= Date.now()) {
      setMessage({ type: 'error', text: 'Scheduled time must be in the future.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post(`/api/v1/campaigns/${campaignId}/schedule/`, {
        scheduled_at: selectedDate.toISOString(),
      });

      setMessage({
        type: 'success',
        text: res.message || 'Campaign scheduled successfully!',
      });

      if (onScheduledSuccess && res.campaign) {
        onScheduledSuccess(res.campaign);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to schedule campaign.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSchedule = async () => {
    setMessage(null);
    setIsCancelling(true);
    try {
      const res = await apiClient.post(`/api/v1/campaigns/${campaignId}/cancel-schedule/`, {});

      setMessage({
        type: 'success',
        text: res.message || 'Schedule cancelled. Reverted to draft.',
      });

      if (onScheduledSuccess && res.campaign) {
        onScheduledSuccess(res.campaign);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to cancel schedule.',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const isRescheduling = Boolean(currentScheduledAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl max-w-md w-full p-6 relative space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
          disabled={isSubmitting || isCancelling}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Calendar size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">{isRescheduling ? 'Reschedule Campaign' : 'Schedule Campaign'}</h2>
            <p className="text-xs text-foreground/50 mt-0.5 line-clamp-1">
              Set automated send time for <span className="font-semibold text-foreground/70">"{campaignName}"</span>
            </p>
          </div>
        </div>

        {/* Notification Banner */}
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
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/70 block">
              Send Date & Time
            </label>
            <input
              type="datetime-local"
              required
              min={minDateTime}
              value={datetimeInput}
              onChange={(e) => setDatetimeInput(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer text-foreground scheme-dark"
              disabled={isSubmitting || isCancelling}
            />
            {timezoneName && (
              <div className="text-[11px] text-foreground/40 flex items-center gap-1.5 pt-0.5">
                <Clock size={12} />
                <span>Local Timezone: <strong className="text-foreground/60">{timezoneName}</strong></span>
              </div>
            )}
          </div>

          <div className="p-3 bg-foreground/5 rounded-lg border border-border/50 text-[11px] text-foreground/60 leading-relaxed">
            Emails will be sent automatically at the selected date and time.
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            {isRescheduling ? (
              <button
                type="button"
                onClick={handleCancelSchedule}
                disabled={isSubmitting || isCancelling}
                className="text-xs text-red-500 hover:text-red-400 font-medium inline-flex items-center gap-1 hover:underline transition-colors disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <Undo2 size={12} />
                    Cancel Schedule
                  </>
                )}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting || isCancelling}
                className="text-xs py-1.5 px-3"
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isCancelling}
                className="text-xs py-1.5 px-4 font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin mr-1.5" />
                    {isRescheduling ? 'Updating...' : 'Scheduling...'}
                  </>
                ) : (
                  isRescheduling ? 'Update Schedule' : 'Schedule Campaign'
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
