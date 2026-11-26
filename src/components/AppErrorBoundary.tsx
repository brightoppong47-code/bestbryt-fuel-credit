import { Component, type ReactNode } from "react";

/** Keep provider, authentication and query failures from erasing the whole app. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
      <section role="alert" className="w-full max-w-lg rounded-xl border p-6 space-y-4">
        <h1 className="text-xl font-bold">BESTBRYT could not load</h1>
        <p>The app could not connect to its account or data service. Check your connection and try again.</p>
        <p className="text-sm">If this continues for several users, the administrator should check the Convex deployment status and usage limits. Reloading cannot restore a disabled backend.</p>
        <p className="text-sm">Do not clear app storage or re-enter payments to try to fix this screen.</p>
        <button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-semibold" onClick={() => window.location.reload()}>Reload app</button>
      </section>
    </main>;
  }
}
