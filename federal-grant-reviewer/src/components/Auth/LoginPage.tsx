import React from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Brain } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const LoginPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f4f7fc] flex flex-col items-center justify-center px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
          <Brain size={32} />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">Federal Grant Reviewer AI</h1>
        <p className="mt-2 text-slate-500">
          Evidence-grounded analysis for federal grant applications
        </p>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
          <span>HRSA</span>
          <span>·</span>
          <span>SAMHSA</span>
          <span>·</span>
          <span>NIH</span>
          <span>·</span>
          <span>CDC</span>
        </div>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-xl">
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#2563eb',
                  brandAccent: '#4f46e5',
                },
              },
            },
          }}
          providers={[]}
          view="sign_in"
          showLinks={true}
          redirectTo={window.location.origin + '/#/app'}
        />
      </div>

      {/* Disclaimer */}
      <p className="mt-6 max-w-md text-center text-xs text-slate-400 leading-5">
        This is an independently developed review-support system and is not affiliated with or
        endorsed by HRSA, SAMHSA, NIH, CDC, or any federal agency.
      </p>

      {/* Back to landing */}
      <button
        onClick={() => { window.location.hash = '/'; }}
        className="mt-4 text-sm text-blue-600 hover:underline"
      >
        ← Back to home
      </button>
    </div>
  );
};

export default LoginPage;
