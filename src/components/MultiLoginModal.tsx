"use client";

import { useAuth } from "@/hooks/useAuth";
import { useMultiLoginDetect } from "@/hooks/useMultiLoginDetect";

/**
 * When the same user is signed in on 2+ browsers, shows a modal asking them
 * to close one session. Renders nothing when not logged in or only one session.
 */
export function MultiLoginModal() {
  const { user } = useAuth();
  const { multipleLoginsDetected } = useMultiLoginDetect(user?.id);

  if (!user || !multipleLoginsDetected) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6">
      <div className="max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
        <p className="text-sm font-bold text-slate-800">Multiple logins detected</p>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in on another browser or device. Please close one of your sessions to continue.
        </p>
      </div>
    </div>
  );
}
