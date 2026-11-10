'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ============================================================================
// TypeScript Interfaces & Types
// ============================================================================
export type ReservationStatus =
  | 'Pending'
  | 'Approved'
  | 'Completed'
  | 'Completed Early'
  | 'Cancelled'
  | 'Rejected'
  | 'Terminated by Admin';

export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  role: 'student' | 'faculty' | 'staff' | 'admin';
  department?: string;
  student_id?: string;
  avatar_url?: string;
}

export interface Reservation {
  id: number;
  room_id: number;
  room_name: string;
  building_id?: number;
  building_name?: string;
  res_date: string; // YYYY-MM-DD or ISO
  start_time: string; // HH:mm:ss
  end_time: string; // HH:mm:ss
  purpose: string;
  attendees: number;
  status: ReservationStatus;
  created_at?: string;
  updated_at?: string;
  remarks?: string;
}

export interface Room {
  id: number;
  name: string;
  building_id: number;
  building_name: string;
  type: 'Computer Lab' | 'Electronics Lab' | 'Science Lab' | 'Lecture Room' | 'Other';
  capacity: number;
  image_url?: string;
  is_under_maintenance?: boolean;
  occupancy_pct?: number;
}

export interface TimelineSlot {
  hour: number;
  label: string; // e.g. "8:00 AM"
  isBooked: boolean;
  bookingDetails?: {
    id: number;
    room_name: string;
    requester?: string;
    status: ReservationStatus;
  };
}

export interface ActivityNotification {
  id: string | number;
  title: string;
  description: string;
  timestamp: string;
  type: 'approval' | 'pending' | 'cancellation' | 'room_update' | 'maintenance';
  unread?: boolean;
}

