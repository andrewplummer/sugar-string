// Type definitions for Sugar v2.0.3
// Project: https://sugarjs.com/
// Definitions by: Andrew Plummer <plummer.andrew@gmail.com>

declare namespace sugarjs {

  type SugarDefaultChainable<RawValue> = Array.Chainable<any, RawValue> &
                                         Date.Chainable<RawValue> &
                                         Function.Chainable<RawValue> &
                                         Number.Chainable<RawValue> &
                                         Object.Chainable<RawValue> &
                                         RegExp.Chainable<RawValue> &
                                         String.Chainable<RawValue>;

  type NativeConstructor = ArrayConstructor |
                           DateConstructor |
                           FunctionConstructor |
                           NumberConstructor |
                           ObjectConstructor |
                           RegExpConstructor |
                           StringConstructor |
                           BooleanConstructor |
                           ErrorConstructor;

  interface ExtendOptions {
    methods?: Array<string>;
    except?: Array<string|NativeConstructor>;
    namespaces?: Array<NativeConstructor>;
    enhance?: boolean;
    enhanceString?: boolean;
    enhanceArray?: boolean;
    objectPrototype?: boolean;
  }

  interface Sugar {
    (opts?: ExtendOptions): Sugar;
    createNamespace(name: string): SugarNamespace;
    extend(opts?: ExtendOptions): Sugar;
    Array: Array.Constructor;
    Date: Date.Constructor;
    Function: Function.Constructor;
    Number: Number.Constructor;
    Object: Object.Constructor;
    RegExp: RegExp.Constructor;
    String: String.Constructor;
  }

  interface SugarNamespace {
    alias(toName: string, from: string|Function): this;
    alias(toName: string, fn: undefined): this;
    defineInstance(methods: Object): this;
    defineInstance(methodName: string, methodFn: Function): this;
    defineInstanceAndStatic(methods: Object): this;
    defineInstanceAndStatic(methodName: string, methodFn: Function): this;
    defineInstancePolyfill(methods: Object): this;
    defineInstancePolyfill(methodName: string, methodFn: Function): this;
    defineInstanceWithArguments(methods: Object): this;
    defineInstanceWithArguments(methodName: string, methodFn: Function): this;
    defineStatic(methods: Object): this;
    defineStatic(methodName: string, methodFn: Function): this;
    defineStaticPolyfill(methods: Object): this;
    defineStaticPolyfill(methodName: string, methodFn: Function): this;
    defineStaticWithArguments(methods: Object): this;
    defineStaticWithArguments(methodName: string, methodFn: Function): this;
    extend(opts?: ExtendOptions): this;
  }

  namespace Array {

    type Chainable<T, RawValue> = ChainableBase<T, RawValue> & Object.ChainableBase<RawValue>;

