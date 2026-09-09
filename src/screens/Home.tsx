import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, Droplet, Baby, Activity, 
  Syringe, Sparkles, CheckCircle2, ChevronRight,
  Calendar, UserCheck, Volume2, VolumeX, Clock,
  AlertTriangle, HelpCircle, ClipboardList, MessageSquare,
  ShieldCheck, ArrowRight, HeartPulse
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useAiStore } from '../stores/useAiStore';
import { cn } from '../components/Layout';
import { SUPPORTED_LANGUAGES, CareEvent, VaccinationRecord, Reminder } from '../types';
import { aiCareCompanionService } from '../services/ai/AiCareCompanionService';
import { CareEventExplanationModal } from '../components/CareEventExplanationModal';
import { FamilyCareOverview } from '../components/FamilyCareOverview';
import { CareExplanationActionType } from '../services/ai/types';

const Home = () => {
  const navigate = useNavigate();
  
  const user = useAppStore((state) => state.user);
  const family = useAppStore((state) => state.family);
  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const setActiveMemberId = useAppStore((state) => state.setActiveMemberId);
  const preferences = useAppStore((state) => state.preferences);
  
  const pregnancyProfiles = useAppStore((state) => state.pregnancyProfiles);
  const childProfiles = useAppStore((state) => state.childProfiles);
  const careEvents = useAppStore((state) => state.careEvents);
  const vaccinationRecords = useAppStore((state) => state.vaccinationRecords);
  const appointments = useAppStore((state) => state.appointments);
  const reminders = useAppStore((state) => state.reminders);

  const speakMessage = useAiStore((state) => state.speakMessage);
  const stopSpeaking = useAiStore((state) => state.stopSpeaking);
  const isAiSpeaking = useAiStore((state) => state.isSpeaking);

  // Modal explanation state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CareEvent | null>(null);
  const [selectedVaccine, setSelectedVaccine] = useState<VaccinationRecord | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [modalAction, setModalAction] = useState<CareExplanationActionType>('importance');

  const activeMember = familyMembers.find((m) => m.id === activeMemberId) || familyMembers[0];
  const isMother = activeMember?.type === 'mother';

  const currentLanguage = preferences?.preferredLanguage || 'en';
  const languageOption = SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage);

  // Active profile specific data
  const activePregnancy = isMother 
    ? pregnancyProfiles.find((p) => p.familyMemberId === activeMember?.id)
    : undefined;

  const activeChild = !isMother 
    ? childProfiles.find((c) => c.familyMemberId === activeMember?.id)
    : undefined;

  // Filter care data strictly for active profile (profile isolation)
  const memberCareEvents = useMemo(
    () => careEvents.filter((e) => e.familyMemberId === activeMember?.id),
    [careEvents, activeMember?.id]
  );
  const memberAppointments = useMemo(
    () => appointments.filter((a) => a.familyMemberId === activeMember?.id),
    [appointments, activeMember?.id]
  );
  const memberReminders = useMemo(
    () => reminders.filter((r) => r.familyMemberId === activeMember?.id && !r.completed),
    [reminders, activeMember?.id]
  );
  const memberVaccines = useMemo(
    () => vaccinationRecords.filter((v) => v.familyMemberId === activeMember?.id),
    [vaccinationRecords, activeMember?.id]
  );

  // Calculate structured care summary deterministically
  const careSummary = useMemo(() => {
    if (!activeMember) return null;
    return aiCareCompanionService.calculateCareSummary({
      member: activeMember,
      careEvents: memberCareEvents,
      reminders: memberReminders,
      vaccinations: memberVaccines
    });
  }, [activeMember, memberCareEvents, memberReminders, memberVaccines]);

  // Next scheduled items
  const nextAppointment = memberAppointments.find((a) => a.status === 'scheduled');
  const nextCareEvent = memberCareEvents
    .filter((e) => e.status === 'pending')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
  const nextVaccine = memberVaccines
    .filter((v) => v.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];

  // Overdue items
  const todayStr = new Date().toISOString().split('T')[0];
  const overdueCareEvents = memberCareEvents.filter((e) => {
    const d = e.scheduledAt.split('T')[0];
    return (d < todayStr && e.status === 'pending') || e.status === 'missed';
  });
  const overdueVaccines = memberVaccines.filter((v) => {
    return v.scheduledDate < todayStr && (v.status === 'scheduled' || v.status === 'overdue');
  });

  // Items due today (deterministic care priorities)
  const todayCareItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      category: 'appointment' | 'vaccine' | 'event' | 'reminder';
      detail: string;
      event?: CareEvent;
      vaccine?: VaccinationRecord;
      reminder?: Reminder;
    }> = [];

    memberAppointments
      .filter((a) => a.scheduledAt.startsWith(todayStr) && a.status === 'scheduled')
      .forEach((a) => {
        items.push({
          id: a.id,
          title: a.title,
          category: 'appointment',
          detail: a.facility || 'Clinical facility'
        });
      });

    memberCareEvents
      .filter((e) => e.scheduledAt.startsWith(todayStr) && e.status === 'pending')
      .forEach((e) => {
        items.push({
          id: e.id,
          title: e.title,
          category: 'event',
          detail: 'GHS Safe Motherhood Protocol',
          event: e
        });
      });

    memberVaccines
      .filter((v) => v.scheduledDate.startsWith(todayStr) && v.status === 'scheduled')
      .forEach((v) => {
        items.push({
          id: v.id,
          title: `Vaccine: ${v.vaccineName}`,
          category: 'vaccine',
          detail: `Target Age: ${v.targetAgeWeeks} weeks`,
          vaccine: v
        });
      });

    memberReminders
      .filter((r) => r.scheduledAt.startsWith(todayStr) && !r.completed)
      .forEach((r) => {
        items.push({
          id: r.id,
          title: r.title,
          category: 'reminder',
          detail: 'Routine care reminder',
          reminder: r
        });
      });

    return items;
  }, [memberAppointments, memberCareEvents, memberVaccines, memberReminders, todayStr]);

  const handleProfileSwitch = (memberId: string) => {
    setActiveMemberId(memberId);
    useAiStore.getState().onProfileSwitch();
    aiCareCompanionService.invalidateCache();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getChildAgeText = (dobStr?: string) => {
    if (!dobStr) return '';
    const dob = new Date(dobStr);
    const diffMs = Date.now() - dob.getTime();
    const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    if (weeks < 8) return `${weeks} weeks old`;
    const months = Math.floor(diffMs / (30.4 * 24 * 60 * 60 * 1000));
    if (months < 24) return `${months} months old`;
    const years = Math.floor(months / 12);
    return `${years} years old`;
  };

  const openExplanation = (
    item: { event?: CareEvent; vaccine?: VaccinationRecord; reminder?: Reminder },
    action: CareExplanationActionType = 'importance'
  ) => {
    setSelectedEvent(item.event || null);
    setSelectedVaccine(item.vaccine || null);
    setSelectedReminder(item.reminder || null);
    setModalAction(action);
    setModalOpen(true);
  };

  const handleListenSummary = () => {
    if (isAiSpeaking) {
      stopSpeaking();
    } else if (careSummary?.deterministicSummaryText) {
      speakMessage(careSummary.deterministicSummaryText, currentLanguage);
    }
  };

  return (
    <div id="home-screen-root" className="flex flex-col min-h-full pb-12">
      {/* Top Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="text-slate-500 font-semibold text-xs tracking-wide uppercase">
              {family?.name || 'NurtureAI Family'}
            </span>
            <h1 id="home-greeting-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
              {getGreeting()}, {activeMember?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Caregiver'} 👋
            </h1>
          </div>
          <button 
            id="home-reminders-bell-btn"
            onClick={() => navigate('/reminders')}
            className="relative w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-xs active:bg-slate-50"
            title="View Reminders"
          >
            <Bell className="w-5 h-5" />
            {memberReminders.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {memberReminders.length}
              </span>
            )}
          </button>
        </div>

        {/* Profile Switcher Chips */}
        {familyMembers.length > 1 && (
          <div id="profile-switcher-chips" className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 flex-shrink-0">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              Active:
            </span>
            {familyMembers.map((member) => {
              const isTwin = member.type === 'child' && !!member.dateOfBirth && familyMembers.some(
                (other) => other.id !== member.id && other.type === 'child' && other.dateOfBirth === member.dateOfBirth
              );
              return (
                <button
                  key={member.id}
                  id={`profile-chip-${member.id}`}
                  onClick={() => handleProfileSwitch(member.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 border",
                    member.id === activeMember?.id
                      ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  )}
                >
                  {member.type === 'mother' ? <Droplet className="w-3 h-3" /> : <Baby className="w-3 h-3" />}
                  <span>{member.displayName}</span>
                  <span className="text-[10px] opacity-75">
                    ({member.type === 'mother' ? 'Mother' : isTwin ? 'Twin' : 'Child'})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 space-y-4 mt-2">
        {/* Dynamic Journey Card based on Active Profile */}
        {isMother ? (
          <div 
            id="journey-card-mother"
            onClick={() => navigate('/pregnancy-care')}
            className="bg-gradient-to-br from-teal-700 to-emerald-800 text-white rounded-2xl p-5 shadow-sm active:scale-[0.99] transition-transform cursor-pointer relative overflow-hidden"
          >
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
              <Droplet className="w-48 h-48 translate-x-8 translate-y-8" />
            </div>
            <p className="text-emerald-200 text-xs font-bold uppercase tracking-wider mb-1">
              Your Pregnancy Journey
            </p>
            <div className="flex justify-between items-baseline mb-1">
              <h2 className="text-2xl font-bold">
                Week {activePregnancy?.currentGestationalWeeks || 24}
              </h2>
              <span className="text-xs bg-emerald-900/80 px-2.5 py-1 rounded-full text-emerald-100 font-medium">
                Due: {activePregnancy?.estimatedDueDate || 'In 16 weeks'}
              </span>
            </div>
            <p className="text-emerald-100 text-sm mb-4">
              {activePregnancy?.status || 'Active'} • GHS Safe Motherhood 8-Contact ANC tracking
            </p>
            
            <div className="w-full bg-emerald-950/40 h-2.5 rounded-full mb-3 overflow-hidden">
              <div 
                className="bg-white h-2.5 rounded-full transition-all" 
                style={{ width: `${Math.min(100, Math.round(((activePregnancy?.currentGestationalWeeks || 24) / 40) * 100))}%` }}
              />
            </div>
            
            <div className="flex justify-between items-center text-xs font-medium text-emerald-100">
              <span>{Math.round(((activePregnancy?.currentGestationalWeeks || 24) / 40) * 100)}% of 40 weeks completed</span>
              <span className="flex items-center gap-1 text-white font-semibold">
                Care plan <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        ) : (
          <div 
            id="journey-card-child"
            onClick={() => navigate('/newborn-care')}
            className="bg-gradient-to-br from-sky-700 to-teal-800 text-white rounded-2xl p-5 shadow-sm active:scale-[0.99] transition-transform cursor-pointer relative overflow-hidden"
          >
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
              <Baby className="w-48 h-48 translate-x-8 translate-y-8" />
            </div>
            <p className="text-sky-200 text-xs font-bold uppercase tracking-wider mb-1">
              Child Health Profile
            </p>
            <h2 className="text-2xl font-bold mb-1">
              {activeMember?.displayName}
            </h2>
            <p className="text-sky-100 text-sm mb-3">
              {getChildAgeText(activeChild?.dateOfBirth)} • {activeChild?.currentWeightKg ? `${activeChild.currentWeightKg} kg` : 'Growth monitoring active'}
            </p>
            
            <div className="bg-sky-900/50 rounded-xl p-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-sky-200 block">Next EPI Vaccination</span>
                <span className="font-bold text-white text-sm">
                  {nextVaccine ? nextVaccine.vaccineName : 'Infancy schedule up to date'}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-sky-200" />
            </div>
          </div>
        )}

        {/* 1. TODAY'S PERSONALIZED CARE SUMMARY CARD */}
        {careSummary && (
          <div id="today-care-summary-card" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Today's Care Summary
                </h3>
              </div>
              <button
                id="listen-today-summary-btn"
                onClick={handleListenSummary}
                className={cn(
                  "p-2 rounded-full border transition-colors flex items-center gap-1 text-xs font-medium",
                  isAiSpeaking
                    ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:border-red-800"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600"
                )}
                title="Listen to summary"
              >
                {isAiSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span className="text-[11px]">{isAiSpeaking ? 'Stop' : 'Listen'}</span>
              </button>
            </div>

            {/* Metrics Pills Grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-800 text-center">
                <span className="block text-xl font-bold text-emerald-700 dark:text-emerald-300">
                  {careSummary.dueTodayCount}
                </span>
                <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                  Due Today
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 text-center">
                <span className="block text-xl font-bold text-slate-700 dark:text-slate-200">
                  {careSummary.upcomingCount}
                </span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Upcoming
                </span>
              </div>
              <div className={cn(
                "p-3 rounded-xl border text-center",
                careSummary.overdueCount > 0
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                  : "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
              )}>
                <span className={cn(
                  "block text-xl font-bold",
                  careSummary.overdueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-200"
                )}>
                  {careSummary.overdueCount}
                </span>
                <span className="text-[11px] font-medium">
                  Past Schedule
                </span>
              </div>
            </div>

            {/* Narrative text description */}
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-700/30 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
              {careSummary.deterministicSummaryText}
            </p>
          </div>
        )}

        {/* 2. OVERDUE CARE NOTICE (Calm, reassuring, non-alarming) */}
        {(overdueCareEvents.length > 0 || overdueVaccines.length > 0) && (
          <div id="overdue-care-card" className="bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-1">
                  Care Milestones Past Schedule ({overdueCareEvents.length + overdueVaccines.length})
                </h4>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed mb-3">
                  Under GHS protocols, routine care visits and vaccinations can usually be safely caught up. Please do not worry. Attend your local clinic or contact your Community Health Nurse to update your schedule.
                </p>

                {overdueCareEvents[0] && (
                  <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-xl border border-amber-200/80 dark:border-amber-700/60 mb-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {overdueCareEvents[0].title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Scheduled date: {new Date(overdueCareEvents[0].scheduledAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        id="overdue-learn-more-btn"
                        onClick={() => openExplanation({ event: overdueCareEvents[0] }, 'importance')}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                      >
                        Learn why it matters
                      </button>
                      <button
                        id="overdue-what-to-do-btn"
                        onClick={() => openExplanation({ event: overdueCareEvents[0] }, 'missed')}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        What should I do?
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. TODAY'S CARE PRIORITIES (Deterministic Care Engine) */}
        <div id="todays-care-priorities" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Today's Care Priorities
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {activeMember?.displayName?.split(' ')[0]} • Deterministic GHS Schedule
                </p>
              </div>
            </div>
            {todayCareItems.length > 0 ? (
              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {todayCareItems.length} Due Today
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                All Caught Up
              </span>
            )}
          </div>

          {todayCareItems.length > 0 ? (
            <div className="space-y-2.5 mb-3">
              {todayCareItems.map((item) => (
                <div 
                  key={item.id} 
                  className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
                        {item.category === 'vaccine' ? (
                          <Syringe className="w-4 h-4" />
                        ) : item.category === 'appointment' ? (
                          <Calendar className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{item.detail}</p>
                      </div>
                    </div>
                  </div>

                  {(item.event || item.vaccine || item.reminder) && (
                    <div className="mt-2.5 pt-2 border-t border-emerald-100 dark:border-emerald-800/50 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openExplanation({ event: item.event, vaccine: item.vaccine, reminder: item.reminder }, 'importance')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 hover:bg-emerald-200 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" /> Why this matters
                      </button>
                      <button
                        onClick={() => openExplanation({ event: item.event, vaccine: item.vaccine, reminder: item.reminder }, 'prepare')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white text-slate-700 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <ClipboardList className="w-3 h-3" /> What to prepare
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  No pending care items due today 🎉
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                All routine care visits and milestone reminders for today are completed.
              </p>
            </div>
          )}

          {/* Next upcoming scheduled milestone */}
          {(nextAppointment || nextVaccine || nextCareEvent) && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Next Upcoming Milestone
              </p>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                    {nextAppointment ? (
                      <Calendar className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    ) : nextVaccine ? (
                      <Syringe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {nextAppointment?.title || (nextVaccine ? `Vaccine: ${nextVaccine.vaccineName}` : nextCareEvent?.title)}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {nextAppointment ? (
                        `${nextAppointment.facility} • ${new Date(nextAppointment.scheduledAt).toLocaleDateString()}`
                      ) : nextVaccine ? (
                        `Target: ${nextVaccine.targetAgeWeeks} weeks • Due ${new Date(nextVaccine.scheduledDate).toLocaleDateString()}`
                      ) : (
                        `Due: ${new Date(nextCareEvent!.scheduledAt).toLocaleDateString()}`
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {(nextCareEvent || nextVaccine) && (
                <div className="mt-2.5 pt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    id="next-action-why-matters"
                    onClick={() =>
                      openExplanation(
                        { event: nextCareEvent, vaccine: nextVaccine },
                        'importance'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" /> Why this matters
                  </button>
                  <button
                    id="next-action-prepare"
                    onClick={() =>
                      openExplanation(
                        { event: nextCareEvent, vaccine: nextVaccine },
                        'prepare'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <ClipboardList className="w-3 h-3" /> What to prepare
                  </button>
                  <button
                    id="next-action-ask-midwife"
                    onClick={() =>
                      openExplanation(
                        { event: nextCareEvent, vaccine: nextVaccine },
                        'questions'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" /> Questions to ask
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. AI CARE COMPANION PROMPT SHORTCUTS */}
        <div id="ai-companion-card" className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm">NurtureAI Care Companion</h3>
                <p className="text-slate-400 text-xs">Offline GHS guidelines & health education</p>
              </div>
            </div>
            <button
              id="open-assistant-btn"
              onClick={() => navigate('/ai-assistant')}
              className="text-xs text-yellow-400 font-semibold flex items-center gap-1 hover:underline"
            >
              Open Chat <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-300 mb-2">Suggested questions for {activeMember?.displayName}:</p>
          <div className="flex flex-wrap gap-1.5">
            {isMother ? (
              <>
                <button
                  id="prompt-chip-due-today"
                  onClick={() => {
                    navigate('/ai-assistant');
                    useAiStore.getState().sendMessage({
                      message: "What care is due today for my pregnancy?",
                      activeMember,
                      preferredLanguage: currentLanguage
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  What is due today?
                </button>
                <button
                  id="prompt-chip-next-anc"
                  onClick={() => {
                    navigate('/ai-assistant');
                    useAiStore.getState().sendMessage({
                      message: "When is my next ANC visit and what should I expect?",
                      activeMember,
                      preferredLanguage: currentLanguage
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  When is my next ANC visit?
                </button>
                <button
                  id="prompt-chip-iptp"
                  onClick={() => {
                    navigate('/ai-assistant');
                    useAiStore.getState().sendMessage({
                      message: "Why is IPTp malaria treatment recommended during pregnancy?",
                      activeMember,
                      preferredLanguage: currentLanguage
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Why is IPTp malaria treatment important?
                </button>
              </>
            ) : (
              <>
                <button
                  id="prompt-chip-next-vaccine"
                  onClick={() => {
                    navigate('/ai-assistant');
                    useAiStore.getState().sendMessage({
                      message: `What is ${activeMember?.displayName}'s next scheduled vaccine?`,
                      activeMember,
                      preferredLanguage: currentLanguage
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  What is my baby's next vaccine?
                </button>
                <button
                  id="prompt-chip-weighing"
                  onClick={() => {
                    navigate('/ai-assistant');
                    useAiStore.getState().sendMessage({
                      message: "What should I bring to the child weighing session?",
                      activeMember,
                      preferredLanguage: currentLanguage
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  What to bring to weighing?
                </button>
                <button
                  id="prompt-chip-feeding"
                  onClick={() => {
                    navigate('/ai-assistant');
                    useAiStore.getState().sendMessage({
                      message: "What are GHS guidelines on exclusive breastfeeding?",
                      activeMember,
                      preferredLanguage: currentLanguage
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Exclusive breastfeeding advice
                </button>
              </>
            )}
          </div>
        </div>

        {/* 5. CARE MODULES GRID */}
        <div className="pt-2">
          <h2 className="font-bold text-slate-900 dark:text-white text-base mb-3">Care Modules</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickCareTile 
              id="tile-pregnancy-care"
              title="Pregnancy Care" 
              subtitle="ANC & Maternal Health"
              icon={<Droplet className="w-5 h-5 text-emerald-700" />}
              bgColor="bg-emerald-50 border-emerald-100"
              onClick={() => navigate('/pregnancy-care')}
            />
            <QuickCareTile 
              id="tile-newborn-care"
              title="Newborn Care" 
              subtitle="Feeding & Sleep Tracking"
              icon={<Baby className="w-5 h-5 text-sky-700" />}
              bgColor="bg-sky-50 border-sky-100"
              onClick={() => navigate('/newborn-care')}
            />
            <QuickCareTile 
              id="tile-under-5-care"
              title="Under-5 Care" 
              subtitle="Growth & Milestones"
              icon={<Activity className="w-5 h-5 text-emerald-700" />}
              bgColor="bg-emerald-50 border-emerald-100"
              onClick={() => navigate('/under-5-care')}
            />
            <QuickCareTile 
              id="tile-vaccination"
              title="Vaccination" 
              subtitle="GHS EPI Schedule"
              icon={<Syringe className="w-5 h-5 text-sky-700" />}
              bgColor="bg-sky-50 border-sky-100"
              onClick={() => navigate('/vaccination')}
            />
          </div>
        </div>

        {/* 6. FAMILY CARE OVERVIEW (Isolated, safe cross-profile status) */}
        {familyMembers.length > 1 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <FamilyCareOverview
              familyMembers={familyMembers}
              activeMemberId={activeMember?.id || null}
              onSelectMember={handleProfileSwitch}
              careEvents={careEvents}
              vaccinations={vaccinationRecords}
              reminders={reminders}
            />
          </div>
        )}
      </div>

      {/* Interactive Explanation Dialog */}
      <CareEventExplanationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        event={selectedEvent}
        vaccine={selectedVaccine}
        reminder={selectedReminder}
        activeMember={activeMember}
        language={currentLanguage}
        initialAction={modalAction}
      />
    </div>
  );
};

interface QuickCareTileProps {
  id?: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bgColor: string;
  onClick: () => void;
}

const QuickCareTile = ({ id, title, subtitle, icon, bgColor, onClick }: QuickCareTileProps) => (
  <div 
    id={id}
    onClick={onClick}
    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex flex-col gap-2.5 active:bg-slate-50 dark:active:bg-slate-700/50 transition-colors cursor-pointer shadow-xs hover:border-slate-300"
  >
    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border", bgColor)}>
      {icon}
    </div>
    <div>
      <span className="font-semibold text-slate-900 dark:text-white text-sm leading-tight block">{title}</span>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight mt-0.5">{subtitle}</span>
    </div>
  </div>
);

export default Home;
