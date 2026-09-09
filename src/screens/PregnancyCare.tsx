import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Droplet, CheckCircle2, Circle, 
  Calendar, ShieldAlert, ChevronRight, Check
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '../components/Layout';

const PregnancyCare = () => {
  const navigate = useNavigate();
  
  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const pregnancyProfiles = useAppStore((state) => state.pregnancyProfiles);
  const careEvents = useAppStore((state) => state.careEvents);
  const completeCareEvent = useAppStore((state) => state.completeCareEvent);

  // Identify mother profile
  const motherMember = familyMembers.find((m) => m.type === 'mother') || familyMembers[0];
  const pregnancy = pregnancyProfiles.find((p) => p.familyMemberId === motherMember?.id);

  // Filter maternal care events
  const maternalEvents = careEvents.filter(
    (e) => e.familyMemberId === motherMember?.id && (e.type === 'anc_visit' || e.type === 'iptp_dose')
  );

  const ancVisits = maternalEvents.filter((e) => e.type === 'anc_visit');
  const iptpDoses = maternalEvents.filter((e) => e.type === 'iptp_dose');

  const [activeTab, setActiveTab] = useState<'anc' | 'iptp' | 'danger'>('anc');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const completedAncCount = ancVisits.filter((v) => v.status === 'completed').length;

  return (
    <div className="flex flex-col min-h-full pb-12 bg-slate-50">
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-teal-700 text-white px-4 pt-6 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-teal-800 flex items-center justify-center text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-teal-200 text-xs font-semibold uppercase tracking-wider block">
              GHS Safe Motherhood Schedule
            </span>
            <h1 className="text-xl font-bold">Pregnancy Care</h1>
          </div>
        </div>

        <div className="bg-teal-800/70 border border-teal-600/60 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <span className="text-teal-200 text-xs block">Gestational Stage</span>
            <span className="text-xl font-bold text-white">
              Week {pregnancy?.currentGestationalWeeks || 24} of 40
            </span>
            <span className="text-xs text-teal-100 block mt-0.5">
              Due Date: {pregnancy?.estimatedDueDate || 'Calculated per LMP'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-teal-200 text-xs block">ANC Completed</span>
            <span className="text-xl font-bold text-white">
              {completedAncCount} / {ancVisits.length || 8}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-6">
        <button
          onClick={() => setActiveTab('anc')}
          className={cn(
            "py-3 text-xs font-bold border-b-2 transition-all",
            activeTab === 'anc' ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          ANC Schedule (8-Contact)
        </button>
        <button
          onClick={() => setActiveTab('iptp')}
          className={cn(
            "py-3 text-xs font-bold border-b-2 transition-all",
            activeTab === 'iptp' ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          IPTp Malaria Prophylaxis
        </button>
        <button
          onClick={() => setActiveTab('danger')}
          className={cn(
            "py-3 text-xs font-bold border-b-2 transition-all",
            activeTab === 'danger' ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Danger Signs
        </button>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4 space-y-3">
        {activeTab === 'anc' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                GHS 8-Contact ANC Model
              </h2>
              <span className="text-[11px] text-slate-400">Tap to record completion</span>
            </div>

            <div className="space-y-2.5">
              {ancVisits.map((visit, index) => {
                const isCompleted = visit.status === 'completed';
                return (
                  <div
                    key={visit.id}
                    className={cn(
                      "p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 shadow-sm",
                      isCompleted ? "bg-emerald-50/70 border-emerald-200" : "bg-white border-slate-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={async () => {
                          await completeCareEvent(visit.id);
                          showToast(`${visit.title} marked as completed`);
                        }}
                        className="mt-0.5"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 hover:text-teal-600" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={cn("text-xs font-bold", isCompleted ? "text-emerald-900 line-through" : "text-slate-900")}>
                            {visit.title}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          {visit.description}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-2">
                          <Calendar className="w-3 h-3" />
                          <span>Scheduled: {new Date(visit.scheduledAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'iptp' && (
          <div>
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <span className="font-bold block">GHS IPTp-SP Protocol in Pregnancy:</span>
              <p>
                Sulfadoxine-Pyrimethamine (SP) is administered monthly from early second trimester (Week 16). At least 3 to 5 doses are provided before delivery under direct observation.
              </p>
            </div>

            <div className="space-y-2.5">
              {iptpDoses.map((dose, index) => {
                const isCompleted = dose.status === 'completed';
                return (
                  <div
                    key={dose.id}
                    className={cn(
                      "p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 shadow-sm",
                      isCompleted ? "bg-emerald-50/70 border-emerald-200" : "bg-white border-slate-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={async () => {
                          await completeCareEvent(dose.id);
                          showToast(`${dose.title} recorded`);
                        }}
                        className="mt-0.5"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 hover:text-teal-600" />
                        )}
                      </button>
                      <div>
                        <h3 className={cn("text-xs font-bold", isCompleted ? "text-emerald-900" : "text-slate-900")}>
                          {dose.title}
                        </h3>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {dose.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'danger' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-bold text-sm">Pregnancy Danger Signs (Seek Immediate Care)</h3>
              </div>
              <ul className="text-xs text-red-900 space-y-1.5 list-disc pl-4">
                <li>Vaginal bleeding or fluid leakage at any stage</li>
                <li>Severe persistent headaches with blurred vision or spots</li>
                <li>Severe swelling of hands, feet, or face (edema)</li>
                <li>High fever or severe chills with rigors</li>
                <li>Severe sharp abdominal pain or constant cramping</li>
                <li>Marked decrease or absence of fetal movements</li>
              </ul>
              <button 
                onClick={() => navigate('/emergency')}
                className="mt-3 w-full bg-red-600 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm hover:bg-red-700"
              >
                Go to Emergency Dispatch & Hotlines
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PregnancyCare;
