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
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 px-4 py-6 backdrop-blur-sm sm:py-10"
      onClick={onClose}
    >
      <div
        className="mx-auto flex min-h-full w-full max-w-2xl items-start sm:items-center"
        onClick={(event) => event.stopPropagation()}
      >
        <AuthForm
          title="Access The Data Foundry"
          description="Create an account or log in securely with a one-time code sent to your email."
          onSuccess={onClose}
        />
      </div>
    </div>
  );
}
