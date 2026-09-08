"use client";

import { useEffect } from "react";

/**
 * Long forms often render a server-side field error far above the submit
 * button. Observe newly-rendered `.err-text` nodes inside one scoped root,
 * scroll the owning control into view, then focus it without triggering a
 * second browser scroll. This keeps the behavior independent from any one
 * form's state model and avoids duplicating the same MutationObserver logic.
 */
export default function ScrollToFormError({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    let lastError: HTMLElement | null = null;

    function revealFirstError() {
      const error = root.querySelector<HTMLElement>(".err-text");
      if (!error || error === lastError) return;
      lastError = error;

      const owner = error.closest<HTMLElement>(".field") ?? error.parentElement;
      const target = owner?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])'
      );

      (target ?? error).scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    }

    const observer = new MutationObserver(revealFirstError);
    observer.observe(root, { childList: true, subtree: true });
    revealFirstError();

    return () => observer.disconnect();
  }, [rootId]);

  return null;
}
