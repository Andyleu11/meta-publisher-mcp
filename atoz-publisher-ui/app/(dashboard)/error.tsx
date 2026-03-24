"use client";

export default function DashboardError({
  error,
  reset,
}: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-red-50 p-6">
      <h2 className="text-sm font-bold text-brand-charcoal">Something went wrong</h2>
      <p className="mt-2 text-sm text-brand-muted">{error.message}</p>
      <button
        className="mt-4 rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-emerald"
        onClick={reset}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}
