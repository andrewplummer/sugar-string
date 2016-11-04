// Extended type definitions for Sugar v2.0.2
// Project: https://sugarjs.com/
// Definitions by: Andrew Plummer <plummer.andrew@gmail.com>

interface String {
  at<T>(index: number|Array<number>, loop?: boolean): T;
  camelize(upper?: boolean): string;
  capitalize(lower?: boolean, all?: boolean): string;
  chars<T>(callback?: (char: string, i: number, arr: Array<string>) => void): T[];
  codes<T>(callback?: (code: number, i: number, str: string) => void): T[];
  compact(): string;
  dasherize(): string;
  decodeBase64(): string;
  encodeBase64(): string;
  escapeHTML(): string;
  escapeURL(param?: boolean): string;
  first(n?: number): string;
  forEach<T>(search?: string|RegExp, callback?: (match: string, i: number, arr: Array<string>) => void): T[];
  forEach<T>(callback: (match: string, i: number, arr: Array<string>) => void): T[];
  format(...args: any[]): string;
  from(index?: number): string;
  insert(str: string, index?: number): string;
  isBlank(): boolean;
  isEmpty(): boolean;
  last(n?: number): string;
  lines<T>(callback?: (line: string, i: number, arr: Array<string>) => void): T[];
  pad(num: number, padding?: string): string;
  padLeft(num: number, padding?: string): string;
  padRight(num: number, padding?: string): string;
  parameterize(): string;
  remove(f: string|RegExp): string;
  removeAll(f: string|RegExp): string;
  removeTags(tag?: string, replace?: string|sugarjs.String.tagReplaceFn): string;
  replaceAll(f: string|RegExp, ...args: any[]): string;
  reverse(): string;
  shift<T>(n: number): T[];
  spacify(): string;
  stripTags(tag?: string, replace?: string|sugarjs.String.tagReplaceFn): string;
  titleize(): string;
  to(index?: number): string;
  toNumber(base?: number): number;
  trimLeft(): string;
  trimRight(): string;
  truncate(length: number, from?: string, ellipsis?: string): string;
  truncateOnWord(length: number, from?: string, ellipsis?: string): string;
  underscore(): string;
  unescapeHTML(): string;
  unescapeURL(partial?: boolean): string;
  words<T>(callback?: (word: string, i: number, arr: Array<string>) => void): T[];
}