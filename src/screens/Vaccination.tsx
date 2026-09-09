import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Syringe, CheckCircle2, Circle, 
  Calendar, Check, UserCheck, Baby, Sparkles
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '../components/Layout';
import { VaccinationRecord } from '../types';
import { CareEventExplanationModal } from '../components/CareEventExplanationModal';

const Vaccination = () => {
  const navigate = useNavigate();

  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const childProfiles = useAppStore((state) => state.childProfiles);
  const vaccinationRecords = useAppStore((state) => state.vaccinationRecords);
  const markVaccineAdministered = useAppStore((state) => state.markVaccineAdministered);

  // Find all child members
  const childMembers = familyMembers.filter((m) => m.type === 'child');
  
  // Select active child or first available child
  const initialChildMember = childMembers.find((c) => c.id === activeMemberId) || childMembers[0];
  const [selectedMemberId, setSelectedMemberId] = useState<string>(initialChildMember?.id || '');

  const selectedMember = childMembers.find((m) => m.id === selectedMemberId);
  const selectedChildProfile = childProfiles.find((c) => c.familyMemberId === selectedMember?.id);

  // Vaccines for this child
  const childVaccines = vaccinationRecords.filter((v) => v.familyMemberId === selectedMember?.id);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedVaccineForExplanation, setSelectedVaccineForExplanation] = useState<VaccinationRecord | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const administeredCount = childVaccines.filter((v) => v.status === 'administered').length;

  return (
    <div className="flex flex-col min-h-full pb-12 bg-slate-50">
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-sky-700 text-white px-4 pt-6 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-sky-800 flex items-center justify-center text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-sky-200 text-xs font-semibold uppercase tracking-wider block">
              GHS EPI 2023 Immunization Tracker
            </span>
            <h1 className="text-xl font-bold">Vaccination Records</h1>
          </div>
        </div>

        {/* Child Selector if multiple children exist */}
        {childMembers.length > 1 && (
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-xs font-semibold text-sky-200 flex-shrink-0">Viewing Child:</span>
            {childMembers.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedMemberId(c.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0",
                  c.id === selectedMember?.id
                    ? "bg-white text-sky-800 shadow"
                    : "bg-sky-800/80 text-sky-100 hover:bg-sky-800"
                )}
              >
                <Baby className="w-3.5 h-3.5" />
                <span>{c.displayName}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bg-sky-800/70 border border-sky-600/60 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <span className="text-sky-200 text-xs block">Immunization Progress</span>
            <span className="text-xl font-bold text-white">
              {selectedMember?.displayName || 'Child'}
            </span>
            <span className="text-xs text-sky-100 block mt-0.5">
              Born: {selectedChildProfile?.dateOfBirth || 'Registered'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sky-200 text-xs block">Doses Completed</span>
            <span className="text-xl font-bold text-white">
              {administeredCount} / {childVaccines.length}
            </span>
          </div>
        </div>
      </div>

      {/* EPI Protocol Information Banner */}
      <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 text-xs text-sky-900">
        <p>
          Adheres to Ghana Health Service (GHS) Expanded Programme on Immunization (EPI) standards. Tap any dose to log administration.
        </p>
      </div>

      {/* Vaccination List */}
      <div className="px-4 py-4 space-y-3">
        {childVaccines.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <Syringe className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No vaccination schedule found</p>
            <p className="text-xs text-slate-500 mt-1">
              Ensure a child profile with a valid date of birth is added in the Family tab.
            </p>
          </div>
        ) : (
          childVaccines.map((vac) => {
            const isDone = vac.status === 'administered';
            return (
              <div
                key={vac.id}
                className={cn(
                  "p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 shadow-sm",
                  isDone ? "bg-emerald-50/70 border-emerald-200" : "bg-white border-slate-200"
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={async () => {
                      if (!isDone) {
                        await markVaccineAdministered(vac.id);
                        showToast(`${vac.vaccineName} recorded as administered`);
                      }
                    }}
                    className="mt-0.5"
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300 hover:text-sky-600" />
                    )}
                  </button>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Target Age: {vac.targetAgeWeeks === 0 ? 'At Birth' : vac.targetAgeWeeks < 20 ? `${vac.targetAgeWeeks} Weeks` : `${Math.round(vac.targetAgeWeeks / 4.3)} Months`}
                    </span>
                    <h3 className={cn("text-xs font-bold mt-0.5", isDone ? "text-emerald-900" : "text-slate-900")}>
                      {vac.vaccineName}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1.5">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {isDone 
                          ? `Administered: ${vac.administeredDate || vac.scheduledDate}` 
                          : `Scheduled: ${vac.scheduledDate}`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedVaccineForExplanation(vac)}
                      className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                    >
                      <Sparkles className="w-3 h-3 text-sky-600" />
                      Why this matters
                    </button>
                  </div>
                </div>

                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0",
                  isDone ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                )}>
                  {isDone ? 'Given' : 'Pending'}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Explanation Modal */}
      {selectedVaccineForExplanation && (
        <CareEventExplanationModal
          isOpen={!!selectedVaccineForExplanation}
          onClose={() => setSelectedVaccineForExplanation(null)}
          vaccine={selectedVaccineForExplanation}
          activeMember={selectedMember}
          initialAction="importance"
        />
      )}
    </div>
  );
};

export default Vaccination;