// ============================================================================
// Main Component: UserDashboard
// ============================================================================
export default function UserDashboard() {
  // User session state
  const [user, setUser] = useState<UserProfile | null>({
    id: 1,
    full_name: 'Bryan Panton',
    email: 'bryan.panton@cspc.edu.ph',
    role: 'student',
    department: 'Computer Studies',
    student_id: '2023-10492',
  });

  // UI state
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterChip, setSelectedFilterChip] = useState<string>('All');

  // Modal state for cancellation
  const [cancelModalReservation, setCancelModalReservation] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Data state
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch user session
      const sessionRes = await fetch('/api/session');
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData && sessionData.user) {
          setUser(sessionData.user);
        }
      }

      // 2. Fetch user's reservations
      const resRes = await fetch('/api/reservations?mine=1&limit=50');
      if (resRes.ok) {
        const data = await resRes.json();
        setReservations(data.reservations || []);
      }

      // 3. Fetch rooms and live availability
      const roomsRes = await fetch(`/api/availability?date=${selectedDate}`);
      if (roomsRes.ok) {
        const data = await roomsRes.json();
        setRooms(data.rooms || []);
      }
    } catch (err) {
      console.warn('API fetch failed or running in preview mode:', err);
      // Fallback preview data for immediate visualization
      setReservations([
        {
          id: 201,
          room_id: 12,
          room_name: 'Computer Lab 3 (Mac Lab)',
          building_name: 'CITD Building',
          res_date: new Date().toISOString().split('T')[0],
          start_time: '09:00:00',
          end_time: '11:00:00',
          purpose: 'Web Development Capstone Defense',
          attendees: 15,
          status: 'Approved',
        },
        {
          id: 202,
          room_id: 15,
          room_name: 'Electronics & Robotics Lab',
          building_name: 'Engineering Complex',
          res_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          start_time: '13:00:00',
          end_time: '15:00:00',
          purpose: 'IoT Microcontroller Testing',
          attendees: 8,
          status: 'Pending',
        },
        {
          id: 198,
          room_id: 5,
          room_name: 'Multimedia & Graphics Studio',
          building_name: 'Academic Building I',
          res_date: '2026-11-05',
          start_time: '14:00:00',
          end_time: '16:00:00',
          purpose: 'UI/UX Interactive Workshop',
          attendees: 22,
          status: 'Completed',
        },
      ]);

      setRooms([
        {
          id: 12,
          name: 'Computer Lab 3 (Mac Lab)',
          building_id: 2,
          building_name: 'CITD Building',
          type: 'Computer Lab',
          capacity: 40,
          image_url: '/images/buildings/citd.jpg',
          occupancy_pct: 35,
        },
        {
          id: 15,
          name: 'Electronics & Robotics Lab',
          building_id: 3,
          building_name: 'Engineering Complex',
          type: 'Electronics Lab',
          capacity: 30,
          image_url: '/images/buildings/academic-1.jpg',
          occupancy_pct: 10,
        },
        {
          id: 8,
          name: 'Speech & Audio Lab',
          building_id: 1,
          building_name: 'CAS Building',
          type: 'Science Lab',
          capacity: 35,
          image_url: '/images/buildings/cas.jpg',
          occupancy_pct: 85,
        },
        {
          id: 18,
          name: 'Networking & Cisco Lab',
          building_id: 2,
          building_name: 'CITD Building',
          type: 'Computer Lab',
          capacity: 45,
          image_url: '/images/buildings/citd.jpg',
          occupancy_pct: 0,
        },
        {
          id: 22,
          name: 'Main Amphitheater / Lecture Room 1',
          building_id: 4,
          building_name: 'Academic Building II',
          type: 'Lecture Room',
          capacity: 120,
          image_url: '/images/buildings/academic-2.jpg',
          occupancy_pct: 0,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate simulated notifications from reservations
  useEffect(() => {
    const list: ActivityNotification[] = [
      {
        id: 'notif-1',
        title: 'Reservation Approved',
        description: 'Your request for Computer Lab 3 has been confirmed by the Department Custodian.',
        timestamp: '15m ago',
        type: 'approval',
        unread: true,
      },
      {
        id: 'notif-2',
        title: 'Pending Review Submitted',
        description: 'Electronics & Robotics Lab reservation request #202 is waiting for approval.',
        timestamp: '2h ago',
        type: 'pending',
        unread: false,
      },
      {
        id: 'notif-3',
        title: 'Lab Schedule Advisory',
        description: 'Network Maintenance scheduled for Academic Building I labs this Saturday.',
        timestamp: '1d ago',
        type: 'room_update',
        unread: false,
      },
    ];
    setNotifications(list);
  }, [reservations]);

  // Handle reservation cancellation
  const handleConfirmCancel = async () => {
    if (!cancelModalReservation) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/reservations/${cancelModalReservation.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: cancelReason || 'Cancelled by requester' }),
      });

      if (response.ok) {
        setReservations((prev) =>
          prev.map((r) =>
            r.id === cancelModalReservation.id ? { ...r, status: 'Cancelled' } : r
          )
        );
        setCancelModalReservation(null);
        setCancelReason('');
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to cancel reservation');
      }
    } catch (err) {
      console.error('Cancel request error:', err);
      // Local optimistic update
      setReservations((prev) =>
        prev.map((r) =>
          r.id === cancelModalReservation.id ? { ...r, status: 'Cancelled' } : r
        )
      );
      setCancelModalReservation(null);
      setCancelReason('');
    } finally {
      setIsCancelling(false);
    }
  };

  // Filtered rooms logic
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.building_name.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedFilterChip === 'All') return true;
      if (selectedFilterChip === 'Available Today') {
        return (room.occupancy_pct || 0) < 80 && !room.is_under_maintenance;
      }
      return room.type === selectedFilterChip;
    });
  }, [rooms, searchQuery, selectedFilterChip]);

  // Active / Upcoming reservations
  const activeReservations = useMemo(() => {
    return reservations.filter(
      (r) => r.status === 'Pending' || r.status === 'Approved'
    );
  }, [reservations]);

  // Daily hours slots for Real-Time Schedule View (8 AM - 6 PM)
  const timelineHours = useMemo(() => {
    const hours = [];
    for (let h = 8; h <= 18; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 || 12;
      hours.push({
        hour: h,
        label: `${displayHour}:00 ${ampm}`,
      });
    }
    return hours;
  }, []);

  // Format Helper functions
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parts[1];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    }
    return timeStr;
  };

  // Status Badge Helper
  const renderStatusBadge = (status: ReservationStatus) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Approved
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Pending
          </span>
        );
      case 'Completed':
      case 'Completed Early':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            ✓ Completed
          </span>
        );
      case 'Cancelled':
      case 'Rejected':
      case 'Terminated by Admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            ✕ {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#070d19] text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* ====================================================================
          1. SIMPLIFIED TOP NAVIGATION BAR
          Decluttered: No redundant admin links; clean Hornet brand & user pill.
         ==================================================================== */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b1329]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-sky-400 flex items-center justify-center p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-[#0b1329] rounded-[10px] flex items-center justify-center font-bold text-blue-400 text-lg">
                ⚡
              </div>
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                CSPC <span className="text-blue-400 font-medium text-sm">Lab Reservation</span>
              </span>
              <p className="text-[11px] text-slate-400 font-mono -mt-0.5">Computer Studies Portal</p>
            </div>
          </div>

          {/* Quick Nav Links (Student / Faculty relevant only) */}
          <nav className="hidden md:flex items-center space-x-1">
            <button className="px-3.5 py-1.5 text-sm font-medium rounded-lg text-white bg-blue-600/30 border border-blue-500/40">
              Dashboard
            </button>
            <a
              href="/rooms-status.html"
              className="px-3.5 py-1.5 text-sm font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
            >
              Browse Labs
            </a>
            <a
              href="/reservation-form.html"
              className="px-3.5 py-1.5 text-sm font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
            >
              Book a Room
            </a>
          </nav>

          {/* Right Action: Notifications & Simplified User Profile Dropdown */}
          <div className="flex items-center space-x-3 relative">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent hover:border-slate-700 transition relative"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {notifications.some((n) => n.unread) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-[#0b1329]" />
                )}
              </button>

              {/* Notifications Dropdown Drawer */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl z-50 p-3 overflow-hidden backdrop-blur-xl">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 px-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Recent Activity Feed
                    </span>
                    <button
                      onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Mark all as read
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-2.5 rounded-xl text-left transition ${
                          notif.unread
                            ? 'bg-blue-950/40 border border-blue-800/40'
                            : 'bg-slate-900/50 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">{notif.title}</span>
                          <span className="text-[10px] text-slate-500">{notif.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notif.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Simplified Profile Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center space-x-2.5 p-1.5 pr-3 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/70 transition shadow-inner"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs ring-2 ring-blue-500/30">
                  {user?.full_name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'U'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-slate-200 leading-tight">
                    {user?.full_name || 'Student User'}
                  </div>
                  <div className="text-[10px] text-blue-400 uppercase font-mono tracking-wider">
                    {user?.role || 'Student'}
                  </div>
                </div>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    profileDropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Simplified Dropdown Menu (No admin clutter) */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl py-1 z-50 overflow-hidden backdrop-blur-xl">
                  <div className="px-4 py-3 border-b border-slate-800/80">
                    <p className="text-xs text-slate-400">Signed in as</p>
                    <p className="text-xs font-semibold text-white truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-mono rounded bg-blue-900/50 text-blue-300 border border-blue-700/40">
                      ID: {user?.student_id || '2023-10492'}
                    </span>
                  </div>
                  <a
                    href="/dashboard.html"
                    className="flex items-center px-4 py-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
                  >
                    <span className="mr-2">👤</span> Profile Details
                  </a>
                  <a
                    href="#change-password"
                    className="flex items-center px-4 py-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
                  >
                    <span className="mr-2">🔒</span> Change Password
                  </a>
                  <div className="border-t border-slate-800/80 my-1"></div>
                  <a
                    href="/?auth=logout"
                    className="flex items-center px-4 py-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition"
                  >
                    <span className="mr-2">🚪</span> Log Out
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ====================================================================
          MAIN DASHBOARD CONTAINER
         ==================================================================== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950/80 via-[#0c1833]/90 to-slate-900/90 border border-blue-500/20 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Campus Booking Portal Active</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome, {user?.full_name?.split(' ')[0] || 'Student'}! 👋
              </h1>
              <p className="text-sm text-slate-300 mt-1 max-w-xl">
                Reserve campus laboratories, monitor real-time room availability, and manage your active bookings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/reservation-form.html"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>+ Request Lab or Room</span>
              </a>
              <a
                href="#schedule-section"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 transition"
              >
                <span>📅 View Day Schedule</span>
              </a>
            </div>
          </div>
          {/* Subtle background glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        </section>

        {/* ====================================================================
            FEATURE 1: ACTIVE RESERVATIONS TRACKER
            Prominent upcoming bookings card with status badges & "Cancel Request"
           ==================================================================== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>⏱ Active Reservations Tracker</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {activeReservations.length} Pending / Approved
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage your upcoming laboratory and room sessions with direct cancellation actions.
              </p>
            </div>
          </div>

          {activeReservations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center backdrop-blur-md">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 text-xl mb-3">
                📋
              </div>
              <h3 className="text-sm font-semibold text-slate-200">No active bookings right now</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Need a computer lab, electronics room, or lecture space for study or defense?
              </p>
              <a
                href="/reservation-form.html"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600/80 hover:bg-blue-600 text-white transition"
              >
                + Book a Laboratory Now &rarr;
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeReservations.map((res) => (
                <div
                  key={res.id}
                  className="rounded-2xl bg-gradient-to-b from-[#0f1b33] to-[#0c1426] border border-blue-900/40 p-5 shadow-xl hover:border-blue-500/40 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="text-[11px] font-mono font-medium text-blue-400 uppercase tracking-wide">
                          {res.building_name || 'CSPC Campus'}
                        </span>
                        <h3 className="text-base font-bold text-white leading-tight mt-0.5">
                          {res.room_name}
                        </h3>
                      </div>
                      {renderStatusBadge(res.status)}
                    </div>

                    <div className="space-y-2 py-3 border-y border-slate-800/80 text-xs">
                      <div className="flex items-center text-slate-300">
                        <span className="text-slate-500 w-16">Date:</span>
                        <span className="font-semibold text-slate-200">{formatDate(res.res_date)}</span>
                      </div>
                      <div className="flex items-center text-slate-300">
                        <span className="text-slate-500 w-16">Time:</span>
                        <span className="font-semibold text-blue-400">
                          {formatTime(res.start_time)} – {formatTime(res.end_time)}
                        </span>
                      </div>
                      <div className="flex items-start text-slate-300">
                        <span className="text-slate-500 w-16 flex-shrink-0">Purpose:</span>
                        <span className="text-slate-300 italic truncate">{res.purpose || 'Academic session'}</span>
                      </div>
                      <div className="flex items-center text-slate-300">
                        <span className="text-slate-500 w-16">Attendees:</span>
                        <span className="text-slate-200">{res.attendees} persons</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-500">ID #{res.id}</span>
                    {res.status === 'Pending' || res.status === 'Approved' ? (
                      <button
                        onClick={() => setCancelModalReservation(res)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition"
                      >
                        Cancel Request
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ====================================================================
            FEATURE 2: QUICK LAB SEARCH & FILTER
            Search bar with fast filter chips (Computer Lab, Electronics Lab, Available Today)
           ==================================================================== */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🔍 Quick Lab Search &amp; Filter</span>
                <span className="text-xs font-mono text-slate-400">({filteredRooms.length} rooms matching)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Instantly filter campus facilities by specialty, building, or real-time availability.
              </p>
            </div>

            {/* Fast Search Input */}
            <div className="relative w-full md:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lab name or building..."
                className="w-full bg-[#0d162b] border border-slate-700/80 rounded-xl px-4 py-2 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Quick Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              'All',
              'Available Today',
              'Computer Lab',
              'Electronics Lab',
              'Science Lab',
              'Lecture Room',
            ].map((chip) => {
              const isActive = selectedFilterChip === chip;
              return (
                <button
                  key={chip}
                  onClick={() => setSelectedFilterChip(chip)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 border border-blue-500'
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {chip === 'Available Today' ? '⚡ Available Today' : chip}
                </button>
              );
            })}
          </div>

          {/* Lab Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => {
              const isAvailable = (room.occupancy_pct || 0) < 80 && !room.is_under_maintenance;
              return (
                <div
                  key={room.id}
                  className="group rounded-2xl bg-[#0d162b]/80 border border-slate-800/80 hover:border-blue-500/50 p-4 transition shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                        {room.type}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          isAvailable
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        />
                        {isAvailable ? 'Open' : 'Busy'}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition leading-snug">
                      {room.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">{room.building_name}</p>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>Capacity: {room.capacity} seats</span>
                      <span>Utilization: {room.occupancy_pct || 0}%</span>
                    </div>

                    {/* Utilization Bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          (room.occupancy_pct || 0) > 75 ? 'bg-rose-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, room.occupancy_pct || 15)}%` }}
                      />
                    </div>
                  </div>

                  <a
                    href={`/reservation-form.html?building_id=${room.building_id}&room_id=${room.id}`}
                    className="mt-4 block text-center w-full py-2 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 transition"
                  >
                    + Reserve This Lab
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        {/* ====================================================================
            FEATURE 3: REAL-TIME SCHEDULE / CALENDAR TIMELINE VIEW
            Interactive daily timeline showing available and booked hours
           ==================================================================== */}
        <section id="schedule-section" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>📅 Real-Time Daily Schedule</span>
                <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  {selectedDate}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Visual timeline showing laboratory schedule occupancy from 8:00 AM to 6:00 PM.
              </p>
            </div>

            {/* Date Switcher */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              >
                Today
              </button>
              <button
                onClick={() =>
                  setSelectedDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              >
                Tomorrow
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-[#0d162b] border border-slate-700 rounded-lg px-3 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Timeline Grid Table */}
          <div className="rounded-2xl border border-slate-800/80 bg-[#0d162b]/90 p-4 backdrop-blur-xl shadow-xl overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Hour Header */}
              <div className="grid grid-cols-12 gap-1 text-[11px] font-mono text-slate-400 border-b border-slate-800 pb-2 mb-3">
                <div className="col-span-3 text-slate-300 font-semibold">Laboratory / Room</div>
                <div className="col-span-9 grid grid-cols-9 text-center">
                  <span>8 AM</span>
                  <span>9 AM</span>
                  <span>10 AM</span>
                  <span>11 AM</span>
                  <span>12 PM</span>
                  <span>1 PM</span>
                  <span>2 PM</span>
                  <span>3 PM</span>
                  <span>4 PM</span>
                </div>
              </div>

              {/* Lab Schedule Rows */}
              <div className="space-y-3">
                {rooms.slice(0, 5).map((room, idx) => (
                  <div
                    key={room.id}
                    className="grid grid-cols-12 gap-1 items-center py-2 px-2 rounded-xl hover:bg-slate-800/30 transition text-xs border border-transparent hover:border-slate-800"
                  >
                    <div className="col-span-3 pr-2 truncate">
                      <div className="font-semibold text-slate-200 truncate">{room.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{room.building_name}</div>
                    </div>

                    {/* Timeline Slot Blocks */}
                    <div className="col-span-9 grid grid-cols-9 gap-1.5 h-7">
                      {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((hour) => {
                        // Mock occupancy logic for slot visualization
                        const isBooked = (idx % 2 === 0 && (hour === 9 || hour === 10)) || (idx % 3 === 0 && hour === 14);
                        return (
                          <div
                            key={hour}
                            title={`${room.name} at ${hour}:00: ${isBooked ? 'Booked' : 'Available'}`}
                            className={`rounded-md flex items-center justify-center text-[10px] font-mono transition cursor-pointer ${
                              isBooked
                                ? 'bg-blue-600/50 text-blue-200 border border-blue-500/40 hover:bg-blue-600'
                                : 'bg-slate-800/50 text-slate-500 hover:bg-emerald-950/40 hover:text-emerald-300 hover:border-emerald-600/30 border border-slate-800'
                            }`}
                          >
                            {isBooked ? 'Busy' : 'Open'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline Legend */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
                    <span>Available Slot</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-blue-600/60 border border-blue-500/60" />
                    <span>Reserved Session</span>
                  </div>
                </div>
                <span className="text-[11px] text-slate-500">Click any open slot to reserve</span>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            FEATURE 4: RECENT ACTIVITY & NOTIFICATIONS LOG
            Feed showing updates on reservation approvals, schedule changes, etc.
           ==================================================================== */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔔 Recent Activity &amp; Notifications Log</span>
            </h2>
            <p className="text-xs text-slate-400">
              Real-time audit log of approvals, status updates, and laboratory reminders.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0d162b]/80 p-5 shadow-xl space-y-3">
            {notifications.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      item.type === 'approval'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : item.type === 'pending'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {item.type === 'approval' ? '✓' : item.type === 'pending' ? '⏱' : 'ℹ'}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{item.title}</h4>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{item.description}</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                  {item.timestamp}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ====================================================================
          MODAL: CANCEL RESERVATION CONFIRMATION
         ==================================================================== */}
      {cancelModalReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f172a] border border-slate-700 p-6 shadow-2xl animate-in fade-in duration-200">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="text-rose-400">⚠️</span> Cancel Reservation #{cancelModalReservation.id}?
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Are you sure you want to cancel your booking for{' '}
              <strong className="text-white">{cancelModalReservation.room_name}</strong> on{' '}
              <strong className="text-blue-400">{formatDate(cancelModalReservation.res_date)}</strong>? This slot will immediately be made available to other students and faculty.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Reason for cancellation (optional):
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Defense rescheduled by instructor..."
                rows={2}
                className="w-full bg-[#090d16] border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="mt-5 flex items-center justify-end space-x-2">
              <button
                onClick={() => setCancelModalReservation(null)}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Keep Booking
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5"
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

