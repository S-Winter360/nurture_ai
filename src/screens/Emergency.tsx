import React from 'react';
import { Phone, Navigation, AlertTriangle, ShieldAlert } from 'lucide-react';

const Emergency = () => {
  return (
    <div className="flex flex-col h-full bg-red-50">
      <div className="px-4 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-8 h-8 text-red-600" />
          <h1 className="text-3xl font-bold text-red-900">Emergency</h1>
        </div>
        <p className="text-red-700 text-sm font-medium">Quick access to medical help</p>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <Phone className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">National Ambulance</h2>
              <p className="text-sm text-slate-500">Call 193</p>
            </div>
          </div>
          <button className="bg-red-600 text-white px-4 py-2 rounded-full font-semibold text-sm">
            Call
          </button>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <Navigation className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Nearest Hospital</h2>
              <p className="text-sm text-slate-500">Locate healthcare facilities</p>
            </div>
          </div>
          <button className="bg-slate-900 text-white px-4 py-2 rounded-full font-semibold text-sm">
            Find
          </button>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100">
          <div className="flex items-center gap-2 mb-3 text-red-800">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-bold">Danger Signs</h2>
          </div>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5"></div>
              <span>Vaginal bleeding during pregnancy</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5"></div>
              <span>Severe headaches or blurred vision</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5"></div>
              <span>Baby moving less than usual</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5"></div>
              <span>Difficulty breathing or severe chest pain</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Emergency;
