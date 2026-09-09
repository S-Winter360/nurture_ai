import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  HelpCircle,
  ClipboardList,
  MessageSquare,
  AlertCircle,
  Volume2,
  VolumeX,
  CheckCircle2,
  ShieldAlert,
  Calendar,
  Clock,
  BookOpen
} from 'lucide-react';
import { CareEvent, VaccinationRecord, Reminder, FamilyMember, SupportedLanguage } from '../types';
import { ReminderItem } from '../services/reminders/reminderTypes';
import { aiCareCompanionService } from '../services/ai/AiCareCompanionService';
import { voiceConversationService } from '../services/voice/VoiceConversationService';
import { CareExplanationActionType, AiAgentResponse } from '../services/ai/types';

interface CareEventExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: CareEvent | null;
  vaccine?: VaccinationRecord | null;
  reminder?: Reminder | ReminderItem | null;
  activeMember?: FamilyMember;
  language?: SupportedLanguage;
  initialAction?: CareExplanationActionType;
}

export const CareEventExplanationModal: React.FC<CareEventExplanationModalProps> = ({
  isOpen,
  onClose,
  event,
  vaccine,
  reminder,
  activeMember,
  language = 'en',
  initialAction = 'importance'
}) => {
  const [selectedAction, setSelectedAction] = useState<CareExplanationActionType>(initialAction);
  const [response, setResponse] = useState<AiAgentResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Subscribe to speech state
  useEffect(() => {
    const unsubscribe = voiceConversationService.subscribe((state) => {
      setIsSpeaking(state.isSpeaking);
    });
    return () => unsubscribe();
  }, []);

  // Update selected action if initialAction changes
  useEffect(() => {
    if (initialAction) {
      setSelectedAction(initialAction);
    }
  }, [initialAction, event?.id, vaccine?.id, reminder?.id]);

  // Fetch explanation when action or subject changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setResponse(null);

    const loadExplanation = async () => {
      try {
        let res: AiAgentResponse | null = null;
        if (event) {
          res = await aiCareCompanionService.explainCareEvent({
            event,
            actionType: selectedAction,
            member: activeMember,
            language
          });
        } else if (vaccine) {
          res = await aiCareCompanionService.explainVaccine({
            vaccine,
            actionType: selectedAction === 'questions' ? 'importance' : selectedAction,
            member: activeMember,
            language
          });
        } else if (reminder) {
          res = await aiCareCompanionService.explainReminder({
            reminder,
            member: activeMember,
            language
          });
        }

        if (isMounted) {
          setResponse(res);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadExplanation();

    return () => {
      isMounted = false;
      voiceConversationService.stopAssistantSpeech();
    };
  }, [isOpen, selectedAction, event, vaccine, reminder, activeMember, language]);

  if (!isOpen || (!event && !vaccine && !reminder)) return null;

  const title = event?.title || vaccine?.vaccineName || reminder?.title || 'Care Milestone';
  const scheduledDate = event?.scheduledAt || vaccine?.scheduledDate || reminder?.scheduledAt || '';
  const dateFormatted = scheduledDate ? new Date(scheduledDate).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : '';

  const isOverdue =
    event?.status === 'missed' ||
    vaccine?.status === 'overdue' ||
    (scheduledDate && new Date(scheduledDate).getTime() < Date.now() && (event?.status === 'pending' || vaccine?.status === 'scheduled'));

  const handleSpeakToggle = () => {
    if (isSpeaking) {
      voiceConversationService.stopAssistantSpeech();
    } else if (response?.text) {
      voiceConversationService.speakResponse(response.text, language);
    }
  };

  const checklistItems = aiCareCompanionService.generatePreparationChecklist(
    event?.type || (vaccine ? 'vaccination' : 'routine'),
    title
  );

  const consultationQuestions = aiCareCompanionService.generateHealthWorkerQuestions(title);

  return (
    <div
      id="care-explanation-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="care-explanation-modal-container"
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-start justify-between">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white uppercase tracking-wider">
                Ghana Health Service (GHS)
              </span>
              {isOverdue && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Past Schedule
                </span>
              )}
            </div>
            <h2 id="care-explanation-modal-title" className="text-xl font-bold tracking-tight">
              {title}
            </h2>
            {dateFormatted && (
              <p className="text-sm text-emerald-100 flex items-center gap-1.5 mt-1">
                <Calendar className="w-4 h-4" /> Scheduled Date: {dateFormatted}
              </p>
            )}
          </div>
          <button
            id="close-explanation-modal-btn"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2 gap-2 overflow-x-auto">
          <button
            id="tab-why-important"
            onClick={() => setSelectedAction('importance')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
              selectedAction === 'importance'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" /> Why this matters
          </button>
          <button
            id="tab-what-to-prepare"
            onClick={() => setSelectedAction('prepare')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
              selectedAction === 'prepare'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> What to prepare
          </button>
          <button
            id="tab-questions-to-ask"
            onClick={() => setSelectedAction('questions')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
              selectedAction === 'questions'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Questions to ask
          </button>
          <button
            id="tab-missed-care"
            onClick={() => setSelectedAction('missed')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
              selectedAction === 'missed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <HelpCircle className="w-4 h-4" /> What if I miss it?
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Overdue Non-Alarming Reassurance Notice */}
          {isOverdue && selectedAction === 'missed' && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-200">
                <p className="font-semibold mb-1">Supportive Care Reminder</p>
                <p>
                  If you missed this visit or milestone, please do not feel discouraged. Missing an appointment does not mean you have to restart care from the beginning. Visit your local health post or Community Health Officer (CHO) at your earliest convenience to catch up safely.
                </p>
              </div>
            </div>
          )}

          {/* AI / Deterministic Explanation Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  NurtureAI Companion Explanation
                </span>
              </div>
              <button
                id="listen-explanation-btn"
                onClick={handleSpeakToggle}
                disabled={isLoading || !response}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isSpeaking
                    ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" /> Stop Listening
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" /> Listen
                  </>
                )}
              </button>
            </div>

            {isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-500 gap-2">
                <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-medium">Generating verified GHS explanation...</p>
              </div>
            ) : response ? (
              <div className="space-y-3">
                <p className="text-sm md:text-base text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line">
                  {response.text}
                </p>
                <div className="flex items-center gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Protocol Source: {response.sourceMetadata}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 ml-auto">
                    {response.origin}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Explanation could not be loaded.</p>
            )}
          </div>

          {/* Section: What to prepare checklist */}
          {selectedAction === 'prepare' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-600" /> Preparation Checklist
              </h3>
              <ul className="space-y-2">
                {checklistItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Suggested questions to ask */}
          {selectedAction === 'questions' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" /> Suggested Questions for Your Consultation
              </h3>
              <div className="space-y-2">
                {consultationQuestions.map((q, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                    "{q}"
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            For personal medical diagnosis or treatment, always consult your midwife or healthcare provider.
          </p>
          <button
            id="close-explanation-dialog-footer"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
