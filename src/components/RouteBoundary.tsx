import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section role="alert" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Die Seite konnte nicht geladen werden.</h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Erneut laden
        </button>
      </section>
    );
  }
}
