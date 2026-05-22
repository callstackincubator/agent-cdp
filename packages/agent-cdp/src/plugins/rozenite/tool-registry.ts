import type { RozeniteRegisteredTool } from "./protocol.js";

export class ToolRegistry {
  private readonly tools = new Map<string, RozeniteRegisteredTool>();

  register(tools: RozeniteRegisteredTool[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  unregister(toolNames: string[]): void {
    for (const name of toolNames) {
      this.tools.delete(name);
    }
  }

  getAll(): RozeniteRegisteredTool[] {
    return [...this.tools.values()];
  }

  get(name: string): RozeniteRegisteredTool | undefined {
    return this.tools.get(name);
  }

  size(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
  }
}
