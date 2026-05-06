export const DEFAULT_RUNTIME_OBJECT_GROUP = "agent-cdp-runtime";

export interface RuntimeEvalResult {
  type: string;
  subtype?: string;
  className?: string;
  description?: string;
  value?: unknown;
  unserializableValue?: string;
  objectId?: string;
  objectGroup?: string;
}

export interface RuntimePropertyResult {
  name: string;
  enumerable: boolean;
  writable?: boolean;
  isAccessor: boolean;
  type?: string;
  subtype?: string;
  className?: string;
  description?: string;
  value?: unknown;
  unserializableValue?: string;
  objectId?: string;
}

export interface RuntimePropertiesResult {
  objectId: string;
  properties: RuntimePropertyResult[];
}
