"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { MultiLoginModal } from "@/components/MultiLoginModal";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <MultiLoginModal />
      {children}
    </AuthProvider>
  );
}
