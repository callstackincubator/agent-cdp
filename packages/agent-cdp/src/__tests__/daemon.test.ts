import { getConnectionErrorMessage, shouldReattachConsoleCollector } from "../daemon.js";

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

describe("getConnectionErrorMessage", () => {
  it("explains when no target has been selected", () => {
    expect(getConnectionErrorMessage(null)).toBe(
      "No target available. Use `target list` to find one, then `target select <id>`.",
    );
  });

  it("explains when a target exists but is disconnected", () => {
    expect(getConnectionErrorMessage({ id: "react-native:target-1" })).toBe(
      "Target react-native:target-1 is not connected. Reconnect the app and try again.",
    );
  });
});
