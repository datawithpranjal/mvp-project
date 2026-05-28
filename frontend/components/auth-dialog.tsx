"use client";

import { AuthForm } from "./auth-form";

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthDialog({ isOpen, onClose }: AuthDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <AuthForm
          title="Log in to your playground account"
          description="Use an email OTP to access your profile, premium status, and interview prep workspace."
          onSuccess={onClose}
        />
      </div>
    </div>
  );
}
