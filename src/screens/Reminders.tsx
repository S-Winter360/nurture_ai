import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Bell, CheckCircle2, Circle, 
  Plus, Calendar, Volume2, VolumeX, Check,
  Clock, AlertCircle, RefreshCw, Trash2, ChevronDown, 
  Sparkles, Globe
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '../components/Layout';
import { reminderScheduler } from '../services/reminders/reminderScheduler';
import { ReminderCategoryGroup, ReminderItem } from '../services/reminders/reminderTypes';
import { SUPPORTED_LANGUAGES, SupportedLanguage, Reminder } from '../types';
import { CareEventExplanationModal } from '../components/CareEventExplanationModal';

const Reminders = () => {
  const navigate = useNavigate();

  const familyMembers = useAppStore((state) => state.familyMembers);
  const careEvents = useAppStore((state) => state.careEvents);
  const reminders = useAppStore((state) => state.reminders);
  const preferences = useAppStore((state) => state.preferences);
  const toggleReminder = useAppStore((state) => state.toggleReminder);
  const snoozeReminder = useAppStore((state) => state.snoozeReminder);
  const dismissReminder = useAppStore((state) => state.dismissReminder);
  const createCustomReminder = useAppStore((state) => state.createCustomReminder);
  const speakReminder = useAppStore((state) => state.speakReminder);
  const stopSpeech = useAppStore((state) => state.stopSpeech);
  const isSpeaking = useAppStore((state) => state.isSpeaking);

  const [filterMemberId, setFilterMemberId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'overdue' | 'today' | 'upcoming' | 'completed'>('all');
  const [playingReminderId, setPlayingReminderId] = useState<string | null>(null);

  const [categories, setCategories] = useState<ReminderCategoryGroup>({
    overdue: [],
    dueToday: [],
    upcoming: [],
    completed: []
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [selectedCareEventId, setSelectedCareEventId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [selectedLeadTime, setSelectedLeadTime] = useState<number>(60);
  const [snoozeMenuOpenId, setSnoozeMenuOpenId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedReminderForExplanation, setSelectedReminderForExplanation] = useState<ReminderItem | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const currentLanguage = preferences?.preferredLanguage || 'en';
  const languageInfo = SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage);

  // Evaluate reminders and update categories
  const refreshCategories = async () => {
    const res = await reminderScheduler.evaluateReminders({
      memberId: filterMemberId,
      targetLanguage: currentLanguage
    });
    setCategories(res);
  };

  useEffect(() => {
    refreshCategories();
  }, [reminders, filterMemberId, currentLanguage]);

  const handleToggleComplete = async (id: string) => {
    await toggleReminder(id);
    await refreshCategories();
    showToast('Care reminder updated');
  };

  const handleSnooze = async (id: string, minutes: number) => {
    await snoozeReminder(id, minutes);
    setSnoozeMenuOpenId(null);
    await refreshCategories();
    showToast(`Reminder snoozed for ${minutes >= 60 ? `${minutes / 60} hour(s)` : `${minutes} minutes`}`);
  };

  const handleDismiss = async (id: string) => {
    await dismissReminder(id);
    await refreshCategories();
    showToast('Reminder dismissed');
  };

  const handleSpeak = async (item: ReminderItem) => {
    if (isSpeaking && playingReminderId === item.id) {
      stopSpeech();
      setPlayingReminderId(null);
      return;
    }

    setPlayingReminderId(item.id);
    try {
      await speakReminder(item.id, currentLanguage);
    } finally {
      setPlayingReminderId(null);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !selectedCareEventId || !reminderDate) return;

    await createCustomReminder(selectedCareEventId, customTitle.trim(), reminderDate);
    setIsAddOpen(false);
    setCustomTitle('');
    setSelectedCareEventId('');
    setReminderDate('');
    await refreshCategories();
    showToast('Care reminder scheduled');
  };

  const totalCount = categories.overdue.length + categories.dueToday.length + categories.upcoming.length + categories.completed.length;

  return (
    <div className="flex flex-col min-h-full pb-16 bg-slate-50">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-teal-700 text-white px-4 pt-6 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full bg-teal-800 flex items-center justify-center text-white active:bg-teal-900"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-teal-200 text-[11px] font-semibold uppercase tracking-wider block">
                Care-Event Engine
              </span>
              <h1 className="text-xl font-bold">Intelligent Reminders</h1>
            </div>
          </div>
          
          <button
            onClick={() => {
              if (careEvents.length > 0) {
                setSelectedCareEventId(careEvents[0].id);
              }
              setIsAddOpen(true);
            }}
            className="w-9 h-9 bg-teal-800 hover:bg-teal-600 rounded-full flex items-center justify-center text-white shadow"
            title="Add Custom Reminder"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Local Voice Language Banner */}
        <div className="bg-teal-800/80 rounded-xl p-2.5 mb-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-200 flex-shrink-0" />
            <div>
              <span className="text-teal-100 font-medium">Voice Language: </span>
              <span className="font-bold text-white">{languageInfo?.displayName || 'English'}</span>
              <span className="text-teal-200 text-[11px] ml-1">({languageInfo?.nativeName})</span>
            </div>
          </div>
          <button 
            onClick={() => navigate('/profile')}
            className="text-[10px] font-semibold bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded"
          >
            Change
          </button>
        </div>

        {/* Member Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setFilterMemberId('all')}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold transition-all flex-shrink-0",
              filterMemberId === 'all'
                ? "bg-white text-teal-800 shadow"
                : "bg-teal-800/80 text-teal-100 hover:bg-teal-800"
            )}
          >
            All Members ({totalCount})
          </button>
          {familyMembers.map((member) => (
            <button
              key={member.id}
              onClick={() => setFilterMemberId(member.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-all flex-shrink-0",
                filterMemberId === member.id
                  ? "bg-white text-teal-800 shadow"
                  : "bg-teal-800/80 text-teal-100 hover:bg-teal-800"
              )}
            >
              {member.displayName}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-4 overflow-x-auto no-scrollbar text-xs font-bold">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "py-3 border-b-2 transition-colors flex-shrink-0",
            activeTab === 'all' ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          className={cn(
            "py-3 border-b-2 transition-colors flex-shrink-0 flex items-center gap-1.5",
            activeTab === 'overdue' ? "border-amber-600 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <span>Overdue</span>
          {categories.overdue.length > 0 && (
            <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full">
              {categories.overdue.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('today')}
          className={cn(
            "py-3 border-b-2 transition-colors flex-shrink-0 flex items-center gap-1.5",
            activeTab === 'today' ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <span>Due Today</span>
          {categories.dueToday.length > 0 && (
            <span className="bg-teal-100 text-teal-800 text-[10px] px-1.5 py-0.2 rounded-full">
              {categories.dueToday.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={cn(
            "py-3 border-b-2 transition-colors flex-shrink-0",
            activeTab === 'upcoming' ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Upcoming ({categories.upcoming.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={cn(
            "py-3 border-b-2 transition-colors flex-shrink-0",
            activeTab === 'completed' ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Completed ({categories.completed.length})
        </button>
      </div>

      {/* Reminders Content */}
      <div className="px-4 py-4 space-y-5">
        {/* Section 1: Overdue Reminders */}
        {(activeTab === 'all' || activeTab === 'overdue') && categories.overdue.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-amber-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Overdue Care Events ({categories.overdue.length})
              </h2>
            </div>

            <div className="space-y-2.5">
              {categories.overdue.map((item) => (
                <ReminderCard
                  key={item.id}
                  item={item}
                  familyMembers={familyMembers}
                  isPlaying={playingReminderId === item.id}
                  onToggle={() => handleToggleComplete(item.id)}
                  onSpeak={() => handleSpeak(item)}
                  onSnooze={(mins) => handleSnooze(item.id, mins)}
                  onDismiss={() => handleDismiss(item.id)}
                  onExplain={() => setSelectedReminderForExplanation(item)}
                  snoozeMenuOpen={snoozeMenuOpenId === item.id}
                  setSnoozeMenuOpen={(open) => setSnoozeMenuOpenId(open ? item.id : null)}
                  borderColor="border-amber-300 bg-amber-50/40"
                  badgeText="Overdue"
                  badgeColor="bg-amber-100 text-amber-800"
                />
              ))}
            </div>
          </div>
        )}

        {/* Section 2: Due Today */}
        {(activeTab === 'all' || activeTab === 'today') && categories.dueToday.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Due Today ({categories.dueToday.length})
            </h2>

            <div className="space-y-2.5">
              {categories.dueToday.map((item) => (
                <ReminderCard
                  key={item.id}
                  item={item}
                  familyMembers={familyMembers}
                  isPlaying={playingReminderId === item.id}
                  onToggle={() => handleToggleComplete(item.id)}
                  onSpeak={() => handleSpeak(item)}
                  onSnooze={(mins) => handleSnooze(item.id, mins)}
                  onDismiss={() => handleDismiss(item.id)}
                  onExplain={() => setSelectedReminderForExplanation(item)}
                  snoozeMenuOpen={snoozeMenuOpenId === item.id}
                  setSnoozeMenuOpen={(open) => setSnoozeMenuOpenId(open ? item.id : null)}
                  borderColor="border-teal-300 bg-teal-50/30"
                  badgeText="Due Today"
                  badgeColor="bg-teal-100 text-teal-800"
                />
              ))}
            </div>
          </div>
        )}

        {/* Section 3: Upcoming */}
        {(activeTab === 'all' || activeTab === 'upcoming') && categories.upcoming.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Upcoming Scheduled ({categories.upcoming.length})
            </h2>

            <div className="space-y-2.5">
              {categories.upcoming.map((item) => (
                <ReminderCard
                  key={item.id}
                  item={item}
                  familyMembers={familyMembers}
                  isPlaying={playingReminderId === item.id}
                  onToggle={() => handleToggleComplete(item.id)}
                  onSpeak={() => handleSpeak(item)}
                  onSnooze={(mins) => handleSnooze(item.id, mins)}
                  onDismiss={() => handleDismiss(item.id)}
                  onExplain={() => setSelectedReminderForExplanation(item)}
                  snoozeMenuOpen={snoozeMenuOpenId === item.id}
                  setSnoozeMenuOpen={(open) => setSnoozeMenuOpenId(open ? item.id : null)}
                  borderColor="border-slate-200 bg-white"
                  badgeText="Scheduled"
                  badgeColor="bg-slate-100 text-slate-600"
                />
              ))}
            </div>
          </div>
        )}

        {/* Section 4: Completed */}
        {(activeTab === 'all' || activeTab === 'completed') && categories.completed.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Completed Reminders ({categories.completed.length})
            </h2>

            <div className="space-y-2">
              {categories.completed.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between opacity-75"
                >
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => handleToggleComplete(item.id)} title="Mark uncompleted">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </button>
                    <div>
                      <span className="text-xs text-slate-600 line-through font-medium block">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.scheduledAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDismiss(item.id)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                    title="Delete record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">All Care Tasks Completed</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              No pending reminders found for this profile. Use the + button above to schedule a custom reminder.
            </p>
          </div>
        )}
      </div>

      {/* Add Reminder Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl">
            <h3 className="font-bold text-slate-900 text-base mb-3">Schedule Care Reminder</h3>
            <form onSubmit={handleAddReminder} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Reminder Title</label>
                <input 
                  type="text" 
                  value={customTitle} 
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Bring Maternal Health Record Book"
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Link to Care Event</label>
                <select 
                  value={selectedCareEventId} 
                  onChange={(e) => setSelectedCareEventId(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                  required
                >
                  {careEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({new Date(e.scheduledAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Date & Time</label>
                <input 
                  type="datetime-local" 
                  value={reminderDate} 
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Reminder Lead Time</label>
                <select 
                  value={selectedLeadTime} 
                  onChange={(e) => setSelectedLeadTime(parseInt(e.target.value))}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                >
                  <option value={15}>15 Minutes Before</option>
                  <option value={60}>1 Hour Before</option>
                  <option value={180}>3 Hours Before</option>
                  <option value={720}>12 Hours Before</option>
                  <option value={1440}>1 Day Before (24 Hours)</option>
                  <option value={2880}>2 Days Before (48 Hours)</option>
                  <option value={10080}>1 Week Before</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 text-xs font-bold text-white bg-teal-700 rounded-xl hover:bg-teal-800"
                >
                  Schedule Reminder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Explanation Modal */}
      {selectedReminderForExplanation && (
        <CareEventExplanationModal
          isOpen={!!selectedReminderForExplanation}
          onClose={() => setSelectedReminderForExplanation(null)}
          reminder={selectedReminderForExplanation}
          activeMember={familyMembers.find((m) => m.id === selectedReminderForExplanation.familyMemberId)}
          language={currentLanguage}
          initialAction="importance"
        />
      )}
    </div>
  );
};

