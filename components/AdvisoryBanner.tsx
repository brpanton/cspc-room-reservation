'use strict';

import React, { useState, useEffect, useCallback } from 'react';

export interface AdvisoryData {
  id: number;
  title: string;
  message: string;
  expectedCompletion: string | null;
  type: 'maintenance' | 'scheduled' | 'warning' | 'info' | 'emergency' | string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdvisoryBannerProps {
  endpoint?: string;
  className?: string;
  onDismiss?: () => void;
  onLoad?: (advisory: AdvisoryData | null) => void;
  pollIntervalMs?: number; // Optional background polling interval
}

/**
 * AdvisoryBanner Component
 *
 * Dynamically fetches active maintenance and scheduled advisories from `/api/advisory/active`
 * and displays an alert banner at the top of the header.
 *
 * Features:
 * - Real-time fetch on mount + optional background polling.
 * - Session-based dismissal persistence (tracks advisory ID + updatedAt).
 * - Contextual color schemes (Maintenance, Warning/Emergency, Scheduled/Info).
 * - Live remaining time countdown calculation for expected completion.
 * - Full accessibility compliance (role="alert", aria-live="polite").
 */
export default function AdvisoryBanner({
  endpoint = '/api/advisory/active',
  className = '',
  onDismiss,
  onLoad,
  pollIntervalMs = 60000,
}: AdvisoryBannerProps) {
  const [advisory, setAdvisory] = useState<AdvisoryData | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch active advisory from public API
  const fetchActiveAdvisory = useCallback(async () => {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        setAdvisory(null);
        if (onLoad) onLoad(null);
        return;
      }

      const data = await res.json();
      if (data && data.active && data.advisory) {
        const item: AdvisoryData = data.advisory;
        setAdvisory(item);

        // Check if user has already dismissed this exact revision in this browser session
        const dismissKey = `cspc_advisory_dismissed_${item.id}_${item.updatedAt || item.createdAt || ''}`;
        const alreadyDismissed = sessionStorage.getItem(dismissKey) === 'true';
        setIsDismissed(alreadyDismissed);

        if (onLoad) onLoad(item);
      } else {
        setAdvisory(null);
        if (onLoad) onLoad(null);
      }
    } catch (err) {
      console.warn('[AdvisoryBanner] Could not retrieve active advisory:', err);
      setAdvisory(null);
      if (onLoad) onLoad(null);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, onLoad]);

  useEffect(() => {
    fetchActiveAdvisory();

    // Background poll for newly published or toggled advisories
    if (pollIntervalMs && pollIntervalMs > 0) {
      const timer = setInterval(fetchActiveAdvisory, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchActiveAdvisory, pollIntervalMs]);

  // Handle dismiss action
  const handleClose = () => {
    if (advisory) {
      const dismissKey = `cspc_advisory_dismissed_${advisory.id}_${advisory.updatedAt || advisory.createdAt || ''}`;
      try {
        sessionStorage.setItem(dismissKey, 'true');
      } catch (_) {
        /* storage may fail in restricted/private modes */
      }
    }
    setIsDismissed(true);
    if (onDismiss) onDismiss();
  };

  if (isLoading || isDismissed || !advisory || !advisory.isActive) {
    return null;
  }

  // Format the expected completion date and calculate remaining duration
  let completionFormatted: string | null = null;
  let remainingText: string | null = null;
  if (advisory.expectedCompletion) {
    const compDate = new Date(advisory.expectedCompletion);
    if (!isNaN(compDate.getTime())) {
      completionFormatted = compDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      const diffMs = compDate.getTime() - Date.now();
      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 24) {
          const days = Math.round(hours / 24);
          remainingText = `~${days} day${days > 1 ? 's' : ''} remaining`;
        } else if (hours > 0) {
          remainingText = `~${hours}h ${minutes}m remaining`;
        } else {
          remainingText = `~${minutes}m remaining`;
        }
      } else {
        remainingText = 'Wrapping up now';
      }
    }
  }

  // Visual styling variants based on advisory.type
  const typeKey = String(advisory.type || 'maintenance').toLowerCase();

  let bannerStyle = {
    bg: 'bg-gradient-to-r from-amber-950/90 via-[#1a140a]/95 to-amber-950/90',
    border: 'border-amber-500/40',
    glow: 'shadow-[0_4px_24px_rgba(245,158,11,0.15)]',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    titleColor: 'text-amber-100',
    textColor: 'text-amber-200/90',
    pillBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    closeColor: 'text-amber-400 hover:text-white hover:bg-amber-500/20',
    label: 'Maintenance Advisory',
    icon: (
      <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  if (typeKey === 'emergency' || typeKey === 'warning') {
    bannerStyle = {
      bg: 'bg-gradient-to-r from-rose-950/90 via-[#200a0d]/95 to-rose-950/90',
      border: 'border-rose-500/40',
      glow: 'shadow-[0_4px_24px_rgba(244,63,94,0.18)]',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      titleColor: 'text-rose-100',
      textColor: 'text-rose-200/90',
      pillBg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      closeColor: 'text-rose-400 hover:text-white hover:bg-rose-500/20',
      label: typeKey === 'emergency' ? 'Critical Notice' : 'System Advisory',
      icon: (
        <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    };
  } else if (typeKey === 'scheduled' || typeKey === 'info') {
    bannerStyle = {
      bg: 'bg-gradient-to-r from-blue-950/90 via-[#0b162b]/95 to-blue-950/90',
      border: 'border-blue-500/40',
      glow: 'shadow-[0_4px_24px_rgba(59,130,246,0.18)]',
      badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      titleColor: 'text-blue-100',
      textColor: 'text-slate-300',
      pillBg: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      closeColor: 'text-blue-400 hover:text-white hover:bg-blue-500/20',
      label: typeKey === 'scheduled' ? 'Scheduled Downtime' : 'Campus Notice',
      icon: (
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    };
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`relative w-full z-50 border-b backdrop-blur-md transition-all duration-300 ${bannerStyle.bg} ${bannerStyle.border} ${bannerStyle.glow} ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-start sm:items-center justify-between gap-3">
          {/* Advisory Icon & Content */}
          <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
            {bannerStyle.icon}

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap min-w-0">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${bannerStyle.badgeBg}`}
              >
                {bannerStyle.label}
              </span>

              <h3 className={`text-sm font-semibold truncate ${bannerStyle.titleColor}`}>
                {advisory.title}
              </h3>

              <span className="hidden sm:inline text-slate-500 text-xs">•</span>

              <p className={`text-xs ${bannerStyle.textColor} line-clamp-2 sm:line-clamp-1`}>
                {advisory.message}
              </p>
            </div>
          </div>

          {/* Expected Completion Pill & Dismiss Close Button */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {completionFormatted && (
              <div
                className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${bannerStyle.pillBg}`}
                title={`Expected Resolution: ${completionFormatted}`}
              >
                <span>Until {completionFormatted}</span>
                {remainingText && (
                  <span className="opacity-80 text-[10px]">({remainingText})</span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              aria-label="Dismiss advisory banner"
              title="Dismiss for this session"
              className={`p-1.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${bannerStyle.closeColor}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile View: Expected Completion row */}
        {completionFormatted && (
          <div className="mt-1.5 pt-1.5 border-t border-white/5 md:hidden flex items-center justify-between text-[11px] text-slate-300">
            <span>Expected Completion:</span>
            <span className="font-mono font-semibold text-white">
              {completionFormatted} {remainingText ? `(${remainingText})` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

