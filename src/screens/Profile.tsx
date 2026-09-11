import React, { useState } from 'react';
import { 
  User, Users, Plus, Globe, Volume2, Bell, 
  Trash2, ShieldCheck, RefreshCw, AlertTriangle, Check,
  Edit2, Calendar, Droplet, Baby, Heart, Palette, Sparkles
} from 'lucide-react';
import { dataBackupService } from '../services/data/DataBackupService';
import { appResilienceService } from '../services/resilience/AppResilienceService';
import { useAppStore } from '../stores/useAppStore';
import { SUPPORTED_LANGUAGES, SupportedLanguage, FamilyMemberType, ModelDownloadPolicy } from '../types';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { cn } from '../components/Layout';

const Profile = () => {
  const user = useAppStore((state) => state.user);
  const family = useAppStore((state) => state.family);
  const familyMembers = useAppStore((state) => state.familyMembers);
  const activeMemberId = useAppStore((state) => state.activeMemberId);
  const setActiveMemberId = useAppStore((state) => state.setActiveMemberId);
  const pregnancyProfiles = useAppStore((state) => state.pregnancyProfiles);
  const preferences = useAppStore((state) => state.preferences);

  // Store actions
  const updateUser = useAppStore((state) => state.updateUser);
  const updateFamilyName = useAppStore((state) => state.updateFamilyName);
  const addFamilyMember = useAppStore((state) => state.addFamilyMember);
  const updateFamilyMember = useAppStore((state) => state.updateFamilyMember);
  const deleteFamilyMember = useAppStore((state) => state.deleteFamilyMember);
  const updatePregnancy = useAppStore((state) => state.updatePregnancy);
  const setPreferredLanguage = useAppStore((state) => state.setPreferredLanguage);
  const updateTheme = useAppStore((state) => state.updateTheme);
  const setVoicePreferences = useAppStore((state) => state.setVoicePreferences);
  const setModelDownloadPolicy = useAppStore((state) => state.setModelDownloadPolicy);
  const setSpeechRate = useAppStore((state) => state.setSpeechRate);
  const updateNotificationSettings = useAppStore((state) => state.updateNotificationSettings);
  const speakText = useAppStore((state) => state.speakText);
  const resetAllData = useAppStore((state) => state.resetAllData);
  const loadSeedData = useAppStore((state) => state.loadSeedData);

  // Local state for modals & forms
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [userNameInput, setUserNameInput] = useState(user?.displayName || '');
  const [userPhoneInput, setUserPhoneInput] = useState(user?.phoneNumber || '');
  const [familyNameInput, setFamilyNameInput] = useState(family?.name || '');

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberType, setNewMemberType] = useState<FamilyMemberType>('child');
  const [newMemberDob, setNewMemberDob] = useState('');
  const [newChildSex, setNewChildSex] = useState<'male' | 'female' | 'unknown'>('female');
  const [newChildWeight, setNewChildWeight] = useState('3.2');
  const [isTwinMode, setIsTwinMode] = useState(false);
  const [twin2Name, setTwin2Name] = useState('');
  const [twin2Sex, setTwin2Sex] = useState<'male' | 'female'>('male');
  const [twin2Weight, setTwin2Weight] = useState('3.1');

  const [isEditingPregnancy, setIsEditingPregnancy] = useState(false);
  const [pregEdd, setPregEdd] = useState('');
  const [pregLmp, setPregLmp] = useState('');

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const motherMember = familyMembers.find((m) => m.type === 'mother');
  const motherPregnancy = motherMember 
    ? pregnancyProfiles.find((p) => p.familyMemberId === motherMember.id)
    : undefined;

  const handleSaveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userNameInput.trim()) return;
    await updateUser(userNameInput.trim(), userPhoneInput.trim());
    if (familyNameInput.trim()) {
      await updateFamilyName(familyNameInput.trim());
    }
    setIsEditingUser(false);
    showToast('Caregiver profile updated');
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newMemberName.trim();
    if (!cleanName) {
      alert('Please enter a member name.');
      return;
    }

    if (newMemberType === 'child') {
      if (!newMemberDob) {
        alert('Date of birth is required for child profiles to generate immunization schedules.');
        return;
      }
      const dobDate = new Date(newMemberDob);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        alert('Child date of birth cannot be in the future.');
        return;
      }
      if (newChildWeight) {
        const wt = parseFloat(newChildWeight);
        if (isNaN(wt) || wt <= 0.3 || wt > 20) {
          alert('Please enter a valid birth weight in kg (e.g., 2.5 - 4.5 kg).');
          return;
        }
      }
      if (isTwinMode) {
        const cleanTwin2 = twin2Name.trim();
        if (!cleanTwin2) {
          alert('Please enter a name for the second twin.');
          return;
        }
        if (twin2Weight) {
          const wt2 = parseFloat(twin2Weight);
          if (isNaN(wt2) || wt2 <= 0.3 || wt2 > 20) {
            alert('Please enter a valid birth weight for the second twin.');
            return;
          }
        }
      }
    }

    if (newMemberType === 'mother') {
      const existingMother = familyMembers.find(m => m.type === 'mother');
      if (existingMother) {
        if (!confirm(`A mother profile (${existingMother.displayName}) already exists. Would you like to add another mother/caregiver profile?`)) {
          return;
        }
      }
    }

    try {
      // 1. Add first child / member
      await addFamilyMember(
        {
          displayName: cleanName,
          type: newMemberType,
          relationship: newMemberType === 'mother' ? 'Mother' : newMemberType === 'child' ? 'Child' : 'Partner',
          dateOfBirth: newMemberDob || undefined
        },
        newMemberType === 'child' ? {
          sex: newChildSex,
          birthWeightKg: parseFloat(newChildWeight) || undefined
        } : undefined
      );

      // 2. If twin mode, add second twin with identical DOB but distinct name, sex, and weight
      if (newMemberType === 'child' && isTwinMode) {
        const cleanTwin2 = twin2Name.trim();
        await addFamilyMember(
          {
            displayName: cleanTwin2,
            type: 'child',
            relationship: 'Child',
            dateOfBirth: newMemberDob || undefined
          },
          {
            sex: twin2Sex,
            birthWeightKg: parseFloat(twin2Weight) || undefined
          }
        );
      }

      setIsAddMemberOpen(false);
      setNewMemberName('');
      setTwin2Name('');
      setNewMemberDob('');
      setIsTwinMode(false);
      showToast(isTwinMode ? `Twins ${cleanName} and ${twin2Name.trim()} added with distinct care schedules` : `${cleanName} added to family profile`);
    } catch (err: any) {
      alert(err.message || 'Failed to add family member');
    }
  };

  const handleSavePregnancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motherPregnancy || !pregEdd) return;
    const eddDate = new Date(pregEdd);
    if (isNaN(eddDate.getTime())) {
      alert('Please enter a valid estimated due date.');
      return;
    }
    await updatePregnancy(motherPregnancy.id, {
      estimatedDueDate: pregEdd,
      lastMenstrualPeriod: pregLmp || undefined
    });
    setIsEditingPregnancy(false);
    showToast('Pregnancy profile updated');
  };

  return (
    <div className="flex flex-col min-h-full pb-12 bg-slate-50">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Family & Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage family profiles, language, voice, and offline data</p>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* 1. Caregiver & Family Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base leading-tight">
                  {user?.displayName || 'Caregiver'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {family?.name || 'Primary Family'} • {user?.phoneNumber || 'No phone set'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setUserNameInput(user?.displayName || '');
                setUserPhoneInput(user?.phoneNumber || '');
                setFamilyNameInput(family?.name || '');
                setIsEditingUser(true);
              }}
              className="p-2 text-slate-500 hover:text-teal-700 rounded-lg hover:bg-slate-100 transition-colors"
              title="Edit Profile"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>

          {/* Edit Caregiver Modal */}
          {isEditingUser && (
            <form onSubmit={handleSaveUserProfile} className="mt-3 pt-3 border-t border-slate-100 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Your Full Name</label>
                <input 
                  type="text" 
                  value={userNameInput} 
                  onChange={(e) => setUserNameInput(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Family / Household Name</label>
                <input 
                  type="text" 
                  value={familyNameInput} 
                  onChange={(e) => setFamilyNameInput(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  value={userPhoneInput} 
                  onChange={(e) => setUserPhoneInput(e.target.value)}
                  placeholder="+233 24 000 0000"
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button 
                  type="button" 
                  onClick={() => setIsEditingUser(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Save Profile
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 2. Family Members & Active Profile Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-700" />
              <h2 className="font-bold text-slate-900 text-sm">Family Members</h2>
            </div>
            <button 
              onClick={() => setIsAddMemberOpen(true)}
              className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Member
            </button>
          </div>

          <div className="space-y-2">
            {familyMembers.map((member) => {
              const isActive = member.id === activeMemberId;
              const isTwin = member.type === 'child' && !!member.dateOfBirth && familyMembers.some(
                (other) => other.id !== member.id && other.type === 'child' && other.dateOfBirth === member.dateOfBirth
              );
              const getChildStage = (dobStr?: string) => {
                if (!dobStr) return null;
                const dob = new Date(dobStr);
                if (isNaN(dob.getTime())) return null;
                const diffMonths = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
                if (diffMonths < 12) return 'Infant';
                if (diffMonths < 36) return 'Toddler';
                return 'Under-5';
              };
              const childStage = member.type === 'child' ? getChildStage(member.dateOfBirth) : null;

              return (
                <div 
                  key={member.id}
                  className={cn(
                    "p-3 rounded-xl border transition-all flex items-center justify-between",
                    isActive ? "bg-teal-50/70 border-teal-300" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold",
                      member.type === 'mother' 
                        ? "bg-teal-100 text-teal-800" 
                        : member.type === 'child' 
                        ? "bg-sky-100 text-sky-800" 
                        : "bg-purple-100 text-purple-800"
                    )}>
                      {member.type === 'mother' ? <Droplet className="w-4 h-4" /> : member.type === 'child' ? <Baby className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">{member.displayName}</span>
                        {isActive && (
                          <span className="bg-teal-700 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                            Active
                          </span>
                        )}
                        {isTwin && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                            Twin
                          </span>
                        )}
                        {childStage && (
                          <span className="bg-sky-100 text-sky-800 text-[9px] font-medium px-1.5 py-0.2 rounded-full">
                            {childStage}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {member.relationship} • {member.dateOfBirth ? `Born ${member.dateOfBirth}` : 'Profile'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isActive && (
                      <button 
                        onClick={() => {
                          setActiveMemberId(member.id);
                          showToast(`Switched active profile to ${member.displayName}`);
                        }}
                        className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-2.5 py-1 rounded-lg"
                      >
                        Set Active
                      </button>
                    )}
                    {familyMembers.length > 1 && (
                      <button 
                        onClick={() => {
                          if (confirm(`Are you sure you want to remove ${member.displayName} from the family?`)) {
                            deleteFamilyMember(member.id);
                            showToast(`Removed ${member.displayName}`);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Delete member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Member Form Modal */}
          {isAddMemberOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-slate-900 text-base mb-3">
                  {isTwinMode ? 'Add Twins (Multiple Birth)' : 'Add Family Member'}
                </h3>
                <form onSubmit={handleAddMember} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      {isTwinMode ? 'Twin 1 Full Name' : 'Full Name'}
                    </label>
                    <input 
                      type="text" 
                      value={newMemberName} 
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder={isTwinMode ? 'e.g. Kofi Mensah' : 'e.g. Kwame Mensah'}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Role / Member Type</label>
                    <select 
                      value={newMemberType} 
                      onChange={(e) => {
                        const val = e.target.value as FamilyMemberType;
                        setNewMemberType(val);
                        if (val !== 'child') setIsTwinMode(false);
                      }}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                    >
                      <option value="child">Child (Infant / Under-5)</option>
                      <option value="mother">Mother (Pregnancy Profile)</option>
                      <option value="partner">Partner / Father</option>
                      <option value="other">Other Guardian</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      {isTwinMode ? 'Shared Date of Birth' : 'Date of Birth'}
                    </label>
                    <input 
                      type="date" 
                      value={newMemberDob} 
                      onChange={(e) => setNewMemberDob(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                      required={newMemberType === 'child'}
                    />
                  </div>

                  {newMemberType === 'child' && (
                    <>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">
                            {isTwinMode ? 'Twin 1 Sex' : 'Sex'}
                          </label>
                          <select 
                            value={newChildSex} 
                            onChange={(e) => setNewChildSex(e.target.value as any)}
                            className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                          >
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">
                            {isTwinMode ? 'Twin 1 Wt (kg)' : 'Birth Wt (kg)'}
                          </label>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={newChildWeight} 
                            onChange={(e) => setNewChildWeight(e.target.value)}
                            className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                          />
                        </div>
                      </div>

                      {/* Twin Toggle */}
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-amber-900 block">Twins / Multiple Birth?</span>
                          <span className="text-[10px] text-amber-700">Creates separate schedules for both twins</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isTwinMode}
                          onChange={(e) => setIsTwinMode(e.target.checked)}
                          className="w-4 h-4 accent-amber-600 rounded"
                        />
                      </div>

                      {/* Twin 2 Fields */}
                      {isTwinMode && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <h4 className="text-xs font-bold text-slate-900">Twin 2 Information</h4>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-700 block mb-1">Twin 2 Full Name</label>
                            <input 
                              type="text" 
                              value={twin2Name} 
                              onChange={(e) => setTwin2Name(e.target.value)}
                              placeholder="e.g. Efua Mensah"
                              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600"
                              required={isTwinMode}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Twin 2 Sex</label>
                              <select 
                                value={twin2Sex} 
                                onChange={(e) => setTwin2Sex(e.target.value as any)}
                                className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600"
                              >
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Twin 2 Wt (kg)</label>
                              <input 
                                type="number" 
                                step="0.1" 
                                value={twin2Weight} 
                                onChange={(e) => setTwin2Weight(e.target.value)}
                                className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex gap-2 justify-end pt-3">
                    <button 
                      type="button" 
                      onClick={() => setIsAddMemberOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-5 py-2 text-xs font-bold text-white bg-teal-700 rounded-xl hover:bg-teal-800"
                    >
                      {isTwinMode ? 'Add Both Twins & Schedules' : 'Add & Generate Plan'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* 3. Pregnancy Profile Settings (If mother present) */}
        {motherPregnancy && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Droplet className="w-5 h-5 text-teal-700" />
                <h2 className="font-bold text-slate-900 text-sm">Pregnancy Profile</h2>
              </div>
              <button 
                onClick={() => {
                  setPregEdd(motherPregnancy.estimatedDueDate);
                  setPregLmp(motherPregnancy.lastMenstrualPeriod || '');
                  setIsEditingPregnancy(true);
                }}
                className="text-xs font-semibold text-slate-600 hover:text-teal-700 p-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            <div className="bg-teal-50/50 rounded-xl p-3 border border-teal-100 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Estimated Due Date:</span>
                <span className="font-bold text-slate-900">{motherPregnancy.estimatedDueDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Last Menstrual Period:</span>
                <span className="font-semibold text-slate-800">{motherPregnancy.lastMenstrualPeriod || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Gestational Stage:</span>
                <span className="font-bold text-teal-800">Week {motherPregnancy.currentGestationalWeeks || 24} (Trimester 2)</span>
              </div>
            </div>

            {isEditingPregnancy && (
              <form onSubmit={handleSavePregnancy} className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Estimated Due Date (EDD)</label>
                  <input 
                    type="date" 
                    value={pregEdd} 
                    onChange={(e) => setPregEdd(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Last Menstrual Period (LMP)</label>
                  <input 
                    type="date" 
                    value={pregLmp} 
                    onChange={(e) => setPregLmp(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-600"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button 
                    type="button" 
                    onClick={() => setIsEditingPregnancy(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg"
                  >
                    Save Dates
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* 4. Language & Localization Selector */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-5 h-5 text-teal-700" />
            <h2 className="font-bold text-slate-900 text-sm">Language & Voice Guidance</h2>
          </div>

          <div className="space-y-2">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = preferences?.preferredLanguage === lang.code;
              return (
                <div
                  key={lang.code}
                  className={cn(
                    "w-full p-3 rounded-xl border transition-all flex items-start justify-between gap-2",
                    isSelected ? "bg-teal-50/80 border-teal-400" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <button
                    onClick={() => {
                      setPreferredLanguage(lang.code);
                      showToast(`Language set to ${lang.displayName}`);
                    }}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{lang.displayName}</span>
                      <span className="text-[11px] text-slate-500">({lang.nativeName})</span>
                      {lang.isVerified ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                          Verified
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-medium px-1.5 py-0.2 rounded-full">
                          Enabled
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">{lang.statusNote}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const sampleTexts: Record<string, string> = {
                          en: 'Welcome to NurtureAI. Routine care reminders and immunization schedules are ready.',
                          dagbani: 'Teebu n-ti a: Alaafie tuma mini bia tiparibo saha paai ya.',
                          hausa: 'Barka da zuwa NurtureAI. Lokacin duba lafiya da rigakafin yara ya zo.',
                          nankam: 'Tɛɛra bɔɔra fõ: Lafiye tuma la bia loro tii nyubo saŋa paɛ me.',
                          kassena: 'N-teena ma: Laafia dena la bia tibara dwoŋo pae ya logo yire.',
                          kasem: 'Teelem ye: Laafi tuma ne bia loro tii saŋa baa ya logoro dige.',
                          twi: 'Akwaaba ba NurtureAI. Wo apɔmuden nhyehyɛe ne abofra paneɛbɔ bere aso.',
                          ga: 'Atuu baa NurtureAI. Hewalɛ gbɛjianɔtoo kɛ gbekɛbii abotee be eshe.',
                          ewe: 'Woezor va NurtureAI. Lãmesẽ dɔwɔwɔ kple viwo ƒe abidodo ƒe ɣeyiɣi de.'
                        };
                        const sample = sampleTexts[lang.code] || sampleTexts.en;
                        await speakText(sample, lang.code);
                        showToast(`Playing ${lang.displayName} preview`);
                      }}
                      className="p-1.5 text-slate-500 hover:text-teal-700 bg-white border border-slate-200 hover:border-teal-300 rounded-lg shadow-xs"
                      title={`Preview ${lang.displayName} Voice`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    {isSelected && <Check className="w-4 h-4 text-teal-700 flex-shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Voice & Audio Settings */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Volume2 className="w-5 h-5 text-teal-700" />
            <h2 className="font-bold text-slate-900 text-sm">Voice & Audio Experience</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1">
              <div>
                <span className="font-semibold text-slate-800 block">Spoken Audio Prompts</span>
                <span className="text-slate-500">Play spoken clinical guidance where available</span>
              </div>
              <input 
                type="checkbox" 
                checked={preferences?.voiceEnabled ?? true} 
                onChange={(e) => setVoicePreferences({ voiceEnabled: e.target.checked })}
                className="w-4 h-4 accent-teal-700 rounded"
              />
            </div>

            <div className="flex justify-between items-center py-1 border-t border-slate-100">
              <div>
                <span className="font-semibold text-slate-800 block">Spoken Reminders</span>
                <span className="text-slate-500">Voice alerts for immunization and ANC visits</span>
              </div>
              <input 
                type="checkbox" 
                checked={preferences?.reminderVoiceEnabled ?? true} 
                onChange={(e) => setVoicePreferences({ reminderVoiceEnabled: e.target.checked })}
                className="w-4 h-4 accent-teal-700 rounded"
              />
            </div>

            <div className="flex justify-between items-center py-1 border-t border-slate-100">
              <div>
                <span className="font-semibold text-slate-800 block">AI Voice Assistant</span>
                <span className="text-slate-500">Enable voice responses in companion chat</span>
              </div>
              <input 
                type="checkbox" 
                checked={preferences?.aiVoiceEnabled ?? true} 
                onChange={(e) => setVoicePreferences({ aiVoiceEnabled: e.target.checked })}
                className="w-4 h-4 accent-teal-700 rounded"
              />
            </div>

            <div className="border-t border-slate-100 pt-2">
              <label className="font-semibold text-slate-800 block mb-1">Voice Speech Rate</label>
              <div className="flex gap-2">
                {[
                  { rate: 0.8, label: '0.8x (Slower)' },
                  { rate: 1.0, label: '1.0x (Normal)' },
                  { rate: 1.2, label: '1.2x (Faster)' }
                ].map(({ rate, label }) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setSpeechRate(rate)}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-xl border text-xs font-medium transition-colors",
                      (preferences?.speechRate || 1.0) === rate
                        ? "bg-teal-50 border-teal-600 text-teal-800 font-bold"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 6. AI Model Download & Network Policy */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-teal-700" />
            <h2 className="font-bold text-slate-900 text-sm">AI Model Download Policy</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Control data usage when updating or downloading offline clinical models.
          </p>

          <div className="space-y-2">
            {[
              {
                id: 'wifi_only' as ModelDownloadPolicy,
                title: 'Wi-Fi Only (Recommended)',
                desc: 'Conserve mobile data; only download and update models on Wi-Fi.'
              },
              {
                id: 'always_allow' as ModelDownloadPolicy,
                title: 'Always Allow (Cellular or Wi-Fi)',
                desc: 'Allow model downloads over any active network connection.'
              },
              {
                id: 'manual_approval_only' as ModelDownloadPolicy,
                title: 'Manual Approval Only',
                desc: 'Never download automatically; prompt for confirmation every time.'
              }
            ].map((p) => {
              const selected = (preferences?.modelDownloadPolicy || 'wifi_only') === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setModelDownloadPolicy(p.id)}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
                    selected ? "bg-teal-50/70 border-teal-500 text-teal-900" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <input
                    type="radio"
                    name="modelDownloadPolicy"
                    checked={selected}
                    onChange={() => setModelDownloadPolicy(p.id)}
                    className="mt-0.5 w-4 h-4 accent-teal-700"
                    aria-label={`Select ${p.title} policy`}
                  />
                  <div className="flex-1">
                    <span className="font-bold text-xs block">{p.title}</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">{p.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6. Theme Settings */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-5 h-5 text-teal-700 dark:text-teal-500" />
            <h2 className="font-bold text-slate-900 text-sm dark:text-white">App Theme</h2>
          </div>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => updateTheme(t)}
                className={cn(
                  "flex-1 py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-colors",
                  preferences?.theme === t 
                    ? "bg-teal-50 border-teal-600 text-teal-800 dark:bg-teal-900/30 dark:border-teal-500 dark:text-teal-300" 
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 7. App Installation */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-5 h-5 text-teal-700 dark:text-teal-500" />
            <h2 className="font-bold text-slate-900 text-sm dark:text-white">Offline App Installation</h2>
          </div>
          <PWAInstallButton variant="button" className="w-full" />
        </div>

        {/* 8. Reminders & Notification Lead Time */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-teal-700" />
            <h2 className="font-bold text-slate-900 text-sm">Notifications & Reminders</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-800">In-App Notifications</span>
              <input 
                type="checkbox" 
                checked={preferences?.notificationEnabled ?? true} 
                onChange={(e) => updateNotificationSettings(e.target.checked, preferences?.reminderLeadTimeMinutes || 60)}
                className="w-4 h-4 accent-teal-700 rounded"
              />
            </div>

            <div className="border-t border-slate-100 pt-2">
              <label className="font-semibold text-slate-800 block mb-1.5">Reminder Advance Lead Time</label>
              <select 
                value={preferences?.reminderLeadTimeMinutes || 60}
                onChange={(e) => updateNotificationSettings(preferences?.notificationEnabled ?? true, parseInt(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-teal-600"
              >
                <option value={15}>15 Minutes Before Event</option>
                <option value={60}>1 Hour Before Event</option>
                <option value={180}>3 Hours Before Event</option>
                <option value={720}>12 Hours Before Event</option>
                <option value={1440}>1 Day Before Event (24 Hours)</option>
                <option value={2880}>2 Days Before Event (48 Hours)</option>
                <option value={10080}>1 Week Before Event (7 Days)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 7. Privacy & Offline Local Storage Guarantee */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm">Local-First Storage Guarantee</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All family medical profiles, immunization logs, and care events are stored locally in your browser's IndexedDB. Your health data never leaves your device without explicit approval.
          </p>
        </div>

        {/* 8. Reset & Restore Data Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold text-slate-900 text-sm">Local Storage Management</h2>
          <div className="flex flex-col gap-2">
            <button 
              onClick={async () => {
                await dataBackupService.downloadBackupFile();
                showToast('Local backup exported successfully');
              }}
              className="w-full text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
              aria-label="Export my data"
            >
              Export My Data
            </button>

            <label className="w-full text-xs font-semibold text-purple-800 bg-purple-50 border border-purple-200 hover:bg-purple-100 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer">
              Import Backup
              <input 
                type="file" 
                accept=".json" 
                className="hidden" 
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    const content = event.target?.result;
                    if (typeof content === 'string') {
                      const res = await dataBackupService.importBackup(content);
                      if (res.success) {
                        showToast(res.message);
                        window.location.reload(); // Reload to refresh stores
                      } else {
                        appResilienceService.report('CORRUPTED_RECORD', res.message, 'Backup Import Failed');
                        showToast('Import failed. Existing data preserved.');
                      }
                    }
                  };
                  reader.readAsText(file);
                }}
                aria-label="Import backup"
              />
            </label>

            <button 
              onClick={async () => {
                await loadSeedData();
                showToast('Restored default demo profiles');
              }}
              className="w-full text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Restore Default Demo Profiles (Ama, Kofi, Efua)
            </button>

            <button 
              onClick={() => setIsResetConfirmOpen(true)}
              className="w-full text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Reset All Local Database Storage
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base text-center">Reset All Local Data?</h3>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              This action will completely wipe all local family members, care records, vaccination history, and custom reminders from your IndexedDB database.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button 
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  await resetAllData();
                  setIsResetConfirmOpen(false);
                  showToast('Local database reset');
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
