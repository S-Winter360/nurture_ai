import React from 'react';
import { Users, User, Baby, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { FamilyMember, CareEvent, VaccinationRecord, Reminder } from '../types';

interface FamilyCareOverviewProps {
  familyMembers: FamilyMember[];
  activeMemberId: string | null;
  onSelectMember: (memberId: string) => void;
  careEvents: CareEvent[];
  vaccinations?: VaccinationRecord[];
  reminders?: Reminder[];
}

export const FamilyCareOverview: React.FC<FamilyCareOverviewProps> = ({
  familyMembers,
  activeMemberId,
  onSelectMember,
  careEvents,
  vaccinations = [],
  reminders = []
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div id="family-care-overview-section" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Family Care Overview
          </h2>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {familyMembers.length} {familyMembers.length === 1 ? 'member' : 'members'} registered
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {familyMembers.map((member) => {
          const isActive = member.id === activeMemberId;

          // Member-specific summary without deep clinical data leakage
          const memberEvents = careEvents.filter((e) => e.familyMemberId === member.id);
          const memberReminders = reminders.filter(
            (r) => r.familyMemberId === member.id && !r.completed
          );
          const memberVaccines = vaccinations.filter((v) => v.familyMemberId === member.id);

          // Today & Overdue counts
          const todayCount =
            memberEvents.filter((e) => e.scheduledAt.startsWith(todayStr)).length +
            memberReminders.filter((r) => r.scheduledAt.startsWith(todayStr)).length;

          const overdueCount =
            memberEvents.filter((e) => {
              const d = e.scheduledAt.split('T')[0];
              return (d < todayStr && e.status === 'pending') || e.status === 'missed';
            }).length +
            memberVaccines.filter((v) => {
              return v.scheduledDate < todayStr && (v.status === 'scheduled' || v.status === 'overdue');
            }).length;

          // Next upcoming milestone
          const nextEvent = memberEvents
            .filter((e) => {
              const d = e.scheduledAt.split('T')[0];
              return d >= todayStr && e.status === 'pending';
            })
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

          return (
            <div
              key={member.id}
              id={`family-member-card-${member.id}`}
              onClick={() => onSelectMember(member.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isActive
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
              }`}
            >
              <div>
                {/* Header with icon and active indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        member.type === 'mother'
                          ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300'
                          : member.type === 'child'
                          ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {member.type === 'mother' ? (
                        <User className="w-4 h-4" />
                      ) : member.type === 'child' ? (
                        <Baby className="w-4 h-4" />
                      ) : (
                        <Users className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1">
                        {member.displayName}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                        {member.type === 'mother' ? 'Mother' : member.type === 'child' ? 'Child' : 'Caregiver'}
                      </p>
                    </div>
                  </div>

                  {isActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                      Active
                    </span>
                  )}
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-1.5 my-3">
                  {overdueCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3 h-3" /> {overdueCount} past schedule
                    </span>
                  ) : todayCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      <Clock className="w-3 h-3" /> {todayCount} due today
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Up to date
                    </span>
                  )}
                </div>

                {/* Next Milestone summary */}
                <div className="text-xs text-slate-600 dark:text-slate-300 min-h-[32px]">
                  {nextEvent ? (
                    <p className="line-clamp-2">
                      <span className="font-medium text-slate-900 dark:text-white">Next:</span>{' '}
                      {nextEvent.title} ({new Date(nextEvent.scheduledAt).toLocaleDateString()})
                    </p>
                  ) : (
                    <p className="text-slate-400 italic">No upcoming pending events</p>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 mt-2 flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span>{isActive ? 'Current Profile' : 'Switch Profile'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
