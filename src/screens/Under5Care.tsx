import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Activity, CheckCircle2, Circle, 
  Sparkles, Check, Baby, ShieldCheck
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '../components/Layout';

const Under5Care = () => {
  const navigate = useNavigate();

  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const childProfiles = useAppStore((state) => state.childProfiles);

  const childMembers = familyMembers.filter((m) => m.type === 'child');
  const activeChildMember = childMembers.find((c) => c.id === activeMemberId) || childMembers[0];
  const activeChildProfile = childProfiles.find((c) => c.familyMemberId === activeChildMember?.id);

  const [milestones, setMilestones] = useState([
    { id: 'm1', stage: '6 Months', title: 'Sits without support for brief moments', done: true },
    { id: 'm2', stage: '6 Months', title: 'Starts eating semi-solid complementary foods (4-star diet)', done: true },
    { id: 'm3', stage: '9 Months', title: 'Crawls and pulls self up to stand', done: true },
    { id: 'm4', stage: '12 Months', title: 'Takes first independent steps and responds to own name', done: false },
    { id: 'm5', stage: '18 Months', title: 'Walks steadily, says 5-10 words, drinks from a cup', done: false },
    { id: 'm6', stage: '24 Months', title: 'Runs, climbs stairs, speaks 2-word phrases', done: false }
  ]);

  const toggleMilestone = (id: string) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, done: !m.done } : m))
    );
  };

  return (
    <div className="flex flex-col min-h-full pb-12 bg-slate-50">
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
              Child Health Record & Milestones
            </span>
            <h1 className="text-xl font-bold">Under-5 Child Care</h1>
          </div>
        </div>

        <div className="bg-teal-800/70 border border-teal-600/60 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <span className="text-teal-200 text-xs block">Child</span>
            <span className="text-xl font-bold text-white">
              {activeChildMember?.displayName || 'Child Profile'}
            </span>
            <span className="text-xs text-teal-100 block mt-0.5">
              Born: {activeChildProfile?.dateOfBirth || 'Registered'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-teal-200 text-xs block">Milestones Logged</span>
            <span className="text-xl font-bold text-white">
              {milestones.filter((m) => m.done).length} / {milestones.length}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Nutrition 4-Star Diet */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-700" />
            <h2 className="font-bold text-slate-900 text-sm">GHS 4-Star Complementary Diet (6–59 Months)</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            From 6 months onwards, continue breastfeeding alongside diverse local nutrient-dense foods:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">
              <span className="font-bold text-amber-900 block">⭐ Staples</span>
              <span className="text-amber-800 text-[11px]">Maize, millet, cassava, plantain, rice</span>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="font-bold text-emerald-900 block">⭐ Legumes & Seeds</span>
              <span className="text-emerald-800 text-[11px]">Beans, groundnuts, cowpea, agushie</span>
            </div>
            <div className="p-2.5 bg-red-50 rounded-xl border border-red-100">
              <span className="font-bold text-red-900 block">⭐ Animal-source</span>
              <span className="text-red-800 text-[11px]">Eggs, fish, liver, meat, milk</span>
            </div>
            <div className="p-2.5 bg-teal-50 rounded-xl border border-teal-100">
              <span className="font-bold text-teal-900 block">⭐ Fruits & Veg</span>
              <span className="text-teal-800 text-[11px]">Pawpaw, mango, kontomire, carrots</span>
            </div>
          </div>
        </div>

        {/* Milestones Checklist */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-slate-900 text-sm mb-3">Developmental Milestones</h2>
          <div className="space-y-2.5">
            {milestones.map((m) => (
              <div
                key={m.id}
                onClick={() => toggleMilestone(m.id)}
                className={cn(
                  "p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer shadow-sm",
                  m.done ? "bg-emerald-50/70 border-emerald-200" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                )}
              >
                <div className="mt-0.5">
                  {m.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {m.stage}
                  </span>
                  <p className={cn("text-xs font-semibold mt-0.5", m.done ? "text-emerald-900" : "text-slate-800")}>
                    {m.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Under5Care;
