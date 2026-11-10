'use strict';

import React, { useState, useEffect, useCallback } from 'react';

export interface AdvisoryData {
  id: number | string;
  title: string;
  message: string;
  description?: string;
  targetScope?: string;
  target_label?: string;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  expectedCompletion?: string | null;
  type?: string;
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface SubNavbarAdvisoryBannerProps {
  endpoint?: string;
  className?: string;
  onDismiss?: () => void;
  pollIntervalMs?: number;
}

/**
 * SubNavbarAdvisoryBanner Component (Sole Advisory Location)
 *
 * Positioned directly underneath the main navigation bar.
 * Dynamically queries active scheduled maintenance and system advisories.
 *
 * Requirements:
 * 1. Only renders if: is_active === true AND start_time <= current_time <= end_time.
 * 2. Remembers user dismissal via localStorage/sessionStorage so users aren't repeatedly prompted.
 * 3. Includes "View Advisory" action button that opens the comprehensive advisory modal.
 */
export default function AdvisoryBanner({
  endpoint = '/api/advisory/active',
  className = '',
  onDismiss,
  pollIntervalMs = 60000,
}: SubNavbarAdvisoryBannerProps) {
  const [advisory, setAdvisory] = useState<AdvisoryData | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchActiveAdvisory = useCallback(async () => {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        setAdvisory(null);
        return;
      }

      const data = await res.json();
      const raw = data?.advisory || (Array.isArray(data?.announcements) && data.announcements[0]) || null;

      if (!raw) {
        setAdvisory(null);
        return;
      }

      // Check active flag
      const activeFlag = raw.isActive ?? raw.is_active ?? true;
      if (!activeFlag) {
        setAdvisory(null);
        return;
      }

      // Check scheduling window: start_time <= now <= end_time
      const now = Date.now();
      const rawStart = raw.startTime || raw.start_time;
      const rawEnd = raw.endTime || raw.end_time || raw.expectedCompletion;

      const startMs = rawStart ? new Date(rawStart).getTime() : 0;
      const endMs = rawEnd ? new Date(rawEnd).getTime() : Infinity;

      if (now < startMs || now > endMs) {
        setAdvisory(null);
        return;
      }

      const item: AdvisoryData = {
        ...raw,
        targetScope: raw.targetScope || raw.target_label || 'Campus Facilities',
        startTime: rawStart,
        endTime: rawEnd,
        message: raw.message || raw.description || '',
      };

      setAdvisory(item);

      // Check dismissal state in localStorage/sessionStorage
      const dismissKey = `cspc_subnav_advisory_dismissed_${item.id}_${item.updatedAt || item.updated_at || item.startTime || ''}`;
      const dismissed =
        typeof window !== 'undefined' &&
        (localStorage.getItem(dismissKey) === 'true' || sessionStorage.getItem(dismissKey) === 'true');

      setIsDismissed(dismissed);
    } catch (err) {
      console.warn('[SubNavbarAdvisory] Could not fetch advisory:', err);
      setAdvisory(null);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchActiveAdvisory();

    if (pollIntervalMs && pollIntervalMs > 0) {
      const timer = setInterval(fetchActiveAdvisory, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchActiveAdvisory, pollIntervalMs]);

  const handleClose = () => {
    if (advisory) {
      const dismissKey = `cspc_subnav_advisory_dismissed_${advisory.id}_${advisory.updatedAt || advisory.updated_at || advisory.startTime || ''}`;
      try {
        localStorage.setItem(dismissKey, 'true');
        sessionStorage.setItem(dismissKey, 'true');
      } catch (_) {
        /* storage may fail in restricted/private browsing modes */
      }
    }
    setIsDismissed(true);
    if (onDismiss) onDismiss();
  };

  if (isLoading || isDismissed || !advisory) {
    return null;
  }

  // Format completion timestamp
  let formattedEndTime = 'TBD';
  if (advisory.endTime) {
    const d = new Date(advisory.endTime);
    if (!isNaN(d.getTime())) {
      formattedEndTime = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }

  let formattedStartTime = 'Immediate';
  if (advisory.startTime) {
    const ds = new Date(advisory.startTime);
    if (!isNaN(ds.getTime())) {
      formattedStartTime = ds.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }

  const isOngoing = advisory.type === 'emergency' || advisory.type === 'ongoing';

  return (
    <>
      {/* Sub-Navbar Banner Bar (Directly underneath main navigation) */}
      <aside
        role="region"
        aria-label="Facility maintenance advisory"
        className={`w-full z-30 border-b border-amber-500/30 bg-gradient-to-r from-amber-950/70 via-[#101828]/90 to-amber-950/70 backdrop-blur-md px-4 py-2 text-xs text-slate-100 transition-all ${className}`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          {/* Advisory Scope & Title */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {isOngoing ? 'Ongoing Maintenance' : 'Scheduled Advisory'}
            </span>

            <strong className="font-semibold text-white truncate">
              {advisory.targetScope}:
            </strong>

            <span className="text-slate-200 truncate">{advisory.title}</span>

            <span className="text-amber-300 font-mono text-[11px] font-medium">
              (Expected completion: {formattedEndTime})
            </span>
          </div>

          {/* Action buttons: View Advisory & Close */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-white/10 hover:bg-white/20 text-white border border-white/20 transition focus:outline-none focus:ring-1 focus:ring-white"
            >
              View Advisory
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Dismiss banner"
              title="Dismiss advisory"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition leading-none text-base"
            >
              &times;
            </button>
          </div>
        </div>
      </aside>

      {/* Detailed Advisory Modal (triggered by "View Advisory") */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#0c1427] border border-amber-500/40 rounded-2xl p-6 shadow-2xl shadow-black/80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-1.5">
                  {advisory.targetScope}
                </span>
                <h3 className="text-base font-bold text-white">{advisory.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              {advisory.message || 'No additional details provided for this maintenance window.'}
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900/40 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[11px]">Start Window:</span>
                <span className="text-slate-200 font-mono font-medium">{formattedStartTime}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Expected Completion:</span>
                <span className="text-amber-300 font-mono font-medium">{formattedEndTime}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
