import { Form } from "react-router";

import type { LinkStatus } from "~/lib/types";

const TONES = {
  neutral: "border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white",
  danger: "border-red-500/30 text-red-400 hover:bg-red-500/10",
} as const;

/** One-button form posting a link status/delete intent to the current route. */
export function LinkActionButton({
  linkId,
  intent,
  children,
  confirmText,
  tone = "neutral",
  title,
}: {
  linkId: string;
  intent: "pause" | "activate" | "revoke" | "delete";
  children: React.ReactNode;
  confirmText?: string;
  tone?: keyof typeof TONES;
  title?: string;
}) {
  return (
    <Form
      method="post"
      className="inline"
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="linkId" value={linkId} />
      <button
        type="submit"
        title={title}
        className={`rounded-lg border px-2.5 py-1 text-xs transition ${TONES[tone]}`}
      >
        {children}
      </button>
    </Form>
  );
}

/**
 * Pause / Resume (also re-activates a locked link) / Revoke controls for the
 * link's current status. Revoked links are final — no status actions.
 */
export function LinkStatusActions({ linkId, status }: { linkId: string; status: LinkStatus }) {
  if (status === "revoked") return null;
  return (
    <>
      {status === "active" ? (
        <LinkActionButton linkId={linkId} intent="pause">
          Pause
        </LinkActionButton>
      ) : (
        <LinkActionButton
          linkId={linkId}
          intent="activate"
          title={status === "locked" ? "Clear the security lock and reactivate" : "Reactivate this link"}
        >
          {status === "locked" ? "Unlock" : "Resume"}
        </LinkActionButton>
      )}
      <LinkActionButton
        linkId={linkId}
        intent="revoke"
        tone="danger"
        confirmText="Revoke this link? Viewers lose access immediately and it cannot be reactivated."
      >
        Revoke
      </LinkActionButton>
    </>
  );
}