interface ReminderCardProps {
  item: ReminderItem;
  familyMembers: any[];
  isPlaying: boolean;
  onToggle: () => void;
  onSpeak: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
  onExplain?: () => void;
  snoozeMenuOpen: boolean;
  setSnoozeMenuOpen: (open: boolean) => void;
  borderColor: string;
  badgeText: string;
  badgeColor: string;
}

const ReminderCard = ({
  item,
  familyMembers,
  isPlaying,
  onToggle,
  onSpeak,
  onSnooze,
  onDismiss,
  onExplain,
  snoozeMenuOpen,
  setSnoozeMenuOpen,
  borderColor,
  badgeText,
  badgeColor
}: ReminderCardProps) => {
  const member = familyMembers.find((m) => m.id === item.familyMemberId);

  return (
    <div className={cn("p-3.5 rounded-2xl border shadow-sm transition-all", borderColor)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <button
            onClick={onToggle}
            className="mt-0.5 text-slate-300 hover:text-teal-600 transition-colors"
            title="Mark Completed"
          >
            <Circle className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-100 px-1.5 py-0.2 rounded">
                {member?.displayName || 'Family'}
              </span>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.2 rounded", badgeColor)}>
                {badgeText}
              </span>
            </div>

            <h3 className="text-xs font-bold text-slate-900 mt-1">
              {item.title}
            </h3>

            {item.description && (
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                {item.description}
              </p>
            )}

            <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(item.scheduledAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {item.leadTimeMinutes >= 60 ? `${item.leadTimeMinutes / 60}h lead` : `${item.leadTimeMinutes}m lead`}
              </span>
            </div>

            {onExplain && (
              <button
                type="button"
                onClick={onExplain}
                className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                <Sparkles className="w-3 h-3 text-emerald-600" />
                Why this matters
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={onSpeak}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm",
              isPlaying
                ? "bg-teal-700 text-white animate-pulse"
                : "bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700"
            )}
            title={isPlaying ? "Stop Voice" : "Play Local Voice Guidance"}
          >
            <Volume2 className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setSnoozeMenuOpen(!snoozeMenuOpen)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-semibold flex items-center gap-1"
              title="Snooze reminder"
            >
              <span>Snooze</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {snoozeMenuOpen && (
              <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1 w-28 text-[11px] space-y-0.5">
                <button
                  onClick={() => onSnooze(15)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 font-medium text-slate-700"
                  aria-label="Snooze 15 minutes"
                >
                  15 Minutes
                </button>
                <button
                  onClick={() => onSnooze(30)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 font-medium text-slate-700"
                  aria-label="Snooze 30 minutes"
                >
                  30 Minutes
                </button>
                <button
                  onClick={() => onSnooze(60)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 font-medium text-slate-700"
                  aria-label="Snooze 1 hour"
                >
                  1 Hour
                </button>
                <button
                  onClick={() => onSnooze(1440)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 font-medium text-slate-700"
                  aria-label="Snooze 1 day"
                >
                  1 Day
                </button>
                <button
                  onClick={onDismiss}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-red-50 font-medium text-red-600 border-t border-slate-100"
                  aria-label="Dismiss reminder"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reminders;
