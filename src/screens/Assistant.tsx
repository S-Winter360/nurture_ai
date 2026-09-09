import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, Send, ShieldAlert, Bot, Mic, MicOff,
  User, Volume2, VolumeX, Globe, CheckCircle2, AlertTriangle,
  RefreshCw, Download, ShieldCheck, X, ChevronRight, Info,
  Trash2, ArrowRight, Copy, Check, PhoneCall, RotateCcw,
  HardDrive, Wifi, Radio
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useAiStore } from '../stores/useAiStore';
import { AiContextBuilder } from '../services/ai/AiContextBuilder';
import { speechRecognitionService } from '../services/voice/SpeechRecognitionService';
import { voiceConversationService } from '../services/voice/VoiceConversationService';
import { localSpeechService } from '../services/speech/localSpeechService';
import { SUPPORTED_LANGUAGES, SupportedLanguage, ModelDownloadPolicy } from '../types';
import { cn } from '../components/Layout';

// Subcomponent: Formats message content with markdown-like structure without external HTML injection
const FormattedMessageContent: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  if (isUser) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  // Split into paragraphs/lines
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let listType: 'bullet' | 'number' | null = null;

  const flushList = () => {
    if (currentList.length > 0 && listType) {
      if (listType === 'bullet') {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-1.5 space-y-1 pl-4 list-disc marker:text-teal-600">
            {currentList.map((item, idx) => (
              <li key={idx} className="pl-0.5 text-xs text-slate-800 leading-relaxed">{renderStyledText(item)}</li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-1.5 space-y-1 pl-4 list-decimal marker:text-teal-600 marker:font-semibold">
            {currentList.map((item, idx) => (
              <li key={idx} className="pl-0.5 text-xs text-slate-800 leading-relaxed">{renderStyledText(item)}</li>
            ))}
          </ol>
        );
      }
      currentList = [];
      listType = null;
    }
  };

  const renderStyledText = (txt: string) => {
    // Process bold segments **text**
    const parts = txt.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    // Bullet list detection
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      if (listType !== 'bullet') flushList();
      listType = 'bullet';
      currentList.push(trimmed.replace(/^(\* |- |• )/, ''));
      return;
    }

    // Numbered list detection
    const numMatch = trimmed.match(/^\d+[\.\)]\s+(.*)/);
    if (numMatch) {
      if (listType !== 'number') flushList();
      listType = 'number';
      currentList.push(numMatch[1]);
      return;
    }

    // Not a list item
    flushList();

    // Check for warning callouts
    if (trimmed.startsWith('⚠️') || trimmed.toUpperCase().startsWith('WARNING:') || trimmed.toUpperCase().startsWith('NOTE:')) {
      elements.push(
        <div key={`warn-${idx}`} className="my-2 p-2.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg text-amber-900 text-xs flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>{renderStyledText(trimmed)}</div>
        </div>
      );
      return;
    }

    elements.push(
      <p key={`p-${idx}`} className="my-1 text-xs text-slate-800 leading-relaxed">
        {renderStyledText(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-0.5">{elements}</div>;
};

const Assistant = () => {
  const navigate = useNavigate();

  // App store context
  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const pregnancyProfiles = useAppStore((state) => state.pregnancyProfiles);
  const childProfiles = useAppStore((state) => state.childProfiles);
  const careEvents = useAppStore((state) => state.careEvents);
  const vaccinationRecords = useAppStore((state) => state.vaccinationRecords);
  const reminders = useAppStore((state) => state.reminders);
  const preferences = useAppStore((state) => state.preferences);
  const setModelDownloadPolicy = useAppStore((state) => state.setModelDownloadPolicy);

  const activeMember = familyMembers.find((m) => m.id === activeMemberId) || familyMembers[0];
  const isMother = activeMember?.type === 'mother';
  const activePregnancy = isMother ? pregnancyProfiles.find((p) => p.familyMemberId === activeMember?.id) : undefined;
  const activeChild = !isMother ? childProfiles.find((c) => c.familyMemberId === activeMember?.id) : undefined;

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === preferences?.preferredLanguage) || SUPPORTED_LANGUAGES[0];

  // AI Store State & Actions
  const messages = useAiStore((state) => state.messages);
  const isGenerating = useAiStore((state) => state.isGenerating);
  const isListening = useAiStore((state) => state.isListening);
  const isSpeaking = useAiStore((state) => state.isSpeaking);
  const speechState = useAiStore((state) => state.speechState);
  const interimTranscript = useAiStore((state) => state.interimTranscript);
  const modelStatus = useAiStore((state) => state.modelStatus);
  const modelProgress = useAiStore((state) => state.modelProgress);
  const activeModel = useAiStore((state) => state.activeModel);
  const voiceMode = useAiStore((state) => state.voiceMode);

  const initializeAiStore = useAiStore((state) => state.initializeAiStore);
  const loadMessagesForMember = useAiStore((state) => state.loadMessagesForMember);
  const sendMessage = useAiStore((state) => state.sendMessage);
  const retryLastMessage = useAiStore((state) => state.retryLastMessage);
  const startVoiceInput = useAiStore((state) => state.startVoiceInput);
  const stopVoiceInput = useAiStore((state) => state.stopVoiceInput);
  const speakMessage = useAiStore((state) => state.speakMessage);
  const stopSpeaking = useAiStore((state) => state.stopSpeaking);
  const clearConversation = useAiStore((state) => state.clearConversation);
  const acquireModel = useAiStore((state) => state.acquireModel);
  const cancelModelAcquisition = useAiStore((state) => state.cancelModelAcquisition);
  const cancelGeneration = useAiStore((state) => state.cancelGeneration);
  const setVoiceMode = useAiStore((state) => state.setVoiceMode);

  // Local state
  const [inputQuery, setInputQuery] = useState('');
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [voiceBannerMessage, setVoiceBannerMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Initialize AI store subscriptions once
  useEffect(() => {
    initializeAiStore();
  }, [initializeAiStore]);

  // Clean up speech recognition and synthesis on tab hide or unmount
  useEffect(() => {
    const handleVisChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        speechRecognitionService.handleVisibilityChange(true);
        voiceConversationService.stopAssistantSpeech();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisChange);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisChange);
      }
      voiceConversationService.stopAssistantSpeech();
      speechRecognitionService.abort();
    };
  }, []);

  // Profile Isolation: Load messages whenever active member changes
  useEffect(() => {
    if (activeMember) {
      loadMessagesForMember(activeMember.id, activeMember.displayName);
    }
  }, [activeMember?.id, loadMessagesForMember]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGenerating, isListening]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputQuery(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // Build current clinical context dynamically
  const buildCurrentContext = (query: string) => {
    return AiContextBuilder.build({
      query,
      member: activeMember,
      pregnancy: activePregnancy,
      child: activeChild,
      careEvents: careEvents.filter(e => e.familyMemberId === activeMember?.id),
      vaccinations: vaccinationRecords.filter(v => v.familyMemberId === activeMember?.id),
      reminders: reminders.filter(r => r.familyMemberId === activeMember?.id)
    });
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputQuery.trim() || isGenerating) return;

    // Barge-in: Interrupt active speech immediately on user send
    if (isSpeaking) {
      stopSpeaking();
    }

    const text = inputQuery.trim();
    setInputQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const context = buildCurrentContext(text);

    await sendMessage({
      message: text,
      activeMember,
      preferredLanguage: currentLang.code,
      clinicalContext: context,
      voiceOutput: voiceMode
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    // 1. Barge-in: If assistant is currently speaking, mic click immediately stops speech and begins listening
    if (isSpeaking) {
      stopSpeaking();
    }

    if (isListening) {
      stopVoiceInput();
      return;
    }

    // Capability check
    if (!speechRecognitionService.isSupported()) {
      setVoiceBannerMessage("Voice input isn't supported on this browser. You can type messages seamlessly.");
      setTimeout(() => setVoiceBannerMessage(null), 4500);
      return;
    }

    startVoiceInput({
      activeMember,
      preferredLanguage: currentLang.code,
      clinicalContext: buildCurrentContext('voice request')
    });
  };

  const handleQuickAction = async (prompt: string) => {
    if (isSpeaking) {
      stopSpeaking();
    }
    const context = buildCurrentContext(prompt);
    await sendMessage({
      message: prompt,
      activeMember,
      preferredLanguage: currentLang.code,
      clinicalContext: context,
      voiceOutput: voiceMode
    });
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedMessageId(id);
        showToast('Message copied to clipboard');
        setTimeout(() => setCopiedMessageId(null), 2500);
      }
    } catch {
      showToast('Unable to copy message');
    }
  };

  const handleRetry = async () => {
    const context = buildCurrentContext('retry request');
    await retryLastMessage({
      activeMember,
      preferredLanguage: currentLang.code,
      clinicalContext: context
    });
  };

  // Get voice capabilities for current language
  const voiceCaps = voiceConversationService.getLanguageCapabilities(currentLang.code);

  // Quick Action Buttons based on profile
  const getQuickQuestions = () => {
    if (isMother) {
      return [
        { label: 'Next ANC Visit', prompt: 'When is my next antenatal care (ANC) visit scheduled?' },
        { label: 'IPTp Malaria', prompt: 'Why is IPTp malaria prevention medicine essential in pregnancy?' },
        { label: 'Iron & Folic Acid', prompt: 'What should I know about daily iron and folic acid?' },
        { label: 'Danger Signs', prompt: 'What critical danger signs in pregnancy require emergency care?' }
      ];
    }
    return [
      { label: 'Next Vaccine', prompt: "When is my child's next scheduled immunization due?" },
      { label: '6-Week Vaccines', prompt: 'What vaccines are administered at 6 weeks under GHS schedule?' },
      { label: 'Exclusive Breastfeeding', prompt: 'Why is exclusive breastfeeding recommended for the first 6 months?' },
      { label: 'Growth Monitoring', prompt: 'How often should I attend child growth monitoring and weighing?' }
    ];
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* 1. Header with Model Status & Voice Controls */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="font-bold text-slate-900 text-sm">NurtureAI Companion</h1>

              {/* Provider Status Pill */}
              <button
                onClick={() => setIsModelModalOpen(true)}
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition-all cursor-pointer",
                  modelStatus === 'ACTIVE'
                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    : modelStatus === 'DOWNLOADING'
                    ? "bg-sky-100 text-sky-800 animate-pulse"
                    : modelStatus === 'VERIFYING'
                    ? "bg-purple-100 text-purple-800 animate-pulse"
                    : modelStatus === 'FAILED' || modelStatus === 'INSUFFICIENT_STORAGE' || modelStatus === 'UNSUPPORTED_DEVICE'
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    : navigator.onLine 
                    ? "bg-blue-100 text-blue-800 hover:bg-blue-200" // Cloud active/connecting
                    : "bg-slate-100 text-slate-800 hover:bg-slate-200" // Offline Fallback
                )}
                title="View AI Model Details & Settings"
                aria-label="View AI Model Details"
              >
                {modelStatus === 'ACTIVE' && <ShieldCheck className="w-3 h-3 text-emerald-600" />}
                {modelStatus === 'DOWNLOADING' && <Download className="w-3 h-3 text-sky-600 animate-bounce" />}
                {modelStatus === 'VERIFYING' && <RefreshCw className="w-3 h-3 text-purple-600 animate-spin" />}
                {modelStatus === 'ACTIVE' 
                  ? 'Local Model Active' 
                  : modelStatus === 'DOWNLOADING' 
                  ? `Downloading ${modelProgress.percentage}%` 
                  : modelStatus === 'VERIFYING' 
                  ? 'Verifying SHA-256' 
                  : modelStatus === 'FAILED' 
                  ? 'Model Alert' 
                  : navigator.onLine
                  ? 'Cloud AI'
                  : 'Offline Care Guidance'}
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Active: <span className="font-semibold text-slate-700">{activeMember?.displayName}</span> • {currentLang.displayName}
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5">
          {/* Voice Output Toggle */}
          <button
            onClick={() => {
              const next = !voiceMode;
              setVoiceMode(next);
              if (!next && isSpeaking) stopSpeaking();
              showToast(next ? 'Spoken voice responses enabled' : 'Spoken voice responses muted');
            }}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
              voiceMode ? "bg-teal-50 text-teal-700 border border-teal-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
            )}
            title={voiceMode ? 'Voice responses active (Click to mute)' : 'Voice responses muted (Click to enable)'}
            aria-label="Toggle spoken audio responses"
          >
            {voiceMode ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Reset Conversation */}
          <button
            onClick={() => setIsClearConfirmOpen(true)}
            className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
            title="Clear Conversation"
            aria-label="Clear chat conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Language & Voice Capabilities Info Bar */}
      <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-1.5 flex items-center justify-between text-[10px] text-slate-600">
        <div className="flex items-center gap-2">
          <Globe className="w-3 h-3 text-teal-600" />
          <span>Language: <strong>{currentLang.displayName}</strong></span>
          <span className="text-slate-300">|</span>
          <span>{voiceCaps.hasTtsVoice ? 'Native Device Voice' : 'Ghana English Voice Engine'}</span>
          {voiceCaps.fallbackNotice && (
            <span className="text-[9px] text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded font-medium" title={voiceCaps.fallbackNotice}>
              Voice Fallback Active
            </span>
          )}
        </div>
        {!currentLang.isVerified && (
          <span className="text-[9px] text-amber-700 font-medium">Regional preference</span>
        )}
      </div>

      {/* Voice Banner Notification (if permission denied or unsupported) */}
      {voiceBannerMessage && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span>{voiceBannerMessage}</span>
          </div>
          <button onClick={() => setVoiceBannerMessage(null)} className="text-amber-700 font-bold p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Speech Bar (Barge-in / Floating Interruption Control) */}
      {isSpeaking && (
        <div className="bg-teal-700 text-white px-4 py-2 flex items-center justify-between text-xs animate-fadeIn shadow-md">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 animate-pulse text-teal-200" />
            <span className="font-medium">NurtureAI is speaking...</span>
          </div>
          <button
            onClick={stopSpeaking}
            className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors"
            aria-label="Stop Speaking"
          >
            <VolumeX className="w-3.5 h-3.5" />
            Stop
          </button>
        </div>
      )}

      {/* 2. Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="p-5 bg-white border border-slate-200 rounded-2xl text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Hello, {activeMember?.displayName}!</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              I am your maternal and child health companion. Ask me questions about antenatal care, Ghana Health Service immunization milestones, or nutrition.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col max-w-[88%]",
                isUser ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div
                className={cn(
                  "p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs relative group transition-all",
                  m.isEmergencyAlert 
                    ? "bg-red-50 border-2 border-red-500 text-red-950 font-medium"
                    : isUser 
                    ? "bg-teal-700 text-white rounded-br-none" 
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                )}
              >
                {/* Emergency Alert Card Presentation */}
                {m.isEmergencyAlert && (
                  <div className="flex items-center gap-2 text-red-700 font-bold text-xs mb-2.5 pb-2 border-b border-red-200">
                    <AlertTriangle className="w-5 h-5 animate-bounce flex-shrink-0" />
                    <div>
                      <div className="text-xs font-black tracking-wide">CRITICAL EMERGENCY DETECTED</div>
                      <div className="text-[10px] font-normal text-red-600">Immediate facility evaluation required</div>
                    </div>
                  </div>
                )}

                {/* Prohibited Action Header */}
                {m.safetyClassification === 'PROHIBITED_ACTION' && (
                  <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px] mb-2 pb-1.5 border-b border-amber-200">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>CLINICAL BOUNDARY NOTICE</span>
                  </div>
                )}
                
                {/* Message Content Formatter */}
                <FormattedMessageContent content={m.content} isUser={isUser} />

                {/* Emergency Action Buttons */}
                {m.isEmergencyAlert && (
                  <div className="mt-3 pt-2.5 border-t border-red-200 space-y-2">
                    <button
                      onClick={() => navigate('/emergency')}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2.5 rounded-xl text-center shadow flex items-center justify-center gap-2 transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Open Emergency Dispatch Center
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href="tel:112"
                        className="bg-red-100 hover:bg-red-200 text-red-900 font-bold text-xs py-2 rounded-xl text-center flex items-center justify-center gap-1 transition-colors"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        Call 112
                      </a>
                      <a
                        href="tel:193"
                        className="bg-red-100 hover:bg-red-200 text-red-900 font-bold text-xs py-2 rounded-xl text-center flex items-center justify-center gap-1 transition-colors"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        Call 193
                      </a>
                    </div>
                  </div>
                )}

                {/* Prohibited Action Navigation Links */}
                {m.safetyClassification === 'PROHIBITED_ACTION' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex gap-2 flex-wrap">
                    <button
                      onClick={() => navigate('/reminders')}
                      className="text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      View Reminders →
                    </button>
                    {isMother ? (
                      <button
                        onClick={() => navigate('/pregnancy')}
                        className="text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Pregnancy Care →
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate('/vaccination')}
                        className="text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Vaccination Tracker →
                      </button>
                    )}
                  </div>
                )}

                {/* Source Citation & Actions Bar */}
                {!isUser && (
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Source:</span>
                      <span className="font-medium text-slate-700">
                        {m.citation || 'Ghana Health Service Protocols'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Copy message button */}
                      <button
                        onClick={() => handleCopyMessage(m.id, m.content)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="Copy message"
                        aria-label="Copy response to clipboard"
                      >
                        {copiedMessageId === m.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Read aloud button */}
                      <button
                        onClick={() => speakMessage(m.content, currentLang.code)}
                        className="p-1 text-slate-400 hover:text-teal-700 rounded transition-colors"
                        title="Read aloud"
                        aria-label="Read message aloud"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">{m.timestamp}</span>
            </div>
          );
        })}

        {/* Live Speech Recognition Transcript Indicator */}
        {isListening && (
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl max-w-[85%] text-xs text-teal-900 animate-fadeIn space-y-2">
            <div className="flex items-center justify-between text-teal-800 font-bold">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                <span>Listening in {currentLang.displayName}...</span>
              </div>
              <span className="text-[10px] text-teal-600 uppercase tracking-wider font-mono">LIVE STT</span>
            </div>
            
            <p className="italic text-slate-700 bg-white/70 p-2.5 rounded-xl border border-teal-100 min-h-[36px]">
              {interimTranscript || 'Speak clearly into your microphone...'}
            </p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => speechRecognitionService.abort()}
                className="text-[11px] bg-slate-200 text-slate-700 px-3 py-1 rounded-lg hover:bg-slate-300 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopVoiceInput}
                className="text-[11px] bg-teal-700 text-white px-3 py-1 rounded-lg font-semibold hover:bg-teal-800"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Typing / Generating Indicator with instant cancellation */}
        {isGenerating && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 p-3 bg-white border border-slate-200 rounded-2xl w-24">
              <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            <button
              type="button"
              onClick={cancelGeneration}
              className="px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-xl transition-colors flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Contextual Quick Actions */}
      <div className="px-4 py-2 bg-slate-100/90 border-t border-slate-200 overflow-x-auto flex gap-2 no-scrollbar">
        {getQuickQuestions().map((qa, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickAction(qa.prompt)}
            disabled={isGenerating}
            className="text-[11px] font-medium bg-white text-slate-700 px-3 py-1.5 rounded-full border border-slate-200 flex-shrink-0 hover:border-teal-600 hover:text-teal-800 transition-colors disabled:opacity-50 shadow-2xs"
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* 4. Chat Input Bar with Auto-resizing Textarea */}
      <div className="p-3 bg-white border-t border-slate-200 flex items-end gap-2 shadow-sm">
        {/* Voice Input Button */}
        <button
          type="button"
          onClick={handleMicClick}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0",
            isListening 
              ? "bg-red-600 text-white animate-pulse shadow-md" 
              : "bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700"
          )}
          title={isListening ? "Stop listening" : `Speak in ${currentLang.displayName}`}
          aria-label={isListening ? "Stop listening" : "Start voice input"}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputQuery}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about care for ${activeMember?.displayName || 'your family'}...`}
            disabled={isGenerating}
            className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 resize-none max-h-28 overflow-y-auto"
            aria-label="Message input"
          />
        </div>

        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!inputQuery.trim() || isGenerating}
          className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-teal-800 transition-colors flex-shrink-0 shadow-xs"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* 5. Clear Conversation Confirmation Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 shadow-xl space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Clear conversation?</h3>
            <p className="text-xs text-slate-600">
              This will remove all recent chat messages for <strong>{activeMember?.displayName}</strong>. Your clinical care schedules and reminders will remain completely safe.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsClearConfirmOpen(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Keep
              </button>
              <button
                onClick={() => {
                  clearConversation(activeMember?.id || 'general', activeMember?.displayName || 'your family');
                  setIsClearConfirmOpen(false);
                  showToast('Conversation cleared');
                }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. AI Model Management Modal / Drawer */}
      {isModelModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-700" />
                <h3 className="font-bold text-slate-900 text-sm">AI Model Architecture</h3>
              </div>
              <button
                onClick={() => setIsModelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2.5 text-slate-600">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Architecture:</span>
                <span className="font-bold text-slate-800">Deterministic + Verified Local</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Current Status:</span>
                <span className={cn(
                  "font-bold",
                  modelStatus === 'ACTIVE' ? "text-emerald-700" : modelStatus === 'FAILED' ? "text-red-600" : "text-teal-700"
                )}>
                  {modelStatus}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Model Package:</span>
                <span className="font-semibold text-slate-800">
                  {activeModel?.name || 'GHS Clinical Companion Nano'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Package Size:</span>
                <span className="font-medium text-slate-800">~1.5 MB (Quantized)</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Integrity Check:</span>
                <span className="font-mono text-[10px] text-slate-700">SHA-256 Verified</span>
              </div>

              {/* Download Policy Selector */}
              <div className="pt-1">
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Download Network Policy:
                </label>
                <select
                  value={preferences?.modelDownloadPolicy || 'wifi_only'}
                  onChange={(e) => setModelDownloadPolicy(e.target.value as ModelDownloadPolicy)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-slate-50 text-slate-800"
                >
                  <option value="wifi_only">Wi-Fi Only (Data Saver)</option>
                  <option value="automatic">Automatic (Wi-Fi or Cellular)</option>
                  <option value="ask_before_download">Ask Before Download</option>
                  <option value="manual_only">Manual Download Only</option>
                </select>
              </div>
            </div>

            {/* Download Progress Bar if downloading */}
            {modelStatus === 'DOWNLOADING' && (
              <div className="space-y-1.5 bg-sky-50 p-3 rounded-xl border border-sky-200">
                <div className="flex justify-between text-xs text-sky-900 font-semibold">
                  <span>Downloading Model Package...</span>
                  <span>{modelProgress.percentage}%</span>
                </div>
                <div className="w-full h-2 bg-sky-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-sky-600 transition-all duration-300"
                    style={{ width: `${modelProgress.percentage}%` }}
                  />
                </div>
                <button
                  onClick={cancelModelAcquisition}
                  className="mt-2 w-full text-center text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Cancel Download
                </button>
              </div>
            )}

            {/* Error notice if verification failed */}
            {(modelStatus === 'FAILED' || modelStatus === 'INSUFFICIENT_STORAGE' || modelStatus === 'UNSUPPORTED_DEVICE') && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Model Notice</span>
                </div>
                <p>
                  {modelStatus === 'INSUFFICIENT_STORAGE' 
                    ? 'Device storage is low. The local deterministic GHS engine remains active.'
                    : modelStatus === 'UNSUPPORTED_DEVICE'
                    ? 'Device lacks WebAssembly/WebCrypto acceleration. Full deterministic guidance remains available.'
                    : 'AI model verification failed. Unverified model was rejected. Deterministic care engine active.'}
                </p>
              </div>
            )}

            {/* Acquisition Action */}
            <div className="pt-2">
              {modelStatus !== 'ACTIVE' && modelStatus !== 'DOWNLOADING' && (
                <button
                  onClick={async () => {
                    showToast('Acquiring AI model package...');
                    const ok = await acquireModel();
                    if (ok) {
                      showToast('Model verified and activated');
                    } else {
                      showToast('Model acquisition failed. Using deterministic fallback.');
                    }
                  }}
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs py-2.5 rounded-xl shadow flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Acquire & Verify AI Model
                </button>
              )}

              {modelStatus === 'ACTIVE' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span>Verified local model is active and running offline.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Simple Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-xl shadow-lg z-50 animate-fadeIn">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default Assistant;
