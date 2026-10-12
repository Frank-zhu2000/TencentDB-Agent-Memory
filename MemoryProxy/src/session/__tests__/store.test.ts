/**
 * Regression for #1072.
 *
 * A dsh first frame injects metadata as role=user messages. tryHistoryScan
 * must not count a loaded `<skill_content ...>` block as a real user turn.
 * Counting it makes userCount > 1, so the frame is treated as existing
 * history and session-init (team memory injection) is skipped.
 *
 * The break this catches: dropping `<skill_content` from the metadata
 * skip-list sends this fixture down the history-scan path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionStore, type SessionIdentity } from "../store.js";

const identity: SessionIdentity = {
  userId: "user-1",
  agentSource: "dsh",
  sessionId: "session-93dba507",
};

const keyId = "dsh:session-93dba507";

function logsOf(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((args) => args.map((part) => String(part)).join(" ")).join("\n");
}

describe("tryHistoryScan dsh skill_content metadata (#1072)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still needs session-init when the first frame includes a loaded skill_content block", async () => {
    const store = new SessionStore();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const recovered = await store.getOrRecover(keyId, identity, {
      messages: [
        { role: "user", content: "/anima-prompt-v1 帮我生成一个角色" },
        { role: "user", content: "Current runtime context.\nworkspace=/tmp" },
        {
          role: "user",
          content: "<system-reminder>\nA skill is a reusable unit of instructions.",
        },
        {
          role: "user",
          content: '<skill_content name="anima-prompt-v1">\n# skill body\n</skill_content>',
        },
      ],
    });

    // Fresh classification returns before history scan. A counted
    // skill_content block falls through and logs this instead.
    const text = logsOf(log);
    expect(text).not.toContain("history scan → no agent marker");
    expect(text).not.toContain("one-shot bypass");
    expect(recovered).toBeUndefined();
  });

  it("still treats a second real user message as existing history", async () => {
    const store = new SessionStore();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const recovered = await store.getOrRecover(keyId, identity, {
      messages: [
        { role: "user", content: "first real prompt" },
        { role: "user", content: "Current runtime context.\nworkspace=/tmp" },
        { role: "user", content: "second real prompt" },
      ],
    });

    expect(logsOf(log)).toContain("history scan → no agent marker");
    expect(recovered).toBeUndefined();
  });
});
