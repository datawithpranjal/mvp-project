"use client";

import { useEffect, useState, type FormEvent } from "react";

import { AuthForm } from "../../components/auth-form";
import { updateAuthProfile } from "../../lib/api";
import {
  AUTH_UPDATED_EVENT,
  getAuthToken,
  getCurrentUser,
  refreshCurrentUser,
  saveCurrentUser,
  type AuthUser
} from "../../lib/auth";

const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"];

export default function ProfilePage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [formState, setFormState] = useState({
    full_name: "",
    role: "",
    experience_level: "Beginner",
    target_role: "",
    country: "",
    phone: "",
    linkedin_url: "",
    preparation_goal: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadUserIntoForm(user: AuthUser | null) {
    setCurrentUser(user);
    if (!user) {
      return;
    }

    setFormState({
      full_name: user.full_name ?? "",
      role: user.role ?? "",
      experience_level: user.experience_level ?? "Beginner",
      target_role: user.target_role ?? "",
      country: user.country ?? "",
      phone: user.phone ?? "",
      linkedin_url: user.linkedin_url ?? "",
      preparation_goal: user.preparation_goal ?? ""
    });
  }

  useEffect(() => {
    async function syncUser() {
      setIsLoading(true);
      const localUser = getCurrentUser();
      loadUserIntoForm(localUser);
      const freshUser = await refreshCurrentUser();
      if (freshUser) {
        loadUserIntoForm(freshUser);
      }
      setIsLoading(false);
    }

    void syncUser();
    window.addEventListener(AUTH_UPDATED_EVENT, syncUser);

    return () => window.removeEventListener(AUTH_UPDATED_EVENT, syncUser);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token) {
      setError("Please sign in again before saving your profile.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);
      const updatedProfile = await updateAuthProfile(token, formState);
      const updatedUser = saveCurrentUser(updatedProfile);
      if (updatedUser) {
        loadUserIntoForm(updatedUser);
      }
      setMessage("Profile updated.");
    } catch (saveError) {
      const nextMessage =
        saveError instanceof Error ? saveError.message : "Unable to update profile.";
      setError(nextMessage);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
        <div className="panel rounded-3xl p-6 text-sm text-slate-300">Loading profile...</div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10 sm:px-10">
        <AuthForm
          title="Log in to manage your profile"
          description="Use email OTP to access your interview preparation profile."
          onSuccess={(user) => loadUserIntoForm(user)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <section className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Account
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">Profile</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          {currentUser.email}
        </p>
      </section>

      <form onSubmit={handleSubmit} className="panel rounded-3xl p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="profile-full-name" className="mb-2 block text-sm text-slate-300">
              Full name
            </label>
            <input
              id="profile-full-name"
              type="text"
              required
              value={formState.full_name}
              onChange={(event) => setFormState({ ...formState, full_name: event.target.value })}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
          <div>
            <label htmlFor="profile-role" className="mb-2 block text-sm text-slate-300">
              Current role
            </label>
            <input
              id="profile-role"
              type="text"
              required
              value={formState.role}
              onChange={(event) => setFormState({ ...formState, role: event.target.value })}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
          <div>
            <label htmlFor="profile-experience" className="mb-2 block text-sm text-slate-300">
              Experience level
            </label>
            <select
              id="profile-experience"
              value={formState.experience_level}
              onChange={(event) =>
                setFormState({ ...formState, experience_level: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="profile-target-role" className="mb-2 block text-sm text-slate-300">
              Target role
            </label>
            <input
              id="profile-target-role"
              type="text"
              required
              value={formState.target_role}
              onChange={(event) => setFormState({ ...formState, target_role: event.target.value })}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
          <div>
            <label htmlFor="profile-country" className="mb-2 block text-sm text-slate-300">
              Country
            </label>
            <input
              id="profile-country"
              type="text"
              required
              value={formState.country}
              onChange={(event) => setFormState({ ...formState, country: event.target.value })}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
          <div>
            <label htmlFor="profile-phone" className="mb-2 block text-sm text-slate-300">
              Phone
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={formState.phone}
              onChange={(event) => setFormState({ ...formState, phone: event.target.value })}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="profile-linkedin" className="mb-2 block text-sm text-slate-300">
              LinkedIn URL
            </label>
            <input
              id="profile-linkedin"
              type="url"
              value={formState.linkedin_url}
              onChange={(event) =>
                setFormState({ ...formState, linkedin_url: event.target.value })
              }
              placeholder="https://linkedin.com/in/your-profile"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="profile-goal" className="mb-2 block text-sm text-slate-300">
              Preparation goal
            </label>
            <textarea
              id="profile-goal"
              required
              rows={5}
              value={formState.preparation_goal}
              onChange={(event) =>
                setFormState({ ...formState, preparation_goal: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm text-teal-100">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
          >
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </main>
  );
}
