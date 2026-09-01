import { readFileSync } from "node:fs";
import path from "node:path";
import type { PresalesDecision } from "@/types";

export interface ReplyConstraintRule {
  toolName?: string;
  subIntent?: string;
  requiredResultKeys?: string[];
  forbidPatterns?: string[];
  maxCharsPerSegment?: number;
  maxSegments?: number;
  maxFactsPerSegment?: number;
  fallbackTemplate?: string[];
  styleVariants?: string[];
}

export interface ReplyConstraintsConfig {
  default: ReplyConstraintRule;
  rules: ReplyConstraintRule[];
}

const DEFAULT_CONFIG: ReplyConstraintsConfig = {
  default: {
    maxCharsPerSegment: 60,
    maxSegments: 3,
    maxFactsPerSegment: 1,
    forbidPatterns: ["转人工", "AI", "机器人"],
  },
  rules: [],
};

const CONFIG_PATH = path.join(process.cwd(), "docs", "reply-constraints.yaml");

function loadConfig(): ReplyConstraintsConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return normalizeConfig(parseReplyConstraintsDocument(raw) as Partial<ReplyConstraintsConfig>);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function parseReplyConstraintsDocument(source: string): Record<string, unknown> {
  const trimmed = source.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to YAML parser
  }

  return parseYamlDocument(source);
}

function parseYamlDocument(source: string): Record<string, unknown> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const { value } = parseYamlBlock(lines, 0, 0);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("reply-constraints.yaml 内容无效");
  }
  return value as Record<string, unknown>;
}

function parseYamlBlock(lines: string[], startIndex: number, indent: number): { value: unknown; nextIndex: number } {
  let index = startIndex;
  let value: Record<string, unknown> | unknown[] | null = null;

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    const currentIndent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    if (currentIndent < indent) {
      break;
    }
    if (currentIndent > indent) {
      throw new Error("reply-constraints.yaml 缩进不合法");
    }

    if (trimmed.startsWith("- ")) {
      if (value && !Array.isArray(value)) {
        throw new Error("reply-constraints.yaml 结构冲突");
      }
      value ??= [];
      const itemContent = trimmed.slice(2).trim();
      const arrayValue = value as unknown[];
      if (!itemContent) {
        const child = parseYamlBlock(lines, index + 1, indent + 2);
        arrayValue.push(child.value);
        index = child.nextIndex;
        continue;
      }

      const inlinePair = parseYamlKeyValue(itemContent);
      if (!inlinePair) {
        arrayValue.push(parseYamlScalar(itemContent));
        index += 1;
        continue;
      }

      const item: Record<string, unknown> = { [inlinePair.key]: inlinePair.value };
      const child = parseYamlBlock(lines, index + 1, indent + 2);
      if (child.value && typeof child.value === "object" && !Array.isArray(child.value)) {
        Object.assign(item, child.value as Record<string, unknown>);
        index = child.nextIndex;
      } else if (child.value !== undefined && child.nextIndex > index + 1) {
        arrayValue.push(item);
        index = child.nextIndex;
        continue;
      } else {
        index += 1;
      }
      arrayValue.push(item);
      continue;
    }

    if (value && Array.isArray(value)) {
      throw new Error("reply-constraints.yaml 结构冲突");
    }
    value ??= {};
    const mapping = value as Record<string, unknown>;
    const pair = parseYamlKeyValue(trimmed);
    if (!pair) {
      throw new Error(`reply-constraints.yaml 无法解析：${trimmed}`);
    }

    if (pair.value !== undefined) {
      mapping[pair.key] = pair.value;
      index += 1;
      continue;
    }

    const child = parseYamlBlock(lines, index + 1, indent + 2);
    mapping[pair.key] = child.value;
    index = child.nextIndex;
  }

  return { value: value ?? {}, nextIndex: index };
}

function parseYamlKeyValue(line: string): { key: string; value?: unknown } | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const key = line.slice(0, colonIndex).trim();
  const rawValue = line.slice(colonIndex + 1).trim();
  if (!key) {
    return null;
  }
  if (!rawValue) {
    return { key };
  }
  return { key, value: parseYamlScalar(rawValue) };
}

function parseYamlScalar(rawValue: string): unknown {
  if (rawValue === "null" || rawValue === "~") return null;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) return Number(rawValue);
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const inner = rawValue.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseYamlScalar(item.trim()));
  }
  if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}

function normalizeConfig(config: Partial<ReplyConstraintsConfig>): ReplyConstraintsConfig {
  return {
    default: { ...DEFAULT_CONFIG.default, ...(config.default ?? {}) },
    rules: Array.isArray(config.rules) ? config.rules.map((item) => ({ ...item })) : [],
  };
}

const constraints = loadConfig();

export function resolveReplyConstraint(decision: Pick<PresalesDecision, "toolName" | "subIntent">): ReplyConstraintRule {
  const specific = constraints.rules.find((rule) => {
    if (rule.toolName !== decision.toolName) return false;
    if (rule.subIntent && rule.subIntent !== decision.subIntent) return false;
    return true;
  });
  return {
    ...constraints.default,
    ...(specific ?? {}),
  };
}

export function normalizeReplySegments(reply: string | string[]): string[] {
  const segments = Array.isArray(reply)
    ? reply
    : reply.split(/[\n。！？!?；;]+/g);
  return segments.map((item) => item.trim()).filter(Boolean);
}

export function joinReplySegments(reply: string[] | string): string {
  return normalizeReplySegments(reply).join("。") || "";
}

export function collectStringFacts(value: unknown): string[] {
  const facts = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) facts.add(trimmed);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return [...facts];
}

export function readReplyConstraintMax(key: keyof ReplyConstraintRule): number {
  const constraint = resolveReplyConstraint({ toolName: null, subIntent: undefined });
  const value = constraint[key];
  return typeof value === "number" ? value : 0;
}
