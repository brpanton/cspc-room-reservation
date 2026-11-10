/**
 * CSPC Lab Reservation - Dynamic Scheduled Advisory / Maintenance Banner
 * Automatically mounts on both the landing page (before login) and user dashboard (after login).
 * Fetches real-time advisory data from GET /api/advisory/active.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCompletionDate(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;

    const formatted = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    const diffMs = d.getTime() - Date.now();
    let remaining = '';
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 24) {
        const days = Math.round(hours / 24);
        remaining = `~${days} day${days > 1 ? 's' : ''} remaining`;
      } else if (hours > 0) {
        remaining = `~${hours}h ${mins}m remaining`;
      } else {
        remaining = `~${mins}m remaining`;
      }
    } else {
      remaining = 'wrapping up now';
    }

    return { formatted, remaining };
  }

  async function checkAndRenderAdvisoryBanner() {
    try {
      const res = await fetch('/api/advisory/active', {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return;

      const data = await res.json();
      if (!data || !data.active || !data.advisory) {
        const existing = document.getElementById('cspc-dynamic-advisory-banner');
        if (existing) existing.remove();
        return;
      }

      const adv = data.advisory;
      const dismissKey = `cspc_advisory_dismissed_${adv.id}_${adv.updatedAt || adv.createdAt || ''}`;
      if (sessionStorage.getItem(dismissKey) === 'true') {
        return;
      }

      const typeKey = String(adv.type || 'maintenance').toLowerCase();

      // Themes based on type
      let colorClass = 'cspc-advisory-maintenance';
      let badgeText = 'Maintenance Advisory';
      if (typeKey === 'emergency' || typeKey === 'warning') {
        colorClass = 'cspc-advisory-emergency';
        badgeText = typeKey === 'emergency' ? 'Critical Notice' : 'System Warning';
      } else if (typeKey === 'scheduled' || typeKey === 'info') {
        colorClass = 'cspc-advisory-scheduled';
        badgeText = typeKey === 'scheduled' ? 'Scheduled Downtime' : 'Campus Notice';
      }

      const completion = formatCompletionDate(adv.expectedCompletion);

      let banner = document.getElementById('cspc-dynamic-advisory-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'cspc-dynamic-advisory-banner';
        banner.className = `cspc-advisory-banner-wrap ${colorClass}`;
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');

        // Insert at the very top of body or before navbar
        const navbar = document.getElementById('navbar-placeholder') || document.body.firstElementChild;
        if (navbar && navbar.parentNode) {
          navbar.parentNode.insertBefore(banner, navbar);
        } else {
          document.body.prepend(banner);
        }
      }

      banner.innerHTML = `
        <div class="cspc-advisory-inner container-fluid px-3 px-md-4 py-2">
          <div class="d-flex align-items-center justify-content-between gap-3">
            <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
              <span class="cspc-advisory-badge">${escapeHtml(badgeText)}</span>
              <div class="cspc-advisory-text d-flex align-items-center gap-2 flex-wrap min-w-0">
                <strong class="cspc-advisory-title text-truncate">${escapeHtml(adv.title)}</strong>
                <span class="d-none d-md-inline opacity-50">•</span>
                <span class="cspc-advisory-msg text-truncate-custom">${escapeHtml(adv.message)}</span>
              </div>
            </div>
            <div class="d-flex align-items-center gap-2 flex-shrink-0">
              ${
                completion
                  ? `<div class="cspc-advisory-pill d-none d-lg-inline-flex" title="Expected resolution: ${escapeHtml(completion.formatted)}">
                      <span>Until ${escapeHtml(completion.formatted)}</span>
                      <small class="opacity-75 ms-1">(${escapeHtml(completion.remaining)})</small>
                    </div>`
                  : ''
              }
              <button type="button" class="cspc-advisory-close" id="btn-dismiss-advisory-banner" aria-label="Dismiss advisory banner" title="Dismiss for this session">&times;</button>
            </div>
          </div>
          ${
            completion
              ? `<div class="d-flex d-lg-none mt-1 pt-1 border-top border-white-10 small opacity-90 justify-content-between">
                  <span>Expected Resolution:</span>
                  <strong class="font-monospace">${escapeHtml(completion.formatted)} (${escapeHtml(completion.remaining)})</strong>
                </div>`
              : ''
          }
        </div>
      `;

      // Style injection if not already present
      if (!document.getElementById('cspc-advisory-styles')) {
        const style = document.createElement('style');
        style.id = 'cspc-advisory-styles';
        style.textContent = `
          .cspc-advisory-banner-wrap {
            position: relative;
            z-index: 1060;
            width: 100%;
            font-size: 0.85rem;
            border-bottom: 1px solid rgba(255,255,255,0.12);
            transition: all 0.3s ease;
          }
          .cspc-advisory-maintenance {
            background: linear-gradient(90deg, rgba(30, 20, 5, 0.96), rgba(45, 27, 8, 0.98), rgba(30, 20, 5, 0.96));
            border-bottom-color: rgba(245, 158, 11, 0.4);
            color: #fef3c7;
          }
          .cspc-advisory-emergency {
            background: linear-gradient(90deg, rgba(38, 10, 16, 0.96), rgba(58, 14, 24, 0.98), rgba(38, 10, 16, 0.96));
            border-bottom-color: rgba(244, 63, 94, 0.45);
            color: #ffe4e6;
          }
          .cspc-advisory-scheduled {
            background: linear-gradient(90deg, rgba(10, 22, 45, 0.96), rgba(15, 32, 67, 0.98), rgba(10, 22, 45, 0.96));
            border-bottom-color: rgba(59, 130, 246, 0.4);
            color: #dbeafe;
          }
          .cspc-advisory-badge {
            font-size: 0.68rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(255, 255, 255, 0.2);
            white-space: nowrap;
          }
          .cspc-advisory-maintenance .cspc-advisory-badge {
            background: rgba(245, 158, 11, 0.2);
            color: #fcd34d;
            border-color: rgba(245, 158, 11, 0.4);
          }
          .cspc-advisory-emergency .cspc-advisory-badge {
            background: rgba(244, 63, 94, 0.2);
            color: #fda4af;
            border-color: rgba(244, 63, 94, 0.4);
          }
          .cspc-advisory-scheduled .cspc-advisory-badge {
            background: rgba(59, 130, 246, 0.2);
            color: #93c5fd;
            border-color: rgba(59, 130, 246, 0.4);
          }
          .cspc-advisory-pill {
            font-family: monospace;
            font-size: 0.75rem;
            padding: 2px 8px;
            border-radius: 5px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.18);
          }
          .cspc-advisory-close {
            background: transparent;
            border: none;
            color: inherit;
            font-size: 1.25rem;
            line-height: 1;
            padding: 2px 6px;
            border-radius: 4px;
            cursor: pointer;
            opacity: 0.75;
            transition: opacity 0.15s, background 0.15s;
          }
          .cspc-advisory-close:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.15);
          }
          .border-white-10 {
            border-color: rgba(255, 255, 255, 0.1) !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Close button event
      const closeBtn = document.getElementById('btn-dismiss-advisory-banner');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          sessionStorage.setItem(dismissKey, 'true');
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-100%)';
          setTimeout(() => banner.remove(), 250);
        });
      }
    } catch (e) {
      console.warn('[advisory-banner] Could not load active advisory:', e);
    }
  }

  // Load when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndRenderAdvisoryBanner);
  } else {
    checkAndRenderAdvisoryBanner();
  }

  // Re-check periodically every 60 seconds
  setInterval(checkAndRenderAdvisoryBanner, 60000);
})();

