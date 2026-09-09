import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Baby, Heart, ShieldAlert, 
  Activity, Check, Scale, Ruler, Droplet
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '../components/Layout';

const NewbornCare = () => {
  const navigate = useNavigate();

  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const childProfiles = useAppStore((state) => state.childProfiles);
  const updateChild = useAppStore((state) => state.updateChild);

  const childMembers = familyMembers.filter((m) => m.type === 'child');
  const activeChildMember = childMembers.find((c) => c.id === activeMemberId) || childMembers[0];
  const activeChildProfile = childProfiles.find((c) => c.familyMemberId === activeChildMember?.id);

  const [weightInput, setWeightInput] = useState(activeChildProfile?.currentWeightKg?.toString() || '3.9');
  const [heightInput, setHeightInput] = useState(activeChildProfile?.currentHeightCm?.toString() || '52');
  const [isEditingGrowth, setIsEditingGrowth] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSaveGrowth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChildProfile) return;

    await updateChild(activeChildProfile.id, {
      currentWeightKg: parseFloat(weightInput) || undefined,
      currentHeightCm: parseFloat(heightInput) || undefined
    });
    setIsEditingGrowth(false);
    showToast('Growth measurements updated');
  };

  return (
    <div className="flex flex-col min-h-full pb-12 bg-slate-50">
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
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
              Infant Health & Development
            </span>
            <h1 className="text-xl font-bold">Newborn & Infant Care</h1>
          </div>
        </div>

        <div className="bg-sky-800/70 border border-sky-600/60 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <span className="text-sky-200 text-xs block">Active Child Profile</span>
            <span className="text-xl font-bold text-white">
              {activeChildMember?.displayName || 'Child'}
            </span>
            <span className="text-xs text-sky-100 block mt-0.5">
              DOB: {activeChildProfile?.dateOfBirth || 'Registered'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sky-200 text-xs block">Current Weight</span>
            <span className="text-xl font-bold text-white">
              {activeChildProfile?.currentWeightKg || 3.9} kg
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Growth Tracking Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-700" />
              <h2 className="font-bold text-slate-900 text-sm">Growth Parameters</h2>
            </div>
            <button
              onClick={() => setIsEditingGrowth(!isEditingGrowth)}
              className="text-xs font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200"
            >
              {isEditingGrowth ? 'Close' : 'Update Metrics'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3">
              <div className="flex items-center gap-2 text-sky-800 text-xs font-semibold mb-1">
                <Scale className="w-4 h-4" />
                <span>Weight</span>
              </div>
              <span className="text-lg font-bold text-slate-900">
                {activeChildProfile?.currentWeightKg || 3.9} kg
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Birth: {activeChildProfile?.birthWeightKg || 3.4} kg</span>
            </div>

            <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3">
              <div className="flex items-center gap-2 text-teal-800 text-xs font-semibold mb-1">
                <Ruler className="w-4 h-4" />
                <span>Length / Height</span>
              </div>
              <span className="text-lg font-bold text-slate-900">
                {activeChildProfile?.currentHeightCm || 52} cm
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Normal growth curve</span>
            </div>
          </div>

          {isEditingGrowth && (
            <form onSubmit={handleSaveGrowth} className="pt-2 border-t border-slate-100 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Height (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-sky-700 text-white font-bold text-xs rounded-xl hover:bg-sky-800"
              >
                Save Measurements to Local Record
              </button>
            </form>
          )}
        </div>

        {/* Clinical Guidelines Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Droplet className="w-5 h-5 text-teal-700" />
            <h2 className="font-bold text-slate-900 text-sm">GHS Infant Feeding Standards</h2>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-2">
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p><strong>Exclusive Breastfeeding:</strong> Give only breastmilk for the first 6 months. No water, tea, or porridge.</p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p><strong>On-Demand Feeding:</strong> Feed at least 8 to 12 times in 24 hours day and night.</p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p><strong>Cord Care:</strong> Apply Chlorhexidine 7.1% daily to the umbilical stump until healed. Keep clean and dry.</p>
            </div>
          </div>
        </div>

        {/* Newborn Danger Signs */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-bold text-sm">Newborn Danger Signs</h3>
          </div>
          <ul className="text-xs text-red-900 space-y-1 list-disc pl-4">
            <li>Unable to suckle or feed at all</li>
            <li>Convulsions or abnormal jitteriness</li>
            <li>Fast breathing (&gt;60 breaths/min) or severe chest in-drawing</li>
            <li>Fever (&gt;37.5°C) or baby feels cold to touch (&lt;35.5°C)</li>
            <li>Yellow palms or soles (severe jaundice)</li>
            <li>Pus or redness spreading from the umbilical cord</li>
          </ul>
          <button 
            onClick={() => navigate('/emergency')}
            className="mt-2 w-full bg-red-600 text-white font-bold text-xs py-2 rounded-xl"
          >
            Open Emergency Contacts
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewbornCare;
