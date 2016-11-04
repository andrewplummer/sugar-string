/*
 *  Sugar v2.0.2
 *
 *  Freely distributable and licensed under the MIT-style license.
 *  Copyright (c) Andrew Plummer
 *  https://sugarjs.com/
 *
 * ---------------------------- */
(function() {
  'use strict';

  /***
   * @module Core
   * @description Core functionality including the ability to define methods and
   *              extend onto natives.
   *
   ***/

  // The global to export.
  var Sugar;

  // The name of Sugar in the global namespace.
  var SUGAR_GLOBAL = 'Sugar';

  // Natives available on initialization. Letting Object go first to ensure its
  // global is set by the time the rest are checking for chainable Object methods.
  var NATIVE_NAMES = 'Object Number String Array Date RegExp Function';

  // Static method flag
  var STATIC   = 0x1;

  // Instance method flag
  var INSTANCE = 0x2;

  // IE8 has a broken defineProperty but no defineProperties so this saves a try/catch.
  var PROPERTY_DESCRIPTOR_SUPPORT = !!(Object.defineProperty && Object.defineProperties);

  // The global context. Rhino uses a different "global" keyword so
  // do an extra check to be sure that it's actually the global context.
  var globalContext = typeof global !== 'undefined' && global.Object === Object ? global : this;

  // Is the environment node?
  var hasExports = typeof module !== 'undefined' && module.exports;

  // Whether object instance methods can be mapped to the prototype.
  var allowObjectPrototype = false;

  // A map from Array to SugarArray.
  var namespacesByName = {};

  // A map from [object Object] to namespace.
  var namespacesByClassString = {};

  // Defining properties.
  var defineProperty = PROPERTY_DESCRIPTOR_SUPPORT ?  Object.defineProperty : definePropertyShim;

  // A default chainable class for unknown types.
  var DefaultChainable = getNewChainableClass('Chainable');


  // Global methods

  function setupGlobal() {
    Sugar = globalContext[SUGAR_GLOBAL];
    if (Sugar) {
      // Reuse already defined Sugar global object.
      return;
    }
    Sugar = function(arg) {
      forEachProperty(Sugar, function(sugarNamespace, name) {
        // Although only the only enumerable properties on the global
        // object are Sugar namespaces, environments that can't set
        // non-enumerable properties will step through the utility methods
        // as well here, so use this check to only allow true namespaces.
        if (hasOwn(namespacesByName, name)) {
          sugarNamespace.extend(arg);
        }
      });
      return Sugar;
    };
    if (hasExports) {
      module.exports = Sugar;
    } else {
      try {
        globalContext[SUGAR_GLOBAL] = Sugar;
      } catch (e) {
        // Contexts such as QML have a read-only global context.
      }
    }
    forEachProperty(NATIVE_NAMES.split(' '), function(name) {
      createNamespace(name);
    });
    setGlobalProperties();
  }

  /***
   * @method createNamespace(name)
   * @returns SugarNamespace
   * @namespace Sugar
   * @short Creates a new Sugar namespace.
   * @extra This method is for plugin developers who want to define methods to be
   *        used with natives that Sugar does not handle by default. The new
   *        namespace will appear on the `Sugar` global with all the methods of
   *        normal namespaces, including the ability to define new methods. When
   *        extended, any defined methods will be mapped to `name` in the global
   *        context.
   *
   * @example
   *
   *   Sugar.createNamespace('Boolean');
   *
   * @param {string} name - The namespace name.
   *
   ***/
  function createNamespace(name) {

    // Is the current namespace Object?
    var isObject = name === 'Object';

    // A Sugar namespace is also a chainable class: Sugar.Array, etc.
    var sugarNamespace = getNewChainableClass(name, true);

    /***
     * @method extend([opts])
     * @returns Sugar
     * @namespace Sugar
     * @short Extends Sugar defined methods onto natives.
     * @extra This method can be called on individual namespaces like
     *        `Sugar.Array` or on the `Sugar` global itself, in which case
     *        [opts] will be forwarded to each `extend` call. For more,
     *        see `extending`.
     *
     * @options
     *
     *   methods           An array of method names to explicitly extend.
     *
     *   except            An array of method names or global namespaces (`Array`,
     *                     `String`) to explicitly exclude. Namespaces should be the
     *                     actual global objects, not strings.
     *
     *   namespaces        An array of global namespaces (`Array`, `String`) to
     *                     explicitly extend. Namespaces should be the actual
     *                     global objects, not strings.
     *
     *   enhance           A shortcut to disallow all "enhance" flags at once
     *                     (flags listed below). For more, see `enhanced methods`.
     *                     Default is `true`.
     *
     *   enhanceString     A boolean allowing String enhancements. Default is `true`.
     *
     *   enhanceArray      A boolean allowing Array enhancements. Default is `true`.
     *
     *   objectPrototype   A boolean allowing Sugar to extend Object.prototype
     *                     with instance methods. This option is off by default
     *                     and should generally not be used except with caution.
     *                     For more, see `object methods`.
     *
     * @example
     *
     *   Sugar.Array.extend();
     *   Sugar.extend();
     *
     * @option {Array<string>} [methods]
     * @option {Array<string|NativeConstructor>} [except]
     * @option {Array<NativeConstructor>} [namespaces]
     * @option {boolean} [enhance]
     * @option {boolean} [enhanceString]
     * @option {boolean} [enhanceArray]
     * @option {boolean} [objectPrototype]
     * @param {ExtendOptions} [opts]
     *
     ***
     * @method extend([opts])
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Extends Sugar defined methods for a specific namespace onto natives.
     * @param {ExtendOptions} [opts]
     *
     ***/
    var extend = function (opts) {

      var nativeClass = globalContext[name], nativeProto = nativeClass.prototype;
      var staticMethods = {}, instanceMethods = {}, methodsByName;

      function objectRestricted(name, target) {
        return isObject && target === nativeProto &&
               (!allowObjectPrototype || name === 'get' || name === 'set');
      }

      function arrayOptionExists(field, val) {
        var arr = opts[field];
        if (arr) {
          for (var i = 0, el; el = arr[i]; i++) {
            if (el === val) {
              return true;
            }
          }
        }
        return false;
      }

      function arrayOptionExcludes(field, val) {
        return opts[field] && !arrayOptionExists(field, val);
      }

      function disallowedByFlags(methodName, target, flags) {
        // Disallowing methods by flag currently only applies if methods already
        // exist to avoid enhancing native methods, as aliases should still be
        // extended (i.e. Array#all should still be extended even if Array#every
        // is being disallowed by a flag).
        if (!target[methodName] || !flags) {
          return false;
        }
        for (var i = 0; i < flags.length; i++) {
          if (opts[flags[i]] === false) {
            return true;
          }
        }
      }

      function namespaceIsExcepted() {
        return arrayOptionExists('except', nativeClass) ||
               arrayOptionExcludes('namespaces', nativeClass);
      }

      function methodIsExcepted(methodName) {
        return arrayOptionExists('except', methodName);
      }

      function canExtend(methodName, method, target) {
        return !objectRestricted(methodName, target) &&
               !disallowedByFlags(methodName, target, method.flags) &&
               !methodIsExcepted(methodName);
      }

      opts = opts || {};
      methodsByName = opts.methods;

      if (namespaceIsExcepted()) {
        return;
      } else if (isObject && typeof opts.objectPrototype === 'boolean') {
        // Store "objectPrototype" flag for future reference.
        allowObjectPrototype = opts.objectPrototype;
      }

      forEachProperty(methodsByName || sugarNamespace, function(method, methodName) {
        if (methodsByName) {
          // If we have method names passed in an array,
          // then we need to flip the key and value here
          // and find the method in the Sugar namespace.
          methodName = method;
          method = sugarNamespace[methodName];
        }
        if (hasOwn(method, 'instance') && canExtend(methodName, method, nativeProto)) {
          instanceMethods[methodName] = method.instance;
        }
        if(hasOwn(method, 'static') && canExtend(methodName, method, nativeClass)) {
          staticMethods[methodName] = method;
        }
      });

      // Accessing the extend target each time instead of holding a reference as
      // it may have been overwritten (for example Date by Sinon). Also need to
      // access through the global to allow extension of user-defined namespaces.
      extendNative(nativeClass, staticMethods);
      extendNative(nativeProto, instanceMethods);

      if (!methodsByName) {
        // If there are no method names passed, then
        // all methods in the namespace will be extended
        // to the native. This includes all future defined
        // methods, so add a flag here to check later.
        setProperty(sugarNamespace, 'active', true);
      }
      return sugarNamespace;
    };

    function defineWithOptionCollect(methodName, instance, args) {
      setProperty(sugarNamespace, methodName, function(arg1, arg2, arg3) {
        var opts = collectDefineOptions(arg1, arg2, arg3);
        defineMethods(sugarNamespace, opts.methods, instance, args, opts.last);
        return sugarNamespace;
      });
    }

    /***
     * @method defineStatic(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Defines static methods on the namespace that can later be extended
     *        onto the native globals.
     * @extra Accepts either a single object mapping names to functions, or name
     *        and function as two arguments. If `extend` was previously called
     *        with no arguments, the method will be immediately mapped to its
     *        native when defined.
     *
     * @example
     *
     *   Sugar.Number.defineStatic({
     *     isOdd: function (num) {
     *       return num % 2 === 1;
     *     }
     *   });
     *
     * @signature defineStatic(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    defineWithOptionCollect('defineStatic', STATIC);

    /***
     * @method defineInstance(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Defines methods on the namespace that can later be extended as
     *        instance methods onto the native prototype.
     * @extra Accepts either a single object mapping names to functions, or name
     *        and function as two arguments. All functions should accept the
     *        native for which they are mapped as their first argument, and should
     *        never refer to `this`. If `extend` was previously called with no
     *        arguments, the method will be immediately mapped to its native when
     *        defined.
     *
     *        Methods cannot accept more than 4 arguments in addition to the
     *        native (5 arguments total). Any additional arguments will not be
     *        mapped. If the method needs to accept unlimited arguments, use
     *        `defineInstanceWithArguments`. Otherwise if more options are
     *        required, use an options object instead.
     *
     * @example
     *
     *   Sugar.Number.defineInstance({
     *     square: function (num) {
     *       return num * num;
     *     }
     *   });
     *
     * @signature defineInstance(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    defineWithOptionCollect('defineInstance', INSTANCE);

    /***
     * @method defineInstanceAndStatic(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short A shortcut to define both static and instance methods on the namespace.
     * @extra This method is intended for use with `Object` instance methods. Sugar
     *        will not map any methods to `Object.prototype` by default, so defining
     *        instance methods as static helps facilitate their proper use.
     *
     * @example
     *
     *   Sugar.Object.defineInstanceAndStatic({
     *     isAwesome: function (obj) {
     *       // check if obj is awesome!
     *     }
     *   });
     *
     * @signature defineInstanceAndStatic(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    defineWithOptionCollect('defineInstanceAndStatic', INSTANCE | STATIC);


    /***
     * @method defineStaticWithArguments(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Defines static methods that collect arguments.
     * @extra This method is identical to `defineStatic`, except that when defined
     *        methods are called, they will collect any arguments past `n - 1`,
     *        where `n` is the number of arguments that the method accepts.
     *        Collected arguments will be passed to the method in an array
     *        as the last argument defined on the function.
     *
     * @example
     *
     *   Sugar.Number.defineStaticWithArguments({
     *     addAll: function (num, args) {
     *       for (var i = 0; i < args.length; i++) {
     *         num += args[i];
     *       }
     *       return num;
     *     }
     *   });
     *
     * @signature defineStaticWithArguments(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    defineWithOptionCollect('defineStaticWithArguments', STATIC, true);

    /***
     * @method defineInstanceWithArguments(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Defines instance methods that collect arguments.
     * @extra This method is identical to `defineInstance`, except that when
     *        defined methods are called, they will collect any arguments past
     *        `n - 1`, where `n` is the number of arguments that the method
     *        accepts. Collected arguments will be passed to the method as the
     *        last argument defined on the function.
     *
     * @example
     *
     *   Sugar.Number.defineInstanceWithArguments({
     *     addAll: function (num, args) {
     *       for (var i = 0; i < args.length; i++) {
     *         num += args[i];
     *       }
     *       return num;
     *     }
     *   });
     *
     * @signature defineInstanceWithArguments(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    defineWithOptionCollect('defineInstanceWithArguments', INSTANCE, true);

    /***
     * @method defineStaticPolyfill(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Defines static methods that are mapped onto the native if they do
     *        not already exist.
     * @extra Intended only for use creating polyfills that follow the ECMAScript
     *        spec. Accepts either a single object mapping names to functions, or
     *        name and function as two arguments.
     *
     * @example
     *
     *   Sugar.Object.defineStaticPolyfill({
     *     keys: function (obj) {
     *       // get keys!
     *     }
     *   });
     *
     * @signature defineStaticPolyfill(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    setProperty(sugarNamespace, 'defineStaticPolyfill', function(arg1, arg2, arg3) {
      var opts = collectDefineOptions(arg1, arg2, arg3);
      extendNative(globalContext[name], opts.methods, true, opts.last);
      return sugarNamespace;
    });

    /***
     * @method defineInstancePolyfill(methods)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Defines instance methods that are mapped onto the native prototype
     *        if they do not already exist.
     * @extra Intended only for use creating polyfills that follow the ECMAScript
     *        spec. Accepts either a single object mapping names to functions, or
     *        name and function as two arguments. This method differs from
     *        `defineInstance` as there is no static signature (as the method
     *        is mapped as-is to the native), so it should refer to its `this`
     *        object.
     *
     * @example
     *
     *   Sugar.Array.defineInstancePolyfill({
     *     indexOf: function (arr, el) {
     *       // index finding code here!
     *     }
     *   });
     *
     * @signature defineInstancePolyfill(methodName, methodFn)
     * @param {Object} methods - Methods to be defined.
     * @param {string} methodName - Name of a single method to be defined.
     * @param {Function} methodFn - Function body of a single method to be defined.
     ***/
    setProperty(sugarNamespace, 'defineInstancePolyfill', function(arg1, arg2, arg3) {
      var opts = collectDefineOptions(arg1, arg2, arg3);
      extendNative(globalContext[name].prototype, opts.methods, true, opts.last);
      // Map instance polyfills to chainable as well.
      forEachProperty(opts.methods, function(fn, methodName) {
        defineChainableMethod(sugarNamespace, methodName, fn);
      });
      return sugarNamespace;
    });

    /***
     * @method alias(toName, from)
     * @returns SugarNamespace
     * @namespace SugarNamespace
     * @short Aliases one Sugar method to another.
     *
     * @example
     *
     *   Sugar.Array.alias('all', 'every');
     *
     * @signature alias(toName, fn)
     * @param {string} toName - Name for new method.
     * @param {string|Function} from - Method to alias, or string shortcut.
     ***/
    setProperty(sugarNamespace, 'alias', function(name, source) {
      var method = typeof source === 'string' ? sugarNamespace[source] : source;
      setMethod(sugarNamespace, name, method);
      return sugarNamespace;
    });

    // Each namespace can extend only itself through its .extend method.
    setProperty(sugarNamespace, 'extend', extend);

    // Cache the class to namespace relationship for later use.
    namespacesByName[name] = sugarNamespace;
    namespacesByClassString['[object ' + name + ']'] = sugarNamespace;

    mapNativeToChainable(name);
    mapObjectChainablesToNamespace(sugarNamespace);


    // Export
    return Sugar[name] = sugarNamespace;
  }

  function setGlobalProperties() {
    setProperty(Sugar, 'extend', Sugar);
    setProperty(Sugar, 'toString', toString);
    setProperty(Sugar, 'createNamespace', createNamespace);

    setProperty(Sugar, 'util', {
      'hasOwn': hasOwn,
      'getOwn': getOwn,
      'setProperty': setProperty,
      'classToString': classToString,
      'defineProperty': defineProperty,
      'forEachProperty': forEachProperty,
      'mapNativeToChainable': mapNativeToChainable
    });
  }

  function toString() {
    return SUGAR_GLOBAL;
  }


  // Defining Methods

  function defineMethods(sugarNamespace, methods, type, args, flags) {
    forEachProperty(methods, function(method, methodName) {
      var instanceMethod, staticMethod = method;
      if (args) {
        staticMethod = wrapMethodWithArguments(method);
      }
      if (flags) {
        staticMethod.flags = flags;
      }

      // A method may define its own custom implementation, so
      // make sure that's not the case before creating one.
      if (type & INSTANCE && !method.instance) {
        instanceMethod = wrapInstanceMethod(method, args);
        setProperty(staticMethod, 'instance', instanceMethod);
      }

      if (type & STATIC) {
        setProperty(staticMethod, 'static', true);
      }

      setMethod(sugarNamespace, methodName, staticMethod);

      if (sugarNamespace.active) {
        // If the namespace has been activated (.extend has been called),
        // then map this method as well.
        sugarNamespace.extend(methodName);
      }
    });
  }

  function collectDefineOptions(arg1, arg2, arg3) {
    var methods, last;
    if (typeof arg1 === 'string') {
      methods = {};
      methods[arg1] = arg2;
      last = arg3;
    } else {
      methods = arg1;
      last = arg2;
    }
    return {
      last: last,
      methods: methods
    };
  }

  function wrapInstanceMethod(fn, args) {
    return args ? wrapMethodWithArguments(fn, true) : wrapInstanceMethodFixed(fn);
  }

  function wrapMethodWithArguments(fn, instance) {
    // Functions accepting enumerated arguments will always have "args" as the
    // last argument, so subtract one from the function length to get the point
    // at which to start collecting arguments. If this is an instance method on
    // a prototype, then "this" will be pushed into the arguments array so start
    // collecting 1 argument earlier.
    var startCollect = fn.length - 1 - (instance ? 1 : 0);
    return function() {
      var args = [], collectedArgs = [], len;
      if (instance) {
        args.push(this);
      }
      len = Math.max(arguments.length, startCollect);
      // Optimized: no leaking arguments
      for (var i = 0; i < len; i++) {
        if (i < startCollect) {
          args.push(arguments[i]);
        } else {
          collectedArgs.push(arguments[i]);
        }
      }
      args.push(collectedArgs);
      return fn.apply(this, args);
    };
  }

  function wrapInstanceMethodFixed(fn) {
    switch(fn.length) {
      // Wrapped instance methods will always be passed the instance
      // as the first argument, but requiring the argument to be defined
      // may cause confusion here, so return the same wrapped function regardless.
      case 0:
      case 1:
        return function() {
          return fn(this);
        };
      case 2:
        return function(a) {
          return fn(this, a);
        };
      case 3:
        return function(a, b) {
          return fn(this, a, b);
        };
      case 4:
        return function(a, b, c) {
          return fn(this, a, b, c);
        };
      case 5:
        return function(a, b, c, d) {
          return fn(this, a, b, c, d);
        };
    }
  }

  // Method helpers

  function extendNative(target, source, polyfill, override) {
    forEachProperty(source, function(method, name) {
      if (polyfill && !override && target[name]) {
        // Method exists, so bail.
        return;
      }
      setProperty(target, name, method);
    });
  }

  function setMethod(sugarNamespace, methodName, method) {
    sugarNamespace[methodName] = method;
    if (method.instance) {
      defineChainableMethod(sugarNamespace, methodName, method.instance, true);
    }
  }


  // Chainables

  function getNewChainableClass(name) {
    var fn = function SugarChainable(obj, arg) {
      if (!(this instanceof fn)) {
        return new fn(obj, arg);
      }
      if (this.constructor !== fn) {
        // Allow modules to define their own constructors.
        obj = this.constructor.apply(obj, arguments);
      }
      this.raw = obj;
    };
    setProperty(fn, 'toString', function() {
      return SUGAR_GLOBAL + name;
    });
    setProperty(fn.prototype, 'valueOf', function() {
      return this.raw;
    });
    return fn;
  }

  function defineChainableMethod(sugarNamespace, methodName, fn) {
    var wrapped = wrapWithChainableResult(fn), existing, collision, dcp;
    dcp = DefaultChainable.prototype;
    existing = dcp[methodName];

    // If the method was previously defined on the default chainable, then a
    // collision exists, so set the method to a disambiguation function that will
    // lazily evaluate the object and find it's associated chainable. An extra
    // check is required to avoid false positives from Object inherited methods.
    collision = existing && existing !== Object.prototype[methodName];

    // The disambiguation function is only required once.
    if (!existing || !existing.disambiguate) {
      dcp[methodName] = collision ? disambiguateMethod(methodName) : wrapped;
    }

    // The target chainable always receives the wrapped method. Additionally,
    // if the target chainable is Sugar.Object, then map the wrapped method
    // to all other namespaces as well if they do not define their own method
    // of the same name. This way, a Sugar.Number will have methods like
    // isEqual that can be called on any object without having to traverse up
    // the prototype chain and perform disambiguation, which costs cycles.
    // Note that the "if" block below actually does nothing on init as Object
    // goes first and no other namespaces exist yet. However it needs to be
    // here as Object instance methods defined later also need to be mapped
    // back onto existing namespaces.
    sugarNamespace.prototype[methodName] = wrapped;
    if (sugarNamespace === Sugar.Object) {
      mapObjectChainableToAllNamespaces(methodName, wrapped);
    }
  }

  function mapObjectChainablesToNamespace(sugarNamespace) {
    forEachProperty(Sugar.Object && Sugar.Object.prototype, function(val, methodName) {
      if (typeof val === 'function') {
        setObjectChainableOnNamespace(sugarNamespace, methodName, val);
      }
    });
  }

  function mapObjectChainableToAllNamespaces(methodName, fn) {
    forEachProperty(namespacesByName, function(sugarNamespace) {
      setObjectChainableOnNamespace(sugarNamespace, methodName, fn);
    });
  }

  function setObjectChainableOnNamespace(sugarNamespace, methodName, fn) {
    var proto = sugarNamespace.prototype;
    if (!hasOwn(proto, methodName)) {
      proto[methodName] = fn;
    }
  }

  function wrapWithChainableResult(fn) {
    return function() {
      return new DefaultChainable(fn.apply(this.raw, arguments));
    };
  }

  function disambiguateMethod(methodName) {
    var fn = function() {
      var raw = this.raw, sugarNamespace, fn;
      if (raw != null) {
        // Find the Sugar namespace for this unknown.
        sugarNamespace = namespacesByClassString[classToString(raw)];
      }
      if (!sugarNamespace) {
        // If no sugarNamespace can be resolved, then default
        // back to Sugar.Object so that undefined and other
        // non-supported types can still have basic object
        // methods called on them, such as type checks.
        sugarNamespace = Sugar.Object;
      }

      fn = new sugarNamespace(raw)[methodName];

      if (fn.disambiguate) {
        // If the method about to be called on this chainable is
        // itself a disambiguation method, then throw an error to
        // prevent infinite recursion.
        throw new TypeError('Cannot resolve namespace for ' + raw);
      }

      return fn.apply(this, arguments);
    };
    fn.disambiguate = true;
    return fn;
  }

  function mapNativeToChainable(name, methodNames) {
    var sugarNamespace = namespacesByName[name],
        nativeProto = globalContext[name].prototype;

    if (!methodNames && ownPropertyNames) {
      methodNames = ownPropertyNames(nativeProto);
    }

    forEachProperty(methodNames, function(methodName) {
      if (nativeMethodProhibited(methodName)) {
        // Sugar chainables have their own constructors as well as "valueOf"
        // methods, so exclude them here. The __proto__ argument should be trapped
        // by the function check below, however simply accessing this property on
        // Object.prototype causes QML to segfault, so pre-emptively excluding it.
        return;
      }
      try {
        var fn = nativeProto[methodName];
        if (typeof fn !== 'function') {
          // Bail on anything not a function.
          return;
        }
      } catch (e) {
        // Function.prototype has properties that
        // will throw errors when accessed.
        return;
      }
      defineChainableMethod(sugarNamespace, methodName, fn);
    });
  }

  function nativeMethodProhibited(methodName) {
    return methodName === 'constructor' ||
           methodName === 'valueOf' ||
           methodName === '__proto__';
  }


  // Util

  // Internal references
  var ownPropertyNames = Object.getOwnPropertyNames,
      internalToString = Object.prototype.toString,
      internalHasOwnProperty = Object.prototype.hasOwnProperty;

  // Defining this as a variable here as the ES5 module
  // overwrites it to patch DONTENUM.
  var forEachProperty = function (obj, fn) {
    for(var key in obj) {
      if (!hasOwn(obj, key)) continue;
      if (fn.call(obj, obj[key], key, obj) === false) break;
    }
  };

  function definePropertyShim(obj, prop, descriptor) {
    obj[prop] = descriptor.value;
  }

  function setProperty(target, name, value, enumerable) {
    defineProperty(target, name, {
      value: value,
      enumerable: !!enumerable,
      configurable: true,
      writable: true
    });
  }

  // PERF: Attempts to speed this method up get very Heisenbergy. Quickly
  // returning based on typeof works for primitives, but slows down object
  // types. Even === checks on null and undefined (no typeof) will end up
  // basically breaking even. This seems to be as fast as it can go.
  function classToString(obj) {
    return internalToString.call(obj);
  }

  function hasOwn(obj, prop) {
    return !!obj && internalHasOwnProperty.call(obj, prop);
  }

  function getOwn(obj, prop) {
    if (hasOwn(obj, prop)) {
      return obj[prop];
    }
  }

  setupGlobal();

  /***
   * @module Common
   * @description Internal utility and common methods.
   ***/

  // Flag allowing native methods to be enhanced
  var ENHANCEMENTS_FLAG = 'enhance';

  // For type checking, etc. Excludes object as this is more nuanced.
  var NATIVE_TYPES = 'Boolean Number String Date RegExp Function Array Error Set Map';

  // Do strings have no keys?
  var NO_KEYS_IN_STRING_OBJECTS = !('0' in Object('a'));

  // Prefix for private properties
  var PRIVATE_PROP_PREFIX = '_sugar_';

  // Matches 1..2 style ranges in properties
  var PROPERTY_RANGE_REG = /^(.*?)\[([-\d]*)\.\.([-\d]*)\](.*)$/;

  // WhiteSpace/LineTerminator as defined in ES5.1 plus Unicode characters in the Space, Separator category.
  var TRIM_CHARS = '\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u2028\u2029\u3000\uFEFF';

  // Regex for matching a formatted string
  var STRING_FORMAT_REG = /([{}])\1|\{([^}]*)\}|(%)%|(%(\w*))/g;

  // Common chars
  var HALF_WIDTH_ZERO = 0x30,
      FULL_WIDTH_ZERO = 0xff10,
      HALF_WIDTH_PERIOD   = '.',
      FULL_WIDTH_PERIOD   = '．',
      HALF_WIDTH_COMMA    = ',',
      OPEN_BRACE  = '{',
      CLOSE_BRACE = '}';

  // Namespace aliases
  var sugarObject   = Sugar.Object,
      sugarArray    = Sugar.Array,
      sugarDate     = Sugar.Date,
      sugarString   = Sugar.String,
      sugarNumber   = Sugar.Number,
      sugarFunction = Sugar.Function,
      sugarRegExp   = Sugar.RegExp;

  // Class checks
  var isSerializable,
      isBoolean, isNumber, isString,
      isDate, isRegExp, isFunction,
      isArray, isSet, isMap, isError;

  function buildClassChecks() {

    var knownTypes = {};

    function addCoreTypes() {

      var names = spaceSplit(NATIVE_TYPES);

      isBoolean = buildPrimitiveClassCheck(names[0]);
      isNumber  = buildPrimitiveClassCheck(names[1]);
      isString  = buildPrimitiveClassCheck(names[2]);

      isDate   = buildClassCheck(names[3]);
      isRegExp = buildClassCheck(names[4]);

      // Wanted to enhance performance here by using simply "typeof"
      // but Firefox has two major issues that make this impossible,
      // one fixed, the other not, so perform a full class check here.
      //
      // 1. Regexes can be typeof "function" in FF < 3
      //    https://bugzilla.mozilla.org/show_bug.cgi?id=61911 (fixed)
      //
      // 2. HTMLEmbedElement and HTMLObjectElement are be typeof "function"
      //    https://bugzilla.mozilla.org/show_bug.cgi?id=268945 (won't fix)
      isFunction = buildClassCheck(names[5]);


      isArray = Array.isArray || buildClassCheck(names[6]);
      isError = buildClassCheck(names[7]);

      isSet = buildClassCheck(names[8], typeof Set !== 'undefined' && Set);
      isMap = buildClassCheck(names[9], typeof Map !== 'undefined' && Map);

      // Add core types as known so that they can be checked by value below,
      // notably excluding Functions and adding Arguments and Error.
      addKnownType('Arguments');
      addKnownType(names[0]);
      addKnownType(names[1]);
      addKnownType(names[2]);
      addKnownType(names[3]);
      addKnownType(names[4]);
      addKnownType(names[6]);

    }

    function addArrayTypes() {
      var types = 'Int8 Uint8 Uint8Clamped Int16 Uint16 Int32 Uint32 Float32 Float64';
      forEach(spaceSplit(types), function(str) {
        addKnownType(str + 'Array');
      });
    }

    function addKnownType(className) {
      var str = '[object '+ className +']';
      knownTypes[str] = true;
    }

    function isKnownType(className) {
      return knownTypes[className];
    }

    function buildClassCheck(className, globalObject) {
      if (globalObject && isClass(new globalObject, 'Object')) {
        return getConstructorClassCheck(globalObject);
      } else {
        return getToStringClassCheck(className);
      }
    }

    function getConstructorClassCheck(obj) {
      var ctorStr = String(obj);
      return function(obj) {
        return String(obj.constructor) === ctorStr;
      };
    }

    function getToStringClassCheck(className) {
      return function(obj, str) {
        // perf: Returning up front on instanceof appears to be slower.
        return isClass(obj, className, str);
      };
    }

    function buildPrimitiveClassCheck(className) {
      var type = className.toLowerCase();
      return function(obj) {
        var t = typeof obj;
        return t === type || t === 'object' && isClass(obj, className);
      };
    }

    addCoreTypes();
    addArrayTypes();

    isSerializable = function(obj, className) {
      // Only known objects can be serialized. This notably excludes functions,
      // host objects, Symbols (which are matched by reference), and instances
      // of classes. The latter can arguably be matched by value, but
      // distinguishing between these and host objects -- which should never be
      // compared by value -- is very tricky so not dealing with it here.
      className = className || classToString(obj);
      return isKnownType(className) || isPlainObject(obj, className);
    };

  }

  function isClass(obj, className, str) {
    if (!str) {
      str = classToString(obj);
    }
    return str === '[object '+ className +']';
  }

  // Wrapping the core's "define" methods to
  // save a few bytes in the minified script.
  function wrapNamespace(method) {
    return function(sugarNamespace, arg1, arg2) {
      sugarNamespace[method](arg1, arg2);
    };
  }

  // Method define aliases
  var alias                       = wrapNamespace('alias'),
      defineStatic                = wrapNamespace('defineStatic'),
      defineInstance              = wrapNamespace('defineInstance'),
      defineStaticPolyfill        = wrapNamespace('defineStaticPolyfill'),
      defineInstancePolyfill      = wrapNamespace('defineInstancePolyfill'),
      defineInstanceAndStatic     = wrapNamespace('defineInstanceAndStatic'),
      defineInstanceWithArguments = wrapNamespace('defineInstanceWithArguments');

  function defineInstanceSimilar(sugarNamespace, set, fn, flags) {
    defineInstance(sugarNamespace, collectSimilarMethods(set, fn), flags);
  }

  function defineInstanceAndStaticSimilar(sugarNamespace, set, fn, flags) {
    defineInstanceAndStatic(sugarNamespace, collectSimilarMethods(set, fn), flags);
  }

  function collectSimilarMethods(set, fn) {
    var methods = {};
    if (isString(set)) {
      set = spaceSplit(set);
    }
    forEach(set, function(el, i) {
      fn(methods, el, i);
    });
    return methods;
  }

  // This song and dance is to fix methods to a different length
  // from what they actually accept in order to stay in line with
  // spec. Additionally passing argument length, as some methods
  // throw assertion errors based on this (undefined check is not
  // enough). Fortunately for now spec is such that passing 3
  // actual arguments covers all requirements. Note that passing
  // the argument length also forces the compiler to not rewrite
  // length of the compiled function.
  function fixArgumentLength(fn) {
    var staticFn = function(a) {
      var args = arguments;
      return fn(a, args[1], args[2], args.length - 1);
    };
    staticFn.instance = function(b) {
      var args = arguments;
      return fn(this, b, args[1], args.length);
    };
    return staticFn;
  }

  function defineAccessor(namespace, name, fn) {
    setProperty(namespace, name, fn);
  }

  function defineOptionsAccessor(namespace, defaults) {
    var obj = simpleClone(defaults);

    function getOption(name) {
      return obj[name];
    }

    function setOption(arg1, arg2) {
      var options;
      if (arguments.length === 1) {
        options = arg1;
      } else {
        options = {};
        options[arg1] = arg2;
      }
      forEachProperty(options, function(val, name) {
        if (val === null) {
          val = defaults[name];
        }
        obj[name] = val;
      });
    }

    defineAccessor(namespace, 'getOption', getOption);
    defineAccessor(namespace, 'setOption', setOption);
    return getOption;
  }

  // For methods defined directly on the prototype like Range
  function defineOnPrototype(ctor, methods) {
    var proto = ctor.prototype;
    forEachProperty(methods, function(val, key) {
      proto[key] = val;
    });
  }

  // Argument helpers

  function assertArgument(exists) {
    if (!exists) {
      throw new TypeError('Argument required');
    }
  }

  function assertCallable(obj) {
    if (!isFunction(obj)) {
      throw new TypeError('Function is not callable');
    }
  }

  function assertArray(obj) {
    if (!isArray(obj)) {
      throw new TypeError('Array required');
    }
  }

  function assertWritable(obj) {
    if (isPrimitive(obj)) {
      // If strict mode is active then primitives will throw an
      // error when attempting to write properties. We can't be
      // sure if strict mode is available, so pre-emptively
      // throw an error here to ensure consistent behavior.
      throw new TypeError('Property cannot be written');
    }
  }

  // Coerces an object to a positive integer.
  // Does not allow Infinity.
  function coercePositiveInteger(n) {
    n = +n || 0;
    if (n < 0 || !isNumber(n) || !isFinite(n)) {
      throw new RangeError('Invalid number');
    }
    return trunc(n);
  }


  // General helpers

  function isDefined(o) {
    return o !== undefined;
  }

  function isUndefined(o) {
    return o === undefined;
  }

  function privatePropertyAccessor(key) {
    var privateKey = PRIVATE_PROP_PREFIX + key;
    return function(obj, val) {
      if (arguments.length > 1) {
        setProperty(obj, privateKey, val);
        return obj;
      }
      return obj[privateKey];
    };
  }

  function setChainableConstructor(sugarNamespace, createFn) {
    sugarNamespace.prototype.constructor = function() {
      return createFn.apply(this, arguments);
    };
  }

  // Fuzzy matching helpers

  function getMatcher(f) {
    if (!isPrimitive(f)) {
      var className = classToString(f);
      if (isRegExp(f, className)) {
        return regexMatcher(f);
      } else if (isDate(f, className)) {
        return dateMatcher(f);
      } else if (isFunction(f, className)) {
        return functionMatcher(f);
      } else if (isPlainObject(f, className)) {
        return fuzzyMatcher(f);
      }
    }
    // Default is standard isEqual
    return defaultMatcher(f);
  }

  function fuzzyMatcher(obj) {
    var matchers = {};
    return function(el, i, arr) {
      var matched = true;
      if (!isObjectType(el)) {
        return false;
      }
      forEachProperty(obj, function(val, key) {
        matchers[key] = getOwn(matchers, key) || getMatcher(val);
        if (matchers[key].call(arr, el[key], i, arr) === false) {
          matched = false;
        }
        return matched;
      });
      return matched;
    };
  }

  function defaultMatcher(f) {
    return function(el) {
      return isEqual(el, f);
    };
  }

  function regexMatcher(reg) {
    reg = RegExp(reg);
    return function(el) {
      return reg.test(el);
    };
  }

  function dateMatcher(d) {
    var ms = d.getTime();
    return function(el) {
      return !!(el && el.getTime) && el.getTime() === ms;
    };
  }

  function functionMatcher(fn) {
    return function(el, i, arr) {
      // Return true up front if match by reference
      return el === fn || fn.call(arr, el, i, arr);
    };
  }

  // Object helpers

  function getKeys(obj) {
    return Object.keys(obj);
  }

  function deepHasProperty(obj, key, any) {
    return handleDeepProperty(obj, key, any, true);
  }

  function deepGetProperty(obj, key, any) {
    return handleDeepProperty(obj, key, any, false);
  }

  function deepSetProperty(obj, key, val) {
    handleDeepProperty(obj, key, false, false, true, false, val);
    return obj;
  }

  function handleDeepProperty(obj, key, any, has, fill, fillLast, val) {
    var ns, bs, ps, cbi, set, isLast, isPush, isIndex, nextIsIndex, exists;
    ns = obj || undefined;
    if (key == null) return;

    if (isObjectType(key)) {
      // Allow array and array-like accessors
      bs = [key];
    } else {
      key = String(key);
      if (key.indexOf('..') !== -1) {
        return handleArrayIndexRange(obj, key, any, val);
      }
      bs = key.split('[');
    }

    set = isDefined(val);

    for (var i = 0, blen = bs.length; i < blen; i++) {
      ps = bs[i];

      if (isString(ps)) {
        ps = periodSplit(ps);
      }

      for (var j = 0, plen = ps.length; j < plen; j++) {
        key = ps[j];

        // Is this the last key?
        isLast = i === blen - 1 && j === plen - 1;

        // Index of the closing ]
        cbi = key.indexOf(']');

        // Is the key an array index?
        isIndex = cbi !== -1;

        // Is this array push syntax "[]"?
        isPush = set && cbi === 0;

        // If the bracket split was successful and this is the last element
        // in the dot split, then we know the next key will be an array index.
        nextIsIndex = blen > 1 && j === plen - 1;

        if (isPush) {
          // Set the index to the end of the array
          key = ns.length;
        } else if (isIndex) {
          // Remove the closing ]
          key = key.slice(0, -1);
        }

        // If the array index is less than 0, then
        // add its length to allow negative indexes.
        if (isIndex && key < 0) {
          key = +key + ns.length;
        }

        // Bracket keys may look like users[5] or just [5], so the leading
        // characters are optional. We can enter the namespace if this is the
        // 2nd part, if there is only 1 part, or if there is an explicit key.
        if (i || key || blen === 1) {

          exists = any ? key in ns : hasOwn(ns, key);

          // Non-existent namespaces are only filled if they are intermediate
          // (not at the end) or explicitly filling the last.
          if (fill && (!isLast || fillLast) && !exists) {
            // For our purposes, last only needs to be an array.
            ns = ns[key] = nextIsIndex || (fillLast && isLast) ? [] : {};
            continue;
          }

          if (has) {
            if (isLast || !exists) {
              return exists;
            }
          } else if (set && isLast) {
            assertWritable(ns);
            ns[key] = val;
          }

          ns = exists ? ns[key] : undefined;
        }

      }
    }
    return ns;
  }

  // Get object property with support for 0..1 style range notation.
  function handleArrayIndexRange(obj, key, any, val) {
    var match, start, end, leading, trailing, arr, set;
    match = key.match(PROPERTY_RANGE_REG);
    if (!match) {
      return;
    }

    set = isDefined(val);
    leading = match[1];

    if (leading) {
      arr = handleDeepProperty(obj, leading, any, false, set ? true : false, true);
    } else {
      arr = obj;
    }

    assertArray(arr);

    trailing = match[4];
    start    = match[2] ? +match[2] : 0;
    end      = match[3] ? +match[3] : arr.length;

    // A range of 0..1 is inclusive, so we need to add 1 to the end. If this
    // pushes the index from -1 to 0, then set it to the full length of the
    // array, otherwise it will return nothing.
    end = end === -1 ? arr.length : end + 1;

    if (set) {
      for (var i = start; i < end; i++) {
        handleDeepProperty(arr, i + trailing, any, false, true, false, val);
      }
    } else {
      arr = arr.slice(start, end);

      // If there are trailing properties, then they need to be mapped for each
      // element in the array.
      if (trailing) {
        if (trailing.charAt(0) === HALF_WIDTH_PERIOD) {
          // Need to chomp the period if one is trailing after the range. We
          // can't do this at the regex level because it will be required if
          // we're setting the value as it needs to be concatentated together
          // with the array index to be set.
          trailing = trailing.slice(1);
        }
        return arr.map(function(el) {
          return handleDeepProperty(el, trailing);
        });
      }
    }
    return arr;
  }

  function getOwnKey(obj, key) {
    if (hasOwn(obj, key)) {
      return key;
    }
  }

  function hasProperty(obj, prop) {
    return !isPrimitive(obj) && prop in obj;
  }

  function isObjectType(obj, type) {
    return !!obj && (type || typeof obj) === 'object';
  }

  function isPrimitive(obj, type) {
    type = type || typeof obj;
    return obj == null || type === 'string' || type === 'number' || type === 'boolean';
  }

  function isPlainObject(obj, className) {
    return isObjectType(obj) &&
           isClass(obj, 'Object', className) &&
           hasValidPlainObjectPrototype(obj) &&
           hasOwnEnumeratedProperties(obj);
  }

  function hasValidPlainObjectPrototype(obj) {
    var hasToString = 'toString' in obj;
    var hasConstructor = 'constructor' in obj;
    // An object created with Object.create(null) has no methods in the
    // prototype chain, so check if any are missing. The additional hasToString
    // check is for false positives on some host objects in old IE which have
    // toString but no constructor. If the object has an inherited constructor,
    // then check if it is Object (the "isPrototypeOf" tapdance here is a more
    // robust way of ensuring this if the global has been hijacked). Note that
    // accessing the constructor directly (without "in" or "hasOwnProperty")
    // will throw a permissions error in IE8 on cross-domain windows.
    return (!hasConstructor && !hasToString) ||
            (hasConstructor && !hasOwn(obj, 'constructor') &&
             hasOwn(obj.constructor.prototype, 'isPrototypeOf'));
  }

  function hasOwnEnumeratedProperties(obj) {
    // Plain objects are generally defined as having enumerated properties
    // all their own, however in early IE environments without defineProperty,
    // there may also be enumerated methods in the prototype chain, so check
    // for both of these cases.
    var objectProto = Object.prototype;
    for (var key in obj) {
      var val = obj[key];
      if (!hasOwn(obj, key) && val !== objectProto[key]) {
        return false;
      }
    }
    return true;
  }

  function simpleRepeat(n, fn) {
    for (var i = 0; i < n; i++) {
      fn(i);
    }
  }

  function simpleClone(obj) {
    return simpleMerge({}, obj);
  }

  function simpleMerge(target, source) {
    forEachProperty(source, function(val, key) {
      target[key] = val;
    });
    return target;
  }

  // Make primtives types like strings into objects.
  function coercePrimitiveToObject(obj) {
    if (isPrimitive(obj)) {
      obj = Object(obj);
    }
    if (NO_KEYS_IN_STRING_OBJECTS && isString(obj)) {
      forceStringCoercion(obj);
    }
    return obj;
  }

  // Force strings to have their indexes set in
  // environments that don't do this automatically.
  function forceStringCoercion(obj) {
    var i = 0, chr;
    while (chr = obj.charAt(i)) {
      obj[i++] = chr;
    }
  }

  // Equality helpers

  function isEqual(a, b, stack) {
    var aClass, bClass;
    if (a === b) {
      // Return quickly up front when matched by reference,
      // but be careful about 0 !== -0.
      return a !== 0 || 1 / a === 1 / b;
    }
    aClass = classToString(a);
    bClass = classToString(b);
    if (aClass !== bClass) {
      return false;
    }

    if (isSerializable(a, aClass) && isSerializable(b, bClass)) {
      return objectIsEqual(a, b, aClass, stack);
    } else if (isSet(a, aClass) && isSet(b, bClass)) {
      return a.size === b.size && isEqual(setToArray(a), setToArray(b), stack);
    } else if (isMap(a, aClass) && isMap(b, bClass)) {
      return a.size === b.size && isEqual(mapToArray(a), mapToArray(b), stack);
    } else if (isError(a, aClass) && isError(b, bClass)) {
      return a.toString() === b.toString();
    }

    return false;
  }

  function objectIsEqual(a, b, aClass, stack) {
    var aType = typeof a, bType = typeof b, propsEqual, count;
    if (aType !== bType) {
      return false;
    }
    if (isObjectType(a.valueOf())) {
      if (a.length !== b.length) {
        // perf: Quickly returning up front for arrays.
        return false;
      }
      count = 0;
      propsEqual = true;
      iterateWithCyclicCheck(a, false, stack, function(key, val, cyc, stack) {
        if (!cyc && (!(key in b) || !isEqual(val, b[key], stack))) {
          propsEqual = false;
        }
        count++;
        return propsEqual;
      });
      if (!propsEqual || count !== getKeys(b).length) {
        return false;
      }
    }
    // Stringifying the value handles NaN, wrapped primitives, dates, and errors in one go.
    return a.valueOf().toString() === b.valueOf().toString();
  }

  // Serializes an object in a way that will provide a token unique
  // to the type, class, and value of an object. Host objects, class
  // instances etc, are not serializable, and are held in an array
  // of references that will return the index as a unique identifier
  // for the object. This array is passed from outside so that the
  // calling function can decide when to dispose of this array.
  function serializeInternal(obj, refs, stack) {
    var type = typeof obj, className, value, ref;

    // Return quickly for primitives to save cycles
    if (isPrimitive(obj, type) && !isRealNaN(obj)) {
      return type + obj;
    }

    className = classToString(obj);

    if (!isSerializable(obj, className)) {
      ref = indexOf(refs, obj);
      if (ref === -1) {
        ref = refs.length;
        refs.push(obj);
      }
      return ref;
    } else if (isObjectType(obj)) {
      value = serializeDeep(obj, refs, stack) + obj.toString();
    } else if (1 / obj === -Infinity) {
      value = '-0';
    } else if (obj.valueOf) {
      value = obj.valueOf();
    }
    return type + className + value;
  }

  function serializeDeep(obj, refs, stack) {
    var result = '';
    iterateWithCyclicCheck(obj, true, stack, function(key, val, cyc, stack) {
      result += cyc ? 'CYC' : key + serializeInternal(val, refs, stack);
    });
    return result;
  }

  function iterateWithCyclicCheck(obj, sortedKeys, stack, fn) {

    function next(val, key) {
      var cyc = false;

      // Allowing a step into the structure before triggering this check to save
      // cycles on standard JSON structures and also to try as hard as possible to
      // catch basic properties that may have been modified.
      if (stack.length > 1) {
        var i = stack.length;
        while (i--) {
          if (stack[i] === val) {
            cyc = true;
          }
        }
      }

      stack.push(val);
      fn(key, val, cyc, stack);
      stack.pop();
    }

    function iterateWithSortedKeys() {
      // Sorted keys is required for serialization, where object order
      // does not matter but stringified order does.
      var arr = getKeys(obj).sort(), key;
      for (var i = 0; i < arr.length; i++) {
        key = arr[i];
        next(obj[key], arr[i]);
      }
    }

    // This method for checking for cyclic structures was egregiously stolen from
    // the ingenious method by @kitcambridge from the Underscore script:
    // https://github.com/documentcloud/underscore/issues/240
    if (!stack) {
      stack = [];
    }

    if (sortedKeys) {
      iterateWithSortedKeys();
    } else {
      forEachProperty(obj, next);
    }
  }


  // Array helpers

  function isArrayIndex(n) {
    return n >>> 0 == n && n != 0xFFFFFFFF;
  }

  function iterateOverSparseArray(arr, fn, fromIndex, loop) {
    var indexes = getSparseArrayIndexes(arr, fromIndex, loop), index;
    for (var i = 0, len = indexes.length; i < len; i++) {
      index = indexes[i];
      fn.call(arr, arr[index], index, arr);
    }
    return arr;
  }

  // It's unclear whether or not sparse arrays qualify as "simple enumerables".
  // If they are not, however, the wrapping function will be deoptimized, so
  // isolate here (also to share between es5 and array modules).
  function getSparseArrayIndexes(arr, fromIndex, loop, fromRight) {
    var indexes = [], i;
    for (i in arr) {
      if (isArrayIndex(i) && (loop || (fromRight ? i <= fromIndex : i >= fromIndex))) {
        indexes.push(+i);
      }
    }
    indexes.sort(function(a, b) {
      var aLoop = a > fromIndex;
      var bLoop = b > fromIndex;
      if (aLoop !== bLoop) {
        return aLoop ? -1 : 1;
      }
      return a - b;
    });
    return indexes;
  }

  function getEntriesForIndexes(obj, find, loop, isString) {
    var result, length = obj.length;
    if (!isArray(find)) {
      return entryAtIndex(obj, find, length, loop, isString);
    }
    result = new Array(find.length);
    forEach(find, function(index, i) {
      result[i] = entryAtIndex(obj, index, length, loop, isString);
    });
    return result;
  }

  function getNormalizedIndex(index, length, loop) {
    if (index && loop) {
      index = index % length;
    }
    if (index < 0) index = length + index;
    return index;
  }

  function entryAtIndex(obj, index, length, loop, isString) {
    index = getNormalizedIndex(index, length, loop);
    return isString ? obj.charAt(index) : obj[index];
  }

  function mapWithShortcuts(el, f, context, mapArgs) {
    if (!f) {
      return el;
    } else if (f.apply) {
      return f.apply(context, mapArgs || []);
    } else if (isArray(f)) {
      return f.map(function(m) {
        return mapWithShortcuts(el, m, context, mapArgs);
      });
    } else if (isFunction(el[f])) {
      return el[f].call(el);
    } else {
      return deepGetProperty(el, f);
    }
  }

  function spaceSplit(str) {
    return str.split(' ');
  }

  function commaSplit(str) {
    return str.split(HALF_WIDTH_COMMA);
  }

  function periodSplit(str) {
    return str.split(HALF_WIDTH_PERIOD);
  }

  function forEach(arr, fn) {
    for (var i = 0, len = arr.length; i < len; i++) {
      if (!(i in arr)) {
        return iterateOverSparseArray(arr, fn, i);
      }
      fn(arr[i], i);
    }
  }

  function filter(arr, fn) {
    var result = [];
    for (var i = 0, len = arr.length; i < len; i++) {
      var el = arr[i];
      if (i in arr && fn(el, i)) {
        result.push(el);
      }
    }
    return result;
  }

  function map(arr, fn) {
    // perf: Not using fixed array len here as it may be sparse.
    var result = [];
    for (var i = 0, len = arr.length; i < len; i++) {
      if (i in arr) {
        result.push(fn(arr[i], i));
      }
    }
    return result;
  }

  function indexOf(arr, el) {
    for (var i = 0, len = arr.length; i < len; i++) {
      if (i in arr && arr[i] === el) return i;
    }
    return -1;
  }

  // Number helpers

  var trunc = Math.trunc || function(n) {
    if (n === 0 || !isFinite(n)) return n;
    return n < 0 ? ceil(n) : floor(n);
  };

  function isRealNaN(obj) {
    // This is only true of NaN
    return obj != null && obj !== obj;
  }

  function withPrecision(val, precision, fn) {
    var multiplier = pow(10, abs(precision || 0));
    fn = fn || round;
    if (precision < 0) multiplier = 1 / multiplier;
    return fn(val * multiplier) / multiplier;
  }

  function padNumber(num, place, sign, base, replacement) {
    var str = abs(num).toString(base || 10);
    str = repeatString(replacement || '0', place - str.replace(/\.\d+/, '').length) + str;
    if (sign || num < 0) {
      str = (num < 0 ? '-' : '+') + str;
    }
    return str;
  }

  function getOrdinalSuffix(num) {
    if (num >= 11 && num <= 13) {
      return 'th';
    } else {
      switch(num % 10) {
        case 1:  return 'st';
        case 2:  return 'nd';
        case 3:  return 'rd';
        default: return 'th';
      }
    }
  }

  // Fullwidth number helpers
  var fullWidthNumberReg, fullWidthNumberMap, fullWidthNumbers;

  function buildFullWidthNumber() {
    var fwp = FULL_WIDTH_PERIOD, hwp = HALF_WIDTH_PERIOD, hwc = HALF_WIDTH_COMMA, fwn = '';
    fullWidthNumberMap = {};
    for (var i = 0, digit; i <= 9; i++) {
      digit = chr(i + FULL_WIDTH_ZERO);
      fwn += digit;
      fullWidthNumberMap[digit] = chr(i + HALF_WIDTH_ZERO);
    }
    fullWidthNumberMap[hwc] = '';
    fullWidthNumberMap[fwp] = hwp;
    // Mapping this to itself to capture it easily
    // in stringToNumber to detect decimals later.
    fullWidthNumberMap[hwp] = hwp;
    fullWidthNumberReg = allCharsReg(fwn + fwp + hwc + hwp);
    fullWidthNumbers = fwn;
  }

  // Takes into account full-width characters, commas, and decimals.
  function stringToNumber(str, base) {
    var sanitized, isDecimal;
    sanitized = str.replace(fullWidthNumberReg, function(chr) {
      var replacement = getOwn(fullWidthNumberMap, chr);
      if (replacement === HALF_WIDTH_PERIOD) {
        isDecimal = true;
      }
      return replacement;
    });
    return isDecimal ? parseFloat(sanitized) : parseInt(sanitized, base || 10);
  }

  // Math aliases
  var abs   = Math.abs,
      pow   = Math.pow,
      min   = Math.min,
      max   = Math.max,
      ceil  = Math.ceil,
      floor = Math.floor,
      round = Math.round;


  // String helpers

  var chr = String.fromCharCode;

  function trim(str) {
    return str.trim();
  }

  function repeatString(str, num) {
    var result = '';
    str = str.toString();
    while (num > 0) {
      if (num & 1) {
        result += str;
      }
      if (num >>= 1) {
        str += str;
      }
    }
    return result;
  }

  function simpleCapitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function createFormatMatcher(bracketMatcher, percentMatcher, precheck) {

    var reg = STRING_FORMAT_REG;
    var compileMemoized = memoizeFunction(compile);

    function getToken(format, match) {
      var get, token, literal, fn;
      var bKey = match[2];
      var pLit = match[3];
      var pKey = match[5];
      if (match[4] && percentMatcher) {
        token = pKey;
        get = percentMatcher;
      } else if (bKey) {
        token = bKey;
        get = bracketMatcher;
      } else if (pLit && percentMatcher) {
        literal = pLit;
      } else {
        literal = match[1] || match[0];
      }
      if (get) {
        assertPassesPrecheck(precheck, bKey, pKey);
        fn = function(obj, opt) {
          return get(obj, token, opt);
        };
      }
      format.push(fn || getLiteral(literal));
    }

    function getSubstring(format, str, start, end) {
      if (end > start) {
        var sub = str.slice(start, end);
        assertNoUnmatched(sub, OPEN_BRACE);
        assertNoUnmatched(sub, CLOSE_BRACE);
        format.push(function() {
          return sub;
        });
      }
    }

    function getLiteral(str) {
      return function() {
        return str;
      };
    }

    function assertPassesPrecheck(precheck, bt, pt) {
      if (precheck && !precheck(bt, pt)) {
        throw new TypeError('Invalid token '+ (bt || pt) +' in format string');
      }
    }

    function assertNoUnmatched(str, chr) {
      if (str.indexOf(chr) !== -1) {
        throw new TypeError('Unmatched '+ chr +' in format string');
      }
    }

    function compile(str) {
      var format = [], lastIndex = 0, match;
      reg.lastIndex = 0;
      while(match = reg.exec(str)) {
        getSubstring(format, str, lastIndex, match.index);
        getToken(format, match);
        lastIndex = reg.lastIndex;
      }
      getSubstring(format, str, lastIndex, str.length);
      return format;
    }

    return function(str, obj, opt) {
      var format = compileMemoized(str), result = '';
      for (var i = 0; i < format.length; i++) {
        result += format[i](obj, opt);
      }
      return result;
    };
  }

  // Inflection helper

  var Inflections = {};

  function getAcronym(str) {
    return Inflections.acronyms && Inflections.acronyms.find(str);
  }

  function getHumanWord(str) {
    return Inflections.human && Inflections.human.find(str);
  }

  function runHumanRules(str) {
    return Inflections.human && Inflections.human.runRules(str) || str;
  }

  // RegExp helpers

  function allCharsReg(src) {
    return RegExp('[' + src + ']', 'g');
  }

  function getRegExpFlags(reg, add) {
    var flags = '';
    add = add || '';
    function checkFlag(prop, flag) {
      if (prop || add.indexOf(flag) > -1) {
        flags += flag;
      }
    }
    checkFlag(reg.global, 'g');
    checkFlag(reg.ignoreCase, 'i');
    checkFlag(reg.multiline, 'm');
    checkFlag(reg.sticky, 'y');
    return flags;
  }

  function escapeRegExp(str) {
    if (!isString(str)) str = String(str);
    return str.replace(/([\\\/\'*+?|()\[\]{}.^$-])/g,'\\$1');
  }

  // Date helpers

  var _utc = privatePropertyAccessor('utc');

  function callDateGet(d, method) {
    return d['get' + (_utc(d) ? 'UTC' : '') + method]();
  }

  function callDateSet(d, method, value, safe) {
    // "Safe" denotes not setting the date if the value is the same as what is
    // currently set. In theory this should be a noop, however it will cause
    // timezone shifts when in the middle of a DST fallback. This is unavoidable
    // as the notation itself is ambiguous (i.e. there are two "1:00ams" on
    // November 1st, 2015 in northern hemisphere timezones that follow DST),
    // however when advancing or rewinding dates this can throw off calculations
    // so avoiding this unintentional shifting on an opt-in basis.
    if (safe && value === callDateGet(d, method, value)) {
      return;
    }
    d['set' + (_utc(d) ? 'UTC' : '') + method](value);
  }

  // Memoization helpers

  var INTERNAL_MEMOIZE_LIMIT = 1000;

  // Note that attemps to consolidate this with Function#memoize
  // ended up clunky as that is also serializing arguments. Separating
  // these implementations turned out to be simpler.
  function memoizeFunction(fn) {
    var memo = {}, counter = 0;

    return function(key) {
      if (hasOwn(memo, key)) {
        return memo[key];
      }
      if (counter === INTERNAL_MEMOIZE_LIMIT) {
        memo = {};
        counter = 0;
      }
      counter++;
      return memo[key] = fn(key);
    };
  }

  // ES6 helpers

  function setToArray(set) {
    var arr = new Array(set.size), i = 0;
    set.forEach(function(val) {
      arr[i++] = val;
    });
    return arr;
  }

  function mapToArray(map) {
    var arr = new Array(map.size), i = 0;
    map.forEach(function(val, key) {
      arr[i++] = [key, val];
    });
    return arr;
  }

  buildClassChecks();
  buildFullWidthNumber();

  /***
   * @module ES5
   * @description Functions and polyfill methods that fix ES5 functionality. This
   *              module is excluded from default builds, and can be included if
   *              you need legacy browser support (IE8 and below).
   *
   ***/

  // Non-enumerable properties on Object.prototype. In early JScript implementations
  // (< IE9) these will shadow object properties and break for..in loops.
  var DONT_ENUM_PROPS = [
    'valueOf',
    'toString',
    'constructor',
    'isPrototypeOf',
    'hasOwnProperty',
    'toLocaleString',
    'propertyIsEnumerable'
  ];

  /***
   * @fix
   * @short Fixes DontEnum bug for iteration methods in < IE9.
   ***/
  function buildDontEnumFix() {
    if (!({toString:1}).propertyIsEnumerable('toString')) {
      var forEachEnumerableProperty = forEachProperty;
      forEachProperty = function(obj, fn) {
        forEachEnumerableProperty(obj, fn);
        for (var i = 0, key; key = DONT_ENUM_PROPS[i]; i++) {
          if (hasOwn(obj, key)) {
            if(fn.call(obj, obj[key], key, obj) === false) break;
          }
        }
      };
    }
  }

  /***
   * @fix
   * @short Adds native methods to chainables in < IE9.
   ***/
  function buildChainableNativeMethodsFix() {
    if (!Object.getOwnPropertyNames) {
      defineNativeMethodsOnChainable();
    }
  }

  // Polyfilled methods will automatically be added to the chainable prototype.
  // However, Object.getOwnPropertyNames cannot be shimmed for non-enumerable
  // properties, so if it does not exist, then the only way to access native
  // methods previous to ES5 is to provide them as a list of tokens here.
  function defineNativeMethodsOnChainable() {

    var nativeTokens = {
      'Function': 'apply,call',
      'RegExp':   'compile,exec,test',
      'Number':   'toExponential,toFixed,toLocaleString,toPrecision',
      'Object':   'hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString',
      'Array':    'concat,join,pop,push,reverse,shift,slice,sort,splice,toLocaleString,unshift',
      'Date':     'getTime,getTimezoneOffset,setTime,toDateString,toGMTString,toLocaleDateString,toLocaleString,toLocaleTimeString,toTimeString,toUTCString',
      'String':   'anchor,big,blink,bold,charAt,charCodeAt,concat,fixed,fontcolor,fontsize,indexOf,italics,lastIndexOf,link,localeCompare,match,replace,search,slice,small,split,strike,sub,substr,substring,sup,toLocaleLowerCase,toLocaleUpperCase,toLowerCase,toUpperCase'
    };

    var dateTokens = 'FullYear,Month,Date,Hours,Minutes,Seconds,Milliseconds'.split(',');

    function addDateTokens(prefix, arr) {
      for (var i = 0; i < dateTokens.length; i++) {
        arr.push(prefix + dateTokens[i]);
      }
    }

    forEachProperty(nativeTokens, function(str, name) {
      var tokens = str.split(',');
      if (name === 'Date') {
        addDateTokens('get', tokens);
        addDateTokens('set', tokens);
        addDateTokens('getUTC', tokens);
        addDateTokens('setUTC', tokens);
      }
      tokens.push('toString');
      mapNativeToChainable(name, tokens);
    });

  }


  buildDontEnumFix();
  buildChainableNativeMethodsFix();


  /*** @namespace Object ***/

  function assertNonNull(obj) {
    if (obj == null) {
      throw new TypeError('Object required');
    }
  }

  defineStaticPolyfill(sugarObject, {

    'keys': function(obj) {
      var keys = [];
      assertNonNull(obj);
      forEachProperty(coercePrimitiveToObject(obj), function(val, key) {
        keys.push(key);
      });
      return keys;
    }

  });


  /*** @namespace Array ***/

  function arrayIndexOf(arr, search, fromIndex, fromRight) {
    var length = arr.length, defaultFromIndex, index, increment;

    increment = fromRight ? -1 : 1;
    defaultFromIndex = fromRight ? length - 1 : 0;
    fromIndex = trunc(fromIndex);
    if (!fromIndex && fromIndex !== 0) {
      fromIndex = defaultFromIndex;
    }
    if (fromIndex < 0) {
      fromIndex = length + fromIndex;
    }
    if ((!fromRight && fromIndex < 0) || (fromRight && fromIndex >= length)) {
      fromIndex = defaultFromIndex;
    }

    index = fromIndex;

    while((fromRight && index >= 0) || (!fromRight && index < length)) {
      if (!(index in arr)) {
        return sparseIndexOf(arr, search, fromIndex, fromRight);
      }
      if (isArrayIndex(index) && arr[index] === search) {
        return index;
      }
      index += increment;
    }
    return -1;
  }

  function sparseIndexOf(arr, search, fromIndex, fromRight) {
    var indexes = getSparseArrayIndexes(arr, fromIndex, false, fromRight), index;
    indexes.sort(function(a, b) {
      return fromRight ? b - a : a - b;
    });
    while ((index = indexes.shift()) !== undefined) {
      if (arr[index] === search) {
        return +index;
      }
    }
    return -1;
  }

  function arrayReduce(arr, fn, initialValue, fromRight) {
    var length = arr.length, count = 0, defined = isDefined(initialValue), result, index;
    assertCallable(fn);
    if (length == 0 && !defined) {
      throw new TypeError('Reduce called on empty array with no initial value');
    } else if (defined) {
      result = initialValue;
    } else {
      result = arr[fromRight ? length - 1 : count];
      count++;
    }
    while(count < length) {
      index = fromRight ? length - count - 1 : count;
      if (index in arr) {
        result = fn(result, arr[index], index, arr);
      }
      count++;
    }
    return result;
  }

  defineStaticPolyfill(sugarArray, {

    /***
     *
     * @method isArray(obj)
     * @returns Boolean
     * @polyfill ES5
     * @static
     * @short Returns true if `obj` is an Array.
     *
     * @example
     *
     *   Array.isArray(3)        -> false
     *   Array.isArray(true)     -> false
     *   Array.isArray('wasabi') -> false
     *   Array.isArray([1,2,3])  -> true
     *
     ***/
    'isArray': function(obj) {
      return isArray(obj);
    }

  });

  defineInstancePolyfill(sugarArray, {

    'every': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      var length = this.length, index = 0;
      assertCallable(fn);
      while(index < length) {
        if (index in this && !fn.call(context, this[index], index, this)) {
          return false;
        }
        index++;
      }
      return true;
    },

    'some': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      var length = this.length, index = 0;
      assertCallable(fn);
      while(index < length) {
        if (index in this && fn.call(context, this[index], index, this)) {
          return true;
        }
        index++;
      }
      return false;
    },

    'map': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      var length = this.length, index = 0, result = new Array(length);
      assertCallable(fn);
      while(index < length) {
        if (index in this) {
          result[index] = fn.call(context, this[index], index, this);
        }
        index++;
      }
      return result;
    },

    'filter': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      var length = this.length, index = 0, result = [];
      assertCallable(fn);
      while(index < length) {
        if (index in this && fn.call(context, this[index], index, this)) {
          result.push(this[index]);
        }
        index++;
      }
      return result;
    },

    /***
     * @method indexOf(search, [fromIndex] = 0)
     * @returns Number
     * @polyfill ES5
     * @short Searches the array and returns the first index where `search` occurs,
     *        or `-1` if the element is not found.
     * @extra [fromIndex] is the index from which to begin the search. This
     *        method performs a simple strict equality comparison on `search`.
     *        Sugar does not enhance this method to support `enhanced matching`.
     *        For such functionality, use the `findIndex` method instead.
     *
     * @example
     *
     *   [1,2,3].indexOf(3) -> 1
     *   [1,2,3].indexOf(7) -> -1
     *
     ***/
    'indexOf': function(search) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, fromIndex = arguments[1];
      if (isString(this)) return this.indexOf(search, fromIndex);
      return arrayIndexOf(this, search, fromIndex);
    },

    /***
     * @method lastIndexOf(search, [fromIndex] = array.length - 1)
     * @returns Number
     * @polyfill ES5
     * @short Searches the array from the end and returns the first index where
     *        `search` occurs, or `-1` if the element is not found.
     * @extra [fromIndex] is the index from which to begin the search. This method
     *        performs a simple strict equality comparison on `search`.
     *        Sugar does not enhance this method to support `enhanced matching`.
     *
     * @example
     *
     *   [1,2,1].lastIndexOf(1) -> 2
     *   [1,2,1].lastIndexOf(7) -> -1
     *
     ***/
    'lastIndexOf': function(search) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, fromIndex = arguments[1];
      if (isString(this)) return this.lastIndexOf(search, fromIndex);
      return arrayIndexOf(this, search, fromIndex, true);
    },

    /***
     * @method forEach([fn], [context])
     * @polyfill ES5
     * @short Iterates over the array, calling [fn] on each loop.
     * @extra [context] becomes the `this` object.
     *
     * @callback fn
     *
     *   el   The element of the current iteration.
     *   i    The index of the current iteration.
     *   arr  A reference to the array.
     *
     * @example
     *
     *   ['a','b','c'].forEach(function(a) {
     *     // Called 3 times: 'a','b','c'
     *   });
     *
     ***/
    'forEach': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      var length = this.length, index = 0;
      assertCallable(fn);
      while(index < length) {
        if (index in this) {
          fn.call(context, this[index], index, this);
        }
        index++;
      }
    },

    /***
     * @method reduce(fn, [init])
     * @returns Mixed
     * @polyfill ES5
     * @short Reduces the array to a single result.
     * @extra This operation is sometimes called "accumulation", as it takes the
     *        result of the last iteration of `fn` and passes it as the first
     *        argument to the next iteration, "accumulating" that value as it goes.
     *        The return value of this method will be the return value of the final
     *        iteration of `fn`. If [init] is passed, it will be the initial
     *        "accumulator" (the first argument). If [init] is not passed, then it
     *        will take the first element in the array, and `fn` will not be called
     *        for that element.
     *
     * @callback fn
     *
     *   acc  The "accumulator". Either [init], the result of the last iteration
     *        of `fn`, or the first element of the array.
     *   el   The current element for this iteration.
     *   idx  The current index for this iteration.
     *   arr  A reference to the array.
     *
     * @example
     *
     *   [1,2,3].reduce(function(a, b) {
     *     return a - b; // 1 - 2 - 3
     *   });
     *
     *   [1,2,3].reduce(function(a, b) {
     *     return a - b; // 100 - 1 - 2 - 3
     *   }, 100);
     *
     ***/
    'reduce': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      return arrayReduce(this, fn, context);
    },

    /***
     * @method reduceRight([fn], [init])
     * @returns Mixed
     * @polyfill ES5
     * @short Similar to `Array#reduce`, but operates on the elements in reverse.
     *
     * @callback fn
     *
     *   acc  The "accumulator", either [init], the result of the last iteration
     *        of `fn`, or the last element of the array.
     *   el   The current element for this iteration.
     *   idx  The current index for this iteration.
     *   arr  A reference to the array.
     *
     * @example
     *
     *   [1,2,3].reduceRight(function(a, b) {
     *     return a - b; // 3 - 2 - 1
     *   });
     *
     *   [1,2,3].reduceRight(function(a, b) {
     *     return a - b; // 100 - 3 - 2 - 1
     *   }, 100);
     *
     *
     ***/
    'reduceRight': function(fn) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, context = arguments[1];
      return arrayReduce(this, fn, context, true);
    }

  });


  /*** @namespace String ***/

  var TRIM_REG = RegExp('^[' + TRIM_CHARS + ']+|['+ TRIM_CHARS +']+$', 'g');

  defineInstancePolyfill(sugarString, {
    /***
     * @method trim()
     * @returns String
     * @polyfill ES5
     * @short Removes leading and trailing whitespace from the string.
     * @extra Whitespace is defined as line breaks, tabs, and any character in the
     *        "Space, Separator" Unicode category, conforming to the the ES5 spec.
     *
     * @example
     *
     *   '   wasabi   '.trim()      -> 'wasabi'
     *   '   wasabi   '.trimLeft()  -> 'wasabi   '
     *   '   wasabi   '.trimRight() -> '   wasabi'
     *
     ***/
    'trim': function() {
      return this.toString().replace(TRIM_REG, '');
    }
  });


  /*** @namespace Function ***/

  defineInstancePolyfill(sugarFunction, {

     /***
     * @method bind(context, [arg1], ...)
     * @returns Function
     * @polyfill ES5
     * @short Binds `context` as the `this` object for the function when it is
     *        called. Also allows currying an unlimited number of parameters.
     * @extra "currying" means setting parameters ([arg1], [arg2], etc.) ahead of
     *        time so that they are passed when the function is called later. If
     *        you pass additional parameters when the function is actually called,
     *        they will be added to the end of the curried parameters.
     *
     * @example
     *
     *   logThis.bind('woof')()   -> logs 'woof' as its this object
     *   addArgs.bind(1, 2, 3)()  -> returns 5 with 1 as the this object
     *   addArgs.bind(1)(2, 3, 4) -> returns 9
     *
     ***/
    'bind': function(context) {
      // Optimized: no leaking arguments
      var boundArgs = []; for(var $i = 1, $len = arguments.length; $i < $len; $i++) boundArgs.push(arguments[$i]);
      var fn = this, bound;
      assertCallable(this);
      bound = function() {
        // Optimized: no leaking arguments
        var args = []; for(var $i = 0, $len = arguments.length; $i < $len; $i++) args.push(arguments[$i]);
        return fn.apply(fn.prototype && this instanceof fn ? this : context, boundArgs.concat(args));
      };
      bound.prototype = this.prototype;
      return bound;
    }

  });


  /*** @namespace Date ***/

  defineStaticPolyfill(sugarDate, {

     /***
     * @method now()
     * @returns String
     * @polyfill ES5
     * @static
     * @short Returns the current time as a Unix timestamp.
     * @extra The number of milliseconds since January 1st, 1970 00:00:00 (UTC).
     *
     * @example
     *
     *   Date.now() -> ex. 1311938296231
     *
     ***/
    'now': function() {
      return new Date().getTime();
    }

  });

  function hasISOSupport() {
    var d = new Date(Date.UTC(2000, 0));
    return !!d.toISOString && d.toISOString() === '2000-01-01T00:00:00.000Z';
  }

  defineInstancePolyfill(sugarDate, {

     /***
     * @method toISOString()
     * @returns String
     * @polyfill ES5
     * @short Formats the string to ISO8601 format.
     * @extra This will always format as UTC time.
     *
     * @example
     *
     *   Date.create().toISOString() -> ex. 2011-07-05 12:24:55.528Z
     *
     ***/
    'toISOString': function() {
      return padNumber(this.getUTCFullYear(), 4) + '-' +
             padNumber(this.getUTCMonth() + 1, 2) + '-' +
             padNumber(this.getUTCDate(), 2) + 'T' +
             padNumber(this.getUTCHours(), 2) + ':' +
             padNumber(this.getUTCMinutes(), 2) + ':' +
             padNumber(this.getUTCSeconds(), 2) + '.' +
             padNumber(this.getUTCMilliseconds(), 3) + 'Z';
    },

     /***
     * @method toJSON([key])
     * @returns String
     * @polyfill ES5
     * @short Returns a JSON representation of the date.
     * @extra This is effectively an alias for `toISOString`. Will always return
     *        the date in UTC time. [key] is ignored.
     *
     * @example
     *
     *   Date.create().toJSON() -> ex. 2011-07-05 12:24:55.528Z
     *
     ***/
    'toJSON': function(key) {
      // Force compiler to respect argument length.
      var argLen = arguments.length;
      return this.toISOString(key);
    }

  }, !hasISOSupport());

  /***
   * @module ES6
   * @description Polyfills that provide basic ES6 compatibility. This module
   *              provides the base for Sugar functionality, but is not a full
   *              polyfill suite.
   *
   ***/


  /*** @namespace String ***/

  function getCoercedStringSubject(obj) {
    if (obj == null) {
      throw new TypeError('String required.');
    }
    return String(obj);
  }

  function getCoercedSearchString(obj) {
    if (isRegExp(obj)) {
      throw new TypeError();
    }
    return String(obj);
  }

  defineInstancePolyfill(sugarString, {

    /***
     * @method includes(search, [pos] = 0)
     * @returns Boolean
     * @polyfill ES6
     * @short Returns true if `search` is contained within the string.
     * @extra Search begins at [pos], which defaults to the beginning of the
     *        string. Sugar enhances this method to allow matching a regex.
     *
     * @example
     *
     *   'jumpy'.includes('py')      -> true
     *   'broken'.includes('ken', 3) -> true
     *   'broken'.includes('bro', 3) -> false
     *
     ***/
    'includes': function(searchString) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, pos = arguments[1];
      var str = getCoercedStringSubject(this);
      searchString = getCoercedSearchString(searchString);
      return str.indexOf(searchString, pos) !== -1;
    },

    /***
     * @method startsWith(search, [pos] = 0)
     * @returns Boolean
     * @polyfill ES6
     * @short Returns true if the string starts with substring `search`.
     * @extra Search begins at [pos], which defaults to the entire string length.
     *
     * @example
     *
     *   'hello'.startsWith('hell')   -> true
     *   'hello'.startsWith('HELL')   -> false
     *   'hello'.startsWith('ell', 1) -> true
     *
     ***/
    'startsWith': function(searchString) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, position = arguments[1];
      var str, start, pos, len, searchLength;
      str = getCoercedStringSubject(this);
      searchString = getCoercedSearchString(searchString);
      pos = +position || 0;
      len = str.length;
      start = min(max(pos, 0), len);
      searchLength = searchString.length;
      if (searchLength + start > len) {
        return false;
      }
      if (str.substr(start, searchLength) === searchString) {
        return true;
      }
      return false;
    },

    /***
     * @method endsWith(search, [pos] = length)
     * @returns Boolean
     * @polyfill ES6
     * @short Returns true if the string ends with substring `search`.
     * @extra Search ends at [pos], which defaults to the entire string length.
     *
     * @example
     *
     *   'jumpy'.endsWith('py')    -> true
     *   'jumpy'.endsWith('MPY')   -> false
     *   'jumpy'.endsWith('mp', 4) -> false
     *
     ***/
    'endsWith': function(searchString) {
      // Force compiler to respect argument length.
      var argLen = arguments.length, endPosition = arguments[1];
      var str, start, end, pos, len, searchLength;
      str = getCoercedStringSubject(this);
      searchString = getCoercedSearchString(searchString);
      len = str.length;
      pos = len;
      if (isDefined(endPosition)) {
        pos = +endPosition || 0;
      }
      end = min(max(pos, 0), len);
      searchLength = searchString.length;
      start = end - searchLength;
      if (start < 0) {
        return false;
      }
      if (str.substr(start, searchLength) === searchString) {
        return true;
      }
      return false;
    },

    /***
     * @method repeat([num] = 0)
     * @returns String
     * @polyfill ES6
     * @short Returns the string repeated [num] times.
     *
     * @example
     *
     *   'jumpy'.repeat(2) -> 'jumpyjumpy'
     *   'a'.repeat(5)     -> 'aaaaa'
     *   'a'.repeat(0)     -> ''
     *
     ***/
    'repeat': function(num) {
      num = coercePositiveInteger(num);
      return repeatString(this, num);
    }

  });



  /***
   * @module String
   * @description String manupulation, encoding, truncation, and formatting, and more.
   *
   ***/

  // Flag allowing native string methods to be enhanced
  var STRING_ENHANCEMENTS_FLAG = 'enhanceString';

  // Matches non-punctuation characters except apostrophe for capitalization.
  var CAPITALIZE_REG = /[^\u0000-\u0040\u005B-\u0060\u007B-\u007F]+('s)?/g;

  // Regex matching camelCase.
  var CAMELIZE_REG = /(^|_)([^_]+)/g;

  // Regex matching any HTML entity.
  var HTML_ENTITY_REG = /&#?(x)?([\w\d]{0,5});/gi;

  // Very basic HTML escaping regex.
  var HTML_ESCAPE_REG = /[&<>]/g;

  // Special HTML entities.
  var HTMLFromEntityMap = {
    'lt':    '<',
    'gt':    '>',
    'amp':   '&',
    'nbsp':  ' ',
    'quot':  '"',
    'apos':  "'"
  };

  var HTMLToEntityMap;

  // Words that should not be capitalized in titles
  var DOWNCASED_WORDS = [
    'and', 'or', 'nor', 'a', 'an', 'the', 'so', 'but', 'to', 'of', 'at',
    'by', 'from', 'into', 'on', 'onto', 'off', 'out', 'in', 'over',
    'with', 'for'
  ];

  // HTML tags that do not have inner content.
  var HTML_VOID_ELEMENTS = [
    'area','base','br','col','command','embed','hr','img',
    'input','keygen','link','meta','param','source','track','wbr'
  ];

  var LEFT_TRIM_REG  = RegExp('^['+ TRIM_CHARS +']+');
  var RIGHT_TRIM_REG = RegExp('['+ TRIM_CHARS +']+$');
  var TRUNC_REG      = RegExp('(?=[' + TRIM_CHARS + '])');

  // Reference to native String#includes to enhance later.
  var nativeIncludes = String.prototype.includes;

  // Base64
  var encodeBase64, decodeBase64;

  // Format matcher for String#format.
  var stringFormatMatcher = createFormatMatcher(deepGetProperty);

  function padString(num, padding) {
    return repeatString(isDefined(padding) ? padding : ' ', num);
  }

  function truncateString(str, length, from, ellipsis, split) {
    var str1, str2, len1, len2;
    if (str.length <= length) {
      return str.toString();
    }
    ellipsis = isUndefined(ellipsis) ? '...' : ellipsis;
    switch(from) {
      case 'left':
        str2 = split ? truncateOnWord(str, length, true) : str.slice(str.length - length);
        return ellipsis + str2;
      case 'middle':
        len1 = ceil(length / 2);
        len2 = floor(length / 2);
        str1 = split ? truncateOnWord(str, len1) : str.slice(0, len1);
        str2 = split ? truncateOnWord(str, len2, true) : str.slice(str.length - len2);
        return str1 + ellipsis + str2;
      default:
        str1 = split ? truncateOnWord(str, length) : str.slice(0, length);
        return str1 + ellipsis;
    }
  }

  function stringEach(str, search, fn) {
    var chunks, chunk, reg, result = [];
    if (isFunction(search)) {
      fn = search;
      reg = /[\s\S]/g;
    } else if (!search) {
      reg = /[\s\S]/g;
    } else if (isString(search)) {
      reg = RegExp(escapeRegExp(search), 'gi');
    } else if (isRegExp(search)) {
      reg = RegExp(search.source, getRegExpFlags(search, 'g'));
    }
    // Getting the entire array of chunks up front as we need to
    // pass this into the callback function as an argument.
    chunks = runGlobalMatch(str, reg);

    if (chunks) {
      for(var i = 0, len = chunks.length, r; i < len; i++) {
        chunk = chunks[i];
        result[i] = chunk;
        if (fn) {
          r = fn.call(str, chunk, i, chunks);
          if (r === false) {
            break;
          } else if (isDefined(r)) {
            result[i] = r;
          }
        }
      }
    }
    return result;
  }

  // "match" in < IE9 has enumable properties that will confuse for..in
  // loops, so ensure that the match is a normal array by manually running
  // "exec". Note that this method is also slightly more performant.
  function runGlobalMatch(str, reg) {
    var result = [], match, lastLastIndex;
    while ((match = reg.exec(str)) != null) {
      if (reg.lastIndex === lastLastIndex) {
        reg.lastIndex += 1;
      } else {
        result.push(match[0]);
      }
      lastLastIndex = reg.lastIndex;
    }
    return result;
  }

  function eachWord(str, fn) {
    return stringEach(trim(str), /\S+/g, fn);
  }

  function stringCodes(str, fn) {
    var codes = new Array(str.length), i, len;
    for(i = 0, len = str.length; i < len; i++) {
      var code = str.charCodeAt(i);
      codes[i] = code;
      if (fn) {
        fn.call(str, code, i, str);
      }
    }
    return codes;
  }

  function stringUnderscore(str) {
    var areg = Inflections.acronyms && Inflections.acronyms.reg;
    return str
      .replace(/[-\s]+/g, '_')
      .replace(areg, function(acronym, index) {
        return (index > 0 ? '_' : '') + acronym.toLowerCase();
      })
      .replace(/([A-Z\d]+)([A-Z][a-z])/g,'$1_$2')
      .replace(/([a-z\d])([A-Z])/g,'$1_$2')
      .toLowerCase();
  }

  function stringCamelize(str, upper) {
    str = stringUnderscore(str);
    return str.replace(CAMELIZE_REG, function(match, pre, word, index) {
      var cap = upper !== false || index > 0, acronym;
      acronym = getAcronym(word);
      if (acronym && cap) {
        return acronym;
      }
      return cap ? stringCapitalize(word, true) : word;
    });
  }

  function stringSpacify(str) {
    return stringUnderscore(str).replace(/_/g, ' ');
  }

  function stringCapitalize(str, downcase, all) {
    if (downcase) {
      str = str.toLowerCase();
    }
    return all ? str.replace(CAPITALIZE_REG, simpleCapitalize) : simpleCapitalize(str);
  }

  function stringTitleize(str) {
    var fullStopPunctuation = /[.:;!]$/, lastHadPunctuation;
    str = runHumanRules(str);
    str = stringSpacify(str);
    return eachWord(str, function(word, index, words) {
      word = getHumanWord(word) || word;
      word = getAcronym(word) || word;
      var hasPunctuation, isFirstOrLast;
      var first = index == 0, last = index == words.length - 1;
      hasPunctuation = fullStopPunctuation.test(word);
      isFirstOrLast = first || last || hasPunctuation || lastHadPunctuation;
      lastHadPunctuation = hasPunctuation;
      if (isFirstOrLast || indexOf(DOWNCASED_WORDS, word) === -1) {
        return stringCapitalize(word, false, true);
      } else {
        return word;
      }
    }).join(' ');
  }

  function stringParameterize(str, separator) {
    if (separator === undefined) separator = '-';
    str = str.replace(/[^a-z0-9\-_]+/gi, separator);
    if (separator) {
      var reg = RegExp('^{s}+|{s}+$|({s}){s}+'.split('{s}').join(escapeRegExp(separator)), 'g');
      str = str.replace(reg, '$1');
    }
    return encodeURI(str.toLowerCase());
  }

  function reverseString(str) {
    return str.split('').reverse().join('');
  }

  function truncateOnWord(str, limit, fromLeft) {
    if (fromLeft) {
      return reverseString(truncateOnWord(reverseString(str), limit));
    }
    var words = str.split(TRUNC_REG);
    var count = 0;
    return filter(words, function(word) {
      count += word.length;
      return count <= limit;
    }).join('');
  }

  function unescapeHTML(str) {
    return str.replace(HTML_ENTITY_REG, function(full, hex, code) {
      var special = HTMLFromEntityMap[code];
      return special || chr(hex ? parseInt(code, 16) : +code);
    });
  }

  function tagIsVoid(tag) {
    return indexOf(HTML_VOID_ELEMENTS, tag.toLowerCase()) !== -1;
  }

  function stringReplaceAll(str, f, replace) {
    var i = 0, tokens;
    if (isString(f)) {
      f = RegExp(escapeRegExp(f), 'g');
    } else if (f && !f.global) {
      f = RegExp(f.source, getRegExpFlags(f, 'g'));
    }
    if (!replace) {
      replace = '';
    } else {
      tokens = replace;
      replace = function() {
        var t = tokens[i++];
        return t != null ? t : '';
      };
    }
    return str.replace(f, replace);
  }

  function replaceTags(str, find, replacement, strip) {
    var tags = isString(find) ? [find] : find, reg, src;
    tags = map(tags || [], function(t) {
      return escapeRegExp(t);
    }).join('|');
    src = tags.replace('all', '') || '[^\\s>]+';
    src = '<(\\/)?(' + src + ')(\\s+[^<>]*?)?\\s*(\\/)?>';
    reg = RegExp(src, 'gi');
    return runTagReplacements(str.toString(), reg, strip, replacement);
  }

  function runTagReplacements(str, reg, strip, replacement, fullString) {

    var match;
    var result = '';
    var currentIndex = 0;
    var openTagName;
    var openTagAttributes;
    var openTagCount = 0;

    function processTag(index, tagName, attributes, tagLength, isVoid) {
      var content = str.slice(currentIndex, index), s = '', r = '';
      if (isString(replacement)) {
        r = replacement;
      } else if (replacement) {
        r = replacement.call(fullString, tagName, content, attributes, fullString) || '';
      }
      if (strip) {
        s = r;
      } else {
        content = r;
      }
      if (content) {
        content = runTagReplacements(content, reg, strip, replacement, fullString);
      }
      result += s + content + (isVoid ? '' : s);
      currentIndex = index + (tagLength || 0);
    }

    fullString = fullString || str;
    reg = RegExp(reg.source, 'gi');

    while(match = reg.exec(str)) {

      var tagName         = match[2];
      var attributes      = (match[3]|| '').slice(1);
      var isClosingTag    = !!match[1];
      var isSelfClosing   = !!match[4];
      var tagLength       = match[0].length;
      var isVoid          = tagIsVoid(tagName);
      var isOpeningTag    = !isClosingTag && !isSelfClosing && !isVoid;
      var isSameAsCurrent = tagName === openTagName;

      if (!openTagName) {
        result += str.slice(currentIndex, match.index);
        currentIndex = match.index;
      }

      if (isOpeningTag) {
        if (!openTagName) {
          openTagName = tagName;
          openTagAttributes = attributes;
          openTagCount++;
          currentIndex += tagLength;
        } else if (isSameAsCurrent) {
          openTagCount++;
        }
      } else if (isClosingTag && isSameAsCurrent) {
        openTagCount--;
        if (openTagCount === 0) {
          processTag(match.index, openTagName, openTagAttributes, tagLength, isVoid);
          openTagName       = null;
          openTagAttributes = null;
        }
      } else if (!openTagName) {
        processTag(match.index, tagName, attributes, tagLength, isVoid);
      }
    }
    if (openTagName) {
      processTag(str.length, openTagName, openTagAttributes);
    }
    result += str.slice(currentIndex);
    return result;
  }

  function numberOrIndex(str, n, from) {
    if (isString(n)) {
      n = str.indexOf(n);
      if (n === -1) {
        n = from ? str.length : 0;
      }
    }
    return n;
  }

  function buildBase64() {
    var encodeAscii, decodeAscii;

    function catchEncodingError(fn) {
      return function(str) {
        try {
          return fn(str);
        } catch(e) {
          return '';
        }
      };
    }

    if (typeof Buffer !== 'undefined') {
      encodeBase64 = function(str) {
        return new Buffer(str).toString('base64');
      };
      decodeBase64 = function(str) {
        return new Buffer(str, 'base64').toString('utf8');
      };
      return;
    }
    if (typeof btoa !== 'undefined') {
      encodeAscii = catchEncodingError(btoa);
      decodeAscii = catchEncodingError(atob);
    } else {
      var key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      var base64reg = /[^A-Za-z0-9\+\/\=]/g;
      encodeAscii = function(str) {
        var output = '';
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var i = 0;
        do {
          chr1 = str.charCodeAt(i++);
          chr2 = str.charCodeAt(i++);
          chr3 = str.charCodeAt(i++);
          enc1 = chr1 >> 2;
          enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
          enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
          enc4 = chr3 & 63;
          if (isNaN(chr2)) {
            enc3 = enc4 = 64;
          } else if (isNaN(chr3)) {
            enc4 = 64;
          }
          output += key.charAt(enc1);
          output += key.charAt(enc2);
          output += key.charAt(enc3);
          output += key.charAt(enc4);
          chr1 = chr2 = chr3 = '';
          enc1 = enc2 = enc3 = enc4 = '';
        } while (i < str.length);
        return output;
      };
      decodeAscii = function(input) {
        var output = '';
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var i = 0;
        if (input.match(base64reg)) {
          return '';
        }
        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
        do {
          enc1 = key.indexOf(input.charAt(i++));
          enc2 = key.indexOf(input.charAt(i++));
          enc3 = key.indexOf(input.charAt(i++));
          enc4 = key.indexOf(input.charAt(i++));
          chr1 = (enc1 << 2) | (enc2 >> 4);
          chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          chr3 = ((enc3 & 3) << 6) | enc4;
          output = output + chr(chr1);
          if (enc3 != 64) {
            output = output + chr(chr2);
          }
          if (enc4 != 64) {
            output = output + chr(chr3);
          }
          chr1 = chr2 = chr3 = '';
          enc1 = enc2 = enc3 = enc4 = '';
        } while (i < input.length);
        return output;
      };
    }
    encodeBase64 = function(str) {
      return encodeAscii(unescape(encodeURIComponent(str)));
    };
    decodeBase64 = function(str) {
      return decodeURIComponent(escape(decodeAscii(str)));
    };
  }

  function buildEntities() {
    HTMLToEntityMap = {};
    forEachProperty(HTMLFromEntityMap, function(val, key) {
      HTMLToEntityMap[val] = '&' + key + ';';
    });
  }

  function callIncludesWithRegexSupport(str, search, position) {
    if (!isRegExp(search)) {
      return nativeIncludes.call(str, search, position);
    }
    if (position) {
      str = str.slice(position);
    }
    return search.test(str);
  }

  defineInstance(sugarString, {

    // Enhancment to String#includes to allow a regex.
    'includes': fixArgumentLength(callIncludesWithRegexSupport)

  }, [ENHANCEMENTS_FLAG, STRING_ENHANCEMENTS_FLAG]);

  defineInstance(sugarString, {

    /***
     * @method at(index, [loop] = false)
     * @returns Mixed
     * @short Gets the character(s) at a given index.
     * @extra When [loop] is true, overshooting the end of the string will begin
     *        counting from the other end. `index` may be negative. If `index` is
     *        an array, multiple elements will be returned.
     * @example
     *
     *   'jumpy'.at(0)             -> 'j'
     *   'jumpy'.at(2)             -> 'm'
     *   'jumpy'.at(5)             -> ''
     *   'jumpy'.at(5, true)       -> 'j'
     *   'jumpy'.at(-1)            -> 'y'
     *   'lucky charms'.at([2, 4]) -> ['u','k']
     *
     * @param {number|Array<number>} index
     * @param {boolean} [loop]
     *
     ***/
    'at': function(str, index, loop) {
      return getEntriesForIndexes(str, index, loop, true);
    },

    /***
     * @method escapeURL([param] = false)
     * @returns String
     * @short Escapes characters in a string to make a valid URL.
     * @extra If [param] is true, it will also escape valid URL characters. Use
     *        this when the entire string is meant for use in a query string.
     *
     * @example
     *
     *   'a, b, and c'.escapeURL() -> 'a,%20b,%20and%20c'
     *   'http://foo.com/'.escapeURL(true) -> 'http%3A%2F%2Ffoo.com%2F'
     *
     * @param {boolean} [param]
     *
     ***/
    'escapeURL': function(str, param) {
      return param ? encodeURIComponent(str) : encodeURI(str);
    },

    /***
     * @method unescapeURL([partial] = false)
     * @returns String
     * @short Restores escaped characters in a URL escaped string.
     * @extra If [partial] is true, it will only unescape non-valid URL tokens,
     *        and is included here for completeness, but should be rarely needed.
     *
     * @example
     *
     *   'http%3A%2F%2Ffoo.com%2F'.unescapeURL()     -> 'http://foo.com/'
     *   'http%3A%2F%2Ffoo.com%2F'.unescapeURL(true) -> 'http%3A%2F%2Ffoo.com%2F'
     *
     * @param {boolean} [partial]
     *
     ***/
    'unescapeURL': function(str, param) {
      return param ? decodeURI(str) : decodeURIComponent(str);
    },

    /***
     * @method escapeHTML()
     * @returns String
     * @short Converts HTML characters to their entity equivalents.
     *
     * @example
     *
     *   '<p>some text</p>'.escapeHTML() -> '&lt;p&gt;some text&lt;/p&gt;'
     *   'one & two'.escapeHTML()        -> 'one &amp; two'
     *
     ***/
    'escapeHTML': function(str) {
      return str.replace(HTML_ESCAPE_REG, function(chr) {
        return getOwn(HTMLToEntityMap, chr);
      });
    },

    /***
     * @method unescapeHTML()
     * @returns String
     * @short Restores escaped HTML characters.
     *
     * @example
     *
     *   '&lt;p&gt;some text&lt;/p&gt;'.unescapeHTML() -> '<p>some text</p>'
     *   'one &amp; two'.unescapeHTML()                -> 'one & two'
     *
     ***/
    'unescapeHTML': function(str) {
      return unescapeHTML(str);
    },

    /***
     * @method stripTags([tag] = 'all', [replace])
     * @returns String
     * @short Strips HTML tags from the string.
     * @extra [tag] may be an array of tags or 'all', in which case all tags will
     *        be stripped. [replace] will replace what was stripped, and may be a
     *        string or a function to handle replacements. If this function returns
     *        a string, then it will be used for the replacement. If it returns
     *        `undefined`, the tags will be stripped normally.
     *
     * @callback tagReplaceFn
     *
     *   tag     The tag name.
     *   inner   The tag content.
     *   attr    The attributes on the tag, if any, as a string.
     *   outer   The entire matched tag string.
     *
     * @example
     *
     *   '<p>just <b>some</b> text</p>'.stripTags()    -> 'just some text'
     *   '<p>just <b>some</b> text</p>'.stripTags('p') -> 'just <b>some</b> text'
     *   '<p>hi!</p>'.stripTags('p', function(all, content) {
     *     return '|';
     *   }); -> '|hi!|'
     *
     * @param {string} tag
     * @param {string|tagReplaceFn} replace
     * @callbackParam {string} tag
     * @callbackParam {string} inner
     * @callbackParam {string} attr
     * @callbackParam {string} outer
     * @callbackReturns {string} tagReplaceFn
     *
     ***/
    'stripTags': function(str, tag, replace) {
      return replaceTags(str, tag, replace, true);
    },

    /***
     * @method removeTags([tag] = 'all', [replace])
     * @returns String
     * @short Removes HTML tags and their contents from the string.
     * @extra [tag] may be an array of tags or 'all', in which case all tags will
     *        be removed. [replace] will replace what was removed, and may be a
     *        string or a function to handle replacements. If this function returns
     *        a string, then it will be used for the replacement. If it returns
     *        `undefined`, the tags will be removed normally.
     *
     * @callback tagReplaceFn
     *
     *   tag     The tag name.
     *   inner   The tag content.
     *   attr    The attributes on the tag, if any, as a string.
     *   outer   The entire matched tag string.
     *
     * @example
     *
     *   '<p>just <b>some</b> text</p>'.removeTags()    -> ''
     *   '<p>just <b>some</b> text</p>'.removeTags('b') -> '<p>just text</p>'
     *   '<p>hi!</p>'.removeTags('p', function(all, content) {
     *     return 'bye!';
     *   }); -> 'bye!'
     *
     * @param {string} tag
     * @param {string|tagReplaceFn} replace
     * @callbackParam {string} tag
     * @callbackParam {string} inner
     * @callbackParam {string} attr
     * @callbackParam {string} outer
     * @callbackReturns {string} tagReplaceFn
     *
     ***/
    'removeTags': function(str, tag, replace) {
      return replaceTags(str, tag, replace, false);
    },

    /***
     * @method encodeBase64()
     * @returns String
     * @short Encodes the string into base64 encoding.
     * @extra This method wraps native methods when available, and uses a custom
     *        implementation when not available. It can also handle Unicode
     *        string encodings.
     *
     * @example
     *
     *   'gonna get encoded!'.encodeBase64()  -> 'Z29ubmEgZ2V0IGVuY29kZWQh'
     *   'http://twitter.com/'.encodeBase64() -> 'aHR0cDovL3R3aXR0ZXIuY29tLw=='
     *
     ***/
    'encodeBase64': function(str) {
      return encodeBase64(str);
    },

    /***
     * @method decodeBase64()
     * @returns String
     * @short Decodes the string from base64 encoding.
     * @extra This method wraps native methods when available, and uses a custom
     *        implementation when not available. It can also handle Unicode string
     *        encodings.
     *
     * @example
     *
     *   'aHR0cDovL3R3aXR0ZXIuY29tLw=='.decodeBase64() -> 'http://twitter.com/'
     *   'anVzdCBnb3QgZGVjb2RlZA=='.decodeBase64()     -> 'just got decoded!'
     *
     ***/
    'decodeBase64': function(str) {
      return decodeBase64(str);
    },

    /***
     * @method forEach([search], [callback])
     * @returns Array
     * @short Runs callback [fn] against every character in the string, or every
     *        every occurence of [search] if it is provided.
     * @extra Returns an array of matches. [search] may be either a string or
     *        regex, and defaults to every character in the string. If [fn]
     *        returns false at any time it will break out of the loop.
     *
     * @callback stringEachFn
     *
     *   match  The current match.
     *   i      The current index.
     *   arr    An array of all matches.
     *
     * @example
     *
     *   'jumpy'.forEach(log)     -> ['j','u','m','p','y']
     *   'jumpy'.forEach(/[r-z]/) -> ['u','y']
     *   'jumpy'.forEach(/mp/)    -> ['mp']
     *   'jumpy'.forEach(/[r-z]/, function(m) {
     *     // Called twice: "u", "y"
     *   });
     *
     * @signature forEach(callback)
     * @param {string|RegExp} [search]
     * @param {stringEachFn} [callback]
     * @callbackParam {string} match
     * @callbackParam {number} i
     * @callbackParam {Array<string>} arr
     *
     ***/
    'forEach': function(str, search, fn) {
      return stringEach(str, search, fn);
    },

    /***
     * @method chars([callback])
     * @returns Array
     * @short Runs [fn] against each character in the string, and returns an array.
     *
     * @callback eachCharFn
     *
     *   char  The current character.
     *   i     The current index.
     *   arr   An array of all characters.
     *
     * @example
     *
     *   'jumpy'.chars() -> ['j','u','m','p','y']
     *   'jumpy'.chars(function(c) {
     *     // Called 5 times: "j","u","m","p","y"
     *   });
     *
     * @param {eachCharFn} [callback]
     * @callbackParam {string} char
     * @callbackParam {number} i
     * @callbackParam {Array<string>} arr
     *
     ***/
    'chars': function(str, search, fn) {
      return stringEach(str, search, fn);
    },

    /***
     * @method words([callback])
     * @returns Array
     * @short Runs [fn] against each word in the string, and returns an array.
     * @extra A "word" is defined as any sequence of non-whitespace characters.
     *
     * @callback eachWordFn
     *
     *   word  The current word.
     *   i     The current index.
     *   arr   An array of all words.
     *
     * @example
     *
     *   'broken wear'.words() -> ['broken','wear']
     *   'broken wear'.words(function(w) {
     *     // Called twice: "broken", "wear"
     *   });
     *
     * @param {eachWordFn} [callback]
     * @callbackParam {string} word
     * @callbackParam {number} i
     * @callbackParam {Array<string>} arr
     *
     ***/
    'words': function(str, fn) {
      return stringEach(trim(str), /\S+/g, fn);
    },

    /***
     * @method lines([callback])
     * @returns Array
     * @short Runs [fn] against each line in the string, and returns an array.
     *
     * @callback eachLineFn
     *
     *   line  The current line.
     *   i     The current index.
     *   arr   An array of all lines.
     *
     * @example
     *
     *   lineText.lines() -> array of lines
     *   lineText.lines(function(l) {
     *     // Called once per line
     *   });
     *
     * @param {eachLineFn} [callback]
     * @callbackParam {string} line
     * @callbackParam {number} i
     * @callbackParam {Array<string>} arr
     *
     ***/
    'lines': function(str, fn) {
      return stringEach(trim(str), /^.*$/gm, fn);
    },

    /***
     * @method codes([callback])
     * @returns Array
     * @short Runs callback [fn] against each character code in the string.
     *        Returns an array of character codes.
     *
     * @callback eachCodeFn
     *
     *   code  The current character code.
     *   i     The current index.
     *   str   The string being operated on.
     *
     * @example
     *
     *   'jumpy'.codes() -> [106,117,109,112,121]
     *   'jumpy'.codes(function(c) {
     *     // Called 5 times: 106, 117, 109, 112, 121
     *   });
     *
     * @param {eachCodeFn} [callback]
     * @callbackParam {number} code
     * @callbackParam {number} i
     * @callbackParam {string} str
     *
     ***/
    'codes': function(str, fn) {
      return stringCodes(str, fn);
    },

    /***
     * @method shift(n)
     * @returns Array
     * @short Shifts each character in the string `n` places in the character map.
     *
     * @example
     *
     *   'a'.shift(1)  -> 'b'
     *   'ク'.shift(1) -> 'グ'
     *
     * @param {number} n
     *
     ***/
    'shift': function(str, n) {
      var result = '';
      n = n || 0;
      stringCodes(str, function(c) {
        result += chr(c + n);
      });
      return result;
    },

    /***
     * @method isBlank()
     * @returns Boolean
     * @short Returns true if the string has length 0 or contains only whitespace.
     *
     * @example
     *
     *   ''.isBlank()      -> true
     *   '   '.isBlank()   -> true
     *   'noway'.isBlank() -> false
     *
     ***/
    'isBlank': function(str) {
      return trim(str).length === 0;
    },

    /***
     * @method isEmpty()
     * @returns Boolean
     * @short Returns true if the string has length 0.
     *
     * @example
     *
     *   ''.isEmpty()  -> true
     *   'a'.isBlank() -> false
     *   ' '.isBlank() -> false
     *
     ***/
    'isEmpty': function(str) {
      return str.length === 0;
    },

    /***
     * @method insert(str, [index] = length)
     * @returns String
     * @short Adds `str` at [index]. Allows negative values.
     *
     * @example
     *
     *   'dopamine'.insert('e', 3)       -> dopeamine
     *   'spelling eror'.insert('r', -3) -> spelling error
     *
     * @param {string} str
     * @param {number} [index]
     *
     ***/
    'insert': function(str, substr, index) {
      index = isUndefined(index) ? str.length : index;
      return str.slice(0, index) + substr + str.slice(index);
    },

    /***
     * @method remove(f)
     * @returns String
     * @short Removes the first occurrence of `f` in the string.
     * @extra `f` can be a either case-sensitive string or a regex. In either case
     *        only the first match will be removed. To remove multiple occurrences,
     *        use `removeAll`.
     *
     * @example
     *
     *   'schfifty five'.remove('f')      -> 'schifty five'
     *   'schfifty five'.remove(/[a-f]/g) -> 'shfifty five'
     *
     * @param {string|RegExp} f
     *
     ***/
    'remove': function(str, f) {
      return str.replace(f, '');
    },

    /***
     * @method removeAll(f)
     * @returns String
     * @short Removes any occurences of `f` in the string.
     * @extra `f` can be either a case-sensitive string or a regex. In either case
     *        all matches will be removed. To remove only a single occurence, use
     *        `remove`.
     *
     * @example
     *
     *   'schfifty five'.removeAll('f')     -> 'schity ive'
     *   'schfifty five'.removeAll(/[a-f]/) -> 'shity iv'
     *
     * @param {string|RegExp} f
     *
     ***/
    'removeAll': function(str, f) {
      return stringReplaceAll(str, f);
    },

    /***
     * @method reverse()
     * @returns String
     * @short Reverses the string.
     *
     * @example
     *
     *   'jumpy'.reverse()        -> 'ypmuj'
     *   'lucky charms'.reverse() -> 'smrahc ykcul'
     *
     ***/
    'reverse': function(str) {
      return reverseString(str);
    },

    /***
     * @method compact()
     * @returns String
     * @short Compacts whitespace in the string to a single space and trims the ends.
     *
     * @example
     *
     *   'too \n much \n space'.compact() -> 'too much space'
     *   'enough \n '.compact()           -> 'enought'
     *
     ***/
    'compact': function(str) {
      return trim(str).replace(/([\r\n\s　])+/g, function(match, whitespace) {
        return whitespace === '　' ? whitespace : ' ';
      });
    },

    /***
     * @method from([index] = 0)
     * @returns String
     * @short Returns a section of the string starting from [index].
     *
     * @example
     *
     *   'lucky charms'.from()   -> 'lucky charms'
     *   'lucky charms'.from(7)  -> 'harms'
     *
     * @param {number} [index]
     *
     ***/
    'from': function(str, from) {
      return str.slice(numberOrIndex(str, from, true));
    },

    /***
     * @method to([index] = end)
     * @returns String
     * @short Returns a section of the string ending at [index].
     *
     * @example
     *
     *   'lucky charms'.to()   -> 'lucky charms'
     *   'lucky charms'.to(7)  -> 'lucky ch'
     *
     * @param {number} [index]
     *
     ***/
    'to': function(str, to) {
      if (isUndefined(to)) to = str.length;
      return str.slice(0, numberOrIndex(str, to));
    },

    /***
     * @method dasherize()
     * @returns String
     * @short Converts underscores and camel casing to hypens.
     *
     * @example
     *
     *   'a_farewell_to_arms'.dasherize() -> 'a-farewell-to-arms'
     *   'capsLock'.dasherize()           -> 'caps-lock'
     *
     ***/
    'dasherize': function(str) {
      return stringUnderscore(str).replace(/_/g, '-');
    },

    /***
     * @method underscore()
     * @returns String
     * @short Converts hyphens and camel casing to underscores.
     *
     * @example
     *
     *   'a-farewell-to-arms'.underscore() -> 'a_farewell_to_arms'
     *   'capsLock'.underscore()           -> 'caps_lock'
     *
     ***/
    'underscore': function(str) {
      return stringUnderscore(str);
    },

    /***
     * @method camelize([upper] = true)
     * @returns String
     * @short Converts underscores and hyphens to camel case.
     * @extra If [upper] is true, the string will be UpperCamelCase. If the
     *        inflections module is included, acronyms can also be defined that
     *        will be used when camelizing.
     *
     * @example
     *
     *   'caps_lock'.camelize()              -> 'CapsLock'
     *   'moz-border-radius'.camelize()      -> 'MozBorderRadius'
     *   'moz-border-radius'.camelize(false) -> 'mozBorderRadius'
     *   'http-method'.camelize()            -> 'HTTPMethod'
     *
     * @param {boolean} [upper]
     *
     ***/
    'camelize': function(str, upper) {
      return stringCamelize(str, upper);
    },

    /***
     * @method spacify()
     * @returns String
     * @short Converts camelcase, underscores, and hyphens to spaces.
     *
     * @example
     *
     *   'camelCase'.spacify()                         -> 'camel case'
     *   'an-ugly-string'.spacify()                    -> 'an ugly string'
     *   'oh-no_youDid-not'.spacify().capitalize(true) -> 'something else'
     *
     ***/
    'spacify': function(str) {
      return stringSpacify(str);
    },

    /***
     * @method titleize()
     * @returns String
     * @short Creates a title version of the string.
     * @extra Capitalizes all the words and replaces some characters in the string
     *        to create a nicer looking title. String#titleize is meant for
     *        creating pretty output.
     *
     * @example
     *
     *   'man from the boondocks'.titleize() -> 'Man from the Boondocks'
     *   'x-men: apocalypse'.titleize() -> 'X Men: Apocalypse'
     *   'TheManWithoutAPast'.titleize() -> 'The Man Without a Past'
     *   'raiders_of_the_lost_ark'.titleize() -> 'Raiders of the Lost Ark'
     *
     ***/
    'titleize': function(str) {
      return stringTitleize(str);
    },

    /***
     * @method parameterize()
     * @returns String
     * @short Replaces special characters in a string so that it may be used as
     *        part of a pretty URL.
     *
     * @example
     *
     *   'hell, no!'.parameterize() -> 'hell-no'
     *
     ***/
    'parameterize': function(str, separator) {
      return stringParameterize(str, separator);
    },

    /***
     * @method truncate(length, [from] = 'right', [ellipsis] = '...')
     * @returns String
     * @short Truncates a string.
     * @extra [from] can be `'right'`, `'left'`, or `'middle'`. If the string is
     *        shorter than `length`, [ellipsis] will not be added.
     *
     * @example
     *
     *   'sittin on the dock'.truncate(10)           -> 'sittin on ...'
     *   'sittin on the dock'.truncate(10, 'left')   -> '...n the dock'
     *   'sittin on the dock'.truncate(10, 'middle') -> 'sitti... dock'
     *
     * @param {number} length
     * @param {string} [from]
     * @param {string} [ellipsis]
     *
     ***/
    'truncate': function(str, length, from, ellipsis) {
      return truncateString(str, length, from, ellipsis);
    },

    /***
     * @method truncateOnWord(length, [from] = 'right', [ellipsis] = '...')
     * @returns String
     * @short Truncates a string without splitting up words.
     * @extra [from] can be `'right'`, `'left'`, or `'middle'`. If the string is
     *        shorter than `length`, [ellipsis] will not be added. A "word" is
     *        defined as any sequence of non-whitespace characters.
     *
     * @example
     *
     *   'here we go'.truncateOnWord(5)         -> 'here...'
     *   'here we go'.truncateOnWord(5, 'left') -> '...we go'
     *
     * @param {number} length
     * @param {string} [from]
     * @param {string} [ellipsis]
     *
     ***/
    'truncateOnWord': function(str, length, from, ellipsis) {
      return truncateString(str, length, from, ellipsis, true);
    },

    /***
     * @method pad(num, [padding] = ' ')
     * @returns String
     * @short Pads the string out with [padding] to be exactly `num` characters.
     *
     * @example
     *
     *   'wasabi'.pad(8)      -> ' wasabi '
     *   'wasabi'.pad(8, '-') -> '-wasabi-'
     *
     * @param {number} num
     * @param {string} [padding]
     *
     ***/
    'pad': function(str, num, padding) {
      var half, front, back;
      num   = coercePositiveInteger(num);
      half  = max(0, num - str.length) / 2;
      front = floor(half);
      back  = ceil(half);
      return padString(front, padding) + str + padString(back, padding);
    },

    /***
     * @method padLeft(num, [padding] = ' ')
     * @returns String
     * @short Pads the string out from the left with [padding] to be exactly
     *        `num` characters.
     *
     * @example
     *
     *   'wasabi'.padLeft(8)      -> '  wasabi'
     *   'wasabi'.padLeft(8, '-') -> '--wasabi'
     *
     * @param {number} num
     * @param {string} [padding]
     *
     ***/
    'padLeft': function(str, num, padding) {
      num = coercePositiveInteger(num);
      return padString(max(0, num - str.length), padding) + str;
    },

    /***
     * @method padRight(num, [padding] = ' ')
     * @returns String
     * @short Pads the string out from the right with [padding] to be exactly
     *        `num` characters.
     *
     * @example
     *
     *   'wasabi'.padRight(8)      -> 'wasabi  '
     *   'wasabi'.padRight(8, '-') -> 'wasabi--'
     *
     * @param {number} num
     * @param {string} [padding]
     *
     ***/
    'padRight': function(str, num, padding) {
      num = coercePositiveInteger(num);
      return str + padString(max(0, num - str.length), padding);
    },

    /***
     * @method first([n] = 1)
     * @returns String
     * @short Returns the first [n] characters of the string.
     *
     * @example
     *
     *   'lucky charms'.first()  -> 'l'
     *   'lucky charms'.first(3) -> 'luc'
     *
     * @param {number} [n]
     *
     ***/
    'first': function(str, num) {
      if (isUndefined(num)) num = 1;
      return str.substr(0, num);
    },

    /***
     * @method last([n] = 1)
     * @returns String
     * @short Returns the last [n] characters of the string.
     *
     * @example
     *
     *   'lucky charms'.last()  -> 's'
     *   'lucky charms'.last(3) -> 'rms'
     *
     * @param {number} [n]
     *
     ***/
    'last': function(str, num) {
      if (isUndefined(num)) num = 1;
      var start = str.length - num < 0 ? 0 : str.length - num;
      return str.substr(start);
    },

    /***
     * @method toNumber([base] = 10)
     * @returns Number
     * @short Converts the string into a number.
     * @extra Any value with a "." fill be converted to a floating point value,
     *        otherwise an integer.
     *
     * @example
     *
     *   '153'.toNumber()    -> 153
     *   '12,000'.toNumber() -> 12000
     *   '10px'.toNumber()   -> 10
     *   'ff'.toNumber(16)   -> 255
     *
     * @param {number} [base]
     *
     ***/
    'toNumber': function(str, base) {
      return stringToNumber(str, base);
    },

    /***
     * @method capitalize([lower] = false, [all] = false)
     * @returns String
     * @short Capitalizes the first character of the string.
     * @extra If [lower] is true, the remainder of the string will be downcased.
     *        If [all] is true, all words in the string will be capitalized.
     *
     * @example
     *
     *   'hello'.capitalize()           -> 'Hello'
     *   'HELLO'.capitalize(true)       -> 'Hello'
     *   'hello kitty'.capitalize()     -> 'Hello kitty'
     *   'hEllO kItTy'.capitalize(true, true) -> 'Hello Kitty'
     *
     * @param {boolean} [lower]
     * @param {boolean} [all]
     *
     ***/
    'capitalize': function(str, lower, all) {
      return stringCapitalize(str, lower, all);
    },

    /***
     * @method trimLeft()
     * @returns String
     * @short Removes leading whitespace from the string.
     * @extra Whitespace is defined as line breaks, tabs, and any character in the
     *        "Space, Separator" Unicode category, conforming to the the ES5 `trim`
     *        spec.
     *
     * @example
     *
     *   '   wasabi   '.trimLeft()  -> 'wasabi   '
     *
     ***/
    'trimLeft': function(str) {
      return str.replace(LEFT_TRIM_REG, '');
    },

    /***
     * @method trimRight()
     * @returns String
     * @short Removes trailing whitespace from the string.
     * @extra Whitespace is defined as line breaks, tabs, and any character in the
     *        "Space, Separator" Unicode category, conforming to the the ES5 `trim`
     *        spec.
     *
     * @example
     *
     *   '   wasabi   '.trimRight() -> '   wasabi'
     *
     ***/
    'trimRight': function(str) {
      return str.replace(RIGHT_TRIM_REG, '');
    }

  });

  defineInstanceWithArguments(sugarString, {

    /***
     * @method replaceAll(f, [str1], [str2], ...)
     * @returns String
     * @short Replaces all occurences of `f` with arguments passed.
     * @extra This method is intended to be a quick way to perform multiple string
     *        replacements quickly when the replacement token differs depending on
     *        position. `f` can be either a case-sensitive string or a regex.
     *        In either case all matches will be replaced.
     *
     * @example
     *
     *   '-x -y -z'.replaceAll('-', 1, 2, 3)               -> '1x 2y 3z'
     *   'one and two'.replaceAll(/one|two/, '1st', '2nd') -> '1st and 2nd'
     *
     * @param {string|RegExp} f
     * @param {string} [str1]
     * @param {string} [str2]
     *
     ***/
    'replaceAll': function(str, f, args) {
      return stringReplaceAll(str, f, args);
    },

    /***
     * @method format(obj1, [obj2], ...)
     * @returns String
     * @short Replaces `{}` tokens in the string with arguments or properties.
     * @extra Tokens support `deep properties`. If a single object is passed, its
     *        properties can be accessed by keywords such as `{name}`. If multiple
     *        objects or a non-object are passed, they can be accessed by the
     *        argument position like `{0}`. Literal braces in the string can be
     *        escaped by repeating them.
     *
     * @example
     *
     *   'Welcome, {name}.'.format({ name: 'Bill' }) -> 'Welcome, Bill.'
     *   'You are {0} years old today.'.format(5)    -> 'You are 5 years old today.'
     *   '{0.name} and {1.name}'.format(users)       -> logs first two users' names
     *   '${currencies.usd.balance}'.format(Harry)   -> "$500"
     *   '{{Hello}}'.format('Hello')                 -> "{Hello}"
     *
     * @param {any} [obj1]
     * @param {any} [obj2]
     *
     ***/
    'format': function(str, args) {
      var arg1 = args[0] && args[0].valueOf();
      // Unwrap if a single object is passed in.
      if (args.length === 1 && isObjectType(arg1)) {
        args = arg1;
      }
      return stringFormatMatcher(str, args);
    }

  });

  buildBase64();
  buildEntities();

  /***
   * @module Range
   * @description Date, Number, and String ranges that can be manipulated and compared,
   *              or enumerate over specific points within the range.
   *
   ***/

  var DURATION_UNITS = 'year|month|week|day|hour|minute|second|millisecond';
  var DURATION_REG   = RegExp('(\\d+)?\\s*('+ DURATION_UNITS +')s?', 'i');

  var MULTIPLIERS = {
    'Hours': 60 * 60 * 1000,
    'Minutes': 60 * 1000,
    'Seconds': 1000,
    'Milliseconds': 1
  };

  var PrimitiveRangeConstructor = function(start, end) {
    return new Range(start, end);
  };

  function Range(start, end) {
    this.start = cloneRangeMember(start);
    this.end   = cloneRangeMember(end);
  }

  function getRangeMemberNumericValue(m) {
    return isString(m) ? m.charCodeAt(0) : m;
  }

  function getRangeMemberPrimitiveValue(m) {
    if (m == null) return m;
    return isDate(m) ? m.getTime() : m.valueOf();
  }

  function getPrecision(n) {
    var split = periodSplit(n.toString());
    return split[1] ? split[1].length : 0;
  }

  function getGreaterPrecision(n1, n2) {
    return max(getPrecision(n1), getPrecision(n2));
  }

  function cloneRangeMember(m) {
    if (isDate(m)) {
      return new Date(m.getTime());
    } else {
      return getRangeMemberPrimitiveValue(m);
    }
  }

  function isValidRangeMember(m) {
    var val = getRangeMemberPrimitiveValue(m);
    return (!!val || val === 0) && valueIsNotInfinite(m);
  }

  function valueIsNotInfinite(m) {
    return m !== -Infinity && m !== Infinity;
  }

  function rangeIsValid(range) {
    return isValidRangeMember(range.start) &&
           isValidRangeMember(range.end) &&
           typeof range.start === typeof range.end;
  }

  function rangeEvery(range, step, countOnly, fn) {
    var increment,
        precision,
        dio,
        unit,
        start   = range.start,
        end     = range.end,
        inverse = end < start,
        current = start,
        index   = 0,
        result  = [];

    if (!rangeIsValid(range)) {
      return [];
    }
    if (isFunction(step)) {
      fn = step;
      step = null;
    }
    step = step || 1;
    if (isNumber(start)) {
      precision = getGreaterPrecision(start, step);
      increment = function() {
        return incrementNumber(current, step, precision);
      };
    } else if (isString(start)) {
      increment = function() {
        return incrementString(current, step);
      };
    } else if (isDate(start)) {
      dio  = getDateIncrementObject(step);
      step = dio[0];
      unit = dio[1];
      increment = function() {
        return incrementDate(current, step, unit);
      };
    }
    // Avoiding infinite loops
    if (inverse && step > 0) {
      step *= -1;
    }
    while(inverse ? current >= end : current <= end) {
      if (!countOnly) {
        result.push(current);
      }
      if (fn) {
        fn(current, index, range);
      }
      current = increment();
      index++;
    }
    return countOnly ? index - 1 : result;
  }

  function getDateIncrementObject(amt) {
    var match, val, unit;
    if (isNumber(amt)) {
      return [amt, 'Milliseconds'];
    }
    match = amt.match(DURATION_REG);
    val = +match[1] || 1;
    unit = simpleCapitalize(match[2].toLowerCase());
    if (unit.match(/hour|minute|second/i)) {
      unit += 's';
    } else if (unit === 'Year') {
      unit = 'FullYear';
    } else if (unit === 'Week') {
      unit = 'Date';
      val *= 7;
    } else if (unit === 'Day') {
      unit = 'Date';
    }
    return [val, unit];
  }

  function incrementDate(src, amount, unit) {
    var mult = MULTIPLIERS[unit], d;
    if (mult) {
      d = new Date(src.getTime() + (amount * mult));
    } else {
      d = new Date(src);
      callDateSet(d, unit, callDateGet(src, unit) + amount);
    }
    return d;
  }

  function incrementString(current, amount) {
    return chr(current.charCodeAt(0) + amount);
  }

  function incrementNumber(current, amount, precision) {
    return withPrecision(current + amount, precision);
  }

  function rangeClamp(range, obj) {
    var clamped,
        start = range.start,
        end = range.end,
        min = end < start ? end : start,
        max = start > end ? start : end;
    if (obj < min) {
      clamped = min;
    } else if (obj > max) {
      clamped = max;
    } else {
      clamped = obj;
    }
    return cloneRangeMember(clamped);
  }

  defineOnPrototype(Range, {

    /***
     * @method toString()
     * @returns String
     * @short Returns a string representation of the range.
     *
     * @example
     *
     *   Number.range(1, 5).toString() -> 1..5
     *   janToMay.toString()           -> January 1, xxxx..May 1, xxxx
     *
     ***/
    'toString': function() {
      return rangeIsValid(this) ? this.start + '..' + this.end : 'Invalid Range';
    },

    /***
     * @method isValid()
     * @returns Boolean
     * @short Returns true if the range is valid, false otherwise.
     *
     * @example
     *
     *   janToMay.isValid() -> true
     *   Number.range(NaN, NaN).isValid()                           -> false
     *
     ***/
    'isValid': function() {
      return rangeIsValid(this);
    },

    /***
     * @method span()
     * @returns Number
     * @short Returns the span of the range. If the range is a date range, the
     *        value is in milliseconds.
     * @extra The span includes both the start and the end.
     *
     * @example
     *
     *   Number.range(5, 10).span()  -> 6
     *   Number.range(40, 25).span() -> 16
     *   janToMay.span()             -> 10368000001 (or more depending on leap year)
     *
     ***/
    'span': function() {
      var n = getRangeMemberNumericValue(this.end) - getRangeMemberNumericValue(this.start);
      return rangeIsValid(this) ? abs(n) + 1 : NaN;
    },

    /***
     * @method contains(el)
     * @returns Boolean
     * @short Returns true if `el` is contained inside the range. `el` may be a
     *        value or another range.
     *
     * @example
     *
     *   Number.range(5, 10).contains(7)         -> true
     *   Number.range(5, 10).contains(2)         -> false
     *   janToMay.contains(mar)                  -> true
     *   janToMay.contains(marToAug)             -> false
     *   janToMay.contains(febToApr)             -> true
     *
     * @param {RangeElement} el
     *
     ***/
    'contains': function(el) {
      if (el == null) return false;
      if (el.start && el.end) {
        return el.start >= this.start && el.start <= this.end &&
               el.end   >= this.start && el.end   <= this.end;
      } else {
        return el >= this.start && el <= this.end;
      }
    },

    /***
     * @method every(amount, [fn])
     * @returns Array
     * @short Iterates through the range by `amount`, calling [fn] for each step.
     * @extra Returns an array of each increment visited. For date ranges,
     *        `amount` can also be a string like `"2 days"`. This will step
     *        through the range by incrementing a date object by that specific
     *        unit, and so is generally preferable for vague units such as
     *        `"2 months"`.
     *
     * @callback rangeEveryFn
     *
     *   el   The element of the current iteration.
     *   i    The index of the current iteration.
     *   r    A reference to the range.
     *
     * @example
     *
     *   Number.range(2, 8).every(2) -> [2,4,6,8]
     *   janToMay.every('2 months')  -> [Jan 1, Mar 1, May 1]
     *
     *   sepToOct.every('week', function() {
     *     // Will be called every week from September to October
     *   })
     *
     * @param {string|number} amount
     * @param {rangeEveryFn} [fn]
     * @callbackParam {RangeElement} el
     * @callbackParam {number} i
     * @callbackParam {Range} r
     *
     ***/
    'every': function(amount, fn) {
      return rangeEvery(this, amount, false, fn);
    },

    /***
     * @method toArray()
     * @returns Array
     * @short Creates an array from the range.
     * @extra If the range is a date range, every millisecond between the start
     *        and end dates will be returned. To control this use `every` instead.
     *
     * @example
     *
     *   Number.range(1, 5).toArray() -> [1,2,3,4,5]
     *   Date.range('1 millisecond ago', 'now').toArray() -> [1ms ago, now]
     *
     ***/
    'toArray': function() {
      return rangeEvery(this);
    },

    /***
     * @method union(range)
     * @returns Range
     * @short Returns a new range with the earliest starting point as its start,
     *        and the latest ending point as its end. If the two ranges do not
     *        intersect this will effectively remove the "gap" between them.
     *
     * @example
     *
     *   oneToTen.union(fiveToTwenty) -> 1..20
     *   janToMay.union(marToAug)     -> Jan 1, xxxx..Aug 1, xxxx
     *
     * @param {Range} range
     *
     ***/
    'union': function(range) {
      return new Range(
        this.start < range.start ? this.start : range.start,
        this.end   > range.end   ? this.end   : range.end
      );
    },

    /***
     * @method intersect(range)
     * @returns Range
     * @short Returns a new range with the latest starting point as its start,
     *        and the earliest ending point as its end. If the two ranges do not
     *        intersect this will effectively produce an invalid range.
     *
     * @example
     *
     *   oneToTen.intersect(fiveToTwenty) -> 5..10
     *   janToMay.intersect(marToAug)     -> Mar 1, xxxx..May 1, xxxx
     *
     * @param {Range} range
     *
     ***/
    'intersect': function(range) {
      if (range.start > this.end || range.end < this.start) {
        return new Range(NaN, NaN);
      }
      return new Range(
        this.start > range.start ? this.start : range.start,
        this.end   < range.end   ? this.end   : range.end
      );
    },

    /***
     * @method clone()
     * @returns Range
     * @short Clones the range.
     * @extra Members of the range will also be cloned.
     *
     * @example
     *
     *   Number.range(1, 5).clone() -> Returns a copy of the range.
     *
     ***/
    'clone': function() {
      return new Range(this.start, this.end);
    },

    /***
     * @method clamp(el)
     * @returns Mixed
     * @short Clamps `el` to be within the range if it falls outside.
     *
     * @example
     *
     *   Number.range(1, 5).clamp(8)     -> 5
     *   janToMay.clamp(aug) -> May 1, xxxx
     *
     * @param {RangeElement} el
     *
     ***/
    'clamp': function(el) {
      return rangeClamp(this, el);
    }

  });


  /*** @namespace String ***/

  defineStatic(sugarString, {

    /***
     * @method range([start], [end])
     * @returns Range
     * @static
     * @short Creates a new string range between [start] and [end]. See `ranges`
     *        for more.
     *
     * @example
     *
     *   String.range('a', 'z')
     *   String.range('t', 'm')
     *
     * @param {string} [start]
     * @param {string} [end]
     *
     ***/
    'range': PrimitiveRangeConstructor

  });



}).call(this);