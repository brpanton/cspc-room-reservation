'use strict';

const RESERVATION_SELECT = `
  SELECT res.id, res.room_id, res.user_id, res.res_date, res.start_time, res.end_time,
         res.purpose, res.attendees, res.status, res.transaction_code,
         res.approved_by, res.remarks, res.decided_at,
         res.scheduled_start, res.scheduled_end, res.actual_check_in, res.actual_check_out,
         res.session_status, res.termination_reason, res.terminated_by,
         res.created_at,
         r.name AS room_name, r.room_type, r.capacity,
         b.id AS building_id, b.name AS building_name,
         u.full_name AS requested_by, u.school_id AS requester_school_id,
         u.role AS requester_role,
         u.email AS requester_email,
         a.full_name AS approved_by_name,
         t.full_name AS terminated_by_name,
         (SELECT string_agg(eq.equipment, ',') FROM reservation_equipment eq WHERE eq.reservation_id = res.id) AS equipment
  FROM reservations res
  JOIN rooms r       ON r.id = res.room_id
  JOIN buildings b   ON b.id = r.building_id
  JOIN users u       ON u.id = res.user_id
  LEFT JOIN users a  ON a.id = res.approved_by
  LEFT JOIN users t  ON t.id = res.terminated_by
`;

function toDateIso(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

function shape(row) {
  if (!row) return null;
  const resDateIso = toDateIso(row.res_date);
  const status = String(row.status || 'PENDING_APPROVAL');
  const sessionStatus = String(row.session_status || 'Scheduled');
  const isApproved = status === 'APPROVED' || status === 'Approved';
  const isPending = status === 'PENDING_APPROVAL' || status === 'Pending';
  const isOngoingOrScheduled = !['Checked Out Early', 'Terminated by Admin', 'Completed', 'Cancelled'].includes(sessionStatus);

  return {
    ...row,
    res_date: resDateIso || row.res_date,
    status,
    is_approved: isApproved,
    is_pending: isPending,
    ticket_unlocked: isApproved,
    equipment: row.equipment ? String(row.equipment).split(',').filter(Boolean) : [],
    can_early_checkout: isApproved && isOngoingOrScheduled,
    can_admin_terminate: (isApproved || isPending) && isOngoingOrScheduled
  };
}

module.exports = {
  RESERVATION_SELECT,
  toDateIso,
  shape
};

