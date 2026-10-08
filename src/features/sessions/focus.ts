/** A conversation target from the URL: a message, a tool call or a subagent. */
export type Focus = { msg?: string; call?: string; sub?: string };

export const focusFrom = (params: URLSearchParams): Focus => ({
  msg: params.get("msg") || undefined,
  call: params.get("call") || undefined,
  sub: params.get("sub") || undefined,
});

/** The conversation tab URL that opens on `focus`. */
export const conversationPath = (id: string, focus: Focus = {}) => {
  const search = new URLSearchParams(
    Object.entries(focus).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();
  return (
    "/sesion/" + encodeURIComponent(id) + "/conversacion" + (search ? "?" + search : "")
  );
};
