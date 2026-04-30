import { shouldReattachConsoleCollector } from "../daemon.js";

describe("shouldReattachConsoleCollector", () => {
  it("does not reattach when the session is still connected", () => {
    expect(shouldReattachConsoleCollector(true, { kind: "react-native" })).toBe(false);
  });

  it("reattaches after a react native reconnect", () => {
    expect(shouldReattachConsoleCollector(false, { kind: "react-native" })).toBe(true);
  });

  it("does not reattach for non-react-native targets", () => {
    expect(shouldReattachConsoleCollector(false, { kind: "chrome" })).toBe(false);
    expect(shouldReattachConsoleCollector(false, null)).toBe(false);
  });
});
