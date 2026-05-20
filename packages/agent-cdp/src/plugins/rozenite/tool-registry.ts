import type { AgentTool } from "./protocol.js";

export interface RegisteredTool extends AgentTool {
  qualifiedName: string;
}

export class RozeniteToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(domain: string, tools: AgentTool[]): void {
    for (const tool of tools) {
      const qualifiedName = `${domain}.${tool.name}`;
      this.tools.set(qualifiedName, { ...tool, qualifiedName });
    }
  }

  unregister(toolNames: string[]): void {
    for (const name of toolNames) {
      this.tools.delete(name);
    }
  }

  clear(): void {
    this.tools.clear();
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  get(qualifiedName: string): RegisteredTool | undefined {
    return this.tools.get(qualifiedName);
  }

  get size(): number {
    return this.tools.size;
  }
}