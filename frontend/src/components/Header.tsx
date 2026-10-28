'use client';

import React from 'react';
import Link from 'next/link';
import { Car, Camera, Wifi, User, LogOut, LogIn } from 'lucide-react';
import { UserProfile } from '../lib/types';

interface HeaderProps {
  wsConnected: boolean;
  systemOnline: boolean;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  wsConnected,
  systemOnline,
  currentUser,
  onLogout,
}) => {
  return (
    <header className="bg-[#333545] text-white px-6 py-4 rounded-2xl mb-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 border border-gray-700/50">
      <div className="flex items-center space-x-4">
        {/* BookMyShow Red Icon Badge */}
        <div className="p-3 bg-[#F84464] text-white rounded-xl flex items-center justify-center shadow-md shadow-[#F84464]/30">
          <Car className="w-7 h-7" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
              Auto<span className="text-[#F84464]">Park</span>
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider bg-[#F84464] text-white">
              SMART BOOKING
            </span>
          </div>
          <p className="text-xs text-gray-300 mt-0.5 flex items-center gap-1.5 font-medium">
            <Camera className="w-3.5 h-3.5 text-[#F84464]" />
            Camera-Based Real-Time Parking Slot Allocation System
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
        {/* User Account / Auth Section */}
        {currentUser ? (
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#222531] border border-gray-600/60 text-xs">
            <div className="w-6 h-6 rounded-full bg-[#F84464]/20 border border-[#F84464]/40 flex items-center justify-center text-[#F84464]">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <p className="font-bold text-white leading-tight">
                {currentUser.full_name || currentUser.username}
              </p>
              <p className="text-[10px] text-gray-400 capitalize">
                {currentUser.role}
              </p>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Log out"
                className="ml-1 p-1 hover:text-rose-400 text-gray-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#F84464] hover:bg-[#e03a58] text-white shadow-md shadow-[#F84464]/20 transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Driver Sign In</span>
            </Link>
            <Link
              href="/register"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#222531] hover:bg-gray-700/60 text-gray-200 border border-gray-600 transition-all"
            >
              <span>Register</span>
            </Link>
          </div>
        )}

        {/* System Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#222531] text-xs font-bold text-gray-200 border border-gray-600/60">
          <span className={`w-2.5 h-2.5 rounded-full ${systemOnline ? 'bg-[#2DC492]' : 'bg-rose-500'}`} />
          <span>{systemOnline ? 'System Online' : 'System Offline'}</span>
        </div>

        {/* WebSocket Connection Badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
          wsConnected 
            ? 'bg-[#2DC492]/20 border-[#2DC492] text-[#2DC492]' 
            : 'bg-amber-500/20 border-amber-500 text-amber-300'
        }`}>
          <Wifi className="w-3.5 h-3.5" />
          <span>{wsConnected ? 'Live Connection' : 'Reconnecting'}</span>
        </div>
      </div>
    </header>
  );
};
