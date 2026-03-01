'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

export default function SignInPopup() {
  useEffect(() => {
    signIn('github', { callbackUrl: '/auth/popup-callback' });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Redirecting to GitHub...
      </div>
    </div>
  );
}