    interface ChainableBase<T, RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
      concat(...items: (T | T[])[]): SugarDefaultChainable<T[]>;
      concat(...items: T[][]): SugarDefaultChainable<T[]>;
      copyWithin(target: number, start: number, end?: number): SugarDefaultChainable<this>;
      every(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): SugarDefaultChainable<boolean>;
      fill(value: T, start?: number, end?: number): SugarDefaultChainable<this>;
      filter(callbackfn: (value: T, index: number, array: T[]) => any, thisArg?: any): SugarDefaultChainable<T[]>;
      find(predicate: (value: T, index: number, obj: Array<T>) => boolean, thisArg?: any): SugarDefaultChainable<T | undefined>;
      findIndex(predicate: (value: T, index: number, obj: Array<T>) => boolean, thisArg?: any): SugarDefaultChainable<number>;
      forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): SugarDefaultChainable<void>;
      indexOf(searchElement: T, fromIndex?: number): SugarDefaultChainable<number>;
      join(separator?: string): SugarDefaultChainable<string>;
      lastIndexOf(searchElement: T, fromIndex?: number): SugarDefaultChainable<number>;
      map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): SugarDefaultChainable<U[]>;
      pop(): SugarDefaultChainable<T | undefined>;
      push(...items: T[]): SugarDefaultChainable<number>;
      reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue?: T): SugarDefaultChainable<T>;
      reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): SugarDefaultChainable<U>;
      reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue?: T): SugarDefaultChainable<T>;
      reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): SugarDefaultChainable<U>;
      reverse(): SugarDefaultChainable<T[]>;
      shift(): SugarDefaultChainable<T | undefined>;
      slice(start?: number, end?: number): SugarDefaultChainable<T[]>;
      some(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): SugarDefaultChainable<boolean>;
      sort(compareFn?: (a: T, b: T) => number): SugarDefaultChainable<this>;
      splice(start: number): SugarDefaultChainable<T[]>;
      splice(start: number, deleteCount: number, ...items: T[]): SugarDefaultChainable<T[]>;
      toLocaleString(): SugarDefaultChainable<string>;
      unshift(...items: T[]): SugarDefaultChainable<number>;
    }

  }

  namespace Date {

    type Chainable<RawValue> = ChainableBase<RawValue> & Object.ChainableBase<RawValue>;

    interface ChainableBase<RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
      getDate(): SugarDefaultChainable<number>;
      getDay(): SugarDefaultChainable<number>;
      getFullYear(): SugarDefaultChainable<number>;
      getHours(): SugarDefaultChainable<number>;
      getMilliseconds(): SugarDefaultChainable<number>;
      getMinutes(): SugarDefaultChainable<number>;
      getMonth(): SugarDefaultChainable<number>;
      getSeconds(): SugarDefaultChainable<number>;
      getTime(): SugarDefaultChainable<number>;
      getTimezoneOffset(): SugarDefaultChainable<number>;
      getUTCDate(): SugarDefaultChainable<number>;
      getUTCDay(): SugarDefaultChainable<number>;
      getUTCFullYear(): SugarDefaultChainable<number>;
      getUTCHours(): SugarDefaultChainable<number>;
      getUTCMilliseconds(): SugarDefaultChainable<number>;
      getUTCMinutes(): SugarDefaultChainable<number>;
      getUTCMonth(): SugarDefaultChainable<number>;
      getUTCSeconds(): SugarDefaultChainable<number>;
      setDate(date: number): SugarDefaultChainable<number>;
      setFullYear(year: number, month?: number, date?: number): SugarDefaultChainable<number>;
      setHours(hours: number, min?: number, sec?: number, ms?: number): SugarDefaultChainable<number>;
      setMilliseconds(ms: number): SugarDefaultChainable<number>;
      setMinutes(min: number, sec?: number, ms?: number): SugarDefaultChainable<number>;
      setMonth(month: number, date?: number): SugarDefaultChainable<number>;
      setSeconds(sec: number, ms?: number): SugarDefaultChainable<number>;
      setTime(time: number): SugarDefaultChainable<number>;
      setUTCDate(date: number): SugarDefaultChainable<number>;
      setUTCFullYear(year: number, month?: number, date?: number): SugarDefaultChainable<number>;
      setUTCHours(hours: number, min?: number, sec?: number, ms?: number): SugarDefaultChainable<number>;
      setUTCMilliseconds(ms: number): SugarDefaultChainable<number>;
      setUTCMinutes(min: number, sec?: number, ms?: number): SugarDefaultChainable<number>;
      setUTCMonth(month: number, date?: number): SugarDefaultChainable<number>;
      setUTCSeconds(sec: number, ms?: number): SugarDefaultChainable<number>;
      toDateString(): SugarDefaultChainable<string>;
      toISOString(): SugarDefaultChainable<string>;
      toJSON(key?: any): SugarDefaultChainable<string>;
      toLocaleDateString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): SugarDefaultChainable<string>;
      toLocaleDateString(): SugarDefaultChainable<string>;
      toLocaleString(): SugarDefaultChainable<string>;
      toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): SugarDefaultChainable<string>;
      toLocaleTimeString(): SugarDefaultChainable<string>;
      toLocaleTimeString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): SugarDefaultChainable<string>;
      toTimeString(): SugarDefaultChainable<string>;
      toUTCString(): SugarDefaultChainable<string>;
    }

  }

  namespace Function {

    type Chainable<RawValue> = ChainableBase<RawValue> & Object.ChainableBase<RawValue>;

    interface ChainableBase<RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
      apply(thisArg: any, argArray?: any): SugarDefaultChainable<any>;
      bind(thisArg: any, ...argArray: any[]): SugarDefaultChainable<any>;
      call(thisArg: any, ...argArray: any[]): SugarDefaultChainable<any>;
    }

  }

  namespace Number {

    type Chainable<RawValue> = ChainableBase<RawValue> & Object.ChainableBase<RawValue>;

    interface ChainableBase<RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
      toExponential(fractionDigits?: number): SugarDefaultChainable<string>;
      toFixed(fractionDigits?: number): SugarDefaultChainable<string>;
      toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): SugarDefaultChainable<string>;
      toPrecision(precision?: number): SugarDefaultChainable<string>;
    }

  }

  namespace Object {

    type Chainable<RawValue> = ChainableBase<RawValue>;

    interface ChainableBase<RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
    }

  }

  namespace RegExp {

    type Chainable<RawValue> = ChainableBase<RawValue> & Object.ChainableBase<RawValue>;

    interface ChainableBase<RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
      exec(string: string): SugarDefaultChainable<RegExpExecArray | null>;
      test(string: string): SugarDefaultChainable<boolean>;
    }

  }

  namespace String {

    type Chainable<RawValue> = ChainableBase<RawValue> & Object.ChainableBase<RawValue>;
    type tagReplaceFn = (tag: string, inner: string, attr: string, outer: string) => string;

    interface Constructor extends SugarNamespace {
      (raw?: string): Chainable<string>;
      new(raw?: string): Chainable<string>;
      at<T>(instance: string, index: number|Array<number>, loop?: boolean): T;
      camelize(instance: string, upper?: boolean): string;
      capitalize(instance: string, lower?: boolean, all?: boolean): string;
      chars<T>(instance: string, callback?: (char: string, i: number, arr: Array<string>) => void): T[];
      codes<T>(instance: string, callback?: (code: number, i: number, str: string) => void): T[];
      compact(instance: string): string;
      dasherize(instance: string): string;
      decodeBase64(instance: string): string;
      encodeBase64(instance: string): string;
      escapeHTML(instance: string): string;
      escapeURL(instance: string, param?: boolean): string;
      first(instance: string, n?: number): string;
      forEach<T>(instance: string, search?: string|RegExp, callback?: (match: string, i: number, arr: Array<string>) => void): T[];
      forEach<T>(instance: string, callback: (match: string, i: number, arr: Array<string>) => void): T[];
      format(instance: string, ...args: any[]): string;
      from(instance: string, index?: number): string;
      insert(instance: string, str: string, index?: number): string;
      isBlank(instance: string): boolean;
      isEmpty(instance: string): boolean;
      last(instance: string, n?: number): string;
      lines<T>(instance: string, callback?: (line: string, i: number, arr: Array<string>) => void): T[];
      pad(instance: string, num: number, padding?: string): string;
      padLeft(instance: string, num: number, padding?: string): string;
      padRight(instance: string, num: number, padding?: string): string;
      parameterize(instance: string): string;
      remove(instance: string, f: string|RegExp): string;
      removeAll(instance: string, f: string|RegExp): string;
      removeTags(instance: string, tag?: string, replace?: string|tagReplaceFn): string;
      replaceAll(instance: string, f: string|RegExp, ...args: any[]): string;
      reverse(instance: string): string;
      shift<T>(instance: string, n: number): T[];
      spacify(instance: string): string;
      stripTags(instance: string, tag?: string, replace?: string|tagReplaceFn): string;
      titleize(instance: string): string;
      to(instance: string, index?: number): string;
      toNumber(instance: string, base?: number): number;
      trimLeft(instance: string): string;
      trimRight(instance: string): string;
      truncate(instance: string, length: number, from?: string, ellipsis?: string): string;
      truncateOnWord(instance: string, length: number, from?: string, ellipsis?: string): string;
      underscore(instance: string): string;
      unescapeHTML(instance: string): string;
      unescapeURL(instance: string, partial?: boolean): string;
      words<T>(instance: string, callback?: (word: string, i: number, arr: Array<string>) => void): T[];
    }

    interface ChainableBase<RawValue> {
      raw: RawValue;
      valueOf: () => RawValue;
      toString: () => string;
      at<T>(index: number|Array<number>, loop?: boolean): SugarDefaultChainable<T>;
      camelize(upper?: boolean): SugarDefaultChainable<string>;
      capitalize(lower?: boolean, all?: boolean): SugarDefaultChainable<string>;
      chars<T>(callback?: (char: string, i: number, arr: Array<string>) => SugarDefaultChainable<void>): SugarDefaultChainable<T[]>;
      codes<T>(callback?: (code: number, i: number, str: string) => SugarDefaultChainable<void>): SugarDefaultChainable<T[]>;
      compact(): SugarDefaultChainable<string>;
      dasherize(): SugarDefaultChainable<string>;
      decodeBase64(): SugarDefaultChainable<string>;
      encodeBase64(): SugarDefaultChainable<string>;
      escapeHTML(): SugarDefaultChainable<string>;
      escapeURL(param?: boolean): SugarDefaultChainable<string>;
      first(n?: number): SugarDefaultChainable<string>;
      forEach<T>(search?: string|RegExp, callback?: (match: string, i: number, arr: Array<string>) => SugarDefaultChainable<void>): SugarDefaultChainable<T[]>;
      forEach<T>(callback: (match: string, i: number, arr: Array<string>) => SugarDefaultChainable<void>): SugarDefaultChainable<T[]>;
      format(...args: any[]): SugarDefaultChainable<string>;
      from(index?: number): SugarDefaultChainable<string>;
      insert(str: string, index?: number): SugarDefaultChainable<string>;
      isBlank(): SugarDefaultChainable<boolean>;
      isEmpty(): SugarDefaultChainable<boolean>;
      last(n?: number): SugarDefaultChainable<string>;
      lines<T>(callback?: (line: string, i: number, arr: Array<string>) => SugarDefaultChainable<void>): SugarDefaultChainable<T[]>;
      pad(num: number, padding?: string): SugarDefaultChainable<string>;
      padLeft(num: number, padding?: string): SugarDefaultChainable<string>;
      padRight(num: number, padding?: string): SugarDefaultChainable<string>;
      parameterize(): SugarDefaultChainable<string>;
      remove(f: string|RegExp): SugarDefaultChainable<string>;
      removeAll(f: string|RegExp): SugarDefaultChainable<string>;
      removeTags(tag?: string, replace?: string|tagReplaceFn): SugarDefaultChainable<string>;
      replaceAll(f: string|RegExp, ...args: any[]): SugarDefaultChainable<string>;
      reverse(): SugarDefaultChainable<string>;
      shift<T>(n: number): SugarDefaultChainable<T[]>;
      spacify(): SugarDefaultChainable<string>;
      stripTags(tag?: string, replace?: string|tagReplaceFn): SugarDefaultChainable<string>;
      titleize(): SugarDefaultChainable<string>;
      to(index?: number): SugarDefaultChainable<string>;
      toNumber(base?: number): SugarDefaultChainable<number>;
      trimLeft(): SugarDefaultChainable<string>;
      trimRight(): SugarDefaultChainable<string>;
      truncate(length: number, from?: string, ellipsis?: string): SugarDefaultChainable<string>;
      truncateOnWord(length: number, from?: string, ellipsis?: string): SugarDefaultChainable<string>;
      underscore(): SugarDefaultChainable<string>;
      unescapeHTML(): SugarDefaultChainable<string>;
      unescapeURL(partial?: boolean): SugarDefaultChainable<string>;
      words<T>(callback?: (word: string, i: number, arr: Array<string>) => SugarDefaultChainable<void>): SugarDefaultChainable<T[]>;
      anchor(name: string): SugarDefaultChainable<string>;
      big(): SugarDefaultChainable<string>;
      blink(): SugarDefaultChainable<string>;
      bold(): SugarDefaultChainable<string>;
      charAt(pos: number): SugarDefaultChainable<string>;
      charCodeAt(index: number): SugarDefaultChainable<number>;
      codePointAt(pos: number): SugarDefaultChainable<number | undefined>;
      concat(...strings: string[]): SugarDefaultChainable<string>;
      endsWith(searchString: string, endPosition?: number): SugarDefaultChainable<boolean>;
      fixed(): SugarDefaultChainable<string>;
      fontcolor(color: string): SugarDefaultChainable<string>;
      fontsize(size: number): SugarDefaultChainable<string>;
      fontsize(size: string): SugarDefaultChainable<string>;
      includes(searchString: string, position?: number): SugarDefaultChainable<boolean>;
      indexOf(searchString: string, position?: number): SugarDefaultChainable<number>;
      italics(): SugarDefaultChainable<string>;
      lastIndexOf(searchString: string, position?: number): SugarDefaultChainable<number>;
      link(url: string): SugarDefaultChainable<string>;
      localeCompare(that: string): SugarDefaultChainable<number>;
      localeCompare(that: string, locales?: string | string[], options?: Intl.CollatorOptions): SugarDefaultChainable<number>;
      match(regexp: RegExp): SugarDefaultChainable<RegExpMatchArray | null>;
      match(regexp: string): SugarDefaultChainable<RegExpMatchArray | null>;
      normalize(form?: string): SugarDefaultChainable<string>;
      normalize(form: "NFC" | "NFD" | "NFKC" | "NFKD"): SugarDefaultChainable<string>;
      repeat(count: number): SugarDefaultChainable<string>;
      replace(searchValue: string, replaceValue: string): SugarDefaultChainable<string>;
      replace(searchValue: string, replacer: (substring: string, ...args: any[]) => string): SugarDefaultChainable<string>;
      replace(searchValue: RegExp, replaceValue: string): SugarDefaultChainable<string>;
      replace(searchValue: RegExp, replacer: (substring: string, ...args: any[]) => string): SugarDefaultChainable<string>;
      search(regexp: RegExp): SugarDefaultChainable<number>;
      search(regexp: string): SugarDefaultChainable<number>;
      slice(start?: number, end?: number): SugarDefaultChainable<string>;
      small(): SugarDefaultChainable<string>;
      split(separator: string, limit?: number): SugarDefaultChainable<string[]>;
      split(separator: RegExp, limit?: number): SugarDefaultChainable<string[]>;
      startsWith(searchString: string, position?: number): SugarDefaultChainable<boolean>;
      strike(): SugarDefaultChainable<string>;
      sub(): SugarDefaultChainable<string>;
      substr(from: number, length?: number): SugarDefaultChainable<string>;
      substring(start: number, end?: number): SugarDefaultChainable<string>;
      sup(): SugarDefaultChainable<string>;
      toLocaleLowerCase(): SugarDefaultChainable<string>;
      toLocaleUpperCase(): SugarDefaultChainable<string>;
      toLowerCase(): SugarDefaultChainable<string>;
      toUpperCase(): SugarDefaultChainable<string>;
      trim(): SugarDefaultChainable<string>;
    }

  }

}

declare module "sugar" {
  const Sugar: sugarjs.Sugar;
  export = Sugar;
}

declare var Sugar: sugarjs.Sugar;