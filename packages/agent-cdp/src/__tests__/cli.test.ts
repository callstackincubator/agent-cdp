import { MULTIPLE_TARGETS_AVAILABLE_MESSAGE, ensureTargetSelected, main, usage } from "../cli.js";
import { createProgram } from "../cli/program.js";
import type { IpcCommand, IpcResponse, StatusInfo, TargetDescriptor } from "../types.js";

describe("cli", () => {
  it("prints the available daemon commands", () => {
    expect(usage()).toContain("If you are an LLM agent, run 'agent-cdp skills get core' before using this");
    expect(usage()).toContain("start");
    expect(usage()).toContain("status");
    expect(usage()).toContain("stop");
    expect(usage()).toContain("target list [--url URL]");
    expect(usage()).toContain("target select <id> [--url URL]");
    expect(usage()).toContain("runtime eval --expr EXPR [--await] [--json]");
    expect(usage()).toContain("runtime props --id OBJECT_ID [--own] [--accessor-properties-only]");
    expect(usage()).toContain("network start [--name NAME] [--preserve-across-navigation]");
    expect(usage()).toContain("network response-body --id REQ_ID [--session ID] [--file PATH]");
    expect(usage()).toContain("trace status");
    expect(usage()).toContain("trace entries [--session ID] [--track NAME]");
    expect(usage()).toContain("js-allocation start");
    expect(usage()).toContain("js-allocation-timeline start");
  });

  it("prints the preserved top-level help text", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["help"]);

    expect(logSpy).toHaveBeenCalledWith(usage());
    logSpy.mockRestore();
  });

  it("dispatches representative commands through commander", async () => {
    const ensureDaemonMock = vi.fn().mockResolvedValue(undefined);
    const sendCommandMock = vi.fn(async (command: IpcCommand): Promise<IpcResponse> => {
      if (command.type === "list-targets") {
        return { ok: true, data: [] };
      }

      if (command.type === "runtime-eval") {
        return {
          ok: true,
          data: {
            type: "string",
            value: "v22.0.0",
            description: "v22.0.0",
            objectGroup: "agent-cdp-runtime",
            hadSideEffect: false,
          },
        };
      }

      throw new Error(`Unexpected command: ${command.type}`);
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram({
      ensureDaemon: ensureDaemonMock,
      sendCommand: sendCommandMock,
      stopDaemon: vi.fn(),
    });

    await program.parseAsync(["target", "list", "--url", "http://127.0.0.1:9222"], { from: "user" });
    await program.parseAsync(["runtime", "eval", "--expr", "process.version"], { from: "user" });

    expect(sendCommandMock).toHaveBeenNthCalledWith(1, {
      type: "list-targets",
      options: { url: "http://127.0.0.1:9222" },
    });
    expect(sendCommandMock).toHaveBeenNthCalledWith(2, {
      type: "runtime-eval",
      expression: "process.version",
      awaitPromise: false,
    });

    logSpy.mockRestore();
  });

  it("auto-selects the only discovered target", async () => {
    const target: TargetDescriptor = {
      id: "chrome:MTI3LjAuMC4xOjkyMjI:page-1",
      rawId: "page-1",
      title: "Example",
      kind: "chrome",
      description: "Test page",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1",
      sourceUrl: "http://127.0.0.1:9222",
    };
    const commands: IpcCommand[] = [];
    const ensureDaemonMock = vi.fn().mockResolvedValue(undefined);
    const sendCommandMock = vi.fn(async (command: IpcCommand): Promise<IpcResponse> => {
      commands.push(command);
      if (command.type === "status") {
        return {
          ok: true,
          data: {
            daemonRunning: true,
            uptime: 123,
            selectedTarget: null,
            providerCount: 2,
            sessionState: "disconnected",
            tracingActive: false,
          } satisfies StatusInfo,
        };
      }

      if (command.type === "list-targets") {
        return { ok: true, data: [target] };
      }

      if (command.type === "select-target") {
        return { ok: true, data: target };
      }

      throw new Error(`Unexpected command: ${command.type}`);
    });

    await ensureTargetSelected({ ensureDaemon: ensureDaemonMock, sendCommand: sendCommandMock, stopDaemon: vi.fn() });

    expect(ensureDaemonMock).toHaveBeenCalledTimes(1);
    expect(commands).toEqual([
      { type: "status" },
      { type: "list-targets", options: {} },
      { type: "select-target", targetId: target.id, options: {} },
    ]);
  });

  it("skips auto-selection when a target is already selected", async () => {
    const ensureDaemonMock = vi.fn().mockResolvedValue(undefined);
    const sendCommandMock = vi.fn(async (command: IpcCommand): Promise<IpcResponse> => {
      if (command.type !== "status") {
        throw new Error(`Unexpected command: ${command.type}`);
      }

      return {
        ok: true,
        data: {
          daemonRunning: true,
          uptime: 123,
          selectedTarget: {
            id: "chrome:MTI3LjAuMC4xOjkyMjI:page-1",
            rawId: "page-1",
            title: "Example",
            kind: "chrome",
            description: "Test page",
            webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1",
            sourceUrl: "http://127.0.0.1:9222",
          },
          providerCount: 2,
          sessionState: "connected",
          tracingActive: false,
        } satisfies StatusInfo,
      };
    });

    await ensureTargetSelected({ ensureDaemon: ensureDaemonMock, sendCommand: sendCommandMock, stopDaemon: vi.fn() });

    expect(ensureDaemonMock).toHaveBeenCalledTimes(1);
    expect(sendCommandMock).toHaveBeenCalledTimes(1);
    expect(sendCommandMock).toHaveBeenCalledWith({ type: "status" });
  });

  it("fails with the manual-selection message when multiple targets are available", async () => {
    const ensureDaemonMock = vi.fn().mockResolvedValue(undefined);
    const sendCommandMock = vi.fn(async (command: IpcCommand): Promise<IpcResponse> => {
      if (command.type === "status") {
        return {
          ok: true,
          data: {
            daemonRunning: true,
            uptime: 123,
            selectedTarget: null,
            providerCount: 2,
            sessionState: "disconnected",
            tracingActive: false,
          } satisfies StatusInfo,
        };
      }

      if (command.type === "list-targets") {
        return {
          ok: true,
          data: [
            {
              id: "chrome:MTI3LjAuMC4xOjkyMjI:page-1",
              rawId: "page-1",
              title: "Example 1",
              kind: "chrome",
              description: "Test page",
              webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1",
              sourceUrl: "http://127.0.0.1:9222",
            },
            {
              id: "chrome:MTI3LjAuMC4xOjkyMjI:page-2",
              rawId: "page-2",
              title: "Example 2",
              kind: "chrome",
              description: "Test page",
              webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/2",
              sourceUrl: "http://127.0.0.1:9222",
            },
          ] satisfies TargetDescriptor[],
        };
      }

      throw new Error(`Unexpected command: ${command.type}`);
    });

    await expect(
      ensureTargetSelected({ ensureDaemon: ensureDaemonMock, sendCommand: sendCommandMock, stopDaemon: vi.fn() }),
    ).rejects.toThrow(
      MULTIPLE_TARGETS_AVAILABLE_MESSAGE,
    );
    expect(sendCommandMock).toHaveBeenCalledTimes(2);
    expect(sendCommandMock).toHaveBeenNthCalledWith(1, { type: "status" });
    expect(sendCommandMock).toHaveBeenNthCalledWith(2, { type: "list-targets", options: {} });
  });
});
