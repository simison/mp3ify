#!/usr/bin/env node
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.l = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// identity function for calling harmony imports with the correct context
/******/ 	__webpack_require__.i = function(value) { return value; };

/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};

/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};

/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 12);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var exec = __webpack_require__(4).exec;
var isWindows = __webpack_require__(39).platform().match(/win(32|64)/);
var _which = __webpack_require__(35);

var nlRegexp = /\r\n|\r|\n/g;
var streamRegexp = /^\[?(.*?)\]?$/;
var filterEscapeRegexp = /[,]/;
var whichCache = {};

/**
 * Parse progress line from ffmpeg stderr
 *
 * @param {String} line progress line
 * @return progress object
 * @private
 */
function parseProgressLine(line) {
  var progress = {};

  // Remove all spaces after = and trim
  line = line.replace(/=\s+/g, '=').trim();
  var progressParts = line.split(' ');

  // Split every progress part by "=" to get key and value
  for (var i = 0; i < progressParts.length; i++) {
    var progressSplit = progressParts[i].split('=', 2);
    var key = progressSplit[0];
    var value = progressSplit[1];

    // This is not a progress line
    if (typeof value === 'undefined') return null;

    progress[key] = value;
  }

  return progress;
}

var utils = module.exports = {
  isWindows: isWindows,
  streamRegexp: streamRegexp,

  /**
   * Copy an object keys into another one
   *
   * @param {Object} source source object
   * @param {Object} dest destination object
   * @private
   */
  copy: function copy(source, dest) {
    Object.keys(source).forEach(function (key) {
      dest[key] = source[key];
    });
  },

  /**
   * Create an argument list
   *
   * Returns a function that adds new arguments to the list.
   * It also has the following methods:
   * - clear() empties the argument list
   * - get() returns the argument list
   * - find(arg, count) finds 'arg' in the list and return the following 'count' items, or undefined if not found
   * - remove(arg, count) remove 'arg' in the list as well as the following 'count' items
   *
   * @private
   */
  args: function args() {
    var list = [];

    // Append argument(s) to the list
    var argfunc = function argfunc() {
      if (arguments.length === 1 && Array.isArray(arguments[0])) {
        list = list.concat(arguments[0]);
      } else {
        list = list.concat([].slice.call(arguments));
      }
    };

    // Clear argument list
    argfunc.clear = function () {
      list = [];
    };

    // Return argument list
    argfunc.get = function () {
      return list;
    };

    // Find argument 'arg' in list, and if found, return an array of the 'count' items that follow it
    argfunc.find = function (arg, count) {
      var index = list.indexOf(arg);
      if (index !== -1) {
        return list.slice(index + 1, index + 1 + (count || 0));
      }
    };

    // Find argument 'arg' in list, and if found, remove it as well as the 'count' items that follow it
    argfunc.remove = function (arg, count) {
      var index = list.indexOf(arg);
      if (index !== -1) {
        list.splice(index, (count || 0) + 1);
      }
    };

    // Clone argument list
    argfunc.clone = function () {
      var cloned = utils.args();
      cloned(list);
      return cloned;
    };

    return argfunc;
  },

  /**
   * Generate filter strings
   *
   * @param {String[]|Object[]} filters filter specifications. When using objects,
   *   each must have the following properties:
   * @param {String} filters.filter filter name
   * @param {String|Array} [filters.inputs] (array of) input stream specifier(s) for the filter,
   *   defaults to ffmpeg automatically choosing the first unused matching streams
   * @param {String|Array} [filters.outputs] (array of) output stream specifier(s) for the filter,
   *   defaults to ffmpeg automatically assigning the output to the output file
   * @param {Object|String|Array} [filters.options] filter options, can be omitted to not set any options
   * @return String[]
   * @private
   */
  makeFilterStrings: function makeFilterStrings(filters) {
    return filters.map(function (filterSpec) {
      if (typeof filterSpec === 'string') {
        return filterSpec;
      }

      var filterString = '';

      // Filter string format is:
      // [input1][input2]...filter[output1][output2]...
      // The 'filter' part can optionaly have arguments:
      //   filter=arg1:arg2:arg3
      //   filter=arg1=v1:arg2=v2:arg3=v3

      // Add inputs
      if (Array.isArray(filterSpec.inputs)) {
        filterString += filterSpec.inputs.map(function (streamSpec) {
          return streamSpec.replace(streamRegexp, '[$1]');
        }).join('');
      } else if (typeof filterSpec.inputs === 'string') {
        filterString += filterSpec.inputs.replace(streamRegexp, '[$1]');
      }

      // Add filter
      filterString += filterSpec.filter;

      // Add options
      if (filterSpec.options) {
        if (typeof filterSpec.options === 'string' || typeof filterSpec.options === 'number') {
          // Option string
          filterString += '=' + filterSpec.options;
        } else if (Array.isArray(filterSpec.options)) {
          // Option array (unnamed options)
          filterString += '=' + filterSpec.options.map(function (option) {
            if (typeof option === 'string' && option.match(filterEscapeRegexp)) {
              return '\'' + option + '\'';
            } else {
              return option;
            }
          }).join(':');
        } else if (Object.keys(filterSpec.options).length) {
          // Option object (named options)
          filterString += '=' + Object.keys(filterSpec.options).map(function (option) {
            var value = filterSpec.options[option];

            if (typeof value === 'string' && value.match(filterEscapeRegexp)) {
              value = '\'' + value + '\'';
            }

            return option + '=' + value;
          }).join(':');
        }
      }

      // Add outputs
      if (Array.isArray(filterSpec.outputs)) {
        filterString += filterSpec.outputs.map(function (streamSpec) {
          return streamSpec.replace(streamRegexp, '[$1]');
        }).join('');
      } else if (typeof filterSpec.outputs === 'string') {
        filterString += filterSpec.outputs.replace(streamRegexp, '[$1]');
      }

      return filterString;
    });
  },

  /**
   * Search for an executable
   *
   * Uses 'which' or 'where' depending on platform
   *
   * @param {String} name executable name
   * @param {Function} callback callback with signature (err, path)
   * @private
   */
  which: function which(name, callback) {
    if (name in whichCache) {
      return callback(null, whichCache[name]);
    }

    _which(name, function (err, result) {
      if (err) {
        // Treat errors as not found
        return callback(null, whichCache[name] = '');
      }
      callback(null, whichCache[name] = result);
    });
  },

  /**
   * Convert a [[hh:]mm:]ss[.xxx] timemark into seconds
   *
   * @param {String} timemark timemark string
   * @return Number
   * @private
   */
  timemarkToSeconds: function timemarkToSeconds(timemark) {
    if (typeof timemark === 'number') {
      return timemark;
    }

    if (timemark.indexOf(':') === -1 && timemark.indexOf('.') >= 0) {
      return Number(timemark);
    }

    var parts = timemark.split(':');

    // add seconds
    var secs = Number(parts.pop());

    if (parts.length) {
      // add minutes
      secs += Number(parts.pop()) * 60;
    }

    if (parts.length) {
      // add hours
      secs += Number(parts.pop()) * 3600;
    }

    return secs;
  },

  /**
   * Extract codec data from ffmpeg stderr and emit 'codecData' event if appropriate
   * Call it with an initially empty codec object once with each line of stderr output until it returns true
   *
   * @param {FfmpegCommand} command event emitter
   * @param {String} stderrLine ffmpeg stderr output line
   * @param {Object} codecObject object used to accumulate codec data between calls
   * @return {Boolean} true if codec data is complete (and event was emitted), false otherwise
   * @private
   */
  extractCodecData: function extractCodecData(command, stderrLine, codecsObject) {
    var inputPattern = /Input #[0-9]+, ([^ ]+),/;
    var durPattern = /Duration\: ([^,]+)/;
    var audioPattern = /Audio\: (.*)/;
    var videoPattern = /Video\: (.*)/;

    if (!('inputStack' in codecsObject)) {
      codecsObject.inputStack = [];
      codecsObject.inputIndex = -1;
      codecsObject.inInput = false;
    }

    var inputStack = codecsObject.inputStack;
    var inputIndex = codecsObject.inputIndex;
    var inInput = codecsObject.inInput;

    var format, dur, audio, video;

    if (format = stderrLine.match(inputPattern)) {
      inInput = codecsObject.inInput = true;
      inputIndex = codecsObject.inputIndex = codecsObject.inputIndex + 1;

      inputStack[inputIndex] = { format: format[1], audio: '', video: '', duration: '' };
    } else if (inInput && (dur = stderrLine.match(durPattern))) {
      inputStack[inputIndex].duration = dur[1];
    } else if (inInput && (audio = stderrLine.match(audioPattern))) {
      audio = audio[1].split(', ');
      inputStack[inputIndex].audio = audio[0];
      inputStack[inputIndex].audio_details = audio;
    } else if (inInput && (video = stderrLine.match(videoPattern))) {
      video = video[1].split(', ');
      inputStack[inputIndex].video = video[0];
      inputStack[inputIndex].video_details = video;
    } else if (/Output #\d+/.test(stderrLine)) {
      inInput = codecsObject.inInput = false;
    } else if (/Stream mapping:|Press (\[q\]|ctrl-c) to stop/.test(stderrLine)) {
      command.emit.apply(command, ['codecData'].concat(inputStack));
      return true;
    }

    return false;
  },

  /**
   * Extract progress data from ffmpeg stderr and emit 'progress' event if appropriate
   *
   * @param {FfmpegCommand} command event emitter
   * @param {String} stderrLine ffmpeg stderr data
   * @param {Number} [duration=0] expected output duration in seconds
   * @private
   */
  extractProgress: function extractProgress(command, stderrLine, duration) {
    var progress = parseProgressLine(stderrLine);

    if (progress) {
      // build progress report object
      var ret = {
        frames: parseInt(progress.frame, 10),
        currentFps: parseInt(progress.fps, 10),
        currentKbps: progress.bitrate ? parseFloat(progress.bitrate.replace('kbits/s', '')) : 0,
        targetSize: parseInt(progress.size, 10),
        timemark: progress.time
      };

      // calculate percent progress using duration
      if (duration && duration > 0) {
        ret.percent = utils.timemarkToSeconds(ret.timemark) / duration * 100;
      }

      command.emit('progress', ret);
    }
  },

  /**
   * Extract error message(s) from ffmpeg stderr
   *
   * @param {String} stderr ffmpeg stderr data
   * @return {String}
   * @private
   */
  extractError: function extractError(stderr) {
    // Only return the last stderr lines that don't start with a space or a square bracket
    return stderr.split(nlRegexp).reduce(function (messages, message) {
      if (message.charAt(0) === ' ' || message.charAt(0) === '[') {
        return [];
      } else {
        messages.push(message);
        return messages;
      }
    }, []).join('\n');
  },

  /**
   * Creates a line ring buffer object with the following methods:
   * - append(str) : appends a string or buffer
   * - get() : returns the whole string
   * - close() : prevents further append() calls and does a last call to callbacks
   * - callback(cb) : calls cb for each line (incl. those already in the ring)
   *
   * @param {Numebr} maxLines maximum number of lines to store (<= 0 for unlimited)
   */
  linesRing: function linesRing(maxLines) {
    var cbs = [];
    var lines = [];
    var current = null;
    var closed = false;
    var max = maxLines - 1;

    function emit(line) {
      cbs.forEach(function (cb) {
        cb(line);
      });
    }

    return {
      callback: function callback(cb) {
        lines.forEach(function (l) {
          cb(l);
        });
        cbs.push(cb);
      },

      append: function append(str) {
        if (closed) return;
        if (str instanceof Buffer) str = '' + str;
        if (!str || str.length === 0) return;

        var newLines = str.split(nlRegexp);

        if (newLines.length === 1) {
          if (current !== null) {
            current = current + newLines.shift();
          } else {
            current = newLines.shift();
          }
        } else {
          if (current !== null) {
            current = current + newLines.shift();
            emit(current);
            lines.push(current);
          }

          current = newLines.pop();

          newLines.forEach(function (l) {
            emit(l);
            lines.push(l);
          });

          if (max > -1 && lines.length > max) {
            lines.splice(0, lines.length - max);
          }
        }
      },

      get: function get() {
        if (current !== null) {
          return lines.concat([current]).join('\n');
        } else {
          return lines.join('\n');
        }
      },

      close: function close() {
        if (closed) return;

        if (current !== null) {
          emit(current);
          lines.push(current);

          if (max > -1 && lines.length > max) {
            lines.shift();
          }

          current = null;
        }

        closed = true;
      }
    };
  }
};

/***/ }),
/* 1 */
/***/ (function(module, exports) {

module.exports = require("fs");

/***/ }),
/* 2 */
/***/ (function(module, exports) {

module.exports = require("path");

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(module) {var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

(function (global, factory) {
    ( false ? 'undefined' : _typeof(exports)) === 'object' && typeof module !== 'undefined' ? factory(exports) :  true ? !(__WEBPACK_AMD_DEFINE_ARRAY__ = [exports], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory),
				__WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ?
				(__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__),
				__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__)) : factory(global.async = global.async || {});
})(undefined, function (exports) {
    'use strict';

    /**
     * A faster alternative to `Function#apply`, this function invokes `func`
     * with the `this` binding of `thisArg` and the arguments of `args`.
     *
     * @private
     * @param {Function} func The function to invoke.
     * @param {*} thisArg The `this` binding of `func`.
     * @param {Array} args The arguments to invoke `func` with.
     * @returns {*} Returns the result of `func`.
     */

    function apply(func, thisArg, args) {
        switch (args.length) {
            case 0:
                return func.call(thisArg);
            case 1:
                return func.call(thisArg, args[0]);
            case 2:
                return func.call(thisArg, args[0], args[1]);
            case 3:
                return func.call(thisArg, args[0], args[1], args[2]);
        }
        return func.apply(thisArg, args);
    }

    /* Built-in method references for those with the same name as other `lodash` methods. */
    var nativeMax = Math.max;

    /**
     * A specialized version of `baseRest` which transforms the rest array.
     *
     * @private
     * @param {Function} func The function to apply a rest parameter to.
     * @param {number} [start=func.length-1] The start position of the rest parameter.
     * @param {Function} transform The rest array transform.
     * @returns {Function} Returns the new function.
     */
    function overRest$1(func, start, transform) {
        start = nativeMax(start === undefined ? func.length - 1 : start, 0);
        return function () {
            var args = arguments,
                index = -1,
                length = nativeMax(args.length - start, 0),
                array = Array(length);

            while (++index < length) {
                array[index] = args[start + index];
            }
            index = -1;
            var otherArgs = Array(start + 1);
            while (++index < start) {
                otherArgs[index] = args[index];
            }
            otherArgs[start] = transform(array);
            return apply(func, this, otherArgs);
        };
    }

    /**
     * This method returns the first argument it receives.
     *
     * @static
     * @since 0.1.0
     * @memberOf _
     * @category Util
     * @param {*} value Any value.
     * @returns {*} Returns `value`.
     * @example
     *
     * var object = { 'a': 1 };
     *
     * console.log(_.identity(object) === object);
     * // => true
     */
    function identity(value) {
        return value;
    }

    // Lodash rest function without function.toString()
    // remappings
    function rest(func, start) {
        return overRest$1(func, start, identity);
    }

    var initialParams = function initialParams(fn) {
        return rest(function (args /*..., callback*/) {
            var callback = args.pop();
            fn.call(this, args, callback);
        });
    };

    function applyEach$1(eachfn) {
        return rest(function (fns, args) {
            var go = initialParams(function (args, callback) {
                var that = this;
                return eachfn(fns, function (fn, cb) {
                    fn.apply(that, args.concat([cb]));
                }, callback);
            });
            if (args.length) {
                return go.apply(this, args);
            } else {
                return go;
            }
        });
    }

    /** Detect free variable `global` from Node.js. */
    var freeGlobal = (typeof global === 'undefined' ? 'undefined' : _typeof(global)) == 'object' && global && global.Object === Object && global;

    /** Detect free variable `self`. */
    var freeSelf = (typeof self === 'undefined' ? 'undefined' : _typeof(self)) == 'object' && self && self.Object === Object && self;

    /** Used as a reference to the global object. */
    var root = freeGlobal || freeSelf || Function('return this')();

    /** Built-in value references. */
    var Symbol$1 = root.Symbol;

    /** Used for built-in method references. */
    var objectProto = Object.prototype;

    /** Used to check objects for own properties. */
    var hasOwnProperty = objectProto.hasOwnProperty;

    /**
     * Used to resolve the
     * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
     * of values.
     */
    var nativeObjectToString = objectProto.toString;

    /** Built-in value references. */
    var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : undefined;

    /**
     * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
     *
     * @private
     * @param {*} value The value to query.
     * @returns {string} Returns the raw `toStringTag`.
     */
    function getRawTag(value) {
        var isOwn = hasOwnProperty.call(value, symToStringTag$1),
            tag = value[symToStringTag$1];

        try {
            value[symToStringTag$1] = undefined;
            var unmasked = true;
        } catch (e) {}

        var result = nativeObjectToString.call(value);
        if (unmasked) {
            if (isOwn) {
                value[symToStringTag$1] = tag;
            } else {
                delete value[symToStringTag$1];
            }
        }
        return result;
    }

    /** Used for built-in method references. */
    var objectProto$1 = Object.prototype;

    /**
     * Used to resolve the
     * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
     * of values.
     */
    var nativeObjectToString$1 = objectProto$1.toString;

    /**
     * Converts `value` to a string using `Object.prototype.toString`.
     *
     * @private
     * @param {*} value The value to convert.
     * @returns {string} Returns the converted string.
     */
    function objectToString(value) {
        return nativeObjectToString$1.call(value);
    }

    /** `Object#toString` result references. */
    var nullTag = '[object Null]';
    var undefinedTag = '[object Undefined]';

    /** Built-in value references. */
    var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : undefined;

    /**
     * The base implementation of `getTag` without fallbacks for buggy environments.
     *
     * @private
     * @param {*} value The value to query.
     * @returns {string} Returns the `toStringTag`.
     */
    function baseGetTag(value) {
        if (value == null) {
            return value === undefined ? undefinedTag : nullTag;
        }
        value = Object(value);
        return symToStringTag && symToStringTag in value ? getRawTag(value) : objectToString(value);
    }

    /**
     * Checks if `value` is the
     * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
     * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
     *
     * @static
     * @memberOf _
     * @since 0.1.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is an object, else `false`.
     * @example
     *
     * _.isObject({});
     * // => true
     *
     * _.isObject([1, 2, 3]);
     * // => true
     *
     * _.isObject(_.noop);
     * // => true
     *
     * _.isObject(null);
     * // => false
     */
    function isObject(value) {
        var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);
        return value != null && (type == 'object' || type == 'function');
    }

    /** `Object#toString` result references. */
    var asyncTag = '[object AsyncFunction]';
    var funcTag = '[object Function]';
    var genTag = '[object GeneratorFunction]';
    var proxyTag = '[object Proxy]';

    /**
     * Checks if `value` is classified as a `Function` object.
     *
     * @static
     * @memberOf _
     * @since 0.1.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a function, else `false`.
     * @example
     *
     * _.isFunction(_);
     * // => true
     *
     * _.isFunction(/abc/);
     * // => false
     */
    function isFunction(value) {
        if (!isObject(value)) {
            return false;
        }
        // The use of `Object#toString` avoids issues with the `typeof` operator
        // in Safari 9 which returns 'object' for typed arrays and other constructors.
        var tag = baseGetTag(value);
        return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }

    /** Used as references for various `Number` constants. */
    var MAX_SAFE_INTEGER = 9007199254740991;

    /**
     * Checks if `value` is a valid array-like length.
     *
     * **Note:** This method is loosely based on
     * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
     *
     * @static
     * @memberOf _
     * @since 4.0.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
     * @example
     *
     * _.isLength(3);
     * // => true
     *
     * _.isLength(Number.MIN_VALUE);
     * // => false
     *
     * _.isLength(Infinity);
     * // => false
     *
     * _.isLength('3');
     * // => false
     */
    function isLength(value) {
        return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }

    /**
     * Checks if `value` is array-like. A value is considered array-like if it's
     * not a function and has a `value.length` that's an integer greater than or
     * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
     *
     * @static
     * @memberOf _
     * @since 4.0.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
     * @example
     *
     * _.isArrayLike([1, 2, 3]);
     * // => true
     *
     * _.isArrayLike(document.body.children);
     * // => true
     *
     * _.isArrayLike('abc');
     * // => true
     *
     * _.isArrayLike(_.noop);
     * // => false
     */
    function isArrayLike(value) {
        return value != null && isLength(value.length) && !isFunction(value);
    }

    /**
     * This method returns `undefined`.
     *
     * @static
     * @memberOf _
     * @since 2.3.0
     * @category Util
     * @example
     *
     * _.times(2, _.noop);
     * // => [undefined, undefined]
     */
    function noop() {
        // No operation performed.
    }

    function once(fn) {
        return function () {
            if (fn === null) return;
            var callFn = fn;
            fn = null;
            callFn.apply(this, arguments);
        };
    }

    var iteratorSymbol = typeof Symbol === 'function' && Symbol.iterator;

    var getIterator = function getIterator(coll) {
        return iteratorSymbol && coll[iteratorSymbol] && coll[iteratorSymbol]();
    };

    /**
     * The base implementation of `_.times` without support for iteratee shorthands
     * or max array length checks.
     *
     * @private
     * @param {number} n The number of times to invoke `iteratee`.
     * @param {Function} iteratee The function invoked per iteration.
     * @returns {Array} Returns the array of results.
     */
    function baseTimes(n, iteratee) {
        var index = -1,
            result = Array(n);

        while (++index < n) {
            result[index] = iteratee(index);
        }
        return result;
    }

    /**
     * Checks if `value` is object-like. A value is object-like if it's not `null`
     * and has a `typeof` result of "object".
     *
     * @static
     * @memberOf _
     * @since 4.0.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
     * @example
     *
     * _.isObjectLike({});
     * // => true
     *
     * _.isObjectLike([1, 2, 3]);
     * // => true
     *
     * _.isObjectLike(_.noop);
     * // => false
     *
     * _.isObjectLike(null);
     * // => false
     */
    function isObjectLike(value) {
        return value != null && (typeof value === 'undefined' ? 'undefined' : _typeof(value)) == 'object';
    }

    /** `Object#toString` result references. */
    var argsTag = '[object Arguments]';

    /**
     * The base implementation of `_.isArguments`.
     *
     * @private
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is an `arguments` object,
     */
    function baseIsArguments(value) {
        return isObjectLike(value) && baseGetTag(value) == argsTag;
    }

    /** Used for built-in method references. */
    var objectProto$3 = Object.prototype;

    /** Used to check objects for own properties. */
    var hasOwnProperty$2 = objectProto$3.hasOwnProperty;

    /** Built-in value references. */
    var propertyIsEnumerable = objectProto$3.propertyIsEnumerable;

    /**
     * Checks if `value` is likely an `arguments` object.
     *
     * @static
     * @memberOf _
     * @since 0.1.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is an `arguments` object,
     *  else `false`.
     * @example
     *
     * _.isArguments(function() { return arguments; }());
     * // => true
     *
     * _.isArguments([1, 2, 3]);
     * // => false
     */
    var isArguments = baseIsArguments(function () {
        return arguments;
    }()) ? baseIsArguments : function (value) {
        return isObjectLike(value) && hasOwnProperty$2.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
    };

    /**
     * Checks if `value` is classified as an `Array` object.
     *
     * @static
     * @memberOf _
     * @since 0.1.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is an array, else `false`.
     * @example
     *
     * _.isArray([1, 2, 3]);
     * // => true
     *
     * _.isArray(document.body.children);
     * // => false
     *
     * _.isArray('abc');
     * // => false
     *
     * _.isArray(_.noop);
     * // => false
     */
    var isArray = Array.isArray;

    /**
     * This method returns `false`.
     *
     * @static
     * @memberOf _
     * @since 4.13.0
     * @category Util
     * @returns {boolean} Returns `false`.
     * @example
     *
     * _.times(2, _.stubFalse);
     * // => [false, false]
     */
    function stubFalse() {
        return false;
    }

    /** Detect free variable `exports`. */
    var freeExports = (typeof exports === 'undefined' ? 'undefined' : _typeof(exports)) == 'object' && exports && !exports.nodeType && exports;

    /** Detect free variable `module`. */
    var freeModule = freeExports && ( false ? 'undefined' : _typeof(module)) == 'object' && module && !module.nodeType && module;

    /** Detect the popular CommonJS extension `module.exports`. */
    var moduleExports = freeModule && freeModule.exports === freeExports;

    /** Built-in value references. */
    var Buffer = moduleExports ? root.Buffer : undefined;

    /* Built-in method references for those with the same name as other `lodash` methods. */
    var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

    /**
     * Checks if `value` is a buffer.
     *
     * @static
     * @memberOf _
     * @since 4.3.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
     * @example
     *
     * _.isBuffer(new Buffer(2));
     * // => true
     *
     * _.isBuffer(new Uint8Array(2));
     * // => false
     */
    var isBuffer = nativeIsBuffer || stubFalse;

    /** Used as references for various `Number` constants. */
    var MAX_SAFE_INTEGER$1 = 9007199254740991;

    /** Used to detect unsigned integer values. */
    var reIsUint = /^(?:0|[1-9]\d*)$/;

    /**
     * Checks if `value` is a valid array-like index.
     *
     * @private
     * @param {*} value The value to check.
     * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
     * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
     */
    function isIndex(value, length) {
        length = length == null ? MAX_SAFE_INTEGER$1 : length;
        return !!length && (typeof value == 'number' || reIsUint.test(value)) && value > -1 && value % 1 == 0 && value < length;
    }

    /** `Object#toString` result references. */
    var argsTag$1 = '[object Arguments]';
    var arrayTag = '[object Array]';
    var boolTag = '[object Boolean]';
    var dateTag = '[object Date]';
    var errorTag = '[object Error]';
    var funcTag$1 = '[object Function]';
    var mapTag = '[object Map]';
    var numberTag = '[object Number]';
    var objectTag = '[object Object]';
    var regexpTag = '[object RegExp]';
    var setTag = '[object Set]';
    var stringTag = '[object String]';
    var weakMapTag = '[object WeakMap]';

    var arrayBufferTag = '[object ArrayBuffer]';
    var dataViewTag = '[object DataView]';
    var float32Tag = '[object Float32Array]';
    var float64Tag = '[object Float64Array]';
    var int8Tag = '[object Int8Array]';
    var int16Tag = '[object Int16Array]';
    var int32Tag = '[object Int32Array]';
    var uint8Tag = '[object Uint8Array]';
    var uint8ClampedTag = '[object Uint8ClampedArray]';
    var uint16Tag = '[object Uint16Array]';
    var uint32Tag = '[object Uint32Array]';

    /** Used to identify `toStringTag` values of typed arrays. */
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag$1] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag$1] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;

    /**
     * The base implementation of `_.isTypedArray` without Node.js optimizations.
     *
     * @private
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
     */
    function baseIsTypedArray(value) {
        return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }

    /**
     * The base implementation of `_.unary` without support for storing metadata.
     *
     * @private
     * @param {Function} func The function to cap arguments for.
     * @returns {Function} Returns the new capped function.
     */
    function baseUnary(func) {
        return function (value) {
            return func(value);
        };
    }

    /** Detect free variable `exports`. */
    var freeExports$1 = (typeof exports === 'undefined' ? 'undefined' : _typeof(exports)) == 'object' && exports && !exports.nodeType && exports;

    /** Detect free variable `module`. */
    var freeModule$1 = freeExports$1 && ( false ? 'undefined' : _typeof(module)) == 'object' && module && !module.nodeType && module;

    /** Detect the popular CommonJS extension `module.exports`. */
    var moduleExports$1 = freeModule$1 && freeModule$1.exports === freeExports$1;

    /** Detect free variable `process` from Node.js. */
    var freeProcess = moduleExports$1 && freeGlobal.process;

    /** Used to access faster Node.js helpers. */
    var nodeUtil = function () {
        try {
            return freeProcess && freeProcess.binding('util');
        } catch (e) {}
    }();

    /* Node.js helper references. */
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

    /**
     * Checks if `value` is classified as a typed array.
     *
     * @static
     * @memberOf _
     * @since 3.0.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
     * @example
     *
     * _.isTypedArray(new Uint8Array);
     * // => true
     *
     * _.isTypedArray([]);
     * // => false
     */
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

    /** Used for built-in method references. */
    var objectProto$2 = Object.prototype;

    /** Used to check objects for own properties. */
    var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

    /**
     * Creates an array of the enumerable property names of the array-like `value`.
     *
     * @private
     * @param {*} value The value to query.
     * @param {boolean} inherited Specify returning inherited property names.
     * @returns {Array} Returns the array of property names.
     */
    function arrayLikeKeys(value, inherited) {
        var isArr = isArray(value),
            isArg = !isArr && isArguments(value),
            isBuff = !isArr && !isArg && isBuffer(value),
            isType = !isArr && !isArg && !isBuff && isTypedArray(value),
            skipIndexes = isArr || isArg || isBuff || isType,
            result = skipIndexes ? baseTimes(value.length, String) : [],
            length = result.length;

        for (var key in value) {
            if ((inherited || hasOwnProperty$1.call(value, key)) && !(skipIndexes && (
            // Safari 9 has enumerable `arguments.length` in strict mode.
            key == 'length' ||
            // Node.js 0.10 has enumerable non-index properties on buffers.
            isBuff && (key == 'offset' || key == 'parent') ||
            // PhantomJS 2 has enumerable non-index properties on typed arrays.
            isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset') ||
            // Skip index properties.
            isIndex(key, length)))) {
                result.push(key);
            }
        }
        return result;
    }

    /** Used for built-in method references. */
    var objectProto$5 = Object.prototype;

    /**
     * Checks if `value` is likely a prototype object.
     *
     * @private
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
     */
    function isPrototype(value) {
        var Ctor = value && value.constructor,
            proto = typeof Ctor == 'function' && Ctor.prototype || objectProto$5;

        return value === proto;
    }

    /**
     * Creates a unary function that invokes `func` with its argument transformed.
     *
     * @private
     * @param {Function} func The function to wrap.
     * @param {Function} transform The argument transform.
     * @returns {Function} Returns the new function.
     */
    function overArg(func, transform) {
        return function (arg) {
            return func(transform(arg));
        };
    }

    /* Built-in method references for those with the same name as other `lodash` methods. */
    var nativeKeys = overArg(Object.keys, Object);

    /** Used for built-in method references. */
    var objectProto$4 = Object.prototype;

    /** Used to check objects for own properties. */
    var hasOwnProperty$3 = objectProto$4.hasOwnProperty;

    /**
     * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
     *
     * @private
     * @param {Object} object The object to query.
     * @returns {Array} Returns the array of property names.
     */
    function baseKeys(object) {
        if (!isPrototype(object)) {
            return nativeKeys(object);
        }
        var result = [];
        for (var key in Object(object)) {
            if (hasOwnProperty$3.call(object, key) && key != 'constructor') {
                result.push(key);
            }
        }
        return result;
    }

    /**
     * Creates an array of the own enumerable property names of `object`.
     *
     * **Note:** Non-object values are coerced to objects. See the
     * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
     * for more details.
     *
     * @static
     * @since 0.1.0
     * @memberOf _
     * @category Object
     * @param {Object} object The object to query.
     * @returns {Array} Returns the array of property names.
     * @example
     *
     * function Foo() {
     *   this.a = 1;
     *   this.b = 2;
     * }
     *
     * Foo.prototype.c = 3;
     *
     * _.keys(new Foo);
     * // => ['a', 'b'] (iteration order is not guaranteed)
     *
     * _.keys('hi');
     * // => ['0', '1']
     */
    function keys(object) {
        return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }

    function createArrayIterator(coll) {
        var i = -1;
        var len = coll.length;
        return function next() {
            return ++i < len ? { value: coll[i], key: i } : null;
        };
    }

    function createES2015Iterator(iterator) {
        var i = -1;
        return function next() {
            var item = iterator.next();
            if (item.done) return null;
            i++;
            return { value: item.value, key: i };
        };
    }

    function createObjectIterator(obj) {
        var okeys = keys(obj);
        var i = -1;
        var len = okeys.length;
        return function next() {
            var key = okeys[++i];
            return i < len ? { value: obj[key], key: key } : null;
        };
    }

    function iterator(coll) {
        if (isArrayLike(coll)) {
            return createArrayIterator(coll);
        }

        var iterator = getIterator(coll);
        return iterator ? createES2015Iterator(iterator) : createObjectIterator(coll);
    }

    function onlyOnce(fn) {
        return function () {
            if (fn === null) throw new Error("Callback was already called.");
            var callFn = fn;
            fn = null;
            callFn.apply(this, arguments);
        };
    }

    // A temporary value used to identify if the loop should be broken.
    // See #1064, #1293
    var breakLoop = {};

    function _eachOfLimit(limit) {
        return function (obj, iteratee, callback) {
            callback = once(callback || noop);
            if (limit <= 0 || !obj) {
                return callback(null);
            }
            var nextElem = iterator(obj);
            var done = false;
            var running = 0;

            function iterateeCallback(err, value) {
                running -= 1;
                if (err) {
                    done = true;
                    callback(err);
                } else if (value === breakLoop || done && running <= 0) {
                    done = true;
                    return callback(null);
                } else {
                    replenish();
                }
            }

            function replenish() {
                while (running < limit && !done) {
                    var elem = nextElem();
                    if (elem === null) {
                        done = true;
                        if (running <= 0) {
                            callback(null);
                        }
                        return;
                    }
                    running += 1;
                    iteratee(elem.value, elem.key, onlyOnce(iterateeCallback));
                }
            }

            replenish();
        };
    }

    /**
     * The same as [`eachOf`]{@link module:Collections.eachOf} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name eachOfLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.eachOf]{@link module:Collections.eachOf}
     * @alias forEachOfLimit
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A function to apply to each
     * item in `coll`. The `key` is the item's key, or index in the case of an
     * array. The iteratee is passed a `callback(err)` which must be called once it
     * has completed. If no error has occurred, the callback should be run without
     * arguments or with an explicit `null` argument. Invoked with
     * (item, key, callback).
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     */
    function eachOfLimit(coll, limit, iteratee, callback) {
        _eachOfLimit(limit)(coll, iteratee, callback);
    }

    function doLimit(fn, limit) {
        return function (iterable, iteratee, callback) {
            return fn(iterable, limit, iteratee, callback);
        };
    }

    // eachOf implementation optimized for array-likes
    function eachOfArrayLike(coll, iteratee, callback) {
        callback = once(callback || noop);
        var index = 0,
            completed = 0,
            length = coll.length;
        if (length === 0) {
            callback(null);
        }

        function iteratorCallback(err) {
            if (err) {
                callback(err);
            } else if (++completed === length) {
                callback(null);
            }
        }

        for (; index < length; index++) {
            iteratee(coll[index], index, onlyOnce(iteratorCallback));
        }
    }

    // a generic version of eachOf which can handle array, object, and iterator cases.
    var eachOfGeneric = doLimit(eachOfLimit, Infinity);

    /**
     * Like [`each`]{@link module:Collections.each}, except that it passes the key (or index) as the second argument
     * to the iteratee.
     *
     * @name eachOf
     * @static
     * @memberOf module:Collections
     * @method
     * @alias forEachOf
     * @category Collection
     * @see [async.each]{@link module:Collections.each}
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each
     * item in `coll`. The `key` is the item's key, or index in the case of an
     * array. The iteratee is passed a `callback(err)` which must be called once it
     * has completed. If no error has occurred, the callback should be run without
     * arguments or with an explicit `null` argument. Invoked with
     * (item, key, callback).
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @example
     *
     * var obj = {dev: "/dev.json", test: "/test.json", prod: "/prod.json"};
     * var configs = {};
     *
     * async.forEachOf(obj, function (value, key, callback) {
     *     fs.readFile(__dirname + value, "utf8", function (err, data) {
     *         if (err) return callback(err);
     *         try {
     *             configs[key] = JSON.parse(data);
     *         } catch (e) {
     *             return callback(e);
     *         }
     *         callback();
     *     });
     * }, function (err) {
     *     if (err) console.error(err.message);
     *     // configs is now a map of JSON data
     *     doSomethingWith(configs);
     * });
     */
    var eachOf = function eachOf(coll, iteratee, callback) {
        var eachOfImplementation = isArrayLike(coll) ? eachOfArrayLike : eachOfGeneric;
        eachOfImplementation(coll, iteratee, callback);
    };

    function doParallel(fn) {
        return function (obj, iteratee, callback) {
            return fn(eachOf, obj, iteratee, callback);
        };
    }

    function _asyncMap(eachfn, arr, iteratee, callback) {
        callback = callback || noop;
        arr = arr || [];
        var results = [];
        var counter = 0;

        eachfn(arr, function (value, _, callback) {
            var index = counter++;
            iteratee(value, function (err, v) {
                results[index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    }

    /**
     * Produces a new collection of values by mapping each value in `coll` through
     * the `iteratee` function. The `iteratee` is called with an item from `coll`
     * and a callback for when it has finished processing. Each of these callback
     * takes 2 arguments: an `error`, and the transformed item from `coll`. If
     * `iteratee` passes an error to its callback, the main `callback` (for the
     * `map` function) is immediately called with the error.
     *
     * Note, that since this function applies the `iteratee` to each item in
     * parallel, there is no guarantee that the `iteratee` functions will complete
     * in order. However, the results array will be in the same order as the
     * original `coll`.
     *
     * If `map` is passed an Object, the results will be an Array.  The results
     * will roughly be in the order of the original Objects' keys (but this can
     * vary across JavaScript engines)
     *
     * @name map
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, transformed)` which must be called
     * once it has completed with an error (which can be `null`) and a
     * transformed item. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Results is an Array of the
     * transformed items from the `coll`. Invoked with (err, results).
     * @example
     *
     * async.map(['file1','file2','file3'], fs.stat, function(err, results) {
     *     // results is now an array of stats for each file
     * });
     */
    var map = doParallel(_asyncMap);

    /**
     * Applies the provided arguments to each function in the array, calling
     * `callback` after all functions have completed. If you only provide the first
     * argument, `fns`, then it will return a function which lets you pass in the
     * arguments as if it were a single function call. If more arguments are
     * provided, `callback` is required while `args` is still optional.
     *
     * @name applyEach
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|Object} fns - A collection of asynchronous functions
     * to all call with the same arguments
     * @param {...*} [args] - any number of separate arguments to pass to the
     * function.
     * @param {Function} [callback] - the final argument should be the callback,
     * called when all functions have completed processing.
     * @returns {Function} - If only the first argument, `fns`, is provided, it will
     * return a function which lets you pass in the arguments as if it were a single
     * function call. The signature is `(..args, callback)`. If invoked with any
     * arguments, `callback` is required.
     * @example
     *
     * async.applyEach([enableSearch, updateSchema], 'bucket', callback);
     *
     * // partial application example:
     * async.each(
     *     buckets,
     *     async.applyEach([enableSearch, updateSchema]),
     *     callback
     * );
     */
    var applyEach = applyEach$1(map);

    function doParallelLimit(fn) {
        return function (obj, limit, iteratee, callback) {
            return fn(_eachOfLimit(limit), obj, iteratee, callback);
        };
    }

    /**
     * The same as [`map`]{@link module:Collections.map} but runs a maximum of `limit` async operations at a time.
     *
     * @name mapLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.map]{@link module:Collections.map}
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A function to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, transformed)` which must be called
     * once it has completed with an error (which can be `null`) and a transformed
     * item. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Results is an array of the
     * transformed items from the `coll`. Invoked with (err, results).
     */
    var mapLimit = doParallelLimit(_asyncMap);

    /**
     * The same as [`map`]{@link module:Collections.map} but runs only a single async operation at a time.
     *
     * @name mapSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.map]{@link module:Collections.map}
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, transformed)` which must be called
     * once it has completed with an error (which can be `null`) and a
     * transformed item. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Results is an array of the
     * transformed items from the `coll`. Invoked with (err, results).
     */
    var mapSeries = doLimit(mapLimit, 1);

    /**
     * The same as [`applyEach`]{@link module:ControlFlow.applyEach} but runs only a single async operation at a time.
     *
     * @name applyEachSeries
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.applyEach]{@link module:ControlFlow.applyEach}
     * @category Control Flow
     * @param {Array|Iterable|Object} fns - A collection of asynchronous functions to all
     * call with the same arguments
     * @param {...*} [args] - any number of separate arguments to pass to the
     * function.
     * @param {Function} [callback] - the final argument should be the callback,
     * called when all functions have completed processing.
     * @returns {Function} - If only the first argument is provided, it will return
     * a function which lets you pass in the arguments as if it were a single
     * function call.
     */
    var applyEachSeries = applyEach$1(mapSeries);

    /**
     * Creates a continuation function with some arguments already applied.
     *
     * Useful as a shorthand when combined with other control flow functions. Any
     * arguments passed to the returned function are added to the arguments
     * originally passed to apply.
     *
     * @name apply
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} function - The function you want to eventually apply all
     * arguments to. Invokes with (arguments...).
     * @param {...*} arguments... - Any number of arguments to automatically apply
     * when the continuation is called.
     * @example
     *
     * // using apply
     * async.parallel([
     *     async.apply(fs.writeFile, 'testfile1', 'test1'),
     *     async.apply(fs.writeFile, 'testfile2', 'test2')
     * ]);
     *
     *
     * // the same process without using apply
     * async.parallel([
     *     function(callback) {
     *         fs.writeFile('testfile1', 'test1', callback);
     *     },
     *     function(callback) {
     *         fs.writeFile('testfile2', 'test2', callback);
     *     }
     * ]);
     *
     * // It's possible to pass any number of additional arguments when calling the
     * // continuation:
     *
     * node> var fn = async.apply(sys.puts, 'one');
     * node> fn('two', 'three');
     * one
     * two
     * three
     */
    var apply$2 = rest(function (fn, args) {
        return rest(function (callArgs) {
            return fn.apply(null, args.concat(callArgs));
        });
    });

    /**
     * Take a sync function and make it async, passing its return value to a
     * callback. This is useful for plugging sync functions into a waterfall,
     * series, or other async functions. Any arguments passed to the generated
     * function will be passed to the wrapped function (except for the final
     * callback argument). Errors thrown will be passed to the callback.
     *
     * If the function passed to `asyncify` returns a Promise, that promises's
     * resolved/rejected state will be used to call the callback, rather than simply
     * the synchronous return value.
     *
     * This also means you can asyncify ES2016 `async` functions.
     *
     * @name asyncify
     * @static
     * @memberOf module:Utils
     * @method
     * @alias wrapSync
     * @category Util
     * @param {Function} func - The synchronous function to convert to an
     * asynchronous function.
     * @returns {Function} An asynchronous wrapper of the `func`. To be invoked with
     * (callback).
     * @example
     *
     * // passing a regular synchronous function
     * async.waterfall([
     *     async.apply(fs.readFile, filename, "utf8"),
     *     async.asyncify(JSON.parse),
     *     function (data, next) {
     *         // data is the result of parsing the text.
     *         // If there was a parsing error, it would have been caught.
     *     }
     * ], callback);
     *
     * // passing a function returning a promise
     * async.waterfall([
     *     async.apply(fs.readFile, filename, "utf8"),
     *     async.asyncify(function (contents) {
     *         return db.model.create(contents);
     *     }),
     *     function (model, next) {
     *         // `model` is the instantiated model object.
     *         // If there was an error, this function would be skipped.
     *     }
     * ], callback);
     *
     * // es6 example
     * var q = async.queue(async.asyncify(async function(file) {
     *     var intermediateStep = await processFile(file);
     *     return await somePromise(intermediateStep)
     * }));
     *
     * q.push(files);
     */
    function asyncify(func) {
        return initialParams(function (args, callback) {
            var result;
            try {
                result = func.apply(this, args);
            } catch (e) {
                return callback(e);
            }
            // if result is Promise object
            if (isObject(result) && typeof result.then === 'function') {
                result.then(function (value) {
                    callback(null, value);
                }, function (err) {
                    callback(err.message ? err : new Error(err));
                });
            } else {
                callback(null, result);
            }
        });
    }

    /**
     * A specialized version of `_.forEach` for arrays without support for
     * iteratee shorthands.
     *
     * @private
     * @param {Array} [array] The array to iterate over.
     * @param {Function} iteratee The function invoked per iteration.
     * @returns {Array} Returns `array`.
     */
    function arrayEach(array, iteratee) {
        var index = -1,
            length = array == null ? 0 : array.length;

        while (++index < length) {
            if (iteratee(array[index], index, array) === false) {
                break;
            }
        }
        return array;
    }

    /**
     * Creates a base function for methods like `_.forIn` and `_.forOwn`.
     *
     * @private
     * @param {boolean} [fromRight] Specify iterating from right to left.
     * @returns {Function} Returns the new base function.
     */
    function createBaseFor(fromRight) {
        return function (object, iteratee, keysFunc) {
            var index = -1,
                iterable = Object(object),
                props = keysFunc(object),
                length = props.length;

            while (length--) {
                var key = props[fromRight ? length : ++index];
                if (iteratee(iterable[key], key, iterable) === false) {
                    break;
                }
            }
            return object;
        };
    }

    /**
     * The base implementation of `baseForOwn` which iterates over `object`
     * properties returned by `keysFunc` and invokes `iteratee` for each property.
     * Iteratee functions may exit iteration early by explicitly returning `false`.
     *
     * @private
     * @param {Object} object The object to iterate over.
     * @param {Function} iteratee The function invoked per iteration.
     * @param {Function} keysFunc The function to get the keys of `object`.
     * @returns {Object} Returns `object`.
     */
    var baseFor = createBaseFor();

    /**
     * The base implementation of `_.forOwn` without support for iteratee shorthands.
     *
     * @private
     * @param {Object} object The object to iterate over.
     * @param {Function} iteratee The function invoked per iteration.
     * @returns {Object} Returns `object`.
     */
    function baseForOwn(object, iteratee) {
        return object && baseFor(object, iteratee, keys);
    }

    /**
     * The base implementation of `_.findIndex` and `_.findLastIndex` without
     * support for iteratee shorthands.
     *
     * @private
     * @param {Array} array The array to inspect.
     * @param {Function} predicate The function invoked per iteration.
     * @param {number} fromIndex The index to search from.
     * @param {boolean} [fromRight] Specify iterating from right to left.
     * @returns {number} Returns the index of the matched value, else `-1`.
     */
    function baseFindIndex(array, predicate, fromIndex, fromRight) {
        var length = array.length,
            index = fromIndex + (fromRight ? 1 : -1);

        while (fromRight ? index-- : ++index < length) {
            if (predicate(array[index], index, array)) {
                return index;
            }
        }
        return -1;
    }

    /**
     * The base implementation of `_.isNaN` without support for number objects.
     *
     * @private
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
     */
    function baseIsNaN(value) {
        return value !== value;
    }

    /**
     * A specialized version of `_.indexOf` which performs strict equality
     * comparisons of values, i.e. `===`.
     *
     * @private
     * @param {Array} array The array to inspect.
     * @param {*} value The value to search for.
     * @param {number} fromIndex The index to search from.
     * @returns {number} Returns the index of the matched value, else `-1`.
     */
    function strictIndexOf(array, value, fromIndex) {
        var index = fromIndex - 1,
            length = array.length;

        while (++index < length) {
            if (array[index] === value) {
                return index;
            }
        }
        return -1;
    }

    /**
     * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
     *
     * @private
     * @param {Array} array The array to inspect.
     * @param {*} value The value to search for.
     * @param {number} fromIndex The index to search from.
     * @returns {number} Returns the index of the matched value, else `-1`.
     */
    function baseIndexOf(array, value, fromIndex) {
        return value === value ? strictIndexOf(array, value, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
    }

    /**
     * Determines the best order for running the functions in `tasks`, based on
     * their requirements. Each function can optionally depend on other functions
     * being completed first, and each function is run as soon as its requirements
     * are satisfied.
     *
     * If any of the functions pass an error to their callback, the `auto` sequence
     * will stop. Further tasks will not execute (so any other functions depending
     * on it will not run), and the main `callback` is immediately called with the
     * error.
     *
     * Functions also receive an object containing the results of functions which
     * have completed so far as the first argument, if they have dependencies. If a
     * task function has no dependencies, it will only be passed a callback.
     *
     * @name auto
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Object} tasks - An object. Each of its properties is either a
     * function or an array of requirements, with the function itself the last item
     * in the array. The object's key of a property serves as the name of the task
     * defined by that property, i.e. can be used when specifying requirements for
     * other tasks. The function receives one or two arguments:
     * * a `results` object, containing the results of the previously executed
     *   functions, only passed if the task has any dependencies,
     * * a `callback(err, result)` function, which must be called when finished,
     *   passing an `error` (which can be `null`) and the result of the function's
     *   execution.
     * @param {number} [concurrency=Infinity] - An optional `integer` for
     * determining the maximum number of tasks that can be run in parallel. By
     * default, as many as possible.
     * @param {Function} [callback] - An optional callback which is called when all
     * the tasks have been completed. It receives the `err` argument if any `tasks`
     * pass an error to their callback. Results are always returned; however, if an
     * error occurs, no further `tasks` will be performed, and the results object
     * will only contain partial results. Invoked with (err, results).
     * @returns undefined
     * @example
     *
     * async.auto({
     *     // this function will just be passed a callback
     *     readData: async.apply(fs.readFile, 'data.txt', 'utf-8'),
     *     showData: ['readData', function(results, cb) {
     *         // results.readData is the file's contents
     *         // ...
     *     }]
     * }, callback);
     *
     * async.auto({
     *     get_data: function(callback) {
     *         console.log('in get_data');
     *         // async code to get some data
     *         callback(null, 'data', 'converted to array');
     *     },
     *     make_folder: function(callback) {
     *         console.log('in make_folder');
     *         // async code to create a directory to store a file in
     *         // this is run at the same time as getting the data
     *         callback(null, 'folder');
     *     },
     *     write_file: ['get_data', 'make_folder', function(results, callback) {
     *         console.log('in write_file', JSON.stringify(results));
     *         // once there is some data and the directory exists,
     *         // write the data to a file in the directory
     *         callback(null, 'filename');
     *     }],
     *     email_link: ['write_file', function(results, callback) {
     *         console.log('in email_link', JSON.stringify(results));
     *         // once the file is written let's email a link to it...
     *         // results.write_file contains the filename returned by write_file.
     *         callback(null, {'file':results.write_file, 'email':'user@example.com'});
     *     }]
     * }, function(err, results) {
     *     console.log('err = ', err);
     *     console.log('results = ', results);
     * });
     */
    var auto = function auto(tasks, concurrency, callback) {
        if (typeof concurrency === 'function') {
            // concurrency is optional, shift the args.
            callback = concurrency;
            concurrency = null;
        }
        callback = once(callback || noop);
        var keys$$1 = keys(tasks);
        var numTasks = keys$$1.length;
        if (!numTasks) {
            return callback(null);
        }
        if (!concurrency) {
            concurrency = numTasks;
        }

        var results = {};
        var runningTasks = 0;
        var hasError = false;

        var listeners = {};

        var readyTasks = [];

        // for cycle detection:
        var readyToCheck = []; // tasks that have been identified as reachable
        // without the possibility of returning to an ancestor task
        var uncheckedDependencies = {};

        baseForOwn(tasks, function (task, key) {
            if (!isArray(task)) {
                // no dependencies
                enqueueTask(key, [task]);
                readyToCheck.push(key);
                return;
            }

            var dependencies = task.slice(0, task.length - 1);
            var remainingDependencies = dependencies.length;
            if (remainingDependencies === 0) {
                enqueueTask(key, task);
                readyToCheck.push(key);
                return;
            }
            uncheckedDependencies[key] = remainingDependencies;

            arrayEach(dependencies, function (dependencyName) {
                if (!tasks[dependencyName]) {
                    throw new Error('async.auto task `' + key + '` has a non-existent dependency in ' + dependencies.join(', '));
                }
                addListener(dependencyName, function () {
                    remainingDependencies--;
                    if (remainingDependencies === 0) {
                        enqueueTask(key, task);
                    }
                });
            });
        });

        checkForDeadlocks();
        processQueue();

        function enqueueTask(key, task) {
            readyTasks.push(function () {
                runTask(key, task);
            });
        }

        function processQueue() {
            if (readyTasks.length === 0 && runningTasks === 0) {
                return callback(null, results);
            }
            while (readyTasks.length && runningTasks < concurrency) {
                var run = readyTasks.shift();
                run();
            }
        }

        function addListener(taskName, fn) {
            var taskListeners = listeners[taskName];
            if (!taskListeners) {
                taskListeners = listeners[taskName] = [];
            }

            taskListeners.push(fn);
        }

        function taskComplete(taskName) {
            var taskListeners = listeners[taskName] || [];
            arrayEach(taskListeners, function (fn) {
                fn();
            });
            processQueue();
        }

        function runTask(key, task) {
            if (hasError) return;

            var taskCallback = onlyOnce(rest(function (err, args) {
                runningTasks--;
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    baseForOwn(results, function (val, rkey) {
                        safeResults[rkey] = val;
                    });
                    safeResults[key] = args;
                    hasError = true;
                    listeners = [];

                    callback(err, safeResults);
                } else {
                    results[key] = args;
                    taskComplete(key);
                }
            }));

            runningTasks++;
            var taskFn = task[task.length - 1];
            if (task.length > 1) {
                taskFn(results, taskCallback);
            } else {
                taskFn(taskCallback);
            }
        }

        function checkForDeadlocks() {
            // Kahn's algorithm
            // https://en.wikipedia.org/wiki/Topological_sorting#Kahn.27s_algorithm
            // http://connalle.blogspot.com/2013/10/topological-sortingkahn-algorithm.html
            var currentTask;
            var counter = 0;
            while (readyToCheck.length) {
                currentTask = readyToCheck.pop();
                counter++;
                arrayEach(getDependents(currentTask), function (dependent) {
                    if (--uncheckedDependencies[dependent] === 0) {
                        readyToCheck.push(dependent);
                    }
                });
            }

            if (counter !== numTasks) {
                throw new Error('async.auto cannot execute tasks due to a recursive dependency');
            }
        }

        function getDependents(taskName) {
            var result = [];
            baseForOwn(tasks, function (task, key) {
                if (isArray(task) && baseIndexOf(task, taskName, 0) >= 0) {
                    result.push(key);
                }
            });
            return result;
        }
    };

    /**
     * A specialized version of `_.map` for arrays without support for iteratee
     * shorthands.
     *
     * @private
     * @param {Array} [array] The array to iterate over.
     * @param {Function} iteratee The function invoked per iteration.
     * @returns {Array} Returns the new mapped array.
     */
    function arrayMap(array, iteratee) {
        var index = -1,
            length = array == null ? 0 : array.length,
            result = Array(length);

        while (++index < length) {
            result[index] = iteratee(array[index], index, array);
        }
        return result;
    }

    /** `Object#toString` result references. */
    var symbolTag = '[object Symbol]';

    /**
     * Checks if `value` is classified as a `Symbol` primitive or object.
     *
     * @static
     * @memberOf _
     * @since 4.0.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
     * @example
     *
     * _.isSymbol(Symbol.iterator);
     * // => true
     *
     * _.isSymbol('abc');
     * // => false
     */
    function isSymbol(value) {
        return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) == 'symbol' || isObjectLike(value) && baseGetTag(value) == symbolTag;
    }

    /** Used as references for various `Number` constants. */
    var INFINITY = 1 / 0;

    /** Used to convert symbols to primitives and strings. */
    var symbolProto = Symbol$1 ? Symbol$1.prototype : undefined;
    var symbolToString = symbolProto ? symbolProto.toString : undefined;

    /**
     * The base implementation of `_.toString` which doesn't convert nullish
     * values to empty strings.
     *
     * @private
     * @param {*} value The value to process.
     * @returns {string} Returns the string.
     */
    function baseToString(value) {
        // Exit early for strings to avoid a performance hit in some environments.
        if (typeof value == 'string') {
            return value;
        }
        if (isArray(value)) {
            // Recursively convert values (susceptible to call stack limits).
            return arrayMap(value, baseToString) + '';
        }
        if (isSymbol(value)) {
            return symbolToString ? symbolToString.call(value) : '';
        }
        var result = value + '';
        return result == '0' && 1 / value == -INFINITY ? '-0' : result;
    }

    /**
     * The base implementation of `_.slice` without an iteratee call guard.
     *
     * @private
     * @param {Array} array The array to slice.
     * @param {number} [start=0] The start position.
     * @param {number} [end=array.length] The end position.
     * @returns {Array} Returns the slice of `array`.
     */
    function baseSlice(array, start, end) {
        var index = -1,
            length = array.length;

        if (start < 0) {
            start = -start > length ? 0 : length + start;
        }
        end = end > length ? length : end;
        if (end < 0) {
            end += length;
        }
        length = start > end ? 0 : end - start >>> 0;
        start >>>= 0;

        var result = Array(length);
        while (++index < length) {
            result[index] = array[index + start];
        }
        return result;
    }

    /**
     * Casts `array` to a slice if it's needed.
     *
     * @private
     * @param {Array} array The array to inspect.
     * @param {number} start The start position.
     * @param {number} [end=array.length] The end position.
     * @returns {Array} Returns the cast slice.
     */
    function castSlice(array, start, end) {
        var length = array.length;
        end = end === undefined ? length : end;
        return !start && end >= length ? array : baseSlice(array, start, end);
    }

    /**
     * Used by `_.trim` and `_.trimEnd` to get the index of the last string symbol
     * that is not found in the character symbols.
     *
     * @private
     * @param {Array} strSymbols The string symbols to inspect.
     * @param {Array} chrSymbols The character symbols to find.
     * @returns {number} Returns the index of the last unmatched string symbol.
     */
    function charsEndIndex(strSymbols, chrSymbols) {
        var index = strSymbols.length;

        while (index-- && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {}
        return index;
    }

    /**
     * Used by `_.trim` and `_.trimStart` to get the index of the first string symbol
     * that is not found in the character symbols.
     *
     * @private
     * @param {Array} strSymbols The string symbols to inspect.
     * @param {Array} chrSymbols The character symbols to find.
     * @returns {number} Returns the index of the first unmatched string symbol.
     */
    function charsStartIndex(strSymbols, chrSymbols) {
        var index = -1,
            length = strSymbols.length;

        while (++index < length && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {}
        return index;
    }

    /**
     * Converts an ASCII `string` to an array.
     *
     * @private
     * @param {string} string The string to convert.
     * @returns {Array} Returns the converted array.
     */
    function asciiToArray(string) {
        return string.split('');
    }

    /** Used to compose unicode character classes. */
    var rsAstralRange = '\\ud800-\\udfff';
    var rsComboMarksRange = '\\u0300-\\u036f\\ufe20-\\ufe23';
    var rsComboSymbolsRange = '\\u20d0-\\u20f0';
    var rsVarRange = '\\ufe0e\\ufe0f';

    /** Used to compose unicode capture groups. */
    var rsZWJ = '\\u200d';

    /** Used to detect strings with [zero-width joiners or code points from the astral planes](http://eev.ee/blog/2015/09/12/dark-corners-of-unicode/). */
    var reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']');

    /**
     * Checks if `string` contains Unicode symbols.
     *
     * @private
     * @param {string} string The string to inspect.
     * @returns {boolean} Returns `true` if a symbol is found, else `false`.
     */
    function hasUnicode(string) {
        return reHasUnicode.test(string);
    }

    /** Used to compose unicode character classes. */
    var rsAstralRange$1 = '\\ud800-\\udfff';
    var rsComboMarksRange$1 = '\\u0300-\\u036f\\ufe20-\\ufe23';
    var rsComboSymbolsRange$1 = '\\u20d0-\\u20f0';
    var rsVarRange$1 = '\\ufe0e\\ufe0f';

    /** Used to compose unicode capture groups. */
    var rsAstral = '[' + rsAstralRange$1 + ']';
    var rsCombo = '[' + rsComboMarksRange$1 + rsComboSymbolsRange$1 + ']';
    var rsFitz = '\\ud83c[\\udffb-\\udfff]';
    var rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
    var rsNonAstral = '[^' + rsAstralRange$1 + ']';
    var rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}';
    var rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]';
    var rsZWJ$1 = '\\u200d';

    /** Used to compose unicode regexes. */
    var reOptMod = rsModifier + '?';
    var rsOptVar = '[' + rsVarRange$1 + ']?';
    var rsOptJoin = '(?:' + rsZWJ$1 + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
    var rsSeq = rsOptVar + reOptMod + rsOptJoin;
    var rsSymbol = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

    /** Used to match [string symbols](https://mathiasbynens.be/notes/javascript-unicode). */
    var reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

    /**
     * Converts a Unicode `string` to an array.
     *
     * @private
     * @param {string} string The string to convert.
     * @returns {Array} Returns the converted array.
     */
    function unicodeToArray(string) {
        return string.match(reUnicode) || [];
    }

    /**
     * Converts `string` to an array.
     *
     * @private
     * @param {string} string The string to convert.
     * @returns {Array} Returns the converted array.
     */
    function stringToArray(string) {
        return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
    }

    /**
     * Converts `value` to a string. An empty string is returned for `null`
     * and `undefined` values. The sign of `-0` is preserved.
     *
     * @static
     * @memberOf _
     * @since 4.0.0
     * @category Lang
     * @param {*} value The value to convert.
     * @returns {string} Returns the converted string.
     * @example
     *
     * _.toString(null);
     * // => ''
     *
     * _.toString(-0);
     * // => '-0'
     *
     * _.toString([1, 2, 3]);
     * // => '1,2,3'
     */
    function toString(value) {
        return value == null ? '' : baseToString(value);
    }

    /** Used to match leading and trailing whitespace. */
    var reTrim = /^\s+|\s+$/g;

    /**
     * Removes leading and trailing whitespace or specified characters from `string`.
     *
     * @static
     * @memberOf _
     * @since 3.0.0
     * @category String
     * @param {string} [string=''] The string to trim.
     * @param {string} [chars=whitespace] The characters to trim.
     * @param- {Object} [guard] Enables use as an iteratee for methods like `_.map`.
     * @returns {string} Returns the trimmed string.
     * @example
     *
     * _.trim('  abc  ');
     * // => 'abc'
     *
     * _.trim('-_-abc-_-', '_-');
     * // => 'abc'
     *
     * _.map(['  foo  ', '  bar  '], _.trim);
     * // => ['foo', 'bar']
     */
    function trim(string, chars, guard) {
        string = toString(string);
        if (string && (guard || chars === undefined)) {
            return string.replace(reTrim, '');
        }
        if (!string || !(chars = baseToString(chars))) {
            return string;
        }
        var strSymbols = stringToArray(string),
            chrSymbols = stringToArray(chars),
            start = charsStartIndex(strSymbols, chrSymbols),
            end = charsEndIndex(strSymbols, chrSymbols) + 1;

        return castSlice(strSymbols, start, end).join('');
    }

    var FN_ARGS = /^(function)?\s*[^\(]*\(\s*([^\)]*)\)/m;
    var FN_ARG_SPLIT = /,/;
    var FN_ARG = /(=.+)?(\s*)$/;
    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

    function parseParams(func) {
        func = func.toString().replace(STRIP_COMMENTS, '');
        func = func.match(FN_ARGS)[2].replace(' ', '');
        func = func ? func.split(FN_ARG_SPLIT) : [];
        func = func.map(function (arg) {
            return trim(arg.replace(FN_ARG, ''));
        });
        return func;
    }

    /**
     * A dependency-injected version of the [async.auto]{@link module:ControlFlow.auto} function. Dependent
     * tasks are specified as parameters to the function, after the usual callback
     * parameter, with the parameter names matching the names of the tasks it
     * depends on. This can provide even more readable task graphs which can be
     * easier to maintain.
     *
     * If a final callback is specified, the task results are similarly injected,
     * specified as named parameters after the initial error parameter.
     *
     * The autoInject function is purely syntactic sugar and its semantics are
     * otherwise equivalent to [async.auto]{@link module:ControlFlow.auto}.
     *
     * @name autoInject
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.auto]{@link module:ControlFlow.auto}
     * @category Control Flow
     * @param {Object} tasks - An object, each of whose properties is a function of
     * the form 'func([dependencies...], callback). The object's key of a property
     * serves as the name of the task defined by that property, i.e. can be used
     * when specifying requirements for other tasks.
     * * The `callback` parameter is a `callback(err, result)` which must be called
     *   when finished, passing an `error` (which can be `null`) and the result of
     *   the function's execution. The remaining parameters name other tasks on
     *   which the task is dependent, and the results from those tasks are the
     *   arguments of those parameters.
     * @param {Function} [callback] - An optional callback which is called when all
     * the tasks have been completed. It receives the `err` argument if any `tasks`
     * pass an error to their callback, and a `results` object with any completed
     * task results, similar to `auto`.
     * @example
     *
     * //  The example from `auto` can be rewritten as follows:
     * async.autoInject({
     *     get_data: function(callback) {
     *         // async code to get some data
     *         callback(null, 'data', 'converted to array');
     *     },
     *     make_folder: function(callback) {
     *         // async code to create a directory to store a file in
     *         // this is run at the same time as getting the data
     *         callback(null, 'folder');
     *     },
     *     write_file: function(get_data, make_folder, callback) {
     *         // once there is some data and the directory exists,
     *         // write the data to a file in the directory
     *         callback(null, 'filename');
     *     },
     *     email_link: function(write_file, callback) {
     *         // once the file is written let's email a link to it...
     *         // write_file contains the filename returned by write_file.
     *         callback(null, {'file':write_file, 'email':'user@example.com'});
     *     }
     * }, function(err, results) {
     *     console.log('err = ', err);
     *     console.log('email_link = ', results.email_link);
     * });
     *
     * // If you are using a JS minifier that mangles parameter names, `autoInject`
     * // will not work with plain functions, since the parameter names will be
     * // collapsed to a single letter identifier.  To work around this, you can
     * // explicitly specify the names of the parameters your task function needs
     * // in an array, similar to Angular.js dependency injection.
     *
     * // This still has an advantage over plain `auto`, since the results a task
     * // depends on are still spread into arguments.
     * async.autoInject({
     *     //...
     *     write_file: ['get_data', 'make_folder', function(get_data, make_folder, callback) {
     *         callback(null, 'filename');
     *     }],
     *     email_link: ['write_file', function(write_file, callback) {
     *         callback(null, {'file':write_file, 'email':'user@example.com'});
     *     }]
     *     //...
     * }, function(err, results) {
     *     console.log('err = ', err);
     *     console.log('email_link = ', results.email_link);
     * });
     */
    function autoInject(tasks, callback) {
        var newTasks = {};

        baseForOwn(tasks, function (taskFn, key) {
            var params;

            if (isArray(taskFn)) {
                params = taskFn.slice(0, -1);
                taskFn = taskFn[taskFn.length - 1];

                newTasks[key] = params.concat(params.length > 0 ? newTask : taskFn);
            } else if (taskFn.length === 1) {
                // no dependencies, use the function as-is
                newTasks[key] = taskFn;
            } else {
                params = parseParams(taskFn);
                if (taskFn.length === 0 && params.length === 0) {
                    throw new Error("autoInject task functions require explicit parameters.");
                }

                params.pop();

                newTasks[key] = params.concat(newTask);
            }

            function newTask(results, taskCb) {
                var newArgs = arrayMap(params, function (name) {
                    return results[name];
                });
                newArgs.push(taskCb);
                taskFn.apply(null, newArgs);
            }
        });

        auto(newTasks, callback);
    }

    var hasSetImmediate = typeof setImmediate === 'function' && setImmediate;
    var hasNextTick = (typeof process === 'undefined' ? 'undefined' : _typeof(process)) === 'object' && typeof process.nextTick === 'function';

    function fallback(fn) {
        setTimeout(fn, 0);
    }

    function wrap(defer) {
        return rest(function (fn, args) {
            defer(function () {
                fn.apply(null, args);
            });
        });
    }

    var _defer;

    if (hasSetImmediate) {
        _defer = setImmediate;
    } else if (hasNextTick) {
        _defer = process.nextTick;
    } else {
        _defer = fallback;
    }

    var setImmediate$1 = wrap(_defer);

    // Simple doubly linked list (https://en.wikipedia.org/wiki/Doubly_linked_list) implementation
    // used for queues. This implementation assumes that the node provided by the user can be modified
    // to adjust the next and last properties. We implement only the minimal functionality
    // for queue support.
    function DLL() {
        this.head = this.tail = null;
        this.length = 0;
    }

    function setInitial(dll, node) {
        dll.length = 1;
        dll.head = dll.tail = node;
    }

    DLL.prototype.removeLink = function (node) {
        if (node.prev) node.prev.next = node.next;else this.head = node.next;
        if (node.next) node.next.prev = node.prev;else this.tail = node.prev;

        node.prev = node.next = null;
        this.length -= 1;
        return node;
    };

    DLL.prototype.empty = DLL;

    DLL.prototype.insertAfter = function (node, newNode) {
        newNode.prev = node;
        newNode.next = node.next;
        if (node.next) node.next.prev = newNode;else this.tail = newNode;
        node.next = newNode;
        this.length += 1;
    };

    DLL.prototype.insertBefore = function (node, newNode) {
        newNode.prev = node.prev;
        newNode.next = node;
        if (node.prev) node.prev.next = newNode;else this.head = newNode;
        node.prev = newNode;
        this.length += 1;
    };

    DLL.prototype.unshift = function (node) {
        if (this.head) this.insertBefore(this.head, node);else setInitial(this, node);
    };

    DLL.prototype.push = function (node) {
        if (this.tail) this.insertAfter(this.tail, node);else setInitial(this, node);
    };

    DLL.prototype.shift = function () {
        return this.head && this.removeLink(this.head);
    };

    DLL.prototype.pop = function () {
        return this.tail && this.removeLink(this.tail);
    };

    function queue(worker, concurrency, payload) {
        if (concurrency == null) {
            concurrency = 1;
        } else if (concurrency === 0) {
            throw new Error('Concurrency must not be zero');
        }

        function _insert(data, insertAtFront, callback) {
            if (callback != null && typeof callback !== 'function') {
                throw new Error('task callback must be a function');
            }
            q.started = true;
            if (!isArray(data)) {
                data = [data];
            }
            if (data.length === 0 && q.idle()) {
                // call drain immediately if there are no tasks
                return setImmediate$1(function () {
                    q.drain();
                });
            }

            for (var i = 0, l = data.length; i < l; i++) {
                var item = {
                    data: data[i],
                    callback: callback || noop
                };

                if (insertAtFront) {
                    q._tasks.unshift(item);
                } else {
                    q._tasks.push(item);
                }
            }
            setImmediate$1(q.process);
        }

        function _next(tasks) {
            return rest(function (args) {
                workers -= 1;

                for (var i = 0, l = tasks.length; i < l; i++) {
                    var task = tasks[i];
                    var index = baseIndexOf(_workersList, task, 0);
                    if (index >= 0) {
                        _workersList.splice(index);
                    }

                    task.callback.apply(task, args);

                    if (args[0] != null) {
                        q.error(args[0], task.data);
                    }
                }

                if (workers <= q.concurrency - q.buffer) {
                    q.unsaturated();
                }

                if (q.idle()) {
                    q.drain();
                }
                q.process();
            });
        }

        var workers = 0;
        var _workersList = [];
        var q = {
            _tasks: new DLL(),
            concurrency: concurrency,
            payload: payload,
            saturated: noop,
            unsaturated: noop,
            buffer: concurrency / 4,
            empty: noop,
            drain: noop,
            error: noop,
            started: false,
            paused: false,
            push: function push(data, callback) {
                _insert(data, false, callback);
            },
            kill: function kill() {
                q.drain = noop;
                q._tasks.empty();
            },
            unshift: function unshift(data, callback) {
                _insert(data, true, callback);
            },
            process: function process() {
                while (!q.paused && workers < q.concurrency && q._tasks.length) {
                    var tasks = [],
                        data = [];
                    var l = q._tasks.length;
                    if (q.payload) l = Math.min(l, q.payload);
                    for (var i = 0; i < l; i++) {
                        var node = q._tasks.shift();
                        tasks.push(node);
                        data.push(node.data);
                    }

                    if (q._tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    _workersList.push(tasks[0]);

                    if (workers === q.concurrency) {
                        q.saturated();
                    }

                    var cb = onlyOnce(_next(tasks));
                    worker(data, cb);
                }
            },
            length: function length() {
                return q._tasks.length;
            },
            running: function running() {
                return workers;
            },
            workersList: function workersList() {
                return _workersList;
            },
            idle: function idle() {
                return q._tasks.length + workers === 0;
            },
            pause: function pause() {
                q.paused = true;
            },
            resume: function resume() {
                if (q.paused === false) {
                    return;
                }
                q.paused = false;
                var resumeCount = Math.min(q.concurrency, q._tasks.length);
                // Need to call q.process once per concurrent
                // worker to preserve full concurrency after pause
                for (var w = 1; w <= resumeCount; w++) {
                    setImmediate$1(q.process);
                }
            }
        };
        return q;
    }

    /**
     * A cargo of tasks for the worker function to complete. Cargo inherits all of
     * the same methods and event callbacks as [`queue`]{@link module:ControlFlow.queue}.
     * @typedef {Object} CargoObject
     * @memberOf module:ControlFlow
     * @property {Function} length - A function returning the number of items
     * waiting to be processed. Invoke like `cargo.length()`.
     * @property {number} payload - An `integer` for determining how many tasks
     * should be process per round. This property can be changed after a `cargo` is
     * created to alter the payload on-the-fly.
     * @property {Function} push - Adds `task` to the `queue`. The callback is
     * called once the `worker` has finished processing the task. Instead of a
     * single task, an array of `tasks` can be submitted. The respective callback is
     * used for every task in the list. Invoke like `cargo.push(task, [callback])`.
     * @property {Function} saturated - A callback that is called when the
     * `queue.length()` hits the concurrency and further tasks will be queued.
     * @property {Function} empty - A callback that is called when the last item
     * from the `queue` is given to a `worker`.
     * @property {Function} drain - A callback that is called when the last item
     * from the `queue` has returned from the `worker`.
     * @property {Function} idle - a function returning false if there are items
     * waiting or being processed, or true if not. Invoke like `cargo.idle()`.
     * @property {Function} pause - a function that pauses the processing of tasks
     * until `resume()` is called. Invoke like `cargo.pause()`.
     * @property {Function} resume - a function that resumes the processing of
     * queued tasks when the queue is paused. Invoke like `cargo.resume()`.
     * @property {Function} kill - a function that removes the `drain` callback and
     * empties remaining tasks from the queue forcing it to go idle. Invoke like `cargo.kill()`.
     */

    /**
     * Creates a `cargo` object with the specified payload. Tasks added to the
     * cargo will be processed altogether (up to the `payload` limit). If the
     * `worker` is in progress, the task is queued until it becomes available. Once
     * the `worker` has completed some tasks, each callback of those tasks is
     * called. Check out [these](https://camo.githubusercontent.com/6bbd36f4cf5b35a0f11a96dcd2e97711ffc2fb37/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130382f62626330636662302d356632392d313165322d393734662d3333393763363464633835382e676966) [animations](https://camo.githubusercontent.com/f4810e00e1c5f5f8addbe3e9f49064fd5d102699/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130312f38346339323036362d356632392d313165322d383134662d3964336430323431336266642e676966)
     * for how `cargo` and `queue` work.
     *
     * While [`queue`]{@link module:ControlFlow.queue} passes only one task to one of a group of workers
     * at a time, cargo passes an array of tasks to a single worker, repeating
     * when the worker is finished.
     *
     * @name cargo
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.queue]{@link module:ControlFlow.queue}
     * @category Control Flow
     * @param {Function} worker - An asynchronous function for processing an array
     * of queued tasks, which must call its `callback(err)` argument when finished,
     * with an optional `err` argument. Invoked with `(tasks, callback)`.
     * @param {number} [payload=Infinity] - An optional `integer` for determining
     * how many tasks should be processed per round; if omitted, the default is
     * unlimited.
     * @returns {module:ControlFlow.CargoObject} A cargo object to manage the tasks. Callbacks can
     * attached as certain properties to listen for specific events during the
     * lifecycle of the cargo and inner queue.
     * @example
     *
     * // create a cargo object with payload 2
     * var cargo = async.cargo(function(tasks, callback) {
     *     for (var i=0; i<tasks.length; i++) {
     *         console.log('hello ' + tasks[i].name);
     *     }
     *     callback();
     * }, 2);
     *
     * // add some items
     * cargo.push({name: 'foo'}, function(err) {
     *     console.log('finished processing foo');
     * });
     * cargo.push({name: 'bar'}, function(err) {
     *     console.log('finished processing bar');
     * });
     * cargo.push({name: 'baz'}, function(err) {
     *     console.log('finished processing baz');
     * });
     */
    function cargo(worker, payload) {
        return queue(worker, 1, payload);
    }

    /**
     * The same as [`eachOf`]{@link module:Collections.eachOf} but runs only a single async operation at a time.
     *
     * @name eachOfSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.eachOf]{@link module:Collections.eachOf}
     * @alias forEachOfSeries
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item in `coll`. The
     * `key` is the item's key, or index in the case of an array. The iteratee is
     * passed a `callback(err)` which must be called once it has completed. If no
     * error has occurred, the callback should be run without arguments or with an
     * explicit `null` argument. Invoked with (item, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Invoked with (err).
     */
    var eachOfSeries = doLimit(eachOfLimit, 1);

    /**
     * Reduces `coll` into a single value using an async `iteratee` to return each
     * successive step. `memo` is the initial state of the reduction. This function
     * only operates in series.
     *
     * For performance reasons, it may make sense to split a call to this function
     * into a parallel map, and then use the normal `Array.prototype.reduce` on the
     * results. This function is for situations where each step in the reduction
     * needs to be async; if you can get the data before reducing it, then it's
     * probably a good idea to do so.
     *
     * @name reduce
     * @static
     * @memberOf module:Collections
     * @method
     * @alias inject
     * @alias foldl
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {*} memo - The initial state of the reduction.
     * @param {Function} iteratee - A function applied to each item in the
     * array to produce the next step in the reduction. The `iteratee` is passed a
     * `callback(err, reduction)` which accepts an optional error as its first
     * argument, and the state of the reduction as the second. If an error is
     * passed to the callback, the reduction is stopped and the main `callback` is
     * immediately called with the error. Invoked with (memo, item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result is the reduced value. Invoked with
     * (err, result).
     * @example
     *
     * async.reduce([1,2,3], 0, function(memo, item, callback) {
     *     // pointless async:
     *     process.nextTick(function() {
     *         callback(null, memo + item)
     *     });
     * }, function(err, result) {
     *     // result is now equal to the last value of memo, which is 6
     * });
     */
    function reduce(coll, memo, iteratee, callback) {
        callback = once(callback || noop);
        eachOfSeries(coll, function (x, i, callback) {
            iteratee(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    }

    /**
     * Version of the compose function that is more natural to read. Each function
     * consumes the return value of the previous function. It is the equivalent of
     * [compose]{@link module:ControlFlow.compose} with the arguments reversed.
     *
     * Each function is executed with the `this` binding of the composed function.
     *
     * @name seq
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.compose]{@link module:ControlFlow.compose}
     * @category Control Flow
     * @param {...Function} functions - the asynchronous functions to compose
     * @returns {Function} a function that composes the `functions` in order
     * @example
     *
     * // Requires lodash (or underscore), express3 and dresende's orm2.
     * // Part of an app, that fetches cats of the logged user.
     * // This example uses `seq` function to avoid overnesting and error
     * // handling clutter.
     * app.get('/cats', function(request, response) {
     *     var User = request.models.User;
     *     async.seq(
     *         _.bind(User.get, User),  // 'User.get' has signature (id, callback(err, data))
     *         function(user, fn) {
     *             user.getCats(fn);      // 'getCats' has signature (callback(err, data))
     *         }
     *     )(req.session.user_id, function (err, cats) {
     *         if (err) {
     *             console.error(err);
     *             response.json({ status: 'error', message: err.message });
     *         } else {
     *             response.json({ status: 'ok', message: 'Cats found', data: cats });
     *         }
     *     });
     * });
     */
    var seq$1 = rest(function seq(functions) {
        return rest(function (args) {
            var that = this;

            var cb = args[args.length - 1];
            if (typeof cb == 'function') {
                args.pop();
            } else {
                cb = noop;
            }

            reduce(functions, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([rest(function (err, nextargs) {
                    cb(err, nextargs);
                })]));
            }, function (err, results) {
                cb.apply(that, [err].concat(results));
            });
        });
    });

    /**
     * Creates a function which is a composition of the passed asynchronous
     * functions. Each function consumes the return value of the function that
     * follows. Composing functions `f()`, `g()`, and `h()` would produce the result
     * of `f(g(h()))`, only this version uses callbacks to obtain the return values.
     *
     * Each function is executed with the `this` binding of the composed function.
     *
     * @name compose
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {...Function} functions - the asynchronous functions to compose
     * @returns {Function} an asynchronous function that is the composed
     * asynchronous `functions`
     * @example
     *
     * function add1(n, callback) {
     *     setTimeout(function () {
     *         callback(null, n + 1);
     *     }, 10);
     * }
     *
     * function mul3(n, callback) {
     *     setTimeout(function () {
     *         callback(null, n * 3);
     *     }, 10);
     * }
     *
     * var add1mul3 = async.compose(mul3, add1);
     * add1mul3(4, function (err, result) {
     *     // result now equals 15
     * });
     */
    var compose = rest(function (args) {
        return seq$1.apply(null, args.reverse());
    });

    function concat$1(eachfn, arr, fn, callback) {
        var result = [];
        eachfn(arr, function (x, index, cb) {
            fn(x, function (err, y) {
                result = result.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, result);
        });
    }

    /**
     * Applies `iteratee` to each item in `coll`, concatenating the results. Returns
     * the concatenated list. The `iteratee`s are called in parallel, and the
     * results are concatenated as they return. There is no guarantee that the
     * results array will be returned in the original order of `coll` passed to the
     * `iteratee` function.
     *
     * @name concat
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, results)` which must be called once
     * it has completed with an error (which can be `null`) and an array of results.
     * Invoked with (item, callback).
     * @param {Function} [callback(err)] - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is an array
     * containing the concatenated results of the `iteratee` function. Invoked with
     * (err, results).
     * @example
     *
     * async.concat(['dir1','dir2','dir3'], fs.readdir, function(err, files) {
     *     // files is now a list of filenames that exist in the 3 directories
     * });
     */
    var concat = doParallel(concat$1);

    function doSeries(fn) {
        return function (obj, iteratee, callback) {
            return fn(eachOfSeries, obj, iteratee, callback);
        };
    }

    /**
     * The same as [`concat`]{@link module:Collections.concat} but runs only a single async operation at a time.
     *
     * @name concatSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.concat]{@link module:Collections.concat}
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, results)` which must be called once
     * it has completed with an error (which can be `null`) and an array of results.
     * Invoked with (item, callback).
     * @param {Function} [callback(err)] - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is an array
     * containing the concatenated results of the `iteratee` function. Invoked with
     * (err, results).
     */
    var concatSeries = doSeries(concat$1);

    /**
     * Returns a function that when called, calls-back with the values provided.
     * Useful as the first function in a [`waterfall`]{@link module:ControlFlow.waterfall}, or for plugging values in to
     * [`auto`]{@link module:ControlFlow.auto}.
     *
     * @name constant
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {...*} arguments... - Any number of arguments to automatically invoke
     * callback with.
     * @returns {Function} Returns a function that when invoked, automatically
     * invokes the callback with the previous given arguments.
     * @example
     *
     * async.waterfall([
     *     async.constant(42),
     *     function (value, next) {
     *         // value === 42
     *     },
     *     //...
     * ], callback);
     *
     * async.waterfall([
     *     async.constant(filename, "utf8"),
     *     fs.readFile,
     *     function (fileData, next) {
     *         //...
     *     }
     *     //...
     * ], callback);
     *
     * async.auto({
     *     hostname: async.constant("https://server.net/"),
     *     port: findFreePort,
     *     launchServer: ["hostname", "port", function (options, cb) {
     *         startServer(options, cb);
     *     }],
     *     //...
     * }, callback);
     */
    var constant = rest(function (values) {
        var args = [null].concat(values);
        return initialParams(function (ignoredArgs, callback) {
            return callback.apply(this, args);
        });
    });

    function _createTester(eachfn, check, getResult) {
        return function (arr, limit, iteratee, cb) {
            function done() {
                if (cb) {
                    cb(null, getResult(false));
                }
            }
            function wrappedIteratee(x, _, callback) {
                if (!cb) return callback();
                iteratee(x, function (err, v) {
                    // Check cb as another iteratee may have resolved with a
                    // value or error since we started this iteratee
                    if (cb && (err || check(v))) {
                        if (err) cb(err);else cb(err, getResult(true, x));
                        cb = iteratee = false;
                        callback(err, breakLoop);
                    } else {
                        callback();
                    }
                });
            }
            if (arguments.length > 3) {
                cb = cb || noop;
                eachfn(arr, limit, wrappedIteratee, done);
            } else {
                cb = iteratee;
                cb = cb || noop;
                iteratee = limit;
                eachfn(arr, wrappedIteratee, done);
            }
        };
    }

    function _findGetResult(v, x) {
        return x;
    }

    /**
     * Returns the first value in `coll` that passes an async truth test. The
     * `iteratee` is applied in parallel, meaning the first iteratee to return
     * `true` will fire the detect `callback` with that result. That means the
     * result might not be the first item in the original `coll` (in terms of order)
     * that passes the test.
    
     * If order within the original `coll` is important, then look at
     * [`detectSeries`]{@link module:Collections.detectSeries}.
     *
     * @name detect
     * @static
     * @memberOf module:Collections
     * @method
     * @alias find
     * @category Collections
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, truthValue)` which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the `iteratee` functions have finished.
     * Result will be the first item in the array that passes the truth test
     * (iteratee) or the value `undefined` if none passed. Invoked with
     * (err, result).
     * @example
     *
     * async.detect(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, result) {
     *     // result now equals the first file in the list that exists
     * });
     */
    var detect = _createTester(eachOf, identity, _findGetResult);

    /**
     * The same as [`detect`]{@link module:Collections.detect} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name detectLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.detect]{@link module:Collections.detect}
     * @alias findLimit
     * @category Collections
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, truthValue)` which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the `iteratee` functions have finished.
     * Result will be the first item in the array that passes the truth test
     * (iteratee) or the value `undefined` if none passed. Invoked with
     * (err, result).
     */
    var detectLimit = _createTester(eachOfLimit, identity, _findGetResult);

    /**
     * The same as [`detect`]{@link module:Collections.detect} but runs only a single async operation at a time.
     *
     * @name detectSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.detect]{@link module:Collections.detect}
     * @alias findSeries
     * @category Collections
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, truthValue)` which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the `iteratee` functions have finished.
     * Result will be the first item in the array that passes the truth test
     * (iteratee) or the value `undefined` if none passed. Invoked with
     * (err, result).
     */
    var detectSeries = _createTester(eachOfSeries, identity, _findGetResult);

    function consoleFunc(name) {
        return rest(function (fn, args) {
            fn.apply(null, args.concat([rest(function (err, args) {
                if ((typeof console === 'undefined' ? 'undefined' : _typeof(console)) === 'object') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    } else if (console[name]) {
                        arrayEach(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            })]));
        });
    }

    /**
     * Logs the result of an `async` function to the `console` using `console.dir`
     * to display the properties of the resulting object. Only works in Node.js or
     * in browsers that support `console.dir` and `console.error` (such as FF and
     * Chrome). If multiple arguments are returned from the async function,
     * `console.dir` is called on each argument in order.
     *
     * @name dir
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} function - The function you want to eventually apply all
     * arguments to.
     * @param {...*} arguments... - Any number of arguments to apply to the function.
     * @example
     *
     * // in a module
     * var hello = function(name, callback) {
     *     setTimeout(function() {
     *         callback(null, {hello: name});
     *     }, 1000);
     * };
     *
     * // in the node repl
     * node> async.dir(hello, 'world');
     * {hello: 'world'}
     */
    var dir = consoleFunc('dir');

    /**
     * The post-check version of [`during`]{@link module:ControlFlow.during}. To reflect the difference in
     * the order of operations, the arguments `test` and `fn` are switched.
     *
     * Also a version of [`doWhilst`]{@link module:ControlFlow.doWhilst} with asynchronous `test` function.
     * @name doDuring
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.during]{@link module:ControlFlow.during}
     * @category Control Flow
     * @param {Function} fn - A function which is called each time `test` passes.
     * The function is passed a `callback(err)`, which must be called once it has
     * completed with an optional `err` argument. Invoked with (callback).
     * @param {Function} test - asynchronous truth test to perform before each
     * execution of `fn`. Invoked with (...args, callback), where `...args` are the
     * non-error args from the previous callback of `fn`.
     * @param {Function} [callback] - A callback which is called after the test
     * function has failed and repeated execution of `fn` has stopped. `callback`
     * will be passed an error if one occured, otherwise `null`.
     */
    function doDuring(fn, test, callback) {
        callback = onlyOnce(callback || noop);

        var next = rest(function (err, args) {
            if (err) return callback(err);
            args.push(check);
            test.apply(this, args);
        });

        function check(err, truth) {
            if (err) return callback(err);
            if (!truth) return callback(null);
            fn(next);
        }

        check(null, true);
    }

    /**
     * The post-check version of [`whilst`]{@link module:ControlFlow.whilst}. To reflect the difference in
     * the order of operations, the arguments `test` and `iteratee` are switched.
     *
     * `doWhilst` is to `whilst` as `do while` is to `while` in plain JavaScript.
     *
     * @name doWhilst
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.whilst]{@link module:ControlFlow.whilst}
     * @category Control Flow
     * @param {Function} iteratee - A function which is called each time `test`
     * passes. The function is passed a `callback(err)`, which must be called once
     * it has completed with an optional `err` argument. Invoked with (callback).
     * @param {Function} test - synchronous truth test to perform after each
     * execution of `iteratee`. Invoked with the non-error callback results of 
     * `iteratee`.
     * @param {Function} [callback] - A callback which is called after the test
     * function has failed and repeated execution of `iteratee` has stopped.
     * `callback` will be passed an error and any arguments passed to the final
     * `iteratee`'s callback. Invoked with (err, [results]);
     */
    function doWhilst(iteratee, test, callback) {
        callback = onlyOnce(callback || noop);
        var next = rest(function (err, args) {
            if (err) return callback(err);
            if (test.apply(this, args)) return iteratee(next);
            callback.apply(null, [null].concat(args));
        });
        iteratee(next);
    }

    /**
     * Like ['doWhilst']{@link module:ControlFlow.doWhilst}, except the `test` is inverted. Note the
     * argument ordering differs from `until`.
     *
     * @name doUntil
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.doWhilst]{@link module:ControlFlow.doWhilst}
     * @category Control Flow
     * @param {Function} fn - A function which is called each time `test` fails.
     * The function is passed a `callback(err)`, which must be called once it has
     * completed with an optional `err` argument. Invoked with (callback).
     * @param {Function} test - synchronous truth test to perform after each
     * execution of `fn`. Invoked with the non-error callback results of `fn`.
     * @param {Function} [callback] - A callback which is called after the test
     * function has passed and repeated execution of `fn` has stopped. `callback`
     * will be passed an error and any arguments passed to the final `fn`'s
     * callback. Invoked with (err, [results]);
     */
    function doUntil(fn, test, callback) {
        doWhilst(fn, function () {
            return !test.apply(this, arguments);
        }, callback);
    }

    /**
     * Like [`whilst`]{@link module:ControlFlow.whilst}, except the `test` is an asynchronous function that
     * is passed a callback in the form of `function (err, truth)`. If error is
     * passed to `test` or `fn`, the main callback is immediately called with the
     * value of the error.
     *
     * @name during
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.whilst]{@link module:ControlFlow.whilst}
     * @category Control Flow
     * @param {Function} test - asynchronous truth test to perform before each
     * execution of `fn`. Invoked with (callback).
     * @param {Function} fn - A function which is called each time `test` passes.
     * The function is passed a `callback(err)`, which must be called once it has
     * completed with an optional `err` argument. Invoked with (callback).
     * @param {Function} [callback] - A callback which is called after the test
     * function has failed and repeated execution of `fn` has stopped. `callback`
     * will be passed an error, if one occured, otherwise `null`.
     * @example
     *
     * var count = 0;
     *
     * async.during(
     *     function (callback) {
     *         return callback(null, count < 5);
     *     },
     *     function (callback) {
     *         count++;
     *         setTimeout(callback, 1000);
     *     },
     *     function (err) {
     *         // 5 seconds have passed
     *     }
     * );
     */
    function during(test, fn, callback) {
        callback = onlyOnce(callback || noop);

        function next(err) {
            if (err) return callback(err);
            test(check);
        }

        function check(err, truth) {
            if (err) return callback(err);
            if (!truth) return callback(null);
            fn(next);
        }

        test(check);
    }

    function _withoutIndex(iteratee) {
        return function (value, index, callback) {
            return iteratee(value, callback);
        };
    }

    /**
     * Applies the function `iteratee` to each item in `coll`, in parallel.
     * The `iteratee` is called with an item from the list, and a callback for when
     * it has finished. If the `iteratee` passes an error to its `callback`, the
     * main `callback` (for the `each` function) is immediately called with the
     * error.
     *
     * Note, that since this function applies `iteratee` to each item in parallel,
     * there is no guarantee that the iteratee functions will complete in order.
     *
     * @name each
     * @static
     * @memberOf module:Collections
     * @method
     * @alias forEach
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item
     * in `coll`. The iteratee is passed a `callback(err)` which must be called once
     * it has completed. If no error has occurred, the `callback` should be run
     * without arguments or with an explicit `null` argument. The array index is not
     * passed to the iteratee. Invoked with (item, callback). If you need the index,
     * use `eachOf`.
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @example
     *
     * // assuming openFiles is an array of file names and saveFile is a function
     * // to save the modified contents of that file:
     *
     * async.each(openFiles, saveFile, function(err){
     *   // if any of the saves produced an error, err would equal that error
     * });
     *
     * // assuming openFiles is an array of file names
     * async.each(openFiles, function(file, callback) {
     *
     *     // Perform operation on file here.
     *     console.log('Processing file ' + file);
     *
     *     if( file.length > 32 ) {
     *       console.log('This file name is too long');
     *       callback('File name too long');
     *     } else {
     *       // Do work to process file here
     *       console.log('File processed');
     *       callback();
     *     }
     * }, function(err) {
     *     // if any of the file processing produced an error, err would equal that error
     *     if( err ) {
     *       // One of the iterations produced an error.
     *       // All processing will now stop.
     *       console.log('A file failed to process');
     *     } else {
     *       console.log('All files have been processed successfully');
     *     }
     * });
     */
    function eachLimit(coll, iteratee, callback) {
        eachOf(coll, _withoutIndex(iteratee), callback);
    }

    /**
     * The same as [`each`]{@link module:Collections.each} but runs a maximum of `limit` async operations at a time.
     *
     * @name eachLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.each]{@link module:Collections.each}
     * @alias forEachLimit
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A function to apply to each item in `coll`. The
     * iteratee is passed a `callback(err)` which must be called once it has
     * completed. If no error has occurred, the `callback` should be run without
     * arguments or with an explicit `null` argument. The array index is not passed
     * to the iteratee. Invoked with (item, callback). If you need the index, use
     * `eachOfLimit`.
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     */
    function eachLimit$1(coll, limit, iteratee, callback) {
        _eachOfLimit(limit)(coll, _withoutIndex(iteratee), callback);
    }

    /**
     * The same as [`each`]{@link module:Collections.each} but runs only a single async operation at a time.
     *
     * @name eachSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.each]{@link module:Collections.each}
     * @alias forEachSeries
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each
     * item in `coll`. The iteratee is passed a `callback(err)` which must be called
     * once it has completed. If no error has occurred, the `callback` should be run
     * without arguments or with an explicit `null` argument. The array index is
     * not passed to the iteratee. Invoked with (item, callback). If you need the
     * index, use `eachOfSeries`.
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     */
    var eachSeries = doLimit(eachLimit$1, 1);

    /**
     * Wrap an async function and ensure it calls its callback on a later tick of
     * the event loop.  If the function already calls its callback on a next tick,
     * no extra deferral is added. This is useful for preventing stack overflows
     * (`RangeError: Maximum call stack size exceeded`) and generally keeping
     * [Zalgo](http://blog.izs.me/post/59142742143/designing-apis-for-asynchrony)
     * contained.
     *
     * @name ensureAsync
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} fn - an async function, one that expects a node-style
     * callback as its last argument.
     * @returns {Function} Returns a wrapped function with the exact same call
     * signature as the function passed in.
     * @example
     *
     * function sometimesAsync(arg, callback) {
     *     if (cache[arg]) {
     *         return callback(null, cache[arg]); // this would be synchronous!!
     *     } else {
     *         doSomeIO(arg, callback); // this IO would be asynchronous
     *     }
     * }
     *
     * // this has a risk of stack overflows if many results are cached in a row
     * async.mapSeries(args, sometimesAsync, done);
     *
     * // this will defer sometimesAsync's callback if necessary,
     * // preventing stack overflows
     * async.mapSeries(args, async.ensureAsync(sometimesAsync), done);
     */
    function ensureAsync(fn) {
        return initialParams(function (args, callback) {
            var sync = true;
            args.push(function () {
                var innerArgs = arguments;
                if (sync) {
                    setImmediate$1(function () {
                        callback.apply(null, innerArgs);
                    });
                } else {
                    callback.apply(null, innerArgs);
                }
            });
            fn.apply(this, args);
            sync = false;
        });
    }

    function notId(v) {
        return !v;
    }

    /**
     * Returns `true` if every element in `coll` satisfies an async test. If any
     * iteratee call returns `false`, the main `callback` is immediately called.
     *
     * @name every
     * @static
     * @memberOf module:Collections
     * @method
     * @alias all
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in the
     * collection in parallel. The iteratee is passed a `callback(err, truthValue)`
     * which must be called with a  boolean argument once it has completed. Invoked
     * with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result will be either `true` or `false`
     * depending on the values of the async tests. Invoked with (err, result).
     * @example
     *
     * async.every(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, result) {
     *     // if result is true then every file exists
     * });
     */
    var every = _createTester(eachOf, notId, notId);

    /**
     * The same as [`every`]{@link module:Collections.every} but runs a maximum of `limit` async operations at a time.
     *
     * @name everyLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.every]{@link module:Collections.every}
     * @alias allLimit
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A truth test to apply to each item in the
     * collection in parallel. The iteratee is passed a `callback(err, truthValue)`
     * which must be called with a  boolean argument once it has completed. Invoked
     * with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result will be either `true` or `false`
     * depending on the values of the async tests. Invoked with (err, result).
     */
    var everyLimit = _createTester(eachOfLimit, notId, notId);

    /**
     * The same as [`every`]{@link module:Collections.every} but runs only a single async operation at a time.
     *
     * @name everySeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.every]{@link module:Collections.every}
     * @alias allSeries
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in the
     * collection in parallel. The iteratee is passed a `callback(err, truthValue)`
     * which must be called with a  boolean argument once it has completed. Invoked
     * with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result will be either `true` or `false`
     * depending on the values of the async tests. Invoked with (err, result).
     */
    var everySeries = doLimit(everyLimit, 1);

    /**
     * The base implementation of `_.property` without support for deep paths.
     *
     * @private
     * @param {string} key The key of the property to get.
     * @returns {Function} Returns the new accessor function.
     */
    function baseProperty(key) {
        return function (object) {
            return object == null ? undefined : object[key];
        };
    }

    function filterArray(eachfn, arr, iteratee, callback) {
        var truthValues = new Array(arr.length);
        eachfn(arr, function (x, index, callback) {
            iteratee(x, function (err, v) {
                truthValues[index] = !!v;
                callback(err);
            });
        }, function (err) {
            if (err) return callback(err);
            var results = [];
            for (var i = 0; i < arr.length; i++) {
                if (truthValues[i]) results.push(arr[i]);
            }
            callback(null, results);
        });
    }

    function filterGeneric(eachfn, coll, iteratee, callback) {
        var results = [];
        eachfn(coll, function (x, index, callback) {
            iteratee(x, function (err, v) {
                if (err) {
                    callback(err);
                } else {
                    if (v) {
                        results.push({ index: index, value: x });
                    }
                    callback();
                }
            });
        }, function (err) {
            if (err) {
                callback(err);
            } else {
                callback(null, arrayMap(results.sort(function (a, b) {
                    return a.index - b.index;
                }), baseProperty('value')));
            }
        });
    }

    function _filter(eachfn, coll, iteratee, callback) {
        var filter = isArrayLike(coll) ? filterArray : filterGeneric;
        filter(eachfn, coll, iteratee, callback || noop);
    }

    /**
     * Returns a new array of all the values in `coll` which pass an async truth
     * test. This operation is performed in parallel, but the results array will be
     * in the same order as the original.
     *
     * @name filter
     * @static
     * @memberOf module:Collections
     * @method
     * @alias select
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @example
     *
     * async.filter(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, results) {
     *     // results now equals an array of the existing files
     * });
     */
    var filter = doParallel(_filter);

    /**
     * The same as [`filter`]{@link module:Collections.filter} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name filterLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.filter]{@link module:Collections.filter}
     * @alias selectLimit
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     */
    var filterLimit = doParallelLimit(_filter);

    /**
     * The same as [`filter`]{@link module:Collections.filter} but runs only a single async operation at a time.
     *
     * @name filterSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.filter]{@link module:Collections.filter}
     * @alias selectSeries
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results)
     */
    var filterSeries = doLimit(filterLimit, 1);

    /**
     * Calls the asynchronous function `fn` with a callback parameter that allows it
     * to call itself again, in series, indefinitely.
    
     * If an error is passed to the
     * callback then `errback` is called with the error, and execution stops,
     * otherwise it will never be called.
     *
     * @name forever
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Function} fn - a function to call repeatedly. Invoked with (next).
     * @param {Function} [errback] - when `fn` passes an error to it's callback,
     * this function will be called, and execution stops. Invoked with (err).
     * @example
     *
     * async.forever(
     *     function(next) {
     *         // next is suitable for passing to things that need a callback(err [, whatever]);
     *         // it will result in this function being called again.
     *     },
     *     function(err) {
     *         // if next is called with a value in its first parameter, it will appear
     *         // in here as 'err', and execution will stop.
     *     }
     * );
     */
    function forever(fn, errback) {
        var done = onlyOnce(errback || noop);
        var task = ensureAsync(fn);

        function next(err) {
            if (err) return done(err);
            task(next);
        }
        next();
    }

    /**
     * Logs the result of an `async` function to the `console`. Only works in
     * Node.js or in browsers that support `console.log` and `console.error` (such
     * as FF and Chrome). If multiple arguments are returned from the async
     * function, `console.log` is called on each argument in order.
     *
     * @name log
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} function - The function you want to eventually apply all
     * arguments to.
     * @param {...*} arguments... - Any number of arguments to apply to the function.
     * @example
     *
     * // in a module
     * var hello = function(name, callback) {
     *     setTimeout(function() {
     *         callback(null, 'hello ' + name);
     *     }, 1000);
     * };
     *
     * // in the node repl
     * node> async.log(hello, 'world');
     * 'hello world'
     */
    var log = consoleFunc('log');

    /**
     * The same as [`mapValues`]{@link module:Collections.mapValues} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name mapValuesLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.mapValues]{@link module:Collections.mapValues}
     * @category Collection
     * @param {Object} obj - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A function to apply to each value in `obj`.
     * The iteratee is passed a `callback(err, transformed)` which must be called
     * once it has completed with an error (which can be `null`) and a
     * transformed value. Invoked with (value, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. `result` is a new object consisting
     * of each key from `obj`, with each transformed value on the right-hand side.
     * Invoked with (err, result).
     */
    function mapValuesLimit(obj, limit, iteratee, callback) {
        callback = once(callback || noop);
        var newObj = {};
        eachOfLimit(obj, limit, function (val, key, next) {
            iteratee(val, key, function (err, result) {
                if (err) return next(err);
                newObj[key] = result;
                next();
            });
        }, function (err) {
            callback(err, newObj);
        });
    }

    /**
     * A relative of [`map`]{@link module:Collections.map}, designed for use with objects.
     *
     * Produces a new Object by mapping each value of `obj` through the `iteratee`
     * function. The `iteratee` is called each `value` and `key` from `obj` and a
     * callback for when it has finished processing. Each of these callbacks takes
     * two arguments: an `error`, and the transformed item from `obj`. If `iteratee`
     * passes an error to its callback, the main `callback` (for the `mapValues`
     * function) is immediately called with the error.
     *
     * Note, the order of the keys in the result is not guaranteed.  The keys will
     * be roughly in the order they complete, (but this is very engine-specific)
     *
     * @name mapValues
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Object} obj - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each value and key in
     * `coll`. The iteratee is passed a `callback(err, transformed)` which must be
     * called once it has completed with an error (which can be `null`) and a
     * transformed value. Invoked with (value, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. `result` is a new object consisting
     * of each key from `obj`, with each transformed value on the right-hand side.
     * Invoked with (err, result).
     * @example
     *
     * async.mapValues({
     *     f1: 'file1',
     *     f2: 'file2',
     *     f3: 'file3'
     * }, function (file, key, callback) {
     *   fs.stat(file, callback);
     * }, function(err, result) {
     *     // result is now a map of stats for each file, e.g.
     *     // {
     *     //     f1: [stats for file1],
     *     //     f2: [stats for file2],
     *     //     f3: [stats for file3]
     *     // }
     * });
     */

    var mapValues = doLimit(mapValuesLimit, Infinity);

    /**
     * The same as [`mapValues`]{@link module:Collections.mapValues} but runs only a single async operation at a time.
     *
     * @name mapValuesSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.mapValues]{@link module:Collections.mapValues}
     * @category Collection
     * @param {Object} obj - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each value in `obj`.
     * The iteratee is passed a `callback(err, transformed)` which must be called
     * once it has completed with an error (which can be `null`) and a
     * transformed value. Invoked with (value, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. `result` is a new object consisting
     * of each key from `obj`, with each transformed value on the right-hand side.
     * Invoked with (err, result).
     */
    var mapValuesSeries = doLimit(mapValuesLimit, 1);

    function has(obj, key) {
        return key in obj;
    }

    /**
     * Caches the results of an `async` function. When creating a hash to store
     * function results against, the callback is omitted from the hash and an
     * optional hash function can be used.
     *
     * If no hash function is specified, the first argument is used as a hash key,
     * which may work reasonably if it is a string or a data type that converts to a
     * distinct string. Note that objects and arrays will not behave reasonably.
     * Neither will cases where the other arguments are significant. In such cases,
     * specify your own hash function.
     *
     * The cache of results is exposed as the `memo` property of the function
     * returned by `memoize`.
     *
     * @name memoize
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} fn - The function to proxy and cache results from.
     * @param {Function} hasher - An optional function for generating a custom hash
     * for storing results. It has all the arguments applied to it apart from the
     * callback, and must be synchronous.
     * @returns {Function} a memoized version of `fn`
     * @example
     *
     * var slow_fn = function(name, callback) {
     *     // do something
     *     callback(null, result);
     * };
     * var fn = async.memoize(slow_fn);
     *
     * // fn can now be used as if it were slow_fn
     * fn('some name', function() {
     *     // callback
     * });
     */
    function memoize(fn, hasher) {
        var memo = Object.create(null);
        var queues = Object.create(null);
        hasher = hasher || identity;
        var memoized = initialParams(function memoized(args, callback) {
            var key = hasher.apply(null, args);
            if (has(memo, key)) {
                setImmediate$1(function () {
                    callback.apply(null, memo[key]);
                });
            } else if (has(queues, key)) {
                queues[key].push(callback);
            } else {
                queues[key] = [callback];
                fn.apply(null, args.concat([rest(function (args) {
                    memo[key] = args;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                        q[i].apply(null, args);
                    }
                })]));
            }
        });
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    }

    /**
     * Calls `callback` on a later loop around the event loop. In Node.js this just
     * calls `setImmediate`.  In the browser it will use `setImmediate` if
     * available, otherwise `setTimeout(callback, 0)`, which means other higher
     * priority events may precede the execution of `callback`.
     *
     * This is used internally for browser-compatibility purposes.
     *
     * @name nextTick
     * @static
     * @memberOf module:Utils
     * @method
     * @alias setImmediate
     * @category Util
     * @param {Function} callback - The function to call on a later loop around
     * the event loop. Invoked with (args...).
     * @param {...*} args... - any number of additional arguments to pass to the
     * callback on the next tick.
     * @example
     *
     * var call_order = [];
     * async.nextTick(function() {
     *     call_order.push('two');
     *     // call_order now equals ['one','two']
     * });
     * call_order.push('one');
     *
     * async.setImmediate(function (a, b, c) {
     *     // a, b, and c equal 1, 2, and 3
     * }, 1, 2, 3);
     */
    var _defer$1;

    if (hasNextTick) {
        _defer$1 = process.nextTick;
    } else if (hasSetImmediate) {
        _defer$1 = setImmediate;
    } else {
        _defer$1 = fallback;
    }

    var nextTick = wrap(_defer$1);

    function _parallel(eachfn, tasks, callback) {
        callback = callback || noop;
        var results = isArrayLike(tasks) ? [] : {};

        eachfn(tasks, function (task, key, callback) {
            task(rest(function (err, args) {
                if (args.length <= 1) {
                    args = args[0];
                }
                results[key] = args;
                callback(err);
            }));
        }, function (err) {
            callback(err, results);
        });
    }

    /**
     * Run the `tasks` collection of functions in parallel, without waiting until
     * the previous function has completed. If any of the functions pass an error to
     * its callback, the main `callback` is immediately called with the value of the
     * error. Once the `tasks` have completed, the results are passed to the final
     * `callback` as an array.
     *
     * **Note:** `parallel` is about kicking-off I/O tasks in parallel, not about
     * parallel execution of code.  If your tasks do not use any timers or perform
     * any I/O, they will actually be executed in series.  Any synchronous setup
     * sections for each task will happen one after the other.  JavaScript remains
     * single-threaded.
     *
     * It is also possible to use an object instead of an array. Each property will
     * be run as a function and the results will be passed to the final `callback`
     * as an object instead of an array. This can be a more readable way of handling
     * results from {@link async.parallel}.
     *
     * @name parallel
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|Object} tasks - A collection containing functions to run.
     * Each function is passed a `callback(err, result)` which it must call on
     * completion with an error `err` (which can be `null`) and an optional `result`
     * value.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed successfully. This function gets a results array
     * (or object) containing all the result arguments passed to the task callbacks.
     * Invoked with (err, results).
     * @example
     * async.parallel([
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'two');
     *         }, 100);
     *     }
     * ],
     * // optional callback
     * function(err, results) {
     *     // the results array will equal ['one','two'] even though
     *     // the second function had a shorter timeout.
     * });
     *
     * // an example using an object instead of an array
     * async.parallel({
     *     one: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 1);
     *         }, 200);
     *     },
     *     two: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 2);
     *         }, 100);
     *     }
     * }, function(err, results) {
     *     // results is now equals to: {one: 1, two: 2}
     * });
     */
    function parallelLimit(tasks, callback) {
        _parallel(eachOf, tasks, callback);
    }

    /**
     * The same as [`parallel`]{@link module:ControlFlow.parallel} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name parallelLimit
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.parallel]{@link module:ControlFlow.parallel}
     * @category Control Flow
     * @param {Array|Collection} tasks - A collection containing functions to run.
     * Each function is passed a `callback(err, result)` which it must call on
     * completion with an error `err` (which can be `null`) and an optional `result`
     * value.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed successfully. This function gets a results array
     * (or object) containing all the result arguments passed to the task callbacks.
     * Invoked with (err, results).
     */
    function parallelLimit$1(tasks, limit, callback) {
        _parallel(_eachOfLimit(limit), tasks, callback);
    }

    /**
     * A queue of tasks for the worker function to complete.
     * @typedef {Object} QueueObject
     * @memberOf module:ControlFlow
     * @property {Function} length - a function returning the number of items
     * waiting to be processed. Invoke with `queue.length()`.
     * @property {boolean} started - a boolean indicating whether or not any
     * items have been pushed and processed by the queue.
     * @property {Function} running - a function returning the number of items
     * currently being processed. Invoke with `queue.running()`.
     * @property {Function} workersList - a function returning the array of items
     * currently being processed. Invoke with `queue.workersList()`.
     * @property {Function} idle - a function returning false if there are items
     * waiting or being processed, or true if not. Invoke with `queue.idle()`.
     * @property {number} concurrency - an integer for determining how many `worker`
     * functions should be run in parallel. This property can be changed after a
     * `queue` is created to alter the concurrency on-the-fly.
     * @property {Function} push - add a new task to the `queue`. Calls `callback`
     * once the `worker` has finished processing the task. Instead of a single task,
     * a `tasks` array can be submitted. The respective callback is used for every
     * task in the list. Invoke with `queue.push(task, [callback])`,
     * @property {Function} unshift - add a new task to the front of the `queue`.
     * Invoke with `queue.unshift(task, [callback])`.
     * @property {Function} saturated - a callback that is called when the number of
     * running workers hits the `concurrency` limit, and further tasks will be
     * queued.
     * @property {Function} unsaturated - a callback that is called when the number
     * of running workers is less than the `concurrency` & `buffer` limits, and
     * further tasks will not be queued.
     * @property {number} buffer - A minimum threshold buffer in order to say that
     * the `queue` is `unsaturated`.
     * @property {Function} empty - a callback that is called when the last item
     * from the `queue` is given to a `worker`.
     * @property {Function} drain - a callback that is called when the last item
     * from the `queue` has returned from the `worker`.
     * @property {Function} error - a callback that is called when a task errors.
     * Has the signature `function(error, task)`.
     * @property {boolean} paused - a boolean for determining whether the queue is
     * in a paused state.
     * @property {Function} pause - a function that pauses the processing of tasks
     * until `resume()` is called. Invoke with `queue.pause()`.
     * @property {Function} resume - a function that resumes the processing of
     * queued tasks when the queue is paused. Invoke with `queue.resume()`.
     * @property {Function} kill - a function that removes the `drain` callback and
     * empties remaining tasks from the queue forcing it to go idle. Invoke with `queue.kill()`.
     */

    /**
     * Creates a `queue` object with the specified `concurrency`. Tasks added to the
     * `queue` are processed in parallel (up to the `concurrency` limit). If all
     * `worker`s are in progress, the task is queued until one becomes available.
     * Once a `worker` completes a `task`, that `task`'s callback is called.
     *
     * @name queue
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Function} worker - An asynchronous function for processing a queued
     * task, which must call its `callback(err)` argument when finished, with an
     * optional `error` as an argument.  If you want to handle errors from an
     * individual task, pass a callback to `q.push()`. Invoked with
     * (task, callback).
     * @param {number} [concurrency=1] - An `integer` for determining how many
     * `worker` functions should be run in parallel.  If omitted, the concurrency
     * defaults to `1`.  If the concurrency is `0`, an error is thrown.
     * @returns {module:ControlFlow.QueueObject} A queue object to manage the tasks. Callbacks can
     * attached as certain properties to listen for specific events during the
     * lifecycle of the queue.
     * @example
     *
     * // create a queue object with concurrency 2
     * var q = async.queue(function(task, callback) {
     *     console.log('hello ' + task.name);
     *     callback();
     * }, 2);
     *
     * // assign a callback
     * q.drain = function() {
     *     console.log('all items have been processed');
     * };
     *
     * // add some items to the queue
     * q.push({name: 'foo'}, function(err) {
     *     console.log('finished processing foo');
     * });
     * q.push({name: 'bar'}, function (err) {
     *     console.log('finished processing bar');
     * });
     *
     * // add some items to the queue (batch-wise)
     * q.push([{name: 'baz'},{name: 'bay'},{name: 'bax'}], function(err) {
     *     console.log('finished processing item');
     * });
     *
     * // add some items to the front of the queue
     * q.unshift({name: 'bar'}, function (err) {
     *     console.log('finished processing bar');
     * });
     */
    var queue$1 = function queue$1(worker, concurrency) {
        return queue(function (items, cb) {
            worker(items[0], cb);
        }, concurrency, 1);
    };

    /**
     * The same as [async.queue]{@link module:ControlFlow.queue} only tasks are assigned a priority and
     * completed in ascending priority order.
     *
     * @name priorityQueue
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.queue]{@link module:ControlFlow.queue}
     * @category Control Flow
     * @param {Function} worker - An asynchronous function for processing a queued
     * task, which must call its `callback(err)` argument when finished, with an
     * optional `error` as an argument.  If you want to handle errors from an
     * individual task, pass a callback to `q.push()`. Invoked with
     * (task, callback).
     * @param {number} concurrency - An `integer` for determining how many `worker`
     * functions should be run in parallel.  If omitted, the concurrency defaults to
     * `1`.  If the concurrency is `0`, an error is thrown.
     * @returns {module:ControlFlow.QueueObject} A priorityQueue object to manage the tasks. There are two
     * differences between `queue` and `priorityQueue` objects:
     * * `push(task, priority, [callback])` - `priority` should be a number. If an
     *   array of `tasks` is given, all tasks will be assigned the same priority.
     * * The `unshift` method was removed.
     */
    var priorityQueue = function priorityQueue(worker, concurrency) {
        // Start with a normal queue
        var q = queue$1(worker, concurrency);

        // Override push to accept second parameter representing priority
        q.push = function (data, priority, callback) {
            if (callback == null) callback = noop;
            if (typeof callback !== 'function') {
                throw new Error('task callback must be a function');
            }
            q.started = true;
            if (!isArray(data)) {
                data = [data];
            }
            if (data.length === 0) {
                // call drain immediately if there are no tasks
                return setImmediate$1(function () {
                    q.drain();
                });
            }

            priority = priority || 0;
            var nextNode = q._tasks.head;
            while (nextNode && priority >= nextNode.priority) {
                nextNode = nextNode.next;
            }

            for (var i = 0, l = data.length; i < l; i++) {
                var item = {
                    data: data[i],
                    priority: priority,
                    callback: callback
                };

                if (nextNode) {
                    q._tasks.insertBefore(nextNode, item);
                } else {
                    q._tasks.push(item);
                }
            }
            setImmediate$1(q.process);
        };

        // Remove unshift function
        delete q.unshift;

        return q;
    };

    /**
     * Runs the `tasks` array of functions in parallel, without waiting until the
     * previous function has completed. Once any of the `tasks` complete or pass an
     * error to its callback, the main `callback` is immediately called. It's
     * equivalent to `Promise.race()`.
     *
     * @name race
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array} tasks - An array containing functions to run. Each function
     * is passed a `callback(err, result)` which it must call on completion with an
     * error `err` (which can be `null`) and an optional `result` value.
     * @param {Function} callback - A callback to run once any of the functions have
     * completed. This function gets an error or result from the first function that
     * completed. Invoked with (err, result).
     * @returns undefined
     * @example
     *
     * async.race([
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'two');
     *         }, 100);
     *     }
     * ],
     * // main callback
     * function(err, result) {
     *     // the result will be equal to 'two' as it finishes earlier
     * });
     */
    function race(tasks, callback) {
        callback = once(callback || noop);
        if (!isArray(tasks)) return callback(new TypeError('First argument to race must be an array of functions'));
        if (!tasks.length) return callback();
        for (var i = 0, l = tasks.length; i < l; i++) {
            tasks[i](callback);
        }
    }

    var slice = Array.prototype.slice;

    /**
     * Same as [`reduce`]{@link module:Collections.reduce}, only operates on `array` in reverse order.
     *
     * @name reduceRight
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.reduce]{@link module:Collections.reduce}
     * @alias foldr
     * @category Collection
     * @param {Array} array - A collection to iterate over.
     * @param {*} memo - The initial state of the reduction.
     * @param {Function} iteratee - A function applied to each item in the
     * array to produce the next step in the reduction. The `iteratee` is passed a
     * `callback(err, reduction)` which accepts an optional error as its first
     * argument, and the state of the reduction as the second. If an error is
     * passed to the callback, the reduction is stopped and the main `callback` is
     * immediately called with the error. Invoked with (memo, item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result is the reduced value. Invoked with
     * (err, result).
     */
    function reduceRight(array, memo, iteratee, callback) {
        var reversed = slice.call(array).reverse();
        reduce(reversed, memo, iteratee, callback);
    }

    /**
     * Wraps the function in another function that always returns data even when it
     * errors.
     *
     * The object returned has either the property `error` or `value`.
     *
     * @name reflect
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} fn - The function you want to wrap
     * @returns {Function} - A function that always passes null to it's callback as
     * the error. The second argument to the callback will be an `object` with
     * either an `error` or a `value` property.
     * @example
     *
     * async.parallel([
     *     async.reflect(function(callback) {
     *         // do some stuff ...
     *         callback(null, 'one');
     *     }),
     *     async.reflect(function(callback) {
     *         // do some more stuff but error ...
     *         callback('bad stuff happened');
     *     }),
     *     async.reflect(function(callback) {
     *         // do some more stuff ...
     *         callback(null, 'two');
     *     })
     * ],
     * // optional callback
     * function(err, results) {
     *     // values
     *     // results[0].value = 'one'
     *     // results[1].error = 'bad stuff happened'
     *     // results[2].value = 'two'
     * });
     */
    function reflect(fn) {
        return initialParams(function reflectOn(args, reflectCallback) {
            args.push(rest(function callback(err, cbArgs) {
                if (err) {
                    reflectCallback(null, {
                        error: err
                    });
                } else {
                    var value = null;
                    if (cbArgs.length === 1) {
                        value = cbArgs[0];
                    } else if (cbArgs.length > 1) {
                        value = cbArgs;
                    }
                    reflectCallback(null, {
                        value: value
                    });
                }
            }));

            return fn.apply(this, args);
        });
    }

    function reject$1(eachfn, arr, iteratee, callback) {
        _filter(eachfn, arr, function (value, cb) {
            iteratee(value, function (err, v) {
                cb(err, !v);
            });
        }, callback);
    }

    /**
     * The opposite of [`filter`]{@link module:Collections.filter}. Removes values that pass an `async` truth test.
     *
     * @name reject
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.filter]{@link module:Collections.filter}
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @example
     *
     * async.reject(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, results) {
     *     // results now equals an array of missing files
     *     createFiles(results);
     * });
     */
    var reject = doParallel(reject$1);

    /**
     * A helper function that wraps an array or an object of functions with reflect.
     *
     * @name reflectAll
     * @static
     * @memberOf module:Utils
     * @method
     * @see [async.reflect]{@link module:Utils.reflect}
     * @category Util
     * @param {Array} tasks - The array of functions to wrap in `async.reflect`.
     * @returns {Array} Returns an array of functions, each function wrapped in
     * `async.reflect`
     * @example
     *
     * let tasks = [
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     function(callback) {
     *         // do some more stuff but error ...
     *         callback(new Error('bad stuff happened'));
     *     },
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'two');
     *         }, 100);
     *     }
     * ];
     *
     * async.parallel(async.reflectAll(tasks),
     * // optional callback
     * function(err, results) {
     *     // values
     *     // results[0].value = 'one'
     *     // results[1].error = Error('bad stuff happened')
     *     // results[2].value = 'two'
     * });
     *
     * // an example using an object instead of an array
     * let tasks = {
     *     one: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     two: function(callback) {
     *         callback('two');
     *     },
     *     three: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'three');
     *         }, 100);
     *     }
     * };
     *
     * async.parallel(async.reflectAll(tasks),
     * // optional callback
     * function(err, results) {
     *     // values
     *     // results.one.value = 'one'
     *     // results.two.error = 'two'
     *     // results.three.value = 'three'
     * });
     */
    function reflectAll(tasks) {
        var results;
        if (isArray(tasks)) {
            results = arrayMap(tasks, reflect);
        } else {
            results = {};
            baseForOwn(tasks, function (task, key) {
                results[key] = reflect.call(this, task);
            });
        }
        return results;
    }

    /**
     * The same as [`reject`]{@link module:Collections.reject} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name rejectLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.reject]{@link module:Collections.reject}
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     */
    var rejectLimit = doParallelLimit(reject$1);

    /**
     * The same as [`reject`]{@link module:Collections.reject} but runs only a single async operation at a time.
     *
     * @name rejectSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.reject]{@link module:Collections.reject}
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     */
    var rejectSeries = doLimit(rejectLimit, 1);

    /**
     * Creates a function that returns `value`.
     *
     * @static
     * @memberOf _
     * @since 2.4.0
     * @category Util
     * @param {*} value The value to return from the new function.
     * @returns {Function} Returns the new constant function.
     * @example
     *
     * var objects = _.times(2, _.constant({ 'a': 1 }));
     *
     * console.log(objects);
     * // => [{ 'a': 1 }, { 'a': 1 }]
     *
     * console.log(objects[0] === objects[1]);
     * // => true
     */
    function constant$1(value) {
        return function () {
            return value;
        };
    }

    /**
     * Attempts to get a successful response from `task` no more than `times` times
     * before returning an error. If the task is successful, the `callback` will be
     * passed the result of the successful task. If all attempts fail, the callback
     * will be passed the error and result (if any) of the final attempt.
     *
     * @name retry
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Object|number} [opts = {times: 5, interval: 0}| 5] - Can be either an
     * object with `times` and `interval` or a number.
     * * `times` - The number of attempts to make before giving up.  The default
     *   is `5`.
     * * `interval` - The time to wait between retries, in milliseconds.  The
     *   default is `0`. The interval may also be specified as a function of the
     *   retry count (see example).
     * * `errorFilter` - An optional synchronous function that is invoked on
     *   erroneous result. If it returns `true` the retry attempts will continue;
     *   if the function returns `false` the retry flow is aborted with the current
     *   attempt's error and result being returned to the final callback.
     *   Invoked with (err).
     * * If `opts` is a number, the number specifies the number of times to retry,
     *   with the default interval of `0`.
     * @param {Function} task - A function which receives two arguments: (1) a
     * `callback(err, result)` which must be called when finished, passing `err`
     * (which can be `null`) and the `result` of the function's execution, and (2)
     * a `results` object, containing the results of the previously executed
     * functions (if nested inside another control flow). Invoked with
     * (callback, results).
     * @param {Function} [callback] - An optional callback which is called when the
     * task has succeeded, or after the final failed attempt. It receives the `err`
     * and `result` arguments of the last attempt at completing the `task`. Invoked
     * with (err, results).
     * @example
     *
     * // The `retry` function can be used as a stand-alone control flow by passing
     * // a callback, as shown below:
     *
     * // try calling apiMethod 3 times
     * async.retry(3, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod 3 times, waiting 200 ms between each retry
     * async.retry({times: 3, interval: 200}, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod 10 times with exponential backoff
     * // (i.e. intervals of 100, 200, 400, 800, 1600, ... milliseconds)
     * async.retry({
     *   times: 10,
     *   interval: function(retryCount) {
     *     return 50 * Math.pow(2, retryCount);
     *   }
     * }, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod the default 5 times no delay between each retry
     * async.retry(apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod only when error condition satisfies, all other
     * // errors will abort the retry control flow and return to final callback
     * async.retry({
     *   errorFilter: function(err) {
     *     return err.message === 'Temporary error'; // only retry on a specific error
     *   }
     * }, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // It can also be embedded within other control flow functions to retry
     * // individual methods that are not as reliable, like this:
     * async.auto({
     *     users: api.getUsers.bind(api),
     *     payments: async.retry(3, api.getPayments.bind(api))
     * }, function(err, results) {
     *     // do something with the results
     * });
     *
     */
    function retry(opts, task, callback) {
        var DEFAULT_TIMES = 5;
        var DEFAULT_INTERVAL = 0;

        var options = {
            times: DEFAULT_TIMES,
            intervalFunc: constant$1(DEFAULT_INTERVAL)
        };

        function parseTimes(acc, t) {
            if ((typeof t === 'undefined' ? 'undefined' : _typeof(t)) === 'object') {
                acc.times = +t.times || DEFAULT_TIMES;

                acc.intervalFunc = typeof t.interval === 'function' ? t.interval : constant$1(+t.interval || DEFAULT_INTERVAL);

                acc.errorFilter = t.errorFilter;
            } else if (typeof t === 'number' || typeof t === 'string') {
                acc.times = +t || DEFAULT_TIMES;
            } else {
                throw new Error("Invalid arguments for async.retry");
            }
        }

        if (arguments.length < 3 && typeof opts === 'function') {
            callback = task || noop;
            task = opts;
        } else {
            parseTimes(options, opts);
            callback = callback || noop;
        }

        if (typeof task !== 'function') {
            throw new Error("Invalid arguments for async.retry");
        }

        var attempt = 1;
        function retryAttempt() {
            task(function (err) {
                if (err && attempt++ < options.times && (typeof options.errorFilter != 'function' || options.errorFilter(err))) {
                    setTimeout(retryAttempt, options.intervalFunc(attempt));
                } else {
                    callback.apply(null, arguments);
                }
            });
        }

        retryAttempt();
    }

    /**
     * A close relative of [`retry`]{@link module:ControlFlow.retry}.  This method wraps a task and makes it
     * retryable, rather than immediately calling it with retries.
     *
     * @name retryable
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.retry]{@link module:ControlFlow.retry}
     * @category Control Flow
     * @param {Object|number} [opts = {times: 5, interval: 0}| 5] - optional
     * options, exactly the same as from `retry`
     * @param {Function} task - the asynchronous function to wrap
     * @returns {Functions} The wrapped function, which when invoked, will retry on
     * an error, based on the parameters specified in `opts`.
     * @example
     *
     * async.auto({
     *     dep1: async.retryable(3, getFromFlakyService),
     *     process: ["dep1", async.retryable(3, function (results, cb) {
     *         maybeProcessData(results.dep1, cb);
     *     })]
     * }, callback);
     */
    var retryable = function retryable(opts, task) {
        if (!task) {
            task = opts;
            opts = null;
        }
        return initialParams(function (args, callback) {
            function taskFn(cb) {
                task.apply(null, args.concat([cb]));
            }

            if (opts) retry(opts, taskFn, callback);else retry(taskFn, callback);
        });
    };

    /**
     * Run the functions in the `tasks` collection in series, each one running once
     * the previous function has completed. If any functions in the series pass an
     * error to its callback, no more functions are run, and `callback` is
     * immediately called with the value of the error. Otherwise, `callback`
     * receives an array of results when `tasks` have completed.
     *
     * It is also possible to use an object instead of an array. Each property will
     * be run as a function, and the results will be passed to the final `callback`
     * as an object instead of an array. This can be a more readable way of handling
     *  results from {@link async.series}.
     *
     * **Note** that while many implementations preserve the order of object
     * properties, the [ECMAScript Language Specification](http://www.ecma-international.org/ecma-262/5.1/#sec-8.6)
     * explicitly states that
     *
     * > The mechanics and order of enumerating the properties is not specified.
     *
     * So if you rely on the order in which your series of functions are executed,
     * and want this to work on all platforms, consider using an array.
     *
     * @name series
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|Object} tasks - A collection containing functions to run, each
     * function is passed a `callback(err, result)` it must call on completion with
     * an error `err` (which can be `null`) and an optional `result` value.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed. This function gets a results array (or object)
     * containing all the result arguments passed to the `task` callbacks. Invoked
     * with (err, result).
     * @example
     * async.series([
     *     function(callback) {
     *         // do some stuff ...
     *         callback(null, 'one');
     *     },
     *     function(callback) {
     *         // do some more stuff ...
     *         callback(null, 'two');
     *     }
     * ],
     * // optional callback
     * function(err, results) {
     *     // results is now equal to ['one', 'two']
     * });
     *
     * async.series({
     *     one: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 1);
     *         }, 200);
     *     },
     *     two: function(callback){
     *         setTimeout(function() {
     *             callback(null, 2);
     *         }, 100);
     *     }
     * }, function(err, results) {
     *     // results is now equal to: {one: 1, two: 2}
     * });
     */
    function series(tasks, callback) {
        _parallel(eachOfSeries, tasks, callback);
    }

    /**
     * Returns `true` if at least one element in the `coll` satisfies an async test.
     * If any iteratee call returns `true`, the main `callback` is immediately
     * called.
     *
     * @name some
     * @static
     * @memberOf module:Collections
     * @method
     * @alias any
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in the array
     * in parallel. The iteratee is passed a `callback(err, truthValue)` which must
     * be called with a boolean argument once it has completed. Invoked with
     * (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the iteratee functions have finished.
     * Result will be either `true` or `false` depending on the values of the async
     * tests. Invoked with (err, result).
     * @example
     *
     * async.some(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, result) {
     *     // if result is true then at least one of the files exists
     * });
     */
    var some = _createTester(eachOf, Boolean, identity);

    /**
     * The same as [`some`]{@link module:Collections.some} but runs a maximum of `limit` async operations at a time.
     *
     * @name someLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.some]{@link module:Collections.some}
     * @alias anyLimit
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A truth test to apply to each item in the array
     * in parallel. The iteratee is passed a `callback(err, truthValue)` which must
     * be called with a boolean argument once it has completed. Invoked with
     * (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the iteratee functions have finished.
     * Result will be either `true` or `false` depending on the values of the async
     * tests. Invoked with (err, result).
     */
    var someLimit = _createTester(eachOfLimit, Boolean, identity);

    /**
     * The same as [`some`]{@link module:Collections.some} but runs only a single async operation at a time.
     *
     * @name someSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.some]{@link module:Collections.some}
     * @alias anySeries
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in the array
     * in parallel. The iteratee is passed a `callback(err, truthValue)` which must
     * be called with a boolean argument once it has completed. Invoked with
     * (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the iteratee functions have finished.
     * Result will be either `true` or `false` depending on the values of the async
     * tests. Invoked with (err, result).
     */
    var someSeries = doLimit(someLimit, 1);

    /**
     * Sorts a list by the results of running each `coll` value through an async
     * `iteratee`.
     *
     * @name sortBy
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A function to apply to each item in `coll`.
     * The iteratee is passed a `callback(err, sortValue)` which must be called once
     * it has completed with an error (which can be `null`) and a value to use as
     * the sort criteria. Invoked with (item, callback).
     * @param {Function} callback - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is the items
     * from the original `coll` sorted by the values returned by the `iteratee`
     * calls. Invoked with (err, results).
     * @example
     *
     * async.sortBy(['file1','file2','file3'], function(file, callback) {
     *     fs.stat(file, function(err, stats) {
     *         callback(err, stats.mtime);
     *     });
     * }, function(err, results) {
     *     // results is now the original array of files sorted by
     *     // modified date
     * });
     *
     * // By modifying the callback parameter the
     * // sorting order can be influenced:
     *
     * // ascending order
     * async.sortBy([1,9,3,5], function(x, callback) {
     *     callback(null, x);
     * }, function(err,result) {
     *     // result callback
     * });
     *
     * // descending order
     * async.sortBy([1,9,3,5], function(x, callback) {
     *     callback(null, x*-1);    //<- x*-1 instead of x, turns the order around
     * }, function(err,result) {
     *     // result callback
     * });
     */
    function sortBy(coll, iteratee, callback) {
        map(coll, function (x, callback) {
            iteratee(x, function (err, criteria) {
                if (err) return callback(err);
                callback(null, { value: x, criteria: criteria });
            });
        }, function (err, results) {
            if (err) return callback(err);
            callback(null, arrayMap(results.sort(comparator), baseProperty('value')));
        });

        function comparator(left, right) {
            var a = left.criteria,
                b = right.criteria;
            return a < b ? -1 : a > b ? 1 : 0;
        }
    }

    /**
     * Sets a time limit on an asynchronous function. If the function does not call
     * its callback within the specified milliseconds, it will be called with a
     * timeout error. The code property for the error object will be `'ETIMEDOUT'`.
     *
     * @name timeout
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} asyncFn - The asynchronous function you want to set the
     * time limit.
     * @param {number} milliseconds - The specified time limit.
     * @param {*} [info] - Any variable you want attached (`string`, `object`, etc)
     * to timeout Error for more information..
     * @returns {Function} Returns a wrapped function that can be used with any of
     * the control flow functions. Invoke this function with the same
     * parameters as you would `asyncFunc`.
     * @example
     *
     * function myFunction(foo, callback) {
     *     doAsyncTask(foo, function(err, data) {
     *         // handle errors
     *         if (err) return callback(err);
     *
     *         // do some stuff ...
     *
     *         // return processed data
     *         return callback(null, data);
     *     });
     * }
     *
     * var wrapped = async.timeout(myFunction, 1000);
     *
     * // call `wrapped` as you would `myFunction`
     * wrapped({ bar: 'bar' }, function(err, data) {
     *     // if `myFunction` takes < 1000 ms to execute, `err`
     *     // and `data` will have their expected values
     *
     *     // else `err` will be an Error with the code 'ETIMEDOUT'
     * });
     */
    function timeout(asyncFn, milliseconds, info) {
        var originalCallback, timer;
        var timedOut = false;

        function injectedCallback() {
            if (!timedOut) {
                originalCallback.apply(null, arguments);
                clearTimeout(timer);
            }
        }

        function timeoutCallback() {
            var name = asyncFn.name || 'anonymous';
            var error = new Error('Callback function "' + name + '" timed out.');
            error.code = 'ETIMEDOUT';
            if (info) {
                error.info = info;
            }
            timedOut = true;
            originalCallback(error);
        }

        return initialParams(function (args, origCallback) {
            originalCallback = origCallback;
            // setup timer and call original function
            timer = setTimeout(timeoutCallback, milliseconds);
            asyncFn.apply(null, args.concat(injectedCallback));
        });
    }

    /* Built-in method references for those with the same name as other `lodash` methods. */
    var nativeCeil = Math.ceil;
    var nativeMax$1 = Math.max;

    /**
     * The base implementation of `_.range` and `_.rangeRight` which doesn't
     * coerce arguments.
     *
     * @private
     * @param {number} start The start of the range.
     * @param {number} end The end of the range.
     * @param {number} step The value to increment or decrement by.
     * @param {boolean} [fromRight] Specify iterating from right to left.
     * @returns {Array} Returns the range of numbers.
     */
    function baseRange(start, end, step, fromRight) {
        var index = -1,
            length = nativeMax$1(nativeCeil((end - start) / (step || 1)), 0),
            result = Array(length);

        while (length--) {
            result[fromRight ? length : ++index] = start;
            start += step;
        }
        return result;
    }

    /**
     * The same as [times]{@link module:ControlFlow.times} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name timesLimit
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.times]{@link module:ControlFlow.times}
     * @category Control Flow
     * @param {number} count - The number of times to run the function.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - The function to call `n` times. Invoked with the
     * iteration index and a callback (n, next).
     * @param {Function} callback - see [async.map]{@link module:Collections.map}.
     */
    function timeLimit(count, limit, iteratee, callback) {
        mapLimit(baseRange(0, count, 1), limit, iteratee, callback);
    }

    /**
     * Calls the `iteratee` function `n` times, and accumulates results in the same
     * manner you would use with [map]{@link module:Collections.map}.
     *
     * @name times
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.map]{@link module:Collections.map}
     * @category Control Flow
     * @param {number} n - The number of times to run the function.
     * @param {Function} iteratee - The function to call `n` times. Invoked with the
     * iteration index and a callback (n, next).
     * @param {Function} callback - see {@link module:Collections.map}.
     * @example
     *
     * // Pretend this is some complicated async factory
     * var createUser = function(id, callback) {
     *     callback(null, {
     *         id: 'user' + id
     *     });
     * };
     *
     * // generate 5 users
     * async.times(5, function(n, next) {
     *     createUser(n, function(err, user) {
     *         next(err, user);
     *     });
     * }, function(err, users) {
     *     // we should now have 5 users
     * });
     */
    var times = doLimit(timeLimit, Infinity);

    /**
     * The same as [times]{@link module:ControlFlow.times} but runs only a single async operation at a time.
     *
     * @name timesSeries
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.times]{@link module:ControlFlow.times}
     * @category Control Flow
     * @param {number} n - The number of times to run the function.
     * @param {Function} iteratee - The function to call `n` times. Invoked with the
     * iteration index and a callback (n, next).
     * @param {Function} callback - see {@link module:Collections.map}.
     */
    var timesSeries = doLimit(timeLimit, 1);

    /**
     * A relative of `reduce`.  Takes an Object or Array, and iterates over each
     * element in series, each step potentially mutating an `accumulator` value.
     * The type of the accumulator defaults to the type of collection passed in.
     *
     * @name transform
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|Object} coll - A collection to iterate over.
     * @param {*} [accumulator] - The initial state of the transform.  If omitted,
     * it will default to an empty Object or Array, depending on the type of `coll`
     * @param {Function} iteratee - A function applied to each item in the
     * collection that potentially modifies the accumulator. The `iteratee` is
     * passed a `callback(err)` which accepts an optional error as its first
     * argument. If an error is passed to the callback, the transform is stopped
     * and the main `callback` is immediately called with the error.
     * Invoked with (accumulator, item, key, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result is the transformed accumulator.
     * Invoked with (err, result).
     * @example
     *
     * async.transform([1,2,3], function(acc, item, index, callback) {
     *     // pointless async:
     *     process.nextTick(function() {
     *         acc.push(item * 2)
     *         callback(null)
     *     });
     * }, function(err, result) {
     *     // result is now equal to [2, 4, 6]
     * });
     *
     * @example
     *
     * async.transform({a: 1, b: 2, c: 3}, function (obj, val, key, callback) {
     *     setImmediate(function () {
     *         obj[key] = val * 2;
     *         callback();
     *     })
     * }, function (err, result) {
     *     // result is equal to {a: 2, b: 4, c: 6}
     * })
     */
    function transform(coll, accumulator, iteratee, callback) {
        if (arguments.length === 3) {
            callback = iteratee;
            iteratee = accumulator;
            accumulator = isArray(coll) ? [] : {};
        }
        callback = once(callback || noop);

        eachOf(coll, function (v, k, cb) {
            iteratee(accumulator, v, k, cb);
        }, function (err) {
            callback(err, accumulator);
        });
    }

    /**
     * Undoes a [memoize]{@link module:Utils.memoize}d function, reverting it to the original,
     * unmemoized form. Handy for testing.
     *
     * @name unmemoize
     * @static
     * @memberOf module:Utils
     * @method
     * @see [async.memoize]{@link module:Utils.memoize}
     * @category Util
     * @param {Function} fn - the memoized function
     * @returns {Function} a function that calls the original unmemoized function
     */
    function unmemoize(fn) {
        return function () {
            return (fn.unmemoized || fn).apply(null, arguments);
        };
    }

    /**
     * Repeatedly call `iteratee`, while `test` returns `true`. Calls `callback` when
     * stopped, or an error occurs.
     *
     * @name whilst
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Function} test - synchronous truth test to perform before each
     * execution of `iteratee`. Invoked with ().
     * @param {Function} iteratee - A function which is called each time `test` passes.
     * The function is passed a `callback(err)`, which must be called once it has
     * completed with an optional `err` argument. Invoked with (callback).
     * @param {Function} [callback] - A callback which is called after the test
     * function has failed and repeated execution of `iteratee` has stopped. `callback`
     * will be passed an error and any arguments passed to the final `iteratee`'s
     * callback. Invoked with (err, [results]);
     * @returns undefined
     * @example
     *
     * var count = 0;
     * async.whilst(
     *     function() { return count < 5; },
     *     function(callback) {
     *         count++;
     *         setTimeout(function() {
     *             callback(null, count);
     *         }, 1000);
     *     },
     *     function (err, n) {
     *         // 5 seconds have passed, n = 5
     *     }
     * );
     */
    function whilst(test, iteratee, callback) {
        callback = onlyOnce(callback || noop);
        if (!test()) return callback(null);
        var next = rest(function (err, args) {
            if (err) return callback(err);
            if (test()) return iteratee(next);
            callback.apply(null, [null].concat(args));
        });
        iteratee(next);
    }

    /**
     * Repeatedly call `fn` until `test` returns `true`. Calls `callback` when
     * stopped, or an error occurs. `callback` will be passed an error and any
     * arguments passed to the final `fn`'s callback.
     *
     * The inverse of [whilst]{@link module:ControlFlow.whilst}.
     *
     * @name until
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.whilst]{@link module:ControlFlow.whilst}
     * @category Control Flow
     * @param {Function} test - synchronous truth test to perform before each
     * execution of `fn`. Invoked with ().
     * @param {Function} fn - A function which is called each time `test` fails.
     * The function is passed a `callback(err)`, which must be called once it has
     * completed with an optional `err` argument. Invoked with (callback).
     * @param {Function} [callback] - A callback which is called after the test
     * function has passed and repeated execution of `fn` has stopped. `callback`
     * will be passed an error and any arguments passed to the final `fn`'s
     * callback. Invoked with (err, [results]);
     */
    function until(test, fn, callback) {
        whilst(function () {
            return !test.apply(this, arguments);
        }, fn, callback);
    }

    /**
     * Runs the `tasks` array of functions in series, each passing their results to
     * the next in the array. However, if any of the `tasks` pass an error to their
     * own callback, the next function is not executed, and the main `callback` is
     * immediately called with the error.
     *
     * @name waterfall
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array} tasks - An array of functions to run, each function is passed
     * a `callback(err, result1, result2, ...)` it must call on completion. The
     * first argument is an error (which can be `null`) and any further arguments
     * will be passed as arguments in order to the next task.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed. This will be passed the results of the last task's
     * callback. Invoked with (err, [results]).
     * @returns undefined
     * @example
     *
     * async.waterfall([
     *     function(callback) {
     *         callback(null, 'one', 'two');
     *     },
     *     function(arg1, arg2, callback) {
     *         // arg1 now equals 'one' and arg2 now equals 'two'
     *         callback(null, 'three');
     *     },
     *     function(arg1, callback) {
     *         // arg1 now equals 'three'
     *         callback(null, 'done');
     *     }
     * ], function (err, result) {
     *     // result now equals 'done'
     * });
     *
     * // Or, with named functions:
     * async.waterfall([
     *     myFirstFunction,
     *     mySecondFunction,
     *     myLastFunction,
     * ], function (err, result) {
     *     // result now equals 'done'
     * });
     * function myFirstFunction(callback) {
     *     callback(null, 'one', 'two');
     * }
     * function mySecondFunction(arg1, arg2, callback) {
     *     // arg1 now equals 'one' and arg2 now equals 'two'
     *     callback(null, 'three');
     * }
     * function myLastFunction(arg1, callback) {
     *     // arg1 now equals 'three'
     *     callback(null, 'done');
     * }
     */
    var waterfall = function waterfall(tasks, callback) {
        callback = once(callback || noop);
        if (!isArray(tasks)) return callback(new Error('First argument to waterfall must be an array of functions'));
        if (!tasks.length) return callback();
        var taskIndex = 0;

        function nextTask(args) {
            if (taskIndex === tasks.length) {
                return callback.apply(null, [null].concat(args));
            }

            var taskCallback = onlyOnce(rest(function (err, args) {
                if (err) {
                    return callback.apply(null, [err].concat(args));
                }
                nextTask(args);
            }));

            args.push(taskCallback);

            var task = tasks[taskIndex++];
            task.apply(null, args);
        }

        nextTask([]);
    };

    /**
     * Async is a utility module which provides straight-forward, powerful functions
     * for working with asynchronous JavaScript. Although originally designed for
     * use with [Node.js](http://nodejs.org) and installable via
     * `npm install --save async`, it can also be used directly in the browser.
     * @module async
     */

    /**
     * A collection of `async` functions for manipulating collections, such as
     * arrays and objects.
     * @module Collections
     */

    /**
     * A collection of `async` functions for controlling the flow through a script.
     * @module ControlFlow
     */

    /**
     * A collection of `async` utility functions.
     * @module Utils
     */
    var index = {
        applyEach: applyEach,
        applyEachSeries: applyEachSeries,
        apply: apply$2,
        asyncify: asyncify,
        auto: auto,
        autoInject: autoInject,
        cargo: cargo,
        compose: compose,
        concat: concat,
        concatSeries: concatSeries,
        constant: constant,
        detect: detect,
        detectLimit: detectLimit,
        detectSeries: detectSeries,
        dir: dir,
        doDuring: doDuring,
        doUntil: doUntil,
        doWhilst: doWhilst,
        during: during,
        each: eachLimit,
        eachLimit: eachLimit$1,
        eachOf: eachOf,
        eachOfLimit: eachOfLimit,
        eachOfSeries: eachOfSeries,
        eachSeries: eachSeries,
        ensureAsync: ensureAsync,
        every: every,
        everyLimit: everyLimit,
        everySeries: everySeries,
        filter: filter,
        filterLimit: filterLimit,
        filterSeries: filterSeries,
        forever: forever,
        log: log,
        map: map,
        mapLimit: mapLimit,
        mapSeries: mapSeries,
        mapValues: mapValues,
        mapValuesLimit: mapValuesLimit,
        mapValuesSeries: mapValuesSeries,
        memoize: memoize,
        nextTick: nextTick,
        parallel: parallelLimit,
        parallelLimit: parallelLimit$1,
        priorityQueue: priorityQueue,
        queue: queue$1,
        race: race,
        reduce: reduce,
        reduceRight: reduceRight,
        reflect: reflect,
        reflectAll: reflectAll,
        reject: reject,
        rejectLimit: rejectLimit,
        rejectSeries: rejectSeries,
        retry: retry,
        retryable: retryable,
        seq: seq$1,
        series: series,
        setImmediate: setImmediate$1,
        some: some,
        someLimit: someLimit,
        someSeries: someSeries,
        sortBy: sortBy,
        timeout: timeout,
        times: times,
        timesLimit: timeLimit,
        timesSeries: timesSeries,
        transform: transform,
        unmemoize: unmemoize,
        until: until,
        waterfall: waterfall,
        whilst: whilst,

        // aliases
        all: every,
        any: some,
        forEach: eachLimit,
        forEachSeries: eachSeries,
        forEachLimit: eachLimit$1,
        forEachOf: eachOf,
        forEachOfSeries: eachOfSeries,
        forEachOfLimit: eachOfLimit,
        inject: reduce,
        foldl: reduce,
        foldr: reduceRight,
        select: filter,
        selectLimit: filterLimit,
        selectSeries: filterSeries,
        wrapSync: asyncify
    };

    exports['default'] = index;
    exports.applyEach = applyEach;
    exports.applyEachSeries = applyEachSeries;
    exports.apply = apply$2;
    exports.asyncify = asyncify;
    exports.auto = auto;
    exports.autoInject = autoInject;
    exports.cargo = cargo;
    exports.compose = compose;
    exports.concat = concat;
    exports.concatSeries = concatSeries;
    exports.constant = constant;
    exports.detect = detect;
    exports.detectLimit = detectLimit;
    exports.detectSeries = detectSeries;
    exports.dir = dir;
    exports.doDuring = doDuring;
    exports.doUntil = doUntil;
    exports.doWhilst = doWhilst;
    exports.during = during;
    exports.each = eachLimit;
    exports.eachLimit = eachLimit$1;
    exports.eachOf = eachOf;
    exports.eachOfLimit = eachOfLimit;
    exports.eachOfSeries = eachOfSeries;
    exports.eachSeries = eachSeries;
    exports.ensureAsync = ensureAsync;
    exports.every = every;
    exports.everyLimit = everyLimit;
    exports.everySeries = everySeries;
    exports.filter = filter;
    exports.filterLimit = filterLimit;
    exports.filterSeries = filterSeries;
    exports.forever = forever;
    exports.log = log;
    exports.map = map;
    exports.mapLimit = mapLimit;
    exports.mapSeries = mapSeries;
    exports.mapValues = mapValues;
    exports.mapValuesLimit = mapValuesLimit;
    exports.mapValuesSeries = mapValuesSeries;
    exports.memoize = memoize;
    exports.nextTick = nextTick;
    exports.parallel = parallelLimit;
    exports.parallelLimit = parallelLimit$1;
    exports.priorityQueue = priorityQueue;
    exports.queue = queue$1;
    exports.race = race;
    exports.reduce = reduce;
    exports.reduceRight = reduceRight;
    exports.reflect = reflect;
    exports.reflectAll = reflectAll;
    exports.reject = reject;
    exports.rejectLimit = rejectLimit;
    exports.rejectSeries = rejectSeries;
    exports.retry = retry;
    exports.retryable = retryable;
    exports.seq = seq$1;
    exports.series = series;
    exports.setImmediate = setImmediate$1;
    exports.some = some;
    exports.someLimit = someLimit;
    exports.someSeries = someSeries;
    exports.sortBy = sortBy;
    exports.timeout = timeout;
    exports.times = times;
    exports.timesLimit = timeLimit;
    exports.timesSeries = timesSeries;
    exports.transform = transform;
    exports.unmemoize = unmemoize;
    exports.until = until;
    exports.waterfall = waterfall;
    exports.whilst = whilst;
    exports.all = every;
    exports.allLimit = everyLimit;
    exports.allSeries = everySeries;
    exports.any = some;
    exports.anyLimit = someLimit;
    exports.anySeries = someSeries;
    exports.find = detect;
    exports.findLimit = detectLimit;
    exports.findSeries = detectSeries;
    exports.forEach = eachLimit;
    exports.forEachSeries = eachSeries;
    exports.forEachLimit = eachLimit$1;
    exports.forEachOf = eachOf;
    exports.forEachOfSeries = eachOfSeries;
    exports.forEachOfLimit = eachOfLimit;
    exports.inject = reduce;
    exports.foldl = reduce;
    exports.foldr = reduceRight;
    exports.select = filter;
    exports.selectLimit = filterLimit;
    exports.selectSeries = filterSeries;
    exports.wrapSync = asyncify;

    Object.defineProperty(exports, '__esModule', { value: true });
});
/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(8)(module)))

/***/ }),
/* 4 */
/***/ (function(module, exports) {

module.exports = require("child_process");

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (args, opts) {
    if (!opts) opts = {};

    var flags = { bools: {}, strings: {}, unknownFn: null };

    if (typeof opts['unknown'] === 'function') {
        flags.unknownFn = opts['unknown'];
    }

    if (typeof opts['boolean'] === 'boolean' && opts['boolean']) {
        flags.allBools = true;
    } else {
        [].concat(opts['boolean']).filter(Boolean).forEach(function (key) {
            flags.bools[key] = true;
        });
    }

    var aliases = {};
    Object.keys(opts.alias || {}).forEach(function (key) {
        aliases[key] = [].concat(opts.alias[key]);
        aliases[key].forEach(function (x) {
            aliases[x] = [key].concat(aliases[key].filter(function (y) {
                return x !== y;
            }));
        });
    });

    [].concat(opts.string).filter(Boolean).forEach(function (key) {
        flags.strings[key] = true;
        if (aliases[key]) {
            flags.strings[aliases[key]] = true;
        }
    });

    var defaults = opts['default'] || {};

    var argv = { _: [] };
    Object.keys(flags.bools).forEach(function (key) {
        setArg(key, defaults[key] === undefined ? false : defaults[key]);
    });

    var notFlags = [];

    if (args.indexOf('--') !== -1) {
        notFlags = args.slice(args.indexOf('--') + 1);
        args = args.slice(0, args.indexOf('--'));
    }

    function argDefined(key, arg) {
        return flags.allBools && /^--[^=]+$/.test(arg) || flags.strings[key] || flags.bools[key] || aliases[key];
    }

    function setArg(key, val, arg) {
        if (arg && flags.unknownFn && !argDefined(key, arg)) {
            if (flags.unknownFn(arg) === false) return;
        }

        var value = !flags.strings[key] && isNumber(val) ? Number(val) : val;
        setKey(argv, key.split('.'), value);

        (aliases[key] || []).forEach(function (x) {
            setKey(argv, x.split('.'), value);
        });
    }

    function setKey(obj, keys, value) {
        var o = obj;
        keys.slice(0, -1).forEach(function (key) {
            if (o[key] === undefined) o[key] = {};
            o = o[key];
        });

        var key = keys[keys.length - 1];
        if (o[key] === undefined || flags.bools[key] || typeof o[key] === 'boolean') {
            o[key] = value;
        } else if (Array.isArray(o[key])) {
            o[key].push(value);
        } else {
            o[key] = [o[key], value];
        }
    }

    function aliasIsBoolean(key) {
        return aliases[key].some(function (x) {
            return flags.bools[x];
        });
    }

    for (var i = 0; i < args.length; i++) {
        var arg = args[i];

        if (/^--.+=/.test(arg)) {
            // Using [\s\S] instead of . because js doesn't support the
            // 'dotall' regex modifier. See:
            // http://stackoverflow.com/a/1068308/13216
            var m = arg.match(/^--([^=]+)=([\s\S]*)$/);
            var key = m[1];
            var value = m[2];
            if (flags.bools[key]) {
                value = value !== 'false';
            }
            setArg(key, value, arg);
        } else if (/^--no-.+/.test(arg)) {
            var key = arg.match(/^--no-(.+)/)[1];
            setArg(key, false, arg);
        } else if (/^--.+/.test(arg)) {
            var key = arg.match(/^--(.+)/)[1];
            var next = args[i + 1];
            if (next !== undefined && !/^-/.test(next) && !flags.bools[key] && !flags.allBools && (aliases[key] ? !aliasIsBoolean(key) : true)) {
                setArg(key, next, arg);
                i++;
            } else if (/^(true|false)$/.test(next)) {
                setArg(key, next === 'true', arg);
                i++;
            } else {
                setArg(key, flags.strings[key] ? '' : true, arg);
            }
        } else if (/^-[^-]+/.test(arg)) {
            var letters = arg.slice(1, -1).split('');

            var broken = false;
            for (var j = 0; j < letters.length; j++) {
                var next = arg.slice(j + 2);

                if (next === '-') {
                    setArg(letters[j], next, arg);
                    continue;
                }

                if (/[A-Za-z]/.test(letters[j]) && /=/.test(next)) {
                    setArg(letters[j], next.split('=')[1], arg);
                    broken = true;
                    break;
                }

                if (/[A-Za-z]/.test(letters[j]) && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
                    setArg(letters[j], next, arg);
                    broken = true;
                    break;
                }

                if (letters[j + 1] && letters[j + 1].match(/\W/)) {
                    setArg(letters[j], arg.slice(j + 2), arg);
                    broken = true;
                    break;
                } else {
                    setArg(letters[j], flags.strings[letters[j]] ? '' : true, arg);
                }
            }

            var key = arg.slice(-1)[0];
            if (!broken && key !== '-') {
                if (args[i + 1] && !/^(-|--)[^-]/.test(args[i + 1]) && !flags.bools[key] && (aliases[key] ? !aliasIsBoolean(key) : true)) {
                    setArg(key, args[i + 1], arg);
                    i++;
                } else if (args[i + 1] && /true|false/.test(args[i + 1])) {
                    setArg(key, args[i + 1] === 'true', arg);
                    i++;
                } else {
                    setArg(key, flags.strings[key] ? '' : true, arg);
                }
            }
        } else {
            if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
                argv._.push(flags.strings['_'] || !isNumber(arg) ? arg : Number(arg));
            }
            if (opts.stopEarly) {
                argv._.push.apply(argv._, args.slice(i + 1));
                break;
            }
        }
    }

    Object.keys(defaults).forEach(function (key) {
        if (!hasKey(argv, key.split('.'))) {
            setKey(argv, key.split('.'), defaults[key]);

            (aliases[key] || []).forEach(function (x) {
                setKey(argv, x.split('.'), defaults[key]);
            });
        }
    });

    if (opts['--']) {
        argv['--'] = new Array();
        notFlags.forEach(function (key) {
            argv['--'].push(key);
        });
    } else {
        notFlags.forEach(function (key) {
            argv._.push(key);
        });
    }

    return argv;
};

function hasKey(obj, keys) {
    var o = obj;
    keys.slice(0, -1).forEach(function (key) {
        o = o[key] || {};
    });

    var key = keys[keys.length - 1];
    return key in o;
}

function isNumber(x) {
    if (typeof x === 'number') return true;
    if (/^0x[0-9a-f]+$/i.test(x)) return true;
    return (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x)
    );
}

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.isFile = isFile;
exports.isDirectory = isDirectory;
exports.filesOfType = filesOfType;
exports.readDir = readDir;
var fs = __webpack_require__(1);
var mime = __webpack_require__(32);

/**
 * return a promise that resolves a boolean to determine if the given path is a file
 * @param path
 * @returns {Promise}
 */
function isFile(path) {
    return new Promise(function (resolve, reject) {
        fs.stat(path, function (err, stats) {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isFile());
            }
        });
    });
}

/**
 * return a promise that resolves a boolean to determine if the given path is a directory
 * @param path
 * @returns {Promise}
 */
function isDirectory(path) {
    return new Promise(function (resolve, reject) {
        fs.stat(path, function (err, stats) {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isDirectory());
            }
        });
    });
}

/**
 * given a path to a file or directory, return an array that includes all of the files that match
 * the given mimeType
 * @param path
 * @param mimeType
 * @returns {Promise}
 */
function filesOfType(path, mimeType) {
    return new Promise(function (resolve, reject) {
        // check if the path is a file and resolve an array with just the file if it matches the mimeType
        isFile(path).then(function (pathIsFile) {
            if (pathIsFile) {
                var files = [path];
                resolve(filterOnMimeType(files));
            } else {
                // read directory and filter down files that match the mimeType
                readDir(path).then(function (files) {
                    resolve(filterOnMimeType(files));
                }).catch(reject);
            }
        }).catch(reject);

        function filterOnMimeType(files) {
            return files.filter(function (file) {
                return mime.lookup(file).indexOf(mimeType) > -1;
            });
        }
    });
}

/**
 * return a Promise that resolves an array of all of the files in a given directory
 * @param dir
 * @returns {Promise}
 */
function readDir(dir) {
    return new Promise(function (resolve, reject) {
        fs.readdir(dir, function (err, files) {
            if (err) {
                reject(err);
            } else {
                resolve(files);
            }
        });
    });
}

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function () {
	return (/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
	);
};

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (module) {
	if (!module.webpackPolyfill) {
		module.deprecate = function () {};
		module.paths = [];
		// module.parent = undefined by default
		if (!module.children) module.children = [];
		Object.defineProperty(module, "loaded", {
			enumerable: true,
			get: function get() {
				return module.l;
			}
		});
		Object.defineProperty(module, "id", {
			enumerable: true,
			get: function get() {
				return module.i;
			}
		});
		module.webpackPolyfill = 1;
	}
	return module;
};

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var escapeStringRegexp = __webpack_require__(14);
var ansiStyles = __webpack_require__(13);
var stripAnsi = __webpack_require__(33);
var hasAnsi = __webpack_require__(27);
var supportsColor = __webpack_require__(34);
var defineProps = Object.defineProperties;
var isSimpleWindowsTerm = process.platform === 'win32' && !/^xterm/i.test(process.env.TERM);

function Chalk(options) {
	// detect mode if not set manually
	this.enabled = !options || options.enabled === undefined ? supportsColor : options.enabled;
}

// use bright blue on Windows as the normal blue color is illegible
if (isSimpleWindowsTerm) {
	ansiStyles.blue.open = '\x1B[94m';
}

var styles = function () {
	var ret = {};

	Object.keys(ansiStyles).forEach(function (key) {
		ansiStyles[key].closeRe = new RegExp(escapeStringRegexp(ansiStyles[key].close), 'g');

		ret[key] = {
			get: function get() {
				return build.call(this, this._styles.concat(key));
			}
		};
	});

	return ret;
}();

var proto = defineProps(function chalk() {}, styles);

function build(_styles) {
	var builder = function builder() {
		return applyStyle.apply(builder, arguments);
	};

	builder._styles = _styles;
	builder.enabled = this.enabled;
	// __proto__ is used because we must return a function, but there is
	// no way to create a function with a different prototype.
	/* eslint-disable no-proto */
	builder.__proto__ = proto;

	return builder;
}

function applyStyle() {
	// support varags, but simply cast to string in case there's only one arg
	var args = arguments;
	var argsLen = args.length;
	var str = argsLen !== 0 && String(arguments[0]);

	if (argsLen > 1) {
		// don't slice `arguments`, it prevents v8 optimizations
		for (var a = 1; a < argsLen; a++) {
			str += ' ' + args[a];
		}
	}

	if (!this.enabled || !str) {
		return str;
	}

	var nestedStyles = this._styles;
	var i = nestedStyles.length;

	// Turns out that on Windows dimmed gray text becomes invisible in cmd.exe,
	// see https://github.com/chalk/chalk/issues/58
	// If we're on Windows and we're dealing with a gray color, temporarily make 'dim' a noop.
	var originalDim = ansiStyles.dim.open;
	if (isSimpleWindowsTerm && (nestedStyles.indexOf('gray') !== -1 || nestedStyles.indexOf('grey') !== -1)) {
		ansiStyles.dim.open = '';
	}

	while (i--) {
		var code = ansiStyles[nestedStyles[i]];

		// Replace any instances already present with a re-opening code
		// otherwise only the part of the string until said closing code
		// will be colored, and the rest will simply be 'plain'.
		str = code.open + str.replace(code.closeRe, code.open) + code.close;
	}

	// Reset the original 'dim' if we changed it to work around the Windows dimmed gray issue.
	ansiStyles.dim.open = originalDim;

	return str;
}

function init() {
	var ret = {};

	Object.keys(styles).forEach(function (name) {
		ret[name] = {
			get: function get() {
				return build.call(this, [name]);
			}
		};
	});

	return ret;
}

defineProps(Chalk.prototype, init());

module.exports = new Chalk();
module.exports.styles = ansiStyles;
module.exports.hasColor = hasAnsi;
module.exports.stripColor = stripAnsi;
module.exports.supportsColor = supportsColor;

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.firstArgIsFile = firstArgIsFile;
exports.firstArgIsDirectory = firstArgIsDirectory;
exports.parseOptsWithDefaults = parseOptsWithDefaults;

var _fs = __webpack_require__(6);

var args = __webpack_require__(5)(process.argv.slice(2));

function firstArgIsFile() {
    var fullPath = process.cwd() + "/" + process.argv[2];
    return (0, _fs.isFile)(fullPath);
}

function firstArgIsDirectory() {
    var fullPath = process.cwd() + "/" + process.argv[2];
    return (0, _fs.isDirectory)(fullPath);
}

function parseOptsWithDefaults(opts) {
    return {
        bitrate: parseBitrate(opts) || 320,
        quiet: opts.quiet || false
    };
}

function parseBitrate(opts) {
    if (opts.bitrate && !isNaN(parseInt(opts.bitrate))) {
        return parseInt(opts.bitrate);
    }
}

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.encodeMP3 = encodeMP3;

var _index = __webpack_require__(12);

var ffmpeg = __webpack_require__(17);

function encodeMP3(root, files, opts) {
    return new Promise(function (resolve, reject) {
        var doneCount = 0;
        // clone file list to avoid increasing loop size
        files = Object.assign([], files);
        // iterate over files and convert each to mp3 format
        files.forEach(function (file) {
            try {
                (function () {
                    var fullPath = root + '/' + file;

                    var savePath = fullPath;
                    if (!/.mp3$/.test(file)) {
                        savePath = fullPath + '.mp3';
                    }

                    ffmpeg().input(fullPath).audioCodec('libmp3lame').audioBitrate(opts.bitrate)
                    // save the file as <the original file>.mp3
                    .save(savePath)
                    // log messages for start and end
                    .on('start', function () {
                        (0, _index.log)('starting ' + file + '...');
                    })
                    // resolve the promise when all of the files have finished converting
                    .on('end', function () {
                        (0, _index.log)(savePath + ' done', 'success');
                        doneCount += 1;
                        if (doneCount === files.length) {
                            resolve();
                        }
                    });
                })();
            } catch (e) {
                reject(e);
            }
        });
    });
}

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.log = log;

var _arg = __webpack_require__(10);

var _fs = __webpack_require__(6);

var _ffmpeg = __webpack_require__(11);

var options = (0, _arg.parseOptsWithDefaults)(__webpack_require__(5)(process.argv.slice(3)));

// TODO handle converting mp3 files. currently the file will be truncated
// TODO write tests

main().catch(function (e) {
    printErr(e);
    process.exit(options.quiet ? 0 : 1);
});

/**
 * starting point for CLI
 * @returns {Promise}
 */
function main() {
    var path = process.argv[2];

    return new Promise(function (resolve, reject) {
        validateArgs(path).then(function () {
            (0, _fs.filesOfType)(path, 'audio').then(function (files) {
                if (files.length) {
                    log("Converting " + files.length + " files to mp3 at " + options.bitrate + " kbps...", 'info');
                    (0, _ffmpeg.encodeMP3)(process.cwd(), files, options).then(function () {
                        log('All files successfully converted.', 'info');
                    }).catch(reject);
                } else {
                    log('No files found for conversion.', 'info');
                }
            });
        }).catch(reject);
    });
}

/**
 * validate arguments to ensure a valid directory or path to a file have been passed as the second
 * argument
 * @returns {Promise}
 */
function validateArgs(path) {
    return new Promise(function (resolve, reject) {
        (0, _fs.isFile)(path).then(function (isFile) {
            if (isFile) {
                resolve(true);
            } else {
                (0, _fs.isDirectory)(path).then(function (isDirectory) {
                    if (isDirectory) {
                        resolve(true);
                    } else {
                        reject(new Error('Supplied path is not a file nor directory.'));
                    }
                }).catch(reject);
            }
        }).catch(reject);
    });
}

function log(msg, type) {
    var chalk = __webpack_require__(9);
    switch (type) {
        case 'error':
            msg = chalk.red(msg);
            break;
        case 'info':
            msg = chalk.blue(msg);
            break;
        case 'success':
            msg = chalk.green(msg);
            break;
        default:
            msg = chalk.grey(msg);
            break;
    }
    if (!options.quiet) {
        console.log(msg);
    }
}

function printErr(err) {
    log(err, 'error');
}

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(module) {

function assembleStyles() {
	var styles = {
		modifiers: {
			reset: [0, 0],
			bold: [1, 22], // 21 isn't widely supported and 22 does the same thing
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29]
		},
		colors: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],
			gray: [90, 39]
		},
		bgColors: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49]
		}
	};

	// fix humans
	styles.colors.grey = styles.colors.gray;

	Object.keys(styles).forEach(function (groupName) {
		var group = styles[groupName];

		Object.keys(group).forEach(function (styleName) {
			var style = group[styleName];

			styles[styleName] = group[styleName] = {
				open: '\x1B[' + style[0] + 'm',
				close: '\x1B[' + style[1] + 'm'
			};
		});

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false
		});
	});

	return styles;
}

Object.defineProperty(module, 'exports', {
	enumerable: true,
	get: assembleStyles
});
/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(8)(module)))

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

module.exports = function (str) {
	if (typeof str !== 'string') {
		throw new TypeError('Expected a string');
	}

	return str.replace(matchOperatorsRe, '\\$&');
};

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var fs = __webpack_require__(1);
var path = __webpack_require__(2);
var async = __webpack_require__(3);
var utils = __webpack_require__(0);

/*
 *! Capability helpers
 */

var avCodecRegexp = /^\s*([D ])([E ])([VAS])([S ])([D ])([T ]) ([^ ]+) +(.*)$/;
var ffCodecRegexp = /^\s*([D\.])([E\.])([VAS])([I\.])([L\.])([S\.]) ([^ ]+) +(.*)$/;
var ffEncodersRegexp = /\(encoders:([^\)]+)\)/;
var ffDecodersRegexp = /\(decoders:([^\)]+)\)/;
var encodersRegexp = /^\s*([VAS\.])([F\.])([S\.])([X\.])([B\.])([D\.]) ([^ ]+) +(.*)$/;
var formatRegexp = /^\s*([D ])([E ]) ([^ ]+) +(.*)$/;
var lineBreakRegexp = /\r\n|\r|\n/;
var filterRegexp = /^(?: [T\.][S\.][C\.] )?([^ ]+) +(AA?|VV?|\|)->(AA?|VV?|\|) +(.*)$/;

var cache = {};

module.exports = function (proto) {
  /**
   * Manually define the ffmpeg binary full path.
   *
   * @method FfmpegCommand#setFfmpegPath
   *
   * @param {String} ffmpegPath The full path to the ffmpeg binary.
   * @return FfmpegCommand
   */
  proto.setFfmpegPath = function (ffmpegPath) {
    cache.ffmpegPath = ffmpegPath;
    return this;
  };

  /**
   * Manually define the ffprobe binary full path.
   *
   * @method FfmpegCommand#setFfprobePath
   *
   * @param {String} ffprobePath The full path to the ffprobe binary.
   * @return FfmpegCommand
   */
  proto.setFfprobePath = function (ffprobePath) {
    cache.ffprobePath = ffprobePath;
    return this;
  };

  /**
   * Manually define the flvtool2/flvmeta binary full path.
   *
   * @method FfmpegCommand#setFlvtoolPath
   *
   * @param {String} flvtool The full path to the flvtool2 or flvmeta binary.
   * @return FfmpegCommand
   */
  proto.setFlvtoolPath = function (flvtool) {
    cache.flvtoolPath = flvtool;
    return this;
  };

  /**
   * Forget executable paths
   *
   * (only used for testing purposes)
   *
   * @method FfmpegCommand#_forgetPaths
   * @private
   */
  proto._forgetPaths = function () {
    delete cache.ffmpegPath;
    delete cache.ffprobePath;
    delete cache.flvtoolPath;
  };

  /**
   * Check for ffmpeg availability
   *
   * If the FFMPEG_PATH environment variable is set, try to use it.
   * If it is unset or incorrect, try to find ffmpeg in the PATH instead.
   *
   * @method FfmpegCommand#_getFfmpegPath
   * @param {Function} callback callback with signature (err, path)
   * @private
   */
  proto._getFfmpegPath = function (callback) {
    if ('ffmpegPath' in cache) {
      return callback(null, cache.ffmpegPath);
    }

    async.waterfall([
    // Try FFMPEG_PATH
    function (cb) {
      if (process.env.FFMPEG_PATH) {
        fs.exists(process.env.FFMPEG_PATH, function (exists) {
          if (exists) {
            cb(null, process.env.FFMPEG_PATH);
          } else {
            cb(null, '');
          }
        });
      } else {
        cb(null, '');
      }
    },

    // Search in the PATH
    function (ffmpeg, cb) {
      if (ffmpeg.length) {
        return cb(null, ffmpeg);
      }

      utils.which('ffmpeg', function (err, ffmpeg) {
        cb(err, ffmpeg);
      });
    }], function (err, ffmpeg) {
      if (err) {
        callback(err);
      } else {
        callback(null, cache.ffmpegPath = ffmpeg || '');
      }
    });
  };

  /**
   * Check for ffprobe availability
   *
   * If the FFPROBE_PATH environment variable is set, try to use it.
   * If it is unset or incorrect, try to find ffprobe in the PATH instead.
   * If this still fails, try to find ffprobe in the same directory as ffmpeg.
   *
   * @method FfmpegCommand#_getFfprobePath
   * @param {Function} callback callback with signature (err, path)
   * @private
   */
  proto._getFfprobePath = function (callback) {
    var self = this;

    if ('ffprobePath' in cache) {
      return callback(null, cache.ffprobePath);
    }

    async.waterfall([
    // Try FFPROBE_PATH
    function (cb) {
      if (process.env.FFPROBE_PATH) {
        fs.exists(process.env.FFPROBE_PATH, function (exists) {
          cb(null, exists ? process.env.FFPROBE_PATH : '');
        });
      } else {
        cb(null, '');
      }
    },

    // Search in the PATH
    function (ffprobe, cb) {
      if (ffprobe.length) {
        return cb(null, ffprobe);
      }

      utils.which('ffprobe', function (err, ffprobe) {
        cb(err, ffprobe);
      });
    },

    // Search in the same directory as ffmpeg
    function (ffprobe, cb) {
      if (ffprobe.length) {
        return cb(null, ffprobe);
      }

      self._getFfmpegPath(function (err, ffmpeg) {
        if (err) {
          cb(err);
        } else if (ffmpeg.length) {
          var name = utils.isWindows ? 'ffprobe.exe' : 'ffprobe';
          var ffprobe = path.join(path.dirname(ffmpeg), name);
          fs.exists(ffprobe, function (exists) {
            cb(null, exists ? ffprobe : '');
          });
        } else {
          cb(null, '');
        }
      });
    }], function (err, ffprobe) {
      if (err) {
        callback(err);
      } else {
        callback(null, cache.ffprobePath = ffprobe || '');
      }
    });
  };

  /**
   * Check for flvtool2/flvmeta availability
   *
   * If the FLVTOOL2_PATH or FLVMETA_PATH environment variable are set, try to use them.
   * If both are either unset or incorrect, try to find flvtool2 or flvmeta in the PATH instead.
   *
   * @method FfmpegCommand#_getFlvtoolPath
   * @param {Function} callback callback with signature (err, path)
   * @private
   */
  proto._getFlvtoolPath = function (callback) {
    if ('flvtoolPath' in cache) {
      return callback(null, cache.flvtoolPath);
    }

    async.waterfall([
    // Try FLVMETA_PATH
    function (cb) {
      if (process.env.FLVMETA_PATH) {
        fs.exists(process.env.FLVMETA_PATH, function (exists) {
          cb(null, exists ? process.env.FLVMETA_PATH : '');
        });
      } else {
        cb(null, '');
      }
    },

    // Try FLVTOOL2_PATH
    function (flvtool, cb) {
      if (flvtool.length) {
        return cb(null, flvtool);
      }

      if (process.env.FLVTOOL2_PATH) {
        fs.exists(process.env.FLVTOOL2_PATH, function (exists) {
          cb(null, exists ? process.env.FLVTOOL2_PATH : '');
        });
      } else {
        cb(null, '');
      }
    },

    // Search for flvmeta in the PATH
    function (flvtool, cb) {
      if (flvtool.length) {
        return cb(null, flvtool);
      }

      utils.which('flvmeta', function (err, flvmeta) {
        cb(err, flvmeta);
      });
    },

    // Search for flvtool2 in the PATH
    function (flvtool, cb) {
      if (flvtool.length) {
        return cb(null, flvtool);
      }

      utils.which('flvtool2', function (err, flvtool2) {
        cb(err, flvtool2);
      });
    }], function (err, flvtool) {
      if (err) {
        callback(err);
      } else {
        callback(null, cache.flvtoolPath = flvtool || '');
      }
    });
  };

  /**
   * A callback passed to {@link FfmpegCommand#availableFilters}.
   *
   * @callback FfmpegCommand~filterCallback
   * @param {Error|null} err error object or null if no error happened
   * @param {Object} filters filter object with filter names as keys and the following
   *   properties for each filter:
   * @param {String} filters.description filter description
   * @param {String} filters.input input type, one of 'audio', 'video' and 'none'
   * @param {Boolean} filters.multipleInputs whether the filter supports multiple inputs
   * @param {String} filters.output output type, one of 'audio', 'video' and 'none'
   * @param {Boolean} filters.multipleOutputs whether the filter supports multiple outputs
   */

  /**
   * Query ffmpeg for available filters
   *
   * @method FfmpegCommand#availableFilters
   * @category Capabilities
   * @aliases getAvailableFilters
   *
   * @param {FfmpegCommand~filterCallback} callback callback function
   */
  proto.availableFilters = proto.getAvailableFilters = function (callback) {
    if ('filters' in cache) {
      return callback(null, cache.filters);
    }

    this._spawnFfmpeg(['-filters'], { captureStdout: true, stdoutLines: 0 }, function (err, stdoutRing) {
      if (err) {
        return callback(err);
      }

      var stdout = stdoutRing.get();
      var lines = stdout.split('\n');
      var data = {};
      var types = { A: 'audio', V: 'video', '|': 'none' };

      lines.forEach(function (line) {
        var match = line.match(filterRegexp);
        if (match) {
          data[match[1]] = {
            description: match[4],
            input: types[match[2].charAt(0)],
            multipleInputs: match[2].length > 1,
            output: types[match[3].charAt(0)],
            multipleOutputs: match[3].length > 1
          };
        }
      });

      callback(null, cache.filters = data);
    });
  };

  /**
   * A callback passed to {@link FfmpegCommand#availableCodecs}.
   *
   * @callback FfmpegCommand~codecCallback
   * @param {Error|null} err error object or null if no error happened
   * @param {Object} codecs codec object with codec names as keys and the following
   *   properties for each codec (more properties may be available depending on the
   *   ffmpeg version used):
   * @param {String} codecs.description codec description
   * @param {Boolean} codecs.canDecode whether the codec is able to decode streams
   * @param {Boolean} codecs.canEncode whether the codec is able to encode streams
   */

  /**
   * Query ffmpeg for available codecs
   *
   * @method FfmpegCommand#availableCodecs
   * @category Capabilities
   * @aliases getAvailableCodecs
   *
   * @param {FfmpegCommand~codecCallback} callback callback function
   */
  proto.availableCodecs = proto.getAvailableCodecs = function (callback) {
    if ('codecs' in cache) {
      return callback(null, cache.codecs);
    }

    this._spawnFfmpeg(['-codecs'], { captureStdout: true, stdoutLines: 0 }, function (err, stdoutRing) {
      if (err) {
        return callback(err);
      }

      var stdout = stdoutRing.get();
      var lines = stdout.split(lineBreakRegexp);
      var data = {};

      lines.forEach(function (line) {
        var match = line.match(avCodecRegexp);
        if (match && match[7] !== '=') {
          data[match[7]] = {
            type: { 'V': 'video', 'A': 'audio', 'S': 'subtitle' }[match[3]],
            description: match[8],
            canDecode: match[1] === 'D',
            canEncode: match[2] === 'E',
            drawHorizBand: match[4] === 'S',
            directRendering: match[5] === 'D',
            weirdFrameTruncation: match[6] === 'T'
          };
        }

        match = line.match(ffCodecRegexp);
        if (match && match[7] !== '=') {
          var codecData = data[match[7]] = {
            type: { 'V': 'video', 'A': 'audio', 'S': 'subtitle' }[match[3]],
            description: match[8],
            canDecode: match[1] === 'D',
            canEncode: match[2] === 'E',
            intraFrameOnly: match[4] === 'I',
            isLossy: match[5] === 'L',
            isLossless: match[6] === 'S'
          };

          var encoders = codecData.description.match(ffEncodersRegexp);
          encoders = encoders ? encoders[1].trim().split(' ') : [];

          var decoders = codecData.description.match(ffDecodersRegexp);
          decoders = decoders ? decoders[1].trim().split(' ') : [];

          if (encoders.length || decoders.length) {
            var coderData = {};
            utils.copy(codecData, coderData);
            delete coderData.canEncode;
            delete coderData.canDecode;

            encoders.forEach(function (name) {
              data[name] = {};
              utils.copy(coderData, data[name]);
              data[name].canEncode = true;
            });

            decoders.forEach(function (name) {
              if (name in data) {
                data[name].canDecode = true;
              } else {
                data[name] = {};
                utils.copy(coderData, data[name]);
                data[name].canDecode = true;
              }
            });
          }
        }
      });

      callback(null, cache.codecs = data);
    });
  };

  /**
   * A callback passed to {@link FfmpegCommand#availableEncoders}.
   *
   * @callback FfmpegCommand~encodersCallback
   * @param {Error|null} err error object or null if no error happened
   * @param {Object} encoders encoders object with encoder names as keys and the following
   *   properties for each encoder:
   * @param {String} encoders.description codec description
   * @param {Boolean} encoders.type "audio", "video" or "subtitle"
   * @param {Boolean} encoders.frameMT whether the encoder is able to do frame-level multithreading
   * @param {Boolean} encoders.sliceMT whether the encoder is able to do slice-level multithreading
   * @param {Boolean} encoders.experimental whether the encoder is experimental
   * @param {Boolean} encoders.drawHorizBand whether the encoder supports draw_horiz_band
   * @param {Boolean} encoders.directRendering whether the encoder supports direct encoding method 1
   */

  /**
   * Query ffmpeg for available encoders
   *
   * @method FfmpegCommand#availableEncoders
   * @category Capabilities
   * @aliases getAvailableEncoders
   *
   * @param {FfmpegCommand~encodersCallback} callback callback function
   */
  proto.availableEncoders = proto.getAvailableEncoders = function (callback) {
    if ('encoders' in cache) {
      return callback(null, cache.encoders);
    }

    this._spawnFfmpeg(['-encoders'], { captureStdout: true, stdoutLines: 0 }, function (err, stdoutRing) {
      if (err) {
        return callback(err);
      }

      var stdout = stdoutRing.get();
      var lines = stdout.split(lineBreakRegexp);
      var data = {};

      lines.forEach(function (line) {
        var match = line.match(encodersRegexp);
        if (match && match[7] !== '=') {
          data[match[7]] = {
            type: { 'V': 'video', 'A': 'audio', 'S': 'subtitle' }[match[1]],
            description: match[8],
            frameMT: match[2] === 'F',
            sliceMT: match[3] === 'S',
            experimental: match[4] === 'X',
            drawHorizBand: match[5] === 'B',
            directRendering: match[6] === 'D'
          };
        }
      });

      callback(null, cache.encoders = data);
    });
  };

  /**
   * A callback passed to {@link FfmpegCommand#availableFormats}.
   *
   * @callback FfmpegCommand~formatCallback
   * @param {Error|null} err error object or null if no error happened
   * @param {Object} formats format object with format names as keys and the following
   *   properties for each format:
   * @param {String} formats.description format description
   * @param {Boolean} formats.canDemux whether the format is able to demux streams from an input file
   * @param {Boolean} formats.canMux whether the format is able to mux streams into an output file
   */

  /**
   * Query ffmpeg for available formats
   *
   * @method FfmpegCommand#availableFormats
   * @category Capabilities
   * @aliases getAvailableFormats
   *
   * @param {FfmpegCommand~formatCallback} callback callback function
   */
  proto.availableFormats = proto.getAvailableFormats = function (callback) {
    if ('formats' in cache) {
      return callback(null, cache.formats);
    }

    // Run ffmpeg -formats
    this._spawnFfmpeg(['-formats'], { captureStdout: true, stdoutLines: 0 }, function (err, stdoutRing) {
      if (err) {
        return callback(err);
      }

      // Parse output
      var stdout = stdoutRing.get();
      var lines = stdout.split(lineBreakRegexp);
      var data = {};

      lines.forEach(function (line) {
        var match = line.match(formatRegexp);
        if (match) {
          match[3].split(',').forEach(function (format) {
            if (!(format in data)) {
              data[format] = {
                description: match[4],
                canDemux: false,
                canMux: false
              };
            }

            if (match[1] === 'D') {
              data[format].canDemux = true;
            }
            if (match[2] === 'E') {
              data[format].canMux = true;
            }
          });
        }
      });

      callback(null, cache.formats = data);
    });
  };

  /**
   * Check capabilities before executing a command
   *
   * Checks whether all used codecs and formats are indeed available
   *
   * @method FfmpegCommand#_checkCapabilities
   * @param {Function} callback callback with signature (err)
   * @private
   */
  proto._checkCapabilities = function (callback) {
    var self = this;
    async.waterfall([
    // Get available formats
    function (cb) {
      self.availableFormats(cb);
    },

    // Check whether specified formats are available
    function (formats, cb) {
      var unavailable;

      // Output format(s)
      unavailable = self._outputs.reduce(function (fmts, output) {
        var format = output.options.find('-f', 1);
        if (format) {
          if (!(format[0] in formats) || !formats[format[0]].canMux) {
            fmts.push(format);
          }
        }

        return fmts;
      }, []);

      if (unavailable.length === 1) {
        return cb(new Error('Output format ' + unavailable[0] + ' is not available'));
      } else if (unavailable.length > 1) {
        return cb(new Error('Output formats ' + unavailable.join(', ') + ' are not available'));
      }

      // Input format(s)
      unavailable = self._inputs.reduce(function (fmts, input) {
        var format = input.options.find('-f', 1);
        if (format) {
          if (!(format[0] in formats) || !formats[format[0]].canDemux) {
            fmts.push(format[0]);
          }
        }

        return fmts;
      }, []);

      if (unavailable.length === 1) {
        return cb(new Error('Input format ' + unavailable[0] + ' is not available'));
      } else if (unavailable.length > 1) {
        return cb(new Error('Input formats ' + unavailable.join(', ') + ' are not available'));
      }

      cb();
    },

    // Get available codecs
    function (cb) {
      self.availableEncoders(cb);
    },

    // Check whether specified codecs are available and add strict experimental options if needed
    function (encoders, cb) {
      var unavailable;

      // Audio codec(s)
      unavailable = self._outputs.reduce(function (cdcs, output) {
        var acodec = output.audio.find('-acodec', 1);
        if (acodec && acodec[0] !== 'copy') {
          if (!(acodec[0] in encoders) || encoders[acodec[0]].type !== 'audio') {
            cdcs.push(acodec[0]);
          }
        }

        return cdcs;
      }, []);

      if (unavailable.length === 1) {
        return cb(new Error('Audio codec ' + unavailable[0] + ' is not available'));
      } else if (unavailable.length > 1) {
        return cb(new Error('Audio codecs ' + unavailable.join(', ') + ' are not available'));
      }

      // Video codec(s)
      unavailable = self._outputs.reduce(function (cdcs, output) {
        var vcodec = output.video.find('-vcodec', 1);
        if (vcodec && vcodec[0] !== 'copy') {
          if (!(vcodec[0] in encoders) || encoders[vcodec[0]].type !== 'video') {
            cdcs.push(vcodec[0]);
          }
        }

        return cdcs;
      }, []);

      if (unavailable.length === 1) {
        return cb(new Error('Video codec ' + unavailable[0] + ' is not available'));
      } else if (unavailable.length > 1) {
        return cb(new Error('Video codecs ' + unavailable.join(', ') + ' are not available'));
      }

      cb();
    }], callback);
  };
};

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true, laxcomma:true*/


var spawn = __webpack_require__(4).spawn;

function legacyTag(key) {
  return key.match(/^TAG:/);
}
function legacyDisposition(key) {
  return key.match(/^DISPOSITION:/);
}

function parseFfprobeOutput(out) {
  var lines = out.split(/\r\n|\r|\n/);

  lines = lines.filter(function (line) {
    return line.length > 0;
  });

  var data = {
    streams: [],
    format: {},
    chapters: []
  };

  function parseBlock(name) {
    var data = {};

    var line = lines.shift();
    while (typeof line !== 'undefined') {
      if (line.toLowerCase() == '[/' + name + ']') {
        return data;
      } else if (line.match(/^\[/)) {
        line = lines.shift();
        continue;
      }

      var kv = line.match(/^([^=]+)=(.*)$/);
      if (kv) {
        if (!kv[1].match(/^TAG:/) && kv[2].match(/^[0-9]+(\.[0-9]+)?$/)) {
          data[kv[1]] = Number(kv[2]);
        } else {
          data[kv[1]] = kv[2];
        }
      }

      line = lines.shift();
    }

    return data;
  }

  var line = lines.shift();
  while (typeof line !== 'undefined') {
    if (line.match(/^\[stream/i)) {
      var stream = parseBlock('stream');
      data.streams.push(stream);
    } else if (line.match(/^\[chapter/i)) {
      var chapter = parseBlock('chapter');
      data.chapters.push(chapter);
    } else if (line.toLowerCase() === '[format]') {
      data.format = parseBlock('format');
    }

    line = lines.shift();
  }

  return data;
}

module.exports = function (proto) {
  /**
   * A callback passed to the {@link FfmpegCommand#ffprobe} method.
   *
   * @callback FfmpegCommand~ffprobeCallback
   *
   * @param {Error|null} err error object or null if no error happened
   * @param {Object} ffprobeData ffprobe output data; this object
   *   has the same format as what the following command returns:
   *
   *     `ffprobe -print_format json -show_streams -show_format INPUTFILE`
   * @param {Array} ffprobeData.streams stream information
   * @param {Object} ffprobeData.format format information
   */

  /**
   * Run ffprobe on last specified input
   *
   * @method FfmpegCommand#ffprobe
   * @category Metadata
   *
   * @param {?Number} [index] 0-based index of input to probe (defaults to last input)
   * @param {?String[]} [options] array of output options to return
   * @param {FfmpegCommand~ffprobeCallback} callback callback function
   *
   */
  proto.ffprobe = function () {
    var input,
        index = null,
        options = [],
        callback;

    // the last argument should be the callback
    var callback = arguments[arguments.length - 1];

    var ended = false;
    function handleCallback(err, data) {
      if (!ended) {
        ended = true;
        callback(err, data);
      }
    };

    // map the arguments to the correct variable names
    switch (arguments.length) {
      case 3:
        index = arguments[0];
        options = arguments[1];
        break;
      case 2:
        if (typeof arguments[0] === 'number') {
          index = arguments[0];
        } else if (Array.isArray(arguments[0])) {
          options = arguments[0];
        }
        break;
    }

    if (index === null) {
      if (!this._currentInput) {
        return handleCallback(new Error('No input specified'));
      }

      input = this._currentInput;
    } else {
      input = this._inputs[index];

      if (!input) {
        return handleCallback(new Error('Invalid input index'));
      }
    }

    // Find ffprobe
    this._getFfprobePath(function (err, path) {
      if (err) {
        return handleCallback(err);
      } else if (!path) {
        return handleCallback(new Error('Cannot find ffprobe'));
      }

      var stdout = '';
      var stdoutClosed = false;
      var stderr = '';
      var stderrClosed = false;

      // Spawn ffprobe
      var src = input.isStream ? 'pipe:0' : input.source;
      var ffprobe = spawn(path, ['-show_streams', '-show_format'].concat(options, src));

      if (input.isStream) {
        // Skip errors on stdin. These get thrown when ffprobe is complete and
        // there seems to be no way hook in and close stdin before it throws.
        ffprobe.stdin.on('error', function (err) {
          if (['ECONNRESET', 'EPIPE'].indexOf(err.code) >= 0) {
            return;
          }
          handleCallback(err);
        });

        // Once ffprobe's input stream closes, we need no more data from the
        // input
        ffprobe.stdin.on('close', function () {
          input.source.pause();
          input.source.unpipe(ffprobe.stdin);
        });

        input.source.pipe(ffprobe.stdin);
      }

      ffprobe.on('error', callback);

      // Ensure we wait for captured streams to end before calling callback
      var exitError = null;
      function handleExit(err) {
        if (err) {
          exitError = err;
        }

        if (processExited && stdoutClosed && stderrClosed) {
          if (exitError) {
            if (stderr) {
              exitError.message += '\n' + stderr;
            }

            return handleCallback(exitError);
          }

          // Process output
          var data = parseFfprobeOutput(stdout);

          // Handle legacy output with "TAG:x" and "DISPOSITION:x" keys
          [data.format].concat(data.streams).forEach(function (target) {
            if (target) {
              var legacyTagKeys = Object.keys(target).filter(legacyTag);

              if (legacyTagKeys.length) {
                target.tags = target.tags || {};

                legacyTagKeys.forEach(function (tagKey) {
                  target.tags[tagKey.substr(4)] = target[tagKey];
                  delete target[tagKey];
                });
              }

              var legacyDispositionKeys = Object.keys(target).filter(legacyDisposition);

              if (legacyDispositionKeys.length) {
                target.disposition = target.disposition || {};

                legacyDispositionKeys.forEach(function (dispositionKey) {
                  target.disposition[dispositionKey.substr(12)] = target[dispositionKey];
                  delete target[dispositionKey];
                });
              }
            }
          });

          handleCallback(null, data);
        }
      }

      // Handle ffprobe exit
      var processExited = false;
      ffprobe.on('exit', function (code, signal) {
        processExited = true;

        if (code) {
          handleExit(new Error('ffprobe exited with code ' + code));
        } else if (signal) {
          handleExit(new Error('ffprobe was killed with signal ' + signal));
        } else {
          handleExit();
        }
      });

      // Handle stdout/stderr streams
      ffprobe.stdout.on('data', function (data) {
        stdout += data;
      });

      ffprobe.stdout.on('close', function () {
        stdoutClosed = true;
        handleExit();
      });

      ffprobe.stderr.on('data', function (data) {
        stderr += data;
      });

      ffprobe.stderr.on('close', function () {
        stderrClosed = true;
        handleExit();
      });
    });
  };
};

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(__dirname) {/*jshint node:true*/


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var path = __webpack_require__(2);
var util = __webpack_require__(41);
var EventEmitter = __webpack_require__(38).EventEmitter;

var utils = __webpack_require__(0);
var ARGLISTS = ['_global', '_audio', '_audioFilters', '_video', '_videoFilters', '_sizeFilters', '_complexFilters'];

/**
 * Create an ffmpeg command
 *
 * Can be called with or without the 'new' operator, and the 'input' parameter
 * may be specified as 'options.source' instead (or passed later with the
 * addInput method).
 *
 * @constructor
 * @param {String|ReadableStream} [input] input file path or readable stream
 * @param {Object} [options] command options
 * @param {Object} [options.logger=<no logging>] logger object with 'error', 'warning', 'info' and 'debug' methods
 * @param {Number} [options.niceness=0] ffmpeg process niceness, ignored on Windows
 * @param {Number} [options.priority=0] alias for `niceness`
 * @param {String} [options.presets="fluent-ffmpeg/lib/presets"] directory to load presets from
 * @param {String} [options.preset="fluent-ffmpeg/lib/presets"] alias for `presets`
 * @param {String} [options.stdoutLines=100] maximum lines of ffmpeg output to keep in memory, use 0 for unlimited
 * @param {Number} [options.timeout=<no timeout>] ffmpeg processing timeout in seconds
 * @param {String|ReadableStream} [options.source=<no input>] alias for the `input` parameter
 */
function FfmpegCommand(input, options) {
  // Make 'new' optional
  if (!(this instanceof FfmpegCommand)) {
    return new FfmpegCommand(input, options);
  }

  EventEmitter.call(this);

  if ((typeof input === 'undefined' ? 'undefined' : _typeof(input)) === 'object' && !('readable' in input)) {
    // Options object passed directly
    options = input;
  } else {
    // Input passed first
    options = options || {};
    options.source = input;
  }

  // Add input if present
  this._inputs = [];
  if (options.source) {
    this.input(options.source);
  }

  // Add target-less output for backwards compatibility
  this._outputs = [];
  this.output();

  // Create argument lists
  var self = this;
  ['_global', '_complexFilters'].forEach(function (prop) {
    self[prop] = utils.args();
  });

  // Set default option values
  options.stdoutLines = 'stdoutLines' in options ? options.stdoutLines : 100;
  options.presets = options.presets || options.preset || path.join(__dirname, 'presets');
  options.niceness = options.niceness || options.priority || 0;

  // Save options
  this.options = options;

  // Setup logger
  this.logger = options.logger || {
    debug: function debug() {},
    info: function info() {},
    warn: function warn() {},
    error: function error() {}
  };
}
util.inherits(FfmpegCommand, EventEmitter);
module.exports = FfmpegCommand;

/**
 * Clone an ffmpeg command
 *
 * This method is useful when you want to process the same input multiple times.
 * It returns a new FfmpegCommand instance with the exact same options.
 *
 * All options set _after_ the clone() call will only be applied to the instance
 * it has been called on.
 *
 * @example
 *   var command = ffmpeg('/path/to/source.avi')
 *     .audioCodec('libfaac')
 *     .videoCodec('libx264')
 *     .format('mp4');
 *
 *   command.clone()
 *     .size('320x200')
 *     .save('/path/to/output-small.mp4');
 *
 *   command.clone()
 *     .size('640x400')
 *     .save('/path/to/output-medium.mp4');
 *
 *   command.save('/path/to/output-original-size.mp4');
 *
 * @method FfmpegCommand#clone
 * @return FfmpegCommand
 */
FfmpegCommand.prototype.clone = function () {
  var clone = new FfmpegCommand();
  var self = this;

  // Clone options and logger
  clone.options = this.options;
  clone.logger = this.logger;

  // Clone inputs
  clone._inputs = this._inputs.map(function (input) {
    return {
      source: input.source,
      options: input.options.clone()
    };
  });

  // Create first output
  if ('target' in this._outputs[0]) {
    // We have outputs set, don't clone them and create first output
    clone._outputs = [];
    clone.output();
  } else {
    // No outputs set, clone first output options
    clone._outputs = [clone._currentOutput = {
      flags: {}
    }];

    ['audio', 'audioFilters', 'video', 'videoFilters', 'sizeFilters', 'options'].forEach(function (key) {
      clone._currentOutput[key] = self._currentOutput[key].clone();
    });

    if (this._currentOutput.sizeData) {
      clone._currentOutput.sizeData = {};
      utils.copy(this._currentOutput.sizeData, clone._currentOutput.sizeData);
    }

    utils.copy(this._currentOutput.flags, clone._currentOutput.flags);
  }

  // Clone argument lists
  ['_global', '_complexFilters'].forEach(function (prop) {
    clone[prop] = self[prop].clone();
  });

  return clone;
};

/* Add methods from options submodules */

__webpack_require__(20)(FfmpegCommand.prototype);
__webpack_require__(18)(FfmpegCommand.prototype);
__webpack_require__(23)(FfmpegCommand.prototype);
__webpack_require__(24)(FfmpegCommand.prototype);
__webpack_require__(22)(FfmpegCommand.prototype);
__webpack_require__(19)(FfmpegCommand.prototype);
__webpack_require__(21)(FfmpegCommand.prototype);

/* Add processor methods */

__webpack_require__(25)(FfmpegCommand.prototype);

/* Add capabilities methods */

__webpack_require__(15)(FfmpegCommand.prototype);

FfmpegCommand.setFfmpegPath = function (path) {
  new FfmpegCommand().setFfmpegPath(path);
};

FfmpegCommand.setFfprobePath = function (path) {
  new FfmpegCommand().setFfprobePath(path);
};

FfmpegCommand.setFlvtoolPath = function (path) {
  new FfmpegCommand().setFlvtoolPath(path);
};

FfmpegCommand.availableFilters = FfmpegCommand.getAvailableFilters = function (callback) {
  new FfmpegCommand().availableFilters(callback);
};

FfmpegCommand.availableCodecs = FfmpegCommand.getAvailableCodecs = function (callback) {
  new FfmpegCommand().availableCodecs(callback);
};

FfmpegCommand.availableFormats = FfmpegCommand.getAvailableFormats = function (callback) {
  new FfmpegCommand().availableFormats(callback);
};

/* Add ffprobe methods */

__webpack_require__(16)(FfmpegCommand.prototype);

FfmpegCommand.ffprobe = function (file) {
  var instance = new FfmpegCommand(file);
  instance.ffprobe.apply(instance, Array.prototype.slice.call(arguments, 1));
};

/* Add processing recipes */

__webpack_require__(26)(FfmpegCommand.prototype);
/* WEBPACK VAR INJECTION */}.call(exports, "/"))

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var utils = __webpack_require__(0);

/*
 *! Audio-related methods
 */

module.exports = function (proto) {
  /**
   * Disable audio in the output
   *
   * @method FfmpegCommand#noAudio
   * @category Audio
   * @aliases withNoAudio
   * @return FfmpegCommand
   */
  proto.withNoAudio = proto.noAudio = function () {
    this._currentOutput.audio.clear();
    this._currentOutput.audioFilters.clear();
    this._currentOutput.audio('-an');

    return this;
  };

  /**
   * Specify audio codec
   *
   * @method FfmpegCommand#audioCodec
   * @category Audio
   * @aliases withAudioCodec
   *
   * @param {String} codec audio codec name
   * @return FfmpegCommand
   */
  proto.withAudioCodec = proto.audioCodec = function (codec) {
    this._currentOutput.audio('-acodec', codec);

    return this;
  };

  /**
   * Specify audio bitrate
   *
   * @method FfmpegCommand#audioBitrate
   * @category Audio
   * @aliases withAudioBitrate
   *
   * @param {String|Number} bitrate audio bitrate in kbps (with an optional 'k' suffix)
   * @return FfmpegCommand
   */
  proto.withAudioBitrate = proto.audioBitrate = function (bitrate) {
    this._currentOutput.audio('-b:a', ('' + bitrate).replace(/k?$/, 'k'));
    return this;
  };

  /**
   * Specify audio channel count
   *
   * @method FfmpegCommand#audioChannels
   * @category Audio
   * @aliases withAudioChannels
   *
   * @param {Number} channels channel count
   * @return FfmpegCommand
   */
  proto.withAudioChannels = proto.audioChannels = function (channels) {
    this._currentOutput.audio('-ac', channels);
    return this;
  };

  /**
   * Specify audio frequency
   *
   * @method FfmpegCommand#audioFrequency
   * @category Audio
   * @aliases withAudioFrequency
   *
   * @param {Number} freq audio frequency in Hz
   * @return FfmpegCommand
   */
  proto.withAudioFrequency = proto.audioFrequency = function (freq) {
    this._currentOutput.audio('-ar', freq);
    return this;
  };

  /**
   * Specify audio quality
   *
   * @method FfmpegCommand#audioQuality
   * @category Audio
   * @aliases withAudioQuality
   *
   * @param {Number} quality audio quality factor
   * @return FfmpegCommand
   */
  proto.withAudioQuality = proto.audioQuality = function (quality) {
    this._currentOutput.audio('-aq', quality);
    return this;
  };

  /**
   * Specify custom audio filter(s)
   *
   * Can be called both with one or many filters, or a filter array.
   *
   * @example
   * command.audioFilters('filter1');
   *
   * @example
   * command.audioFilters('filter1', 'filter2=param1=value1:param2=value2');
   *
   * @example
   * command.audioFilters(['filter1', 'filter2']);
   *
   * @example
   * command.audioFilters([
   *   {
   *     filter: 'filter1'
   *   },
   *   {
   *     filter: 'filter2',
   *     options: 'param=value:param=value'
   *   }
   * ]);
   *
   * @example
   * command.audioFilters(
   *   {
   *     filter: 'filter1',
   *     options: ['value1', 'value2']
   *   },
   *   {
   *     filter: 'filter2',
   *     options: { param1: 'value1', param2: 'value2' }
   *   }
   * );
   *
   * @method FfmpegCommand#audioFilters
   * @aliases withAudioFilter,withAudioFilters,audioFilter
   * @category Audio
   *
   * @param {...String|String[]|Object[]} filters audio filter strings, string array or
   *   filter specification array, each with the following properties:
   * @param {String} filters.filter filter name
   * @param {String|String[]|Object} [filters.options] filter option string, array, or object
   * @return FfmpegCommand
   */
  proto.withAudioFilter = proto.withAudioFilters = proto.audioFilter = proto.audioFilters = function (filters) {
    if (arguments.length > 1) {
      filters = [].slice.call(arguments);
    }

    if (!Array.isArray(filters)) {
      filters = [filters];
    }

    this._currentOutput.audioFilters(utils.makeFilterStrings(filters));
    return this;
  };
};

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var utils = __webpack_require__(0);

/*
 *! Custom options methods
 */

module.exports = function (proto) {
  /**
   * Add custom input option(s)
   *
   * When passing a single string or an array, each string containing two
   * words is split (eg. inputOptions('-option value') is supported) for
   * compatibility reasons.  This is not the case when passing more than
   * one argument.
   *
   * @example
   * command.inputOptions('option1');
   *
   * @example
   * command.inputOptions('option1', 'option2');
   *
   * @example
   * command.inputOptions(['option1', 'option2']);
   *
   * @method FfmpegCommand#inputOptions
   * @category Custom options
   * @aliases addInputOption,addInputOptions,withInputOption,withInputOptions,inputOption
   *
   * @param {...String} options option string(s) or string array
   * @return FfmpegCommand
   */
  proto.addInputOption = proto.addInputOptions = proto.withInputOption = proto.withInputOptions = proto.inputOption = proto.inputOptions = function (options) {
    if (!this._currentInput) {
      throw new Error('No input specified');
    }

    var doSplit = true;

    if (arguments.length > 1) {
      options = [].slice.call(arguments);
      doSplit = false;
    }

    if (!Array.isArray(options)) {
      options = [options];
    }

    this._currentInput.options(options.reduce(function (options, option) {
      var split = String(option).split(' ');

      if (doSplit && split.length === 2) {
        options.push(split[0], split[1]);
      } else {
        options.push(option);
      }

      return options;
    }, []));
    return this;
  };

  /**
   * Add custom output option(s)
   *
   * @example
   * command.outputOptions('option1');
   *
   * @example
   * command.outputOptions('option1', 'option2');
   *
   * @example
   * command.outputOptions(['option1', 'option2']);
   *
   * @method FfmpegCommand#outputOptions
   * @category Custom options
   * @aliases addOutputOption,addOutputOptions,addOption,addOptions,withOutputOption,withOutputOptions,withOption,withOptions,outputOption
   *
   * @param {...String} options option string(s) or string array
   * @return FfmpegCommand
   */
  proto.addOutputOption = proto.addOutputOptions = proto.addOption = proto.addOptions = proto.withOutputOption = proto.withOutputOptions = proto.withOption = proto.withOptions = proto.outputOption = proto.outputOptions = function (options) {
    var doSplit = true;

    if (arguments.length > 1) {
      options = [].slice.call(arguments);
      doSplit = false;
    }

    if (!Array.isArray(options)) {
      options = [options];
    }

    this._currentOutput.options(options.reduce(function (options, option) {
      var split = String(option).split(' ');

      if (doSplit && split.length === 2) {
        options.push(split[0], split[1]);
      } else {
        options.push(option);
      }

      return options;
    }, []));
    return this;
  };

  /**
   * Specify a complex filtergraph
   *
   * Calling this method will override any previously set filtergraph, but you can set
   * as many filters as needed in one call.
   *
   * @example <caption>Overlay an image over a video (using a filtergraph string)</caption>
   *   ffmpeg()
   *     .input('video.avi')
   *     .input('image.png')
   *     .complexFilter('[0:v][1:v]overlay[out]', ['out']);
   *
   * @example <caption>Overlay an image over a video (using a filter array)</caption>
   *   ffmpeg()
   *     .input('video.avi')
   *     .input('image.png')
   *     .complexFilter([{
   *       filter: 'overlay',
   *       inputs: ['0:v', '1:v'],
   *       outputs: ['out']
   *     }], ['out']);
   *
   * @example <caption>Split video into RGB channels and output a 3x1 video with channels side to side</caption>
   *  ffmpeg()
   *    .input('video.avi')
   *    .complexFilter([
   *      // Duplicate video stream 3 times into streams a, b, and c
   *      { filter: 'split', options: '3', outputs: ['a', 'b', 'c'] },
   *
   *      // Create stream 'red' by cancelling green and blue channels from stream 'a'
   *      { filter: 'lutrgb', options: { g: 0, b: 0 }, inputs: 'a', outputs: 'red' },
   *
   *      // Create stream 'green' by cancelling red and blue channels from stream 'b'
   *      { filter: 'lutrgb', options: { r: 0, b: 0 }, inputs: 'b', outputs: 'green' },
   *
   *      // Create stream 'blue' by cancelling red and green channels from stream 'c'
   *      { filter: 'lutrgb', options: { r: 0, g: 0 }, inputs: 'c', outputs: 'blue' },
   *
   *      // Pad stream 'red' to 3x width, keeping the video on the left, and name output 'padded'
   *      { filter: 'pad', options: { w: 'iw*3', h: 'ih' }, inputs: 'red', outputs: 'padded' },
   *
   *      // Overlay 'green' onto 'padded', moving it to the center, and name output 'redgreen'
   *      { filter: 'overlay', options: { x: 'w', y: 0 }, inputs: ['padded', 'green'], outputs: 'redgreen'},
   *
   *      // Overlay 'blue' onto 'redgreen', moving it to the right
   *      { filter: 'overlay', options: { x: '2*w', y: 0 }, inputs: ['redgreen', 'blue']},
   *    ]);
   *
   * @method FfmpegCommand#complexFilter
   * @category Custom options
   * @aliases filterGraph
   *
   * @param {String|Array} spec filtergraph string or array of filter specification
   *   objects, each having the following properties:
   * @param {String} spec.filter filter name
   * @param {String|Array} [spec.inputs] (array of) input stream specifier(s) for the filter,
   *   defaults to ffmpeg automatically choosing the first unused matching streams
   * @param {String|Array} [spec.outputs] (array of) output stream specifier(s) for the filter,
   *   defaults to ffmpeg automatically assigning the output to the output file
   * @param {Object|String|Array} [spec.options] filter options, can be omitted to not set any options
   * @param {Array} [map] (array of) stream specifier(s) from the graph to include in
   *   ffmpeg output, defaults to ffmpeg automatically choosing the first matching streams.
   * @return FfmpegCommand
   */
  proto.filterGraph = proto.complexFilter = function (spec, map) {
    this._complexFilters.clear();

    if (!Array.isArray(spec)) {
      spec = [spec];
    }

    this._complexFilters('-filter_complex', utils.makeFilterStrings(spec).join(';'));

    if (Array.isArray(map)) {
      var self = this;
      map.forEach(function (streamSpec) {
        self._complexFilters('-map', streamSpec.replace(utils.streamRegexp, '[$1]'));
      });
    } else if (typeof map === 'string') {
      this._complexFilters('-map', map.replace(utils.streamRegexp, '[$1]'));
    }

    return this;
  };
};

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var utils = __webpack_require__(0);

/*
 *! Input-related methods
 */

module.exports = function (proto) {
  /**
   * Add an input to command
   *
   * Also switches "current input", that is the input that will be affected
   * by subsequent input-related methods.
   *
   * Note: only one stream input is supported for now.
   *
   * @method FfmpegCommand#input
   * @category Input
   * @aliases mergeAdd,addInput
   *
   * @param {String|Readable} source input file path or readable stream
   * @return FfmpegCommand
   */
  proto.mergeAdd = proto.addInput = proto.input = function (source) {
    var isFile = false;
    var isStream = false;

    if (typeof source !== 'string') {
      if (!('readable' in source) || !source.readable) {
        throw new Error('Invalid input');
      }

      var hasInputStream = this._inputs.some(function (input) {
        return input.isStream;
      });

      if (hasInputStream) {
        throw new Error('Only one input stream is supported');
      }

      isStream = true;
      source.pause();
    } else {
      var protocol = source.match(/^([a-z]{2,}):/i);
      isFile = !protocol || protocol[0] === 'file';
    }

    this._inputs.push(this._currentInput = {
      source: source,
      isFile: isFile,
      isStream: isStream,
      options: utils.args()
    });

    return this;
  };

  /**
   * Specify input format for the last specified input
   *
   * @method FfmpegCommand#inputFormat
   * @category Input
   * @aliases withInputFormat,fromFormat
   *
   * @param {String} format input format
   * @return FfmpegCommand
   */
  proto.withInputFormat = proto.inputFormat = proto.fromFormat = function (format) {
    if (!this._currentInput) {
      throw new Error('No input specified');
    }

    this._currentInput.options('-f', format);
    return this;
  };

  /**
   * Specify input FPS for the last specified input
   * (only valid for raw video formats)
   *
   * @method FfmpegCommand#inputFps
   * @category Input
   * @aliases withInputFps,withInputFPS,withFpsInput,withFPSInput,inputFPS,inputFps,fpsInput
   *
   * @param {Number} fps input FPS
   * @return FfmpegCommand
   */
  proto.withInputFps = proto.withInputFPS = proto.withFpsInput = proto.withFPSInput = proto.inputFPS = proto.inputFps = proto.fpsInput = proto.FPSInput = function (fps) {
    if (!this._currentInput) {
      throw new Error('No input specified');
    }

    this._currentInput.options('-r', fps);
    return this;
  };

  /**
   * Use native framerate for the last specified input
   *
   * @method FfmpegCommand#native
   * @category Input
   * @aliases nativeFramerate,withNativeFramerate
   *
   * @return FfmmegCommand
   */
  proto.nativeFramerate = proto.withNativeFramerate = proto.native = function () {
    if (!this._currentInput) {
      throw new Error('No input specified');
    }

    this._currentInput.options('-re');
    return this;
  };

  /**
   * Specify input seek time for the last specified input
   *
   * @method FfmpegCommand#seekInput
   * @category Input
   * @aliases setStartTime,seekTo
   *
   * @param {String|Number} seek seek time in seconds or as a '[hh:[mm:]]ss[.xxx]' string
   * @return FfmpegCommand
   */
  proto.setStartTime = proto.seekInput = function (seek) {
    if (!this._currentInput) {
      throw new Error('No input specified');
    }

    this._currentInput.options('-ss', seek);

    return this;
  };

  /**
   * Loop over the last specified input
   *
   * @method FfmpegCommand#loop
   * @category Input
   *
   * @param {String|Number} [duration] loop duration in seconds or as a '[[hh:]mm:]ss[.xxx]' string
   * @return FfmpegCommand
   */
  proto.loop = function (duration) {
    if (!this._currentInput) {
      throw new Error('No input specified');
    }

    this._currentInput.options('-loop', '1');

    if (typeof duration !== 'undefined') {
      this.duration(duration);
    }

    return this;
  };
};

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var path = __webpack_require__(2);

/*
 *! Miscellaneous methods
 */

module.exports = function (proto) {
  /**
   * Use preset
   *
   * @method FfmpegCommand#preset
   * @category Miscellaneous
   * @aliases usingPreset
   *
   * @param {String|Function} preset preset name or preset function
   */
  proto.usingPreset = proto.preset = function (preset) {
    if (typeof preset === 'function') {
      preset(this);
    } else {
      try {
        var modulePath = path.join(this.options.presets, preset);
        var module = !(function webpackMissingModule() { var e = new Error("Cannot find module \".\""); e.code = 'MODULE_NOT_FOUND'; throw e; }());

        if (typeof module.load === 'function') {
          module.load(this);
        } else {
          throw new Error('preset ' + modulePath + ' has no load() function');
        }
      } catch (err) {
        throw new Error('preset ' + modulePath + ' could not be loaded: ' + err.message);
      }
    }

    return this;
  };
};

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var utils = __webpack_require__(0);

/*
 *! Output-related methods
 */

module.exports = function (proto) {
  /**
   * Add output
   *
   * @method FfmpegCommand#output
   * @category Output
   * @aliases addOutput
   *
   * @param {String|Writable} target target file path or writable stream
   * @param {Object} [pipeopts={}] pipe options (only applies to streams)
   * @return FfmpegCommand
   */
  proto.addOutput = proto.output = function (target, pipeopts) {
    var isFile = false;

    if (!target && this._currentOutput) {
      // No target is only allowed when called from constructor
      throw new Error('Invalid output');
    }

    if (target && typeof target !== 'string') {
      if (!('writable' in target) || !target.writable) {
        throw new Error('Invalid output');
      }
    } else if (typeof target === 'string') {
      var protocol = target.match(/^([a-z]{2,}):/i);
      isFile = !protocol || protocol[0] === 'file';
    }

    if (target && !('target' in this._currentOutput)) {
      // For backwards compatibility, set target for first output
      this._currentOutput.target = target;
      this._currentOutput.isFile = isFile;
      this._currentOutput.pipeopts = pipeopts || {};
    } else {
      if (target && typeof target !== 'string') {
        var hasOutputStream = this._outputs.some(function (output) {
          return typeof output.target !== 'string';
        });

        if (hasOutputStream) {
          throw new Error('Only one output stream is supported');
        }
      }

      this._outputs.push(this._currentOutput = {
        target: target,
        isFile: isFile,
        flags: {},
        pipeopts: pipeopts || {}
      });

      var self = this;
      ['audio', 'audioFilters', 'video', 'videoFilters', 'sizeFilters', 'options'].forEach(function (key) {
        self._currentOutput[key] = utils.args();
      });

      if (!target) {
        // Call from constructor: remove target key
        delete this._currentOutput.target;
      }
    }

    return this;
  };

  /**
   * Specify output seek time
   *
   * @method FfmpegCommand#seek
   * @category Input
   * @aliases seekOutput
   *
   * @param {String|Number} seek seek time in seconds or as a '[hh:[mm:]]ss[.xxx]' string
   * @return FfmpegCommand
   */
  proto.seekOutput = proto.seek = function (seek) {
    this._currentOutput.options('-ss', seek);
    return this;
  };

  /**
   * Set output duration
   *
   * @method FfmpegCommand#duration
   * @category Output
   * @aliases withDuration,setDuration
   *
   * @param {String|Number} duration duration in seconds or as a '[[hh:]mm:]ss[.xxx]' string
   * @return FfmpegCommand
   */
  proto.withDuration = proto.setDuration = proto.duration = function (duration) {
    this._currentOutput.options('-t', duration);
    return this;
  };

  /**
   * Set output format
   *
   * @method FfmpegCommand#format
   * @category Output
   * @aliases toFormat,withOutputFormat,outputFormat
   *
   * @param {String} format output format name
   * @return FfmpegCommand
   */
  proto.toFormat = proto.withOutputFormat = proto.outputFormat = proto.format = function (format) {
    this._currentOutput.options('-f', format);
    return this;
  };

  /**
   * Add stream mapping to output
   *
   * @method FfmpegCommand#map
   * @category Output
   *
   * @param {String} spec stream specification string, with optional square brackets
   * @return FfmpegCommand
   */
  proto.map = function (spec) {
    this._currentOutput.options('-map', spec.replace(utils.streamRegexp, '[$1]'));
    return this;
  };

  /**
   * Run flvtool2/flvmeta on output
   *
   * @method FfmpegCommand#flvmeta
   * @category Output
   * @aliases updateFlvMetadata
   *
   * @return FfmpegCommand
   */
  proto.updateFlvMetadata = proto.flvmeta = function () {
    this._currentOutput.flags.flvmeta = true;
    return this;
  };
};

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var utils = __webpack_require__(0);

/*
 *! Video-related methods
 */

module.exports = function (proto) {
  /**
   * Disable video in the output
   *
   * @method FfmpegCommand#noVideo
   * @category Video
   * @aliases withNoVideo
   *
   * @return FfmpegCommand
   */
  proto.withNoVideo = proto.noVideo = function () {
    this._currentOutput.video.clear();
    this._currentOutput.videoFilters.clear();
    this._currentOutput.video('-vn');

    return this;
  };

  /**
   * Specify video codec
   *
   * @method FfmpegCommand#videoCodec
   * @category Video
   * @aliases withVideoCodec
   *
   * @param {String} codec video codec name
   * @return FfmpegCommand
   */
  proto.withVideoCodec = proto.videoCodec = function (codec) {
    this._currentOutput.video('-vcodec', codec);
    return this;
  };

  /**
   * Specify video bitrate
   *
   * @method FfmpegCommand#videoBitrate
   * @category Video
   * @aliases withVideoBitrate
   *
   * @param {String|Number} bitrate video bitrate in kbps (with an optional 'k' suffix)
   * @param {Boolean} [constant=false] enforce constant bitrate
   * @return FfmpegCommand
   */
  proto.withVideoBitrate = proto.videoBitrate = function (bitrate, constant) {
    bitrate = ('' + bitrate).replace(/k?$/, 'k');

    this._currentOutput.video('-b:v', bitrate);
    if (constant) {
      this._currentOutput.video('-maxrate', bitrate, '-minrate', bitrate, '-bufsize', '3M');
    }

    return this;
  };

  /**
   * Specify custom video filter(s)
   *
   * Can be called both with one or many filters, or a filter array.
   *
   * @example
   * command.videoFilters('filter1');
   *
   * @example
   * command.videoFilters('filter1', 'filter2=param1=value1:param2=value2');
   *
   * @example
   * command.videoFilters(['filter1', 'filter2']);
   *
   * @example
   * command.videoFilters([
   *   {
   *     filter: 'filter1'
   *   },
   *   {
   *     filter: 'filter2',
   *     options: 'param=value:param=value'
   *   }
   * ]);
   *
   * @example
   * command.videoFilters(
   *   {
   *     filter: 'filter1',
   *     options: ['value1', 'value2']
   *   },
   *   {
   *     filter: 'filter2',
   *     options: { param1: 'value1', param2: 'value2' }
   *   }
   * );
   *
   * @method FfmpegCommand#videoFilters
   * @category Video
   * @aliases withVideoFilter,withVideoFilters,videoFilter
   *
   * @param {...String|String[]|Object[]} filters video filter strings, string array or
   *   filter specification array, each with the following properties:
   * @param {String} filters.filter filter name
   * @param {String|String[]|Object} [filters.options] filter option string, array, or object
   * @return FfmpegCommand
   */
  proto.withVideoFilter = proto.withVideoFilters = proto.videoFilter = proto.videoFilters = function (filters) {
    if (arguments.length > 1) {
      filters = [].slice.call(arguments);
    }

    if (!Array.isArray(filters)) {
      filters = [filters];
    }

    this._currentOutput.videoFilters(utils.makeFilterStrings(filters));

    return this;
  };

  /**
   * Specify output FPS
   *
   * @method FfmpegCommand#fps
   * @category Video
   * @aliases withOutputFps,withOutputFPS,withFpsOutput,withFPSOutput,withFps,withFPS,outputFPS,outputFps,fpsOutput,FPSOutput,FPS
   *
   * @param {Number} fps output FPS
   * @return FfmpegCommand
   */
  proto.withOutputFps = proto.withOutputFPS = proto.withFpsOutput = proto.withFPSOutput = proto.withFps = proto.withFPS = proto.outputFPS = proto.outputFps = proto.fpsOutput = proto.FPSOutput = proto.fps = proto.FPS = function (fps) {
    this._currentOutput.video('-r', fps);
    return this;
  };

  /**
   * Only transcode a certain number of frames
   *
   * @method FfmpegCommand#frames
   * @category Video
   * @aliases takeFrames,withFrames
   *
   * @param {Number} frames frame count
   * @return FfmpegCommand
   */
  proto.takeFrames = proto.withFrames = proto.frames = function (frames) {
    this._currentOutput.video('-vframes', frames);
    return this;
  };
};

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


/*
 *! Size helpers
 */

/**
 * Return filters to pad video to width*height,
 *
 * @param {Number} width output width
 * @param {Number} height output height
 * @param {Number} aspect video aspect ratio (without padding)
 * @param {Number} color padding color
 * @return scale/pad filters
 * @private
 */

function getScalePadFilters(width, height, aspect, color) {
  /*
    let a be the input aspect ratio, A be the requested aspect ratio
     if a > A, padding is done on top and bottom
    if a < A, padding is done on left and right
   */

  return [
  /*
    In both cases, we first have to scale the input to match the requested size.
    When using computed width/height, we truncate them to multiples of 2
   */
  {
    filter: 'scale',
    options: {
      w: 'if(gt(a,' + aspect + '),' + width + ',trunc(' + height + '*a/2)*2)',
      h: 'if(lt(a,' + aspect + '),' + height + ',trunc(' + width + '/a/2)*2)'
    }
  },

  /*
    Then we pad the scaled input to match the target size
    (here iw and ih refer to the padding input, i.e the scaled output)
   */

  {
    filter: 'pad',
    options: {
      w: width,
      h: height,
      x: 'if(gt(a,' + aspect + '),0,(' + width + '-iw)/2)',
      y: 'if(lt(a,' + aspect + '),0,(' + height + '-ih)/2)',
      color: color
    }
  }];
}

/**
 * Recompute size filters
 *
 * @param {Object} output
 * @param {String} key newly-added parameter name ('size', 'aspect' or 'pad')
 * @param {String} value newly-added parameter value
 * @return filter string array
 * @private
 */
function createSizeFilters(output, key, value) {
  // Store parameters
  var data = output.sizeData = output.sizeData || {};
  data[key] = value;

  if (!('size' in data)) {
    // No size requested, keep original size
    return [];
  }

  // Try to match the different size string formats
  var fixedSize = data.size.match(/([0-9]+)x([0-9]+)/);
  var fixedWidth = data.size.match(/([0-9]+)x\?/);
  var fixedHeight = data.size.match(/\?x([0-9]+)/);
  var percentRatio = data.size.match(/\b([0-9]{1,3})%/);
  var width, height, aspect;

  if (percentRatio) {
    var ratio = Number(percentRatio[1]) / 100;
    return [{
      filter: 'scale',
      options: {
        w: 'trunc(iw*' + ratio + '/2)*2',
        h: 'trunc(ih*' + ratio + '/2)*2'
      }
    }];
  } else if (fixedSize) {
    // Round target size to multiples of 2
    width = Math.round(Number(fixedSize[1]) / 2) * 2;
    height = Math.round(Number(fixedSize[2]) / 2) * 2;

    aspect = width / height;

    if (data.pad) {
      return getScalePadFilters(width, height, aspect, data.pad);
    } else {
      // No autopad requested, rescale to target size
      return [{ filter: 'scale', options: { w: width, h: height } }];
    }
  } else if (fixedWidth || fixedHeight) {
    if ('aspect' in data) {
      // Specified aspect ratio
      width = fixedWidth ? fixedWidth[1] : Math.round(Number(fixedHeight[1]) * data.aspect);
      height = fixedHeight ? fixedHeight[1] : Math.round(Number(fixedWidth[1]) / data.aspect);

      // Round to multiples of 2
      width = Math.round(width / 2) * 2;
      height = Math.round(height / 2) * 2;

      if (data.pad) {
        return getScalePadFilters(width, height, data.aspect, data.pad);
      } else {
        // No autopad requested, rescale to target size
        return [{ filter: 'scale', options: { w: width, h: height } }];
      }
    } else {
      // Keep input aspect ratio

      if (fixedWidth) {
        return [{
          filter: 'scale',
          options: {
            w: Math.round(Number(fixedWidth[1]) / 2) * 2,
            h: 'trunc(ow/a/2)*2'
          }
        }];
      } else {
        return [{
          filter: 'scale',
          options: {
            w: 'trunc(oh*a/2)*2',
            h: Math.round(Number(fixedHeight[1]) / 2) * 2
          }
        }];
      }
    }
  } else {
    throw new Error('Invalid size specified: ' + data.size);
  }
}

/*
 *! Video size-related methods
 */

module.exports = function (proto) {
  /**
   * Keep display aspect ratio
   *
   * This method is useful when converting an input with non-square pixels to an output format
   * that does not support non-square pixels.  It rescales the input so that the display aspect
   * ratio is the same.
   *
   * @method FfmpegCommand#keepDAR
   * @category Video size
   * @aliases keepPixelAspect,keepDisplayAspect,keepDisplayAspectRatio
   *
   * @return FfmpegCommand
   */
  proto.keepPixelAspect = // Only for compatibility, this is not about keeping _pixel_ aspect ratio
  proto.keepDisplayAspect = proto.keepDisplayAspectRatio = proto.keepDAR = function () {
    return this.videoFilters([{
      filter: 'scale',
      options: {
        w: 'if(gt(sar,1),iw*sar,iw)',
        h: 'if(lt(sar,1),ih/sar,ih)'
      }
    }, {
      filter: 'setsar',
      options: '1'
    }]);
  };

  /**
   * Set output size
   *
   * The 'size' parameter can have one of 4 forms:
   * - 'X%': rescale to xx % of the original size
   * - 'WxH': specify width and height
   * - 'Wx?': specify width and compute height from input aspect ratio
   * - '?xH': specify height and compute width from input aspect ratio
   *
   * Note: both dimensions will be truncated to multiples of 2.
   *
   * @method FfmpegCommand#size
   * @category Video size
   * @aliases withSize,setSize
   *
   * @param {String} size size string, eg. '33%', '320x240', '320x?', '?x240'
   * @return FfmpegCommand
   */
  proto.withSize = proto.setSize = proto.size = function (size) {
    var filters = createSizeFilters(this._currentOutput, 'size', size);

    this._currentOutput.sizeFilters.clear();
    this._currentOutput.sizeFilters(filters);

    return this;
  };

  /**
   * Set output aspect ratio
   *
   * @method FfmpegCommand#aspect
   * @category Video size
   * @aliases withAspect,withAspectRatio,setAspect,setAspectRatio,aspectRatio
   *
   * @param {String|Number} aspect aspect ratio (number or 'X:Y' string)
   * @return FfmpegCommand
   */
  proto.withAspect = proto.withAspectRatio = proto.setAspect = proto.setAspectRatio = proto.aspect = proto.aspectRatio = function (aspect) {
    var a = Number(aspect);
    if (isNaN(a)) {
      var match = aspect.match(/^(\d+):(\d+)$/);
      if (match) {
        a = Number(match[1]) / Number(match[2]);
      } else {
        throw new Error('Invalid aspect ratio: ' + aspect);
      }
    }

    var filters = createSizeFilters(this._currentOutput, 'aspect', a);

    this._currentOutput.sizeFilters.clear();
    this._currentOutput.sizeFilters(filters);

    return this;
  };

  /**
   * Enable auto-padding the output
   *
   * @method FfmpegCommand#autopad
   * @category Video size
   * @aliases applyAutopadding,applyAutoPadding,applyAutopad,applyAutoPad,withAutopadding,withAutoPadding,withAutopad,withAutoPad,autoPad
   *
   * @param {Boolean} [pad=true] enable/disable auto-padding
   * @param {String} [color='black'] pad color
   */
  proto.applyAutopadding = proto.applyAutoPadding = proto.applyAutopad = proto.applyAutoPad = proto.withAutopadding = proto.withAutoPadding = proto.withAutopad = proto.withAutoPad = proto.autoPad = proto.autopad = function (pad, color) {
    // Allow autopad(color)
    if (typeof pad === 'string') {
      color = pad;
      pad = true;
    }

    // Allow autopad() and autopad(undefined, color)
    if (typeof pad === 'undefined') {
      pad = true;
    }

    var filters = createSizeFilters(this._currentOutput, 'pad', pad ? color || 'black' : false);

    this._currentOutput.sizeFilters.clear();
    this._currentOutput.sizeFilters(filters);

    return this;
  };
};

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var spawn = __webpack_require__(4).spawn;
var path = __webpack_require__(2);
var fs = __webpack_require__(1);
var async = __webpack_require__(3);
var utils = __webpack_require__(0);

var nlRegexp = /\r\n|\r|\n/g;

/*
 *! Processor methods
 */

/**
 * Run ffprobe asynchronously and store data in command
 *
 * @param {FfmpegCommand} command
 * @private
 */
function runFfprobe(command) {
  command.ffprobe(0, function (err, data) {
    command._ffprobeData = data;
  });
}

module.exports = function (proto) {
  /**
   * Emitted just after ffmpeg has been spawned.
   *
   * @event FfmpegCommand#start
   * @param {String} command ffmpeg command line
   */

  /**
   * Emitted when ffmpeg reports progress information
   *
   * @event FfmpegCommand#progress
   * @param {Object} progress progress object
   * @param {Number} progress.frames number of frames transcoded
   * @param {Number} progress.currentFps current processing speed in frames per second
   * @param {Number} progress.currentKbps current output generation speed in kilobytes per second
   * @param {Number} progress.targetSize current output file size
   * @param {String} progress.timemark current video timemark
   * @param {Number} [progress.percent] processing progress (may not be available depending on input)
   */

  /**
   * Emitted when ffmpeg outputs to stderr
   *
   * @event FfmpegCommand#stderr
   * @param {String} line stderr output line
   */

  /**
   * Emitted when ffmpeg reports input codec data
   *
   * @event FfmpegCommand#codecData
   * @param {Object} codecData codec data object
   * @param {String} codecData.format input format name
   * @param {String} codecData.audio input audio codec name
   * @param {String} codecData.audio_details input audio codec parameters
   * @param {String} codecData.video input video codec name
   * @param {String} codecData.video_details input video codec parameters
   */

  /**
   * Emitted when an error happens when preparing or running a command
   *
   * @event FfmpegCommand#error
   * @param {Error} error error object
   * @param {String|null} stdout ffmpeg stdout, unless outputting to a stream
   * @param {String|null} stderr ffmpeg stderr
   */

  /**
   * Emitted when a command finishes processing
   *
   * @event FfmpegCommand#end
   * @param {Array|String|null} [filenames|stdout] generated filenames when taking screenshots, ffmpeg stdout when not outputting to a stream, null otherwise
   * @param {String|null} stderr ffmpeg stderr
   */

  /**
   * Spawn an ffmpeg process
   *
   * The 'options' argument may contain the following keys:
   * - 'niceness': specify process niceness, ignored on Windows (default: 0)
   * - `cwd`: change working directory
   * - 'captureStdout': capture stdout and pass it to 'endCB' as its 2nd argument (default: false)
   * - 'stdoutLines': override command limit (default: use command limit)
   *
   * The 'processCB' callback, if present, is called as soon as the process is created and
   * receives a nodejs ChildProcess object.  It may not be called at all if an error happens
   * before spawning the process.
   *
   * The 'endCB' callback is called either when an error occurs or when the ffmpeg process finishes.
   *
   * @method FfmpegCommand#_spawnFfmpeg
   * @param {Array} args ffmpeg command line argument list
   * @param {Object} [options] spawn options (see above)
   * @param {Function} [processCB] callback called with process object and stdout/stderr ring buffers when process has been created
   * @param {Function} endCB callback called with error (if applicable) and stdout/stderr ring buffers when process finished
   * @private
   */
  proto._spawnFfmpeg = function (args, options, processCB, endCB) {
    // Enable omitting options
    if (typeof options === 'function') {
      endCB = processCB;
      processCB = options;
      options = {};
    }

    // Enable omitting processCB
    if (typeof endCB === 'undefined') {
      endCB = processCB;
      processCB = function processCB() {};
    }

    var maxLines = 'stdoutLines' in options ? options.stdoutLines : this.options.stdoutLines;

    // Find ffmpeg
    this._getFfmpegPath(function (err, command) {
      if (err) {
        return endCB(err);
      } else if (!command || command.length === 0) {
        return endCB(new Error('Cannot find ffmpeg'));
      }

      // Apply niceness
      if (options.niceness && options.niceness !== 0 && !utils.isWindows) {
        args.unshift('-n', options.niceness, command);
        command = 'nice';
      }

      var stdoutRing = utils.linesRing(maxLines);
      var stdoutClosed = false;

      var stderrRing = utils.linesRing(maxLines);
      var stderrClosed = false;

      // Spawn process
      var ffmpegProc = spawn(command, args, options);

      if (ffmpegProc.stderr) {
        ffmpegProc.stderr.setEncoding('utf8');
      }

      ffmpegProc.on('error', function (err) {
        endCB(err);
      });

      // Ensure we wait for captured streams to end before calling endCB
      var exitError = null;
      function handleExit(err) {
        if (err) {
          exitError = err;
        }

        if (processExited && (stdoutClosed || !options.captureStdout) && stderrClosed) {
          endCB(exitError, stdoutRing, stderrRing);
        }
      }

      // Handle process exit
      var processExited = false;
      ffmpegProc.on('exit', function (code, signal) {
        processExited = true;

        if (signal) {
          handleExit(new Error('ffmpeg was killed with signal ' + signal));
        } else if (code) {
          handleExit(new Error('ffmpeg exited with code ' + code));
        } else {
          handleExit();
        }
      });

      // Capture stdout if specified
      if (options.captureStdout) {
        ffmpegProc.stdout.on('data', function (data) {
          stdoutRing.append(data);
        });

        ffmpegProc.stdout.on('close', function () {
          stdoutRing.close();
          stdoutClosed = true;
          handleExit();
        });
      }

      // Capture stderr if specified
      ffmpegProc.stderr.on('data', function (data) {
        stderrRing.append(data);
      });

      ffmpegProc.stderr.on('close', function () {
        stderrRing.close();
        stderrClosed = true;
        handleExit();
      });

      // Call process callback
      processCB(ffmpegProc, stdoutRing, stderrRing);
    });
  };

  /**
   * Build the argument list for an ffmpeg command
   *
   * @method FfmpegCommand#_getArguments
   * @return argument list
   * @private
   */
  proto._getArguments = function () {
    var complexFilters = this._complexFilters.get();

    var fileOutput = this._outputs.some(function (output) {
      return output.isFile;
    });

    return [].concat(
    // Inputs and input options
    this._inputs.reduce(function (args, input) {
      var source = typeof input.source === 'string' ? input.source : 'pipe:0';

      // For each input, add input options, then '-i <source>'
      return args.concat(input.options.get(), ['-i', source]);
    }, []),

    // Global options
    this._global.get(),

    // Overwrite if we have file outputs
    fileOutput ? ['-y'] : [],

    // Complex filters
    complexFilters,

    // Outputs, filters and output options
    this._outputs.reduce(function (args, output) {
      var sizeFilters = utils.makeFilterStrings(output.sizeFilters.get());
      var audioFilters = output.audioFilters.get();
      var videoFilters = output.videoFilters.get().concat(sizeFilters);
      var outputArg;

      if (!output.target) {
        outputArg = [];
      } else if (typeof output.target === 'string') {
        outputArg = [output.target];
      } else {
        outputArg = ['pipe:1'];
      }

      return args.concat(output.audio.get(), audioFilters.length ? ['-filter:a', audioFilters.join(',')] : [], output.video.get(), videoFilters.length ? ['-filter:v', videoFilters.join(',')] : [], output.options.get(), outputArg);
    }, []));
  };

  /**
   * Prepare execution of an ffmpeg command
   *
   * Checks prerequisites for the execution of the command (codec/format availability, flvtool...),
   * then builds the argument list for ffmpeg and pass them to 'callback'.
   *
   * @method FfmpegCommand#_prepare
   * @param {Function} callback callback with signature (err, args)
   * @param {Boolean} [readMetadata=false] read metadata before processing
   * @private
   */
  proto._prepare = function (callback, readMetadata) {
    var self = this;

    async.waterfall([
    // Check codecs and formats
    function (cb) {
      self._checkCapabilities(cb);
    },

    // Read metadata if required
    function (cb) {
      if (!readMetadata) {
        return cb();
      }

      self.ffprobe(0, function (err, data) {
        if (!err) {
          self._ffprobeData = data;
        }

        cb();
      });
    },

    // Check for flvtool2/flvmeta if necessary
    function (cb) {
      var flvmeta = self._outputs.some(function (output) {
        // Remove flvmeta flag on non-file output
        if (output.flags.flvmeta && !output.isFile) {
          self.logger.warn('Updating flv metadata is only supported for files');
          output.flags.flvmeta = false;
        }

        return output.flags.flvmeta;
      });

      if (flvmeta) {
        self._getFlvtoolPath(function (err) {
          cb(err);
        });
      } else {
        cb();
      }
    },

    // Build argument list
    function (cb) {
      var args;
      try {
        args = self._getArguments();
      } catch (e) {
        return cb(e);
      }

      cb(null, args);
    },

    // Add "-strict experimental" option where needed
    function (args, cb) {
      self.availableEncoders(function (err, encoders) {
        for (var i = 0; i < args.length; i++) {
          if (args[i] === '-acodec' || args[i] === '-vcodec') {
            i++;

            if (args[i] in encoders && encoders[args[i]].experimental) {
              args.splice(i + 1, 0, '-strict', 'experimental');
              i += 2;
            }
          }
        }

        cb(null, args);
      });
    }], callback);

    if (!readMetadata) {
      // Read metadata as soon as 'progress' listeners are added

      if (this.listeners('progress').length > 0) {
        // Read metadata in parallel
        runFfprobe(this);
      } else {
        // Read metadata as soon as the first 'progress' listener is added
        this.once('newListener', function (event) {
          if (event === 'progress') {
            runFfprobe(this);
          }
        });
      }
    }
  };

  /**
   * Run ffmpeg command
   *
   * @method FfmpegCommand#run
   * @category Processing
   * @aliases exec,execute
   */
  proto.exec = proto.execute = proto.run = function () {
    var self = this;

    // Check if at least one output is present
    var outputPresent = this._outputs.some(function (output) {
      return 'target' in output;
    });

    if (!outputPresent) {
      throw new Error('No output specified');
    }

    // Get output stream if any
    var outputStream = this._outputs.filter(function (output) {
      return typeof output.target !== 'string';
    })[0];

    // Get input stream if any
    var inputStream = this._inputs.filter(function (input) {
      return typeof input.source !== 'string';
    })[0];

    // Ensure we send 'end' or 'error' only once
    var ended = false;
    function emitEnd(err, stdout, stderr) {
      if (!ended) {
        ended = true;

        if (err) {
          self.emit('error', err, stdout, stderr);
        } else {
          self.emit('end', stdout, stderr);
        }
      }
    }

    self._prepare(function (err, args) {
      if (err) {
        return emitEnd(err);
      }

      // Run ffmpeg
      self._spawnFfmpeg(args, {
        captureStdout: !outputStream,
        niceness: self.options.niceness,
        cwd: self.options.cwd
      }, function processCB(ffmpegProc, stdoutRing, stderrRing) {
        self.ffmpegProc = ffmpegProc;
        self.emit('start', 'ffmpeg ' + args.join(' '));

        // Pipe input stream if any
        if (inputStream) {
          inputStream.source.on('error', function (err) {
            emitEnd(new Error('Input stream error: ' + err.message));
            ffmpegProc.kill();
          });

          inputStream.source.resume();
          inputStream.source.pipe(ffmpegProc.stdin);

          // Set stdin error handler on ffmpeg (prevents nodejs catching the error, but
          // ffmpeg will fail anyway, so no need to actually handle anything)
          ffmpegProc.stdin.on('error', function () {});
        }

        // Setup timeout if requested
        var processTimer;
        if (self.options.timeout) {
          processTimer = setTimeout(function () {
            var msg = 'process ran into a timeout (' + self.options.timeout + 's)';

            emitEnd(new Error(msg), stdoutRing.get(), stderrRing.get());
            ffmpegProc.kill();
          }, self.options.timeout * 1000);
        }

        if (outputStream) {
          // Pipe ffmpeg stdout to output stream
          ffmpegProc.stdout.pipe(outputStream.target, outputStream.pipeopts);

          // Handle output stream events
          outputStream.target.on('close', function () {
            self.logger.debug('Output stream closed, scheduling kill for ffmpgeg process');

            // Don't kill process yet, to give a chance to ffmpeg to
            // terminate successfully first  This is necessary because
            // under load, the process 'exit' event sometimes happens
            // after the output stream 'close' event.
            setTimeout(function () {
              emitEnd(new Error('Output stream closed'));
              ffmpegProc.kill();
            }, 20);
          });

          outputStream.target.on('error', function (err) {
            self.logger.debug('Output stream error, killing ffmpgeg process');
            emitEnd(new Error('Output stream error: ' + err.message), stdoutRing.get(), stderrRing.get());
            ffmpegProc.kill();
          });
        }

        // Setup stderr handling
        if (stderrRing) {

          // 'stderr' event
          if (self.listeners('stderr').length) {
            stderrRing.callback(function (line) {
              self.emit('stderr', line);
            });
          }

          // 'codecData' event
          if (self.listeners('codecData').length) {
            var codecDataSent = false;
            var codecObject = {};

            stderrRing.callback(function (line) {
              if (!codecDataSent) codecDataSent = utils.extractCodecData(self, line, codecObject);
            });
          }

          // 'progress' event
          if (self.listeners('progress').length) {
            var duration = 0;

            if (self._ffprobeData && self._ffprobeData.format && self._ffprobeData.format.duration) {
              duration = Number(self._ffprobeData.format.duration);
            }

            stderrRing.callback(function (line) {
              utils.extractProgress(self, line, duration);
            });
          }
        }
      }, function endCB(err, stdoutRing, stderrRing) {
        delete self.ffmpegProc;

        if (err) {
          if (err.message.match(/ffmpeg exited with code/)) {
            // Add ffmpeg error message
            err.message += ': ' + utils.extractError(stderrRing.get());
          }

          emitEnd(err, stdoutRing.get(), stderrRing.get());
        } else {
          // Find out which outputs need flv metadata
          var flvmeta = self._outputs.filter(function (output) {
            return output.flags.flvmeta;
          });

          if (flvmeta.length) {
            self._getFlvtoolPath(function (err, flvtool) {
              if (err) {
                return emitEnd(err);
              }

              async.each(flvmeta, function (output, cb) {
                spawn(flvtool, ['-U', output.target]).on('error', function (err) {
                  cb(new Error('Error running ' + flvtool + ' on ' + output.target + ': ' + err.message));
                }).on('exit', function (code, signal) {
                  if (code !== 0 || signal) {
                    cb(new Error(flvtool + ' ' + (signal ? 'received signal ' + signal : 'exited with code ' + code)) + ' when running on ' + output.target);
                  } else {
                    cb();
                  }
                });
              }, function (err) {
                if (err) {
                  emitEnd(err);
                } else {
                  emitEnd(null, stdoutRing.get(), stderrRing.get());
                }
              });
            });
          } else {
            emitEnd(null, stdoutRing.get(), stderrRing.get());
          }
        }
      });
    });
  };

  /**
   * Renice current and/or future ffmpeg processes
   *
   * Ignored on Windows platforms.
   *
   * @method FfmpegCommand#renice
   * @category Processing
   *
   * @param {Number} [niceness=0] niceness value between -20 (highest priority) and 20 (lowest priority)
   * @return FfmpegCommand
   */
  proto.renice = function (niceness) {
    if (!utils.isWindows) {
      niceness = niceness || 0;

      if (niceness < -20 || niceness > 20) {
        this.logger.warn('Invalid niceness value: ' + niceness + ', must be between -20 and 20');
      }

      niceness = Math.min(20, Math.max(-20, niceness));
      this.options.niceness = niceness;

      if (this.ffmpegProc) {
        var logger = this.logger;
        var pid = this.ffmpegProc.pid;
        var renice = spawn('renice', [niceness, '-p', pid]);

        renice.on('error', function (err) {
          logger.warn('could not renice process ' + pid + ': ' + err.message);
        });

        renice.on('exit', function (code, signal) {
          if (signal) {
            logger.warn('could not renice process ' + pid + ': renice was killed by signal ' + signal);
          } else if (code) {
            logger.warn('could not renice process ' + pid + ': renice exited with ' + code);
          } else {
            logger.info('successfully reniced process ' + pid + ' to ' + niceness + ' niceness');
          }
        });
      }
    }

    return this;
  };

  /**
   * Kill current ffmpeg process, if any
   *
   * @method FfmpegCommand#kill
   * @category Processing
   *
   * @param {String} [signal=SIGKILL] signal name
   * @return FfmpegCommand
   */
  proto.kill = function (signal) {
    if (!this.ffmpegProc) {
      this.logger.warn('No running ffmpeg process, cannot send signal');
    } else {
      this.ffmpegProc.kill(signal || 'SIGKILL');
    }

    return this;
  };
};

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*jshint node:true*/


var fs = __webpack_require__(1);
var path = __webpack_require__(2);
var PassThrough = __webpack_require__(40).PassThrough;
var async = __webpack_require__(3);
var utils = __webpack_require__(0);

/*
 * Useful recipes for commands
 */

module.exports = function recipes(proto) {
  /**
   * Execute ffmpeg command and save output to a file
   *
   * @method FfmpegCommand#save
   * @category Processing
   * @aliases saveToFile
   *
   * @param {String} output file path
   * @return FfmpegCommand
   */
  proto.saveToFile = proto.save = function (output) {
    this.output(output).run();
    return this;
  };

  /**
   * Execute ffmpeg command and save output to a stream
   *
   * If 'stream' is not specified, a PassThrough stream is created and returned.
   * 'options' will be used when piping ffmpeg output to the output stream
   * (@see http://nodejs.org/api/stream.html#stream_readable_pipe_destination_options)
   *
   * @method FfmpegCommand#pipe
   * @category Processing
   * @aliases stream,writeToStream
   *
   * @param {stream.Writable} [stream] output stream
   * @param {Object} [options={}] pipe options
   * @return Output stream
   */
  proto.writeToStream = proto.pipe = proto.stream = function (stream, options) {
    if (stream && !('writable' in stream)) {
      options = stream;
      stream = undefined;
    }

    if (!stream) {
      if (process.version.match(/v0\.8\./)) {
        throw new Error('PassThrough stream is not supported on node v0.8');
      }

      stream = new PassThrough();
    }

    this.output(stream, options).run();
    return stream;
  };

  /**
   * Generate images from a video
   *
   * Note: this method makes the command emit a 'filenames' event with an array of
   * the generated image filenames.
   *
   * @method FfmpegCommand#screenshots
   * @category Processing
   * @aliases takeScreenshots,thumbnail,thumbnails,screenshot
   *
   * @param {Number|Object} [config=1] screenshot count or configuration object with
   *   the following keys:
   * @param {Number} [config.count] number of screenshots to take; using this option
   *   takes screenshots at regular intervals (eg. count=4 would take screens at 20%, 40%,
   *   60% and 80% of the video length).
   * @param {String} [config.folder='.'] output folder
   * @param {String} [config.filename='tn.png'] output filename pattern, may contain the following
   *   tokens:
   *   - '%s': offset in seconds
   *   - '%w': screenshot width
   *   - '%h': screenshot height
   *   - '%r': screenshot resolution (same as '%wx%h')
   *   - '%f': input filename
   *   - '%b': input basename (filename w/o extension)
   *   - '%i': index of screenshot in timemark array (can be zero-padded by using it like `%000i`)
   * @param {Number[]|String[]} [config.timemarks] array of timemarks to take screenshots
   *   at; each timemark may be a number of seconds, a '[[hh:]mm:]ss[.xxx]' string or a
   *   'XX%' string.  Overrides 'count' if present.
   * @param {Number[]|String[]} [config.timestamps] alias for 'timemarks'
   * @param {Boolean} [config.fastSeek] use fast seek (less accurate)
   * @param {String} [config.size] screenshot size, with the same syntax as {@link FfmpegCommand#size}
   * @param {String} [folder] output folder (legacy alias for 'config.folder')
   * @return FfmpegCommand
   */
  proto.takeScreenshots = proto.thumbnail = proto.thumbnails = proto.screenshot = proto.screenshots = function (config, folder) {
    var self = this;
    var source = this._currentInput.source;
    config = config || { count: 1 };

    // Accept a number of screenshots instead of a config object
    if (typeof config === 'number') {
      config = {
        count: config
      };
    }

    // Accept a second 'folder' parameter instead of config.folder
    if (!('folder' in config)) {
      config.folder = folder || '.';
    }

    // Accept 'timestamps' instead of 'timemarks'
    if ('timestamps' in config) {
      config.timemarks = config.timestamps;
    }

    // Compute timemarks from count if not present
    if (!('timemarks' in config)) {
      if (!config.count) {
        throw new Error('Cannot take screenshots: neither a count nor a timemark list are specified');
      }

      var interval = 100 / (1 + config.count);
      config.timemarks = [];
      for (var i = 0; i < config.count; i++) {
        config.timemarks.push(interval * (i + 1) + '%');
      }
    }

    // Parse size option
    if ('size' in config) {
      var fixedSize = config.size.match(/^(\d+)x(\d+)$/);
      var fixedWidth = config.size.match(/^(\d+)x\?$/);
      var fixedHeight = config.size.match(/^\?x(\d+)$/);
      var percentSize = config.size.match(/^(\d+)%$/);

      if (!fixedSize && !fixedWidth && !fixedHeight && !percentSize) {
        throw new Error('Invalid size parameter: ' + config.size);
      }
    }

    // Metadata helper
    var metadata;
    function getMetadata(cb) {
      if (metadata) {
        cb(null, metadata);
      } else {
        self.ffprobe(function (err, meta) {
          metadata = meta;
          cb(err, meta);
        });
      }
    }

    async.waterfall([
    // Compute percent timemarks if any
    function computeTimemarks(next) {
      if (config.timemarks.some(function (t) {
        return ('' + t).match(/^[\d.]+%$/);
      })) {
        if (typeof source !== 'string') {
          return next(new Error('Cannot compute screenshot timemarks with an input stream, please specify fixed timemarks'));
        }

        getMetadata(function (err, meta) {
          if (err) {
            next(err);
          } else {
            // Select video stream with the highest resolution
            var vstream = meta.streams.reduce(function (biggest, stream) {
              if (stream.codec_type === 'video' && stream.width * stream.height > biggest.width * biggest.height) {
                return stream;
              } else {
                return biggest;
              }
            }, { width: 0, height: 0 });

            if (vstream.width === 0) {
              return next(new Error('No video stream in input, cannot take screenshots'));
            }

            var duration = Number(vstream.duration);
            if (isNaN(duration)) {
              duration = Number(meta.format.duration);
            }

            if (isNaN(duration)) {
              return next(new Error('Could not get input duration, please specify fixed timemarks'));
            }

            config.timemarks = config.timemarks.map(function (mark) {
              if (('' + mark).match(/^([\d.]+)%$/)) {
                return duration * parseFloat(mark) / 100;
              } else {
                return mark;
              }
            });

            next();
          }
        });
      } else {
        next();
      }
    },

    // Turn all timemarks into numbers and sort them
    function normalizeTimemarks(next) {
      config.timemarks = config.timemarks.map(function (mark) {
        return utils.timemarkToSeconds(mark);
      }).sort(function (a, b) {
        return a - b;
      });

      next();
    },

    // Add '_%i' to pattern when requesting multiple screenshots and no variable token is present
    function fixPattern(next) {
      var pattern = config.filename || 'tn.png';

      if (pattern.indexOf('.') === -1) {
        pattern += '.png';
      }

      if (config.timemarks.length > 1 && !pattern.match(/%(s|0*i)/)) {
        var ext = path.extname(pattern);
        pattern = path.join(path.dirname(pattern), path.basename(pattern, ext) + '_%i' + ext);
      }

      next(null, pattern);
    },

    // Replace filename tokens (%f, %b) in pattern
    function replaceFilenameTokens(pattern, next) {
      if (pattern.match(/%[bf]/)) {
        if (typeof source !== 'string') {
          return next(new Error('Cannot replace %f or %b when using an input stream'));
        }

        pattern = pattern.replace(/%f/g, path.basename(source)).replace(/%b/g, path.basename(source, path.extname(source)));
      }

      next(null, pattern);
    },

    // Compute size if needed
    function getSize(pattern, next) {
      if (pattern.match(/%[whr]/)) {
        if (fixedSize) {
          return next(null, pattern, fixedSize[1], fixedSize[2]);
        }

        getMetadata(function (err, meta) {
          if (err) {
            return next(new Error('Could not determine video resolution to replace %w, %h or %r'));
          }

          var vstream = meta.streams.reduce(function (biggest, stream) {
            if (stream.codec_type === 'video' && stream.width * stream.height > biggest.width * biggest.height) {
              return stream;
            } else {
              return biggest;
            }
          }, { width: 0, height: 0 });

          if (vstream.width === 0) {
            return next(new Error('No video stream in input, cannot replace %w, %h or %r'));
          }

          var width = vstream.width;
          var height = vstream.height;

          if (fixedWidth) {
            height = height * Number(fixedWidth[1]) / width;
            width = Number(fixedWidth[1]);
          } else if (fixedHeight) {
            width = width * Number(fixedHeight[1]) / height;
            height = Number(fixedHeight[1]);
          } else if (percentSize) {
            width = width * Number(percentSize[1]) / 100;
            height = height * Number(percentSize[1]) / 100;
          }

          next(null, pattern, Math.round(width / 2) * 2, Math.round(height / 2) * 2);
        });
      } else {
        next(null, pattern, -1, -1);
      }
    },

    // Replace size tokens (%w, %h, %r) in pattern
    function replaceSizeTokens(pattern, width, height, next) {
      pattern = pattern.replace(/%r/g, '%wx%h').replace(/%w/g, width).replace(/%h/g, height);

      next(null, pattern);
    },

    // Replace variable tokens in pattern (%s, %i) and generate filename list
    function replaceVariableTokens(pattern, next) {
      var filenames = config.timemarks.map(function (t, i) {
        return pattern.replace(/%s/g, utils.timemarkToSeconds(t)).replace(/%(0*)i/g, function (match, padding) {
          var idx = '' + (i + 1);
          return padding.substr(0, Math.max(0, padding.length + 1 - idx.length)) + idx;
        });
      });

      self.emit('filenames', filenames);
      next(null, filenames);
    },

    // Create output directory
    function createDirectory(filenames, next) {
      fs.exists(config.folder, function (exists) {
        if (!exists) {
          fs.mkdir(config.folder, function (err) {
            if (err) {
              next(err);
            } else {
              next(null, filenames);
            }
          });
        } else {
          next(null, filenames);
        }
      });
    }], function runCommand(err, filenames) {
      if (err) {
        return self.emit('error', err);
      }

      var count = config.timemarks.length;
      var split;
      var filters = [split = {
        filter: 'split',
        options: count,
        outputs: []
      }];

      if ('size' in config) {
        // Set size to generate size filters
        self.size(config.size);

        // Get size filters and chain them with 'sizeN' stream names
        var sizeFilters = self._currentOutput.sizeFilters.get().map(function (f, i) {
          if (i > 0) {
            f.inputs = 'size' + (i - 1);
          }

          f.outputs = 'size' + i;

          return f;
        });

        // Input last size filter output into split filter
        split.inputs = 'size' + (sizeFilters.length - 1);

        // Add size filters in front of split filter
        filters = sizeFilters.concat(filters);

        // Remove size filters
        self._currentOutput.sizeFilters.clear();
      }

      var first = 0;
      for (var i = 0; i < count; i++) {
        var stream = 'screen' + i;
        split.outputs.push(stream);

        if (i === 0) {
          first = config.timemarks[i];
          self.seekInput(first);
        }

        self.output(path.join(config.folder, filenames[i])).frames(1).map(stream);

        if (i > 0) {
          self.seek(config.timemarks[i] - first);
        }
      }

      self.complexFilter(filters);
      self.run();
    });

    return this;
  };

  /**
   * Merge (concatenate) inputs to a single file
   *
   * @method FfmpegCommand#concat
   * @category Processing
   * @aliases concatenate,mergeToFile
   *
   * @param {String|Writable} target output file or writable stream
   * @param {Object} [options] pipe options (only used when outputting to a writable stream)
   * @return FfmpegCommand
   */
  proto.mergeToFile = proto.concatenate = proto.concat = function (target, options) {
    // Find out which streams are present in the first non-stream input
    var fileInput = this._inputs.filter(function (input) {
      return !input.isStream;
    })[0];

    var self = this;
    this.ffprobe(this._inputs.indexOf(fileInput), function (err, data) {
      if (err) {
        return self.emit('error', err);
      }

      var hasAudioStreams = data.streams.some(function (stream) {
        return stream.codec_type === 'audio';
      });

      var hasVideoStreams = data.streams.some(function (stream) {
        return stream.codec_type === 'video';
      });

      // Setup concat filter and start processing
      self.output(target, options).complexFilter({
        filter: 'concat',
        options: {
          n: self._inputs.length,
          v: hasVideoStreams ? 1 : 0,
          a: hasAudioStreams ? 1 : 0
        }
      }).run();
    });

    return this;
  };
};

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var ansiRegex = __webpack_require__(7);
var re = new RegExp(ansiRegex().source); // remove the `g` flag
module.exports = re.test.bind(re);

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = isexe;
isexe.sync = sync;

var fs = __webpack_require__(1);

function isexe(path, _, cb) {
  fs.access(path, fs.X_OK, function (er) {
    cb(er, !er);
  });
}

function sync(path, _) {
  fs.accessSync(path, fs.X_OK);
  return true;
}

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var fs = __webpack_require__(1);
var core;
if (process.platform === 'win32' || global.TESTING_WINDOWS) {
  core = __webpack_require__(31);
} else if (typeof fs.access === 'function') {
  core = __webpack_require__(28);
} else {
  core = __webpack_require__(30);
}

module.exports = isexe;
isexe.sync = sync;

function isexe(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (!cb) {
    if (typeof Promise !== 'function') {
      throw new TypeError('callback not provided');
    }

    return new Promise(function (resolve, reject) {
      isexe(path, options || {}, function (er, is) {
        if (er) {
          reject(er);
        } else {
          resolve(is);
        }
      });
    });
  }

  core(path, options || {}, function (er, is) {
    // ignore EACCES because that just means we aren't allowed to run it
    if (er) {
      if (er.code === 'EACCES' || options && options.ignoreErrors) {
        er = null;
        is = false;
      }
    }
    cb(er, is);
  });
}

function sync(path, options) {
  // my kingdom for a filtered catch
  try {
    return core.sync(path, options || {});
  } catch (er) {
    if (options && options.ignoreErrors || er.code === 'EACCES') {
      return false;
    } else {
      throw er;
    }
  }
}

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = isexe;
isexe.sync = sync;

var fs = __webpack_require__(1);

function isexe(path, options, cb) {
  fs.stat(path, function (er, st) {
    cb(er, er ? false : checkMode(st, options));
  });
}

function sync(path, options) {
  return checkMode(fs.statSync(path), options);
}

function checkMode(stat, options) {
  var mod = stat.mode;
  var uid = stat.uid;
  var gid = stat.gid;

  var myUid = options.uid !== undefined ? options.uid : process.getuid && process.getuid();
  var myGid = options.gid !== undefined ? options.gid : process.getgid && process.getgid();

  var u = parseInt('100', 8);
  var g = parseInt('010', 8);
  var o = parseInt('001', 8);
  var ug = u | g;

  var ret = mod & o || mod & g && gid === myGid || mod & u && uid === myUid || mod & ug && myUid === 0;

  return ret;
}

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = isexe;
isexe.sync = sync;

var fs = __webpack_require__(1);

function checkPathExt(path, options) {
  var pathext = options.pathExt !== undefined ? options.pathExt : process.env.PATHEXT;

  if (!pathext) {
    return true;
  }

  pathext = pathext.split(';');
  if (pathext.indexOf('') !== -1) {
    return true;
  }
  for (var i = 0; i < pathext.length; i++) {
    var p = pathext[i].toLowerCase();
    if (p && path.substr(-p.length).toLowerCase() === p) {
      return true;
    }
  }
  return false;
}

function isexe(path, options, cb) {
  fs.stat(path, function (er, st) {
    cb(er, er ? false : checkPathExt(path, options));
  });
}

function sync(path, options) {
  fs.statSync(path);
  return checkPathExt(path, options);
}

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var path = __webpack_require__(2);
var fs = __webpack_require__(1);

function Mime() {
  // Map of extension -> mime type
  this.types = Object.create(null);

  // Map of mime type -> extension
  this.extensions = Object.create(null);
}

/**
 * Define mimetype -> extension mappings.  Each key is a mime-type that maps
 * to an array of extensions associated with the type.  The first extension is
 * used as the default extension for the type.
 *
 * e.g. mime.define({'audio/ogg', ['oga', 'ogg', 'spx']});
 *
 * @param map (Object) type definitions
 */
Mime.prototype.define = function (map) {
  for (var type in map) {
    var exts = map[type];
    for (var i = 0; i < exts.length; i++) {
      if (process.env.DEBUG_MIME && this.types[exts]) {
        console.warn(this._loading.replace(/.*\//, ''), 'changes "' + exts[i] + '" extension type from ' + this.types[exts] + ' to ' + type);
      }

      this.types[exts[i]] = type;
    }

    // Default extension is the first one we encounter
    if (!this.extensions[type]) {
      this.extensions[type] = exts[0];
    }
  }
};

/**
 * Load an Apache2-style ".types" file
 *
 * This may be called multiple times (it's expected).  Where files declare
 * overlapping types/extensions, the last file wins.
 *
 * @param file (String) path of file to load.
 */
Mime.prototype.load = function (file) {
  this._loading = file;
  // Read file and split into lines
  var map = {},
      content = fs.readFileSync(file, 'ascii'),
      lines = content.split(/[\r\n]+/);

  lines.forEach(function (line) {
    // Clean up whitespace/comments, and split into fields
    var fields = line.replace(/\s*#.*|^\s*|\s*$/g, '').split(/\s+/);
    map[fields.shift()] = fields;
  });

  this.define(map);

  this._loading = null;
};

/**
 * Lookup a mime type based on extension
 */
Mime.prototype.lookup = function (path, fallback) {
  var ext = path.replace(/.*[\.\/\\]/, '').toLowerCase();

  return this.types[ext] || fallback || this.default_type;
};

/**
 * Return file extension associated with a mime type
 */
Mime.prototype.extension = function (mimeType) {
  var type = mimeType.match(/^\s*([^;\s]*)(?:;|\s|$)/)[1].toLowerCase();
  return this.extensions[type];
};

// Default instance
var mime = new Mime();

// Define built-in types
mime.define(__webpack_require__(37));

// Default type
mime.default_type = mime.lookup('bin');

//
// Additional API specific to the default instance
//

mime.Mime = Mime;

/**
 * Lookup a charset based on mime type.
 */
mime.charsets = {
  lookup: function lookup(mimeType, fallback) {
    // Assume text types are utf8
    return (/^text\//.test(mimeType) ? 'UTF-8' : fallback
    );
  }
};

module.exports = mime;

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var ansiRegex = __webpack_require__(7)();

module.exports = function (str) {
	return typeof str === 'string' ? str.replace(ansiRegex, '') : str;
};

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var argv = process.argv;

var terminator = argv.indexOf('--');
var hasFlag = function hasFlag(flag) {
	flag = '--' + flag;
	var pos = argv.indexOf(flag);
	return pos !== -1 && (terminator !== -1 ? pos < terminator : true);
};

module.exports = function () {
	if ('FORCE_COLOR' in process.env) {
		return true;
	}

	if (hasFlag('no-color') || hasFlag('no-colors') || hasFlag('color=false')) {
		return false;
	}

	if (hasFlag('color') || hasFlag('colors') || hasFlag('color=true') || hasFlag('color=always')) {
		return true;
	}

	if (process.stdout && !process.stdout.isTTY) {
		return false;
	}

	if (process.platform === 'win32') {
		return true;
	}

	if ('COLORTERM' in process.env) {
		return true;
	}

	if (process.env.TERM === 'dumb') {
		return false;
	}

	if (/^screen|^xterm|^vt100|color|ansi|cygwin|linux/i.test(process.env.TERM)) {
		return true;
	}

	return false;
}();

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = which;
which.sync = whichSync;

var isWindows = process.platform === 'win32' || process.env.OSTYPE === 'cygwin' || process.env.OSTYPE === 'msys';

var path = __webpack_require__(2);
var COLON = isWindows ? ';' : ':';
var isexe = __webpack_require__(29);

function getNotFoundError(cmd) {
  var er = new Error('not found: ' + cmd);
  er.code = 'ENOENT';

  return er;
}

function getPathInfo(cmd, opt) {
  var colon = opt.colon || COLON;
  var pathEnv = opt.path || process.env.PATH || '';
  var pathExt = [''];

  pathEnv = pathEnv.split(colon);

  var pathExtExe = '';
  if (isWindows) {
    pathEnv.unshift(process.cwd());
    pathExtExe = opt.pathExt || process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM';
    pathExt = pathExtExe.split(colon);

    // Always test the cmd itself first.  isexe will check to make sure
    // it's found in the pathExt set.
    if (cmd.indexOf('.') !== -1 && pathExt[0] !== '') pathExt.unshift('');
  }

  // If it has a slash, then we don't bother searching the pathenv.
  // just check the file itself, and that's it.
  if (cmd.match(/\//) || isWindows && cmd.match(/\\/)) pathEnv = [''];

  return {
    env: pathEnv,
    ext: pathExt,
    extExe: pathExtExe
  };
}

function which(cmd, opt, cb) {
  if (typeof opt === 'function') {
    cb = opt;
    opt = {};
  }

  var info = getPathInfo(cmd, opt);
  var pathEnv = info.env;
  var pathExt = info.ext;
  var pathExtExe = info.extExe;
  var found = [];(function F(i, l) {
    if (i === l) {
      if (opt.all && found.length) return cb(null, found);else return cb(getNotFoundError(cmd));
    }

    var pathPart = pathEnv[i];
    if (pathPart.charAt(0) === '"' && pathPart.slice(-1) === '"') pathPart = pathPart.slice(1, -1);

    var p = path.join(pathPart, cmd);
    if (!pathPart && /^\.[\\\/]/.test(cmd)) {
      p = cmd.slice(0, 2) + p;
    }
    ;(function E(ii, ll) {
      if (ii === ll) return F(i + 1, l);
      var ext = pathExt[ii];
      isexe(p + ext, { pathExt: pathExtExe }, function (er, is) {
        if (!er && is) {
          if (opt.all) found.push(p + ext);else return cb(null, p + ext);
        }
        return E(ii + 1, ll);
      });
    })(0, pathExt.length);
  })(0, pathEnv.length);
}

function whichSync(cmd, opt) {
  opt = opt || {};

  var info = getPathInfo(cmd, opt);
  var pathEnv = info.env;
  var pathExt = info.ext;
  var pathExtExe = info.extExe;
  var found = [];

  for (var i = 0, l = pathEnv.length; i < l; i++) {
    var pathPart = pathEnv[i];
    if (pathPart.charAt(0) === '"' && pathPart.slice(-1) === '"') pathPart = pathPart.slice(1, -1);

    var p = path.join(pathPart, cmd);
    if (!pathPart && /^\.[\\\/]/.test(cmd)) {
      p = cmd.slice(0, 2) + p;
    }
    for (var j = 0, ll = pathExt.length; j < ll; j++) {
      var cur = p + pathExt[j];
      var is;
      try {
        is = isexe.sync(cur, { pathExt: pathExtExe });
        if (is) {
          if (opt.all) found.push(cur);else return cur;
        }
      } catch (ex) {}
    }
  }

  if (opt.all && found.length) return found;

  throw getNotFoundError(cmd);
}

/***/ }),
/* 36 */
/***/ (function(module, exports) {

function webpackEmptyContext(req) {
	throw new Error("Cannot find module '" + req + "'.");
}
webpackEmptyContext.keys = function() { return []; };
webpackEmptyContext.resolve = webpackEmptyContext;
module.exports = webpackEmptyContext;
webpackEmptyContext.id = 36;


/***/ }),
/* 37 */
/***/ (function(module, exports) {

module.exports = {
	"application/andrew-inset": [
		"ez"
	],
	"application/applixware": [
		"aw"
	],
	"application/atom+xml": [
		"atom"
	],
	"application/atomcat+xml": [
		"atomcat"
	],
	"application/atomsvc+xml": [
		"atomsvc"
	],
	"application/ccxml+xml": [
		"ccxml"
	],
	"application/cdmi-capability": [
		"cdmia"
	],
	"application/cdmi-container": [
		"cdmic"
	],
	"application/cdmi-domain": [
		"cdmid"
	],
	"application/cdmi-object": [
		"cdmio"
	],
	"application/cdmi-queue": [
		"cdmiq"
	],
	"application/cu-seeme": [
		"cu"
	],
	"application/dash+xml": [
		"mdp"
	],
	"application/davmount+xml": [
		"davmount"
	],
	"application/docbook+xml": [
		"dbk"
	],
	"application/dssc+der": [
		"dssc"
	],
	"application/dssc+xml": [
		"xdssc"
	],
	"application/ecmascript": [
		"ecma"
	],
	"application/emma+xml": [
		"emma"
	],
	"application/epub+zip": [
		"epub"
	],
	"application/exi": [
		"exi"
	],
	"application/font-tdpfr": [
		"pfr"
	],
	"application/font-woff": [
		"woff"
	],
	"application/font-woff2": [
		"woff2"
	],
	"application/gml+xml": [
		"gml"
	],
	"application/gpx+xml": [
		"gpx"
	],
	"application/gxf": [
		"gxf"
	],
	"application/hyperstudio": [
		"stk"
	],
	"application/inkml+xml": [
		"ink",
		"inkml"
	],
	"application/ipfix": [
		"ipfix"
	],
	"application/java-archive": [
		"jar"
	],
	"application/java-serialized-object": [
		"ser"
	],
	"application/java-vm": [
		"class"
	],
	"application/javascript": [
		"js"
	],
	"application/json": [
		"json",
		"map"
	],
	"application/json5": [
		"json5"
	],
	"application/jsonml+json": [
		"jsonml"
	],
	"application/lost+xml": [
		"lostxml"
	],
	"application/mac-binhex40": [
		"hqx"
	],
	"application/mac-compactpro": [
		"cpt"
	],
	"application/mads+xml": [
		"mads"
	],
	"application/marc": [
		"mrc"
	],
	"application/marcxml+xml": [
		"mrcx"
	],
	"application/mathematica": [
		"ma",
		"nb",
		"mb"
	],
	"application/mathml+xml": [
		"mathml"
	],
	"application/mbox": [
		"mbox"
	],
	"application/mediaservercontrol+xml": [
		"mscml"
	],
	"application/metalink+xml": [
		"metalink"
	],
	"application/metalink4+xml": [
		"meta4"
	],
	"application/mets+xml": [
		"mets"
	],
	"application/mods+xml": [
		"mods"
	],
	"application/mp21": [
		"m21",
		"mp21"
	],
	"application/mp4": [
		"mp4s",
		"m4p"
	],
	"application/msword": [
		"doc",
		"dot"
	],
	"application/mxf": [
		"mxf"
	],
	"application/octet-stream": [
		"bin",
		"dms",
		"lrf",
		"mar",
		"so",
		"dist",
		"distz",
		"pkg",
		"bpk",
		"dump",
		"elc",
		"deploy",
		"buffer"
	],
	"application/oda": [
		"oda"
	],
	"application/oebps-package+xml": [
		"opf"
	],
	"application/ogg": [
		"ogx"
	],
	"application/omdoc+xml": [
		"omdoc"
	],
	"application/onenote": [
		"onetoc",
		"onetoc2",
		"onetmp",
		"onepkg"
	],
	"application/oxps": [
		"oxps"
	],
	"application/patch-ops-error+xml": [
		"xer"
	],
	"application/pdf": [
		"pdf"
	],
	"application/pgp-encrypted": [
		"pgp"
	],
	"application/pgp-signature": [
		"asc",
		"sig"
	],
	"application/pics-rules": [
		"prf"
	],
	"application/pkcs10": [
		"p10"
	],
	"application/pkcs7-mime": [
		"p7m",
		"p7c"
	],
	"application/pkcs7-signature": [
		"p7s"
	],
	"application/pkcs8": [
		"p8"
	],
	"application/pkix-attr-cert": [
		"ac"
	],
	"application/pkix-cert": [
		"cer"
	],
	"application/pkix-crl": [
		"crl"
	],
	"application/pkix-pkipath": [
		"pkipath"
	],
	"application/pkixcmp": [
		"pki"
	],
	"application/pls+xml": [
		"pls"
	],
	"application/postscript": [
		"ai",
		"eps",
		"ps"
	],
	"application/prs.cww": [
		"cww"
	],
	"application/pskc+xml": [
		"pskcxml"
	],
	"application/rdf+xml": [
		"rdf"
	],
	"application/reginfo+xml": [
		"rif"
	],
	"application/relax-ng-compact-syntax": [
		"rnc"
	],
	"application/resource-lists+xml": [
		"rl"
	],
	"application/resource-lists-diff+xml": [
		"rld"
	],
	"application/rls-services+xml": [
		"rs"
	],
	"application/rpki-ghostbusters": [
		"gbr"
	],
	"application/rpki-manifest": [
		"mft"
	],
	"application/rpki-roa": [
		"roa"
	],
	"application/rsd+xml": [
		"rsd"
	],
	"application/rss+xml": [
		"rss"
	],
	"application/rtf": [
		"rtf"
	],
	"application/sbml+xml": [
		"sbml"
	],
	"application/scvp-cv-request": [
		"scq"
	],
	"application/scvp-cv-response": [
		"scs"
	],
	"application/scvp-vp-request": [
		"spq"
	],
	"application/scvp-vp-response": [
		"spp"
	],
	"application/sdp": [
		"sdp"
	],
	"application/set-payment-initiation": [
		"setpay"
	],
	"application/set-registration-initiation": [
		"setreg"
	],
	"application/shf+xml": [
		"shf"
	],
	"application/smil+xml": [
		"smi",
		"smil"
	],
	"application/sparql-query": [
		"rq"
	],
	"application/sparql-results+xml": [
		"srx"
	],
	"application/srgs": [
		"gram"
	],
	"application/srgs+xml": [
		"grxml"
	],
	"application/sru+xml": [
		"sru"
	],
	"application/ssdl+xml": [
		"ssdl"
	],
	"application/ssml+xml": [
		"ssml"
	],
	"application/tei+xml": [
		"tei",
		"teicorpus"
	],
	"application/thraud+xml": [
		"tfi"
	],
	"application/timestamped-data": [
		"tsd"
	],
	"application/vnd.3gpp.pic-bw-large": [
		"plb"
	],
	"application/vnd.3gpp.pic-bw-small": [
		"psb"
	],
	"application/vnd.3gpp.pic-bw-var": [
		"pvb"
	],
	"application/vnd.3gpp2.tcap": [
		"tcap"
	],
	"application/vnd.3m.post-it-notes": [
		"pwn"
	],
	"application/vnd.accpac.simply.aso": [
		"aso"
	],
	"application/vnd.accpac.simply.imp": [
		"imp"
	],
	"application/vnd.acucobol": [
		"acu"
	],
	"application/vnd.acucorp": [
		"atc",
		"acutc"
	],
	"application/vnd.adobe.air-application-installer-package+zip": [
		"air"
	],
	"application/vnd.adobe.formscentral.fcdt": [
		"fcdt"
	],
	"application/vnd.adobe.fxp": [
		"fxp",
		"fxpl"
	],
	"application/vnd.adobe.xdp+xml": [
		"xdp"
	],
	"application/vnd.adobe.xfdf": [
		"xfdf"
	],
	"application/vnd.ahead.space": [
		"ahead"
	],
	"application/vnd.airzip.filesecure.azf": [
		"azf"
	],
	"application/vnd.airzip.filesecure.azs": [
		"azs"
	],
	"application/vnd.amazon.ebook": [
		"azw"
	],
	"application/vnd.americandynamics.acc": [
		"acc"
	],
	"application/vnd.amiga.ami": [
		"ami"
	],
	"application/vnd.android.package-archive": [
		"apk"
	],
	"application/vnd.anser-web-certificate-issue-initiation": [
		"cii"
	],
	"application/vnd.anser-web-funds-transfer-initiation": [
		"fti"
	],
	"application/vnd.antix.game-component": [
		"atx"
	],
	"application/vnd.apple.installer+xml": [
		"mpkg"
	],
	"application/vnd.apple.mpegurl": [
		"m3u8"
	],
	"application/vnd.aristanetworks.swi": [
		"swi"
	],
	"application/vnd.astraea-software.iota": [
		"iota"
	],
	"application/vnd.audiograph": [
		"aep"
	],
	"application/vnd.blueice.multipass": [
		"mpm"
	],
	"application/vnd.bmi": [
		"bmi"
	],
	"application/vnd.businessobjects": [
		"rep"
	],
	"application/vnd.chemdraw+xml": [
		"cdxml"
	],
	"application/vnd.chipnuts.karaoke-mmd": [
		"mmd"
	],
	"application/vnd.cinderella": [
		"cdy"
	],
	"application/vnd.claymore": [
		"cla"
	],
	"application/vnd.cloanto.rp9": [
		"rp9"
	],
	"application/vnd.clonk.c4group": [
		"c4g",
		"c4d",
		"c4f",
		"c4p",
		"c4u"
	],
	"application/vnd.cluetrust.cartomobile-config": [
		"c11amc"
	],
	"application/vnd.cluetrust.cartomobile-config-pkg": [
		"c11amz"
	],
	"application/vnd.commonspace": [
		"csp"
	],
	"application/vnd.contact.cmsg": [
		"cdbcmsg"
	],
	"application/vnd.cosmocaller": [
		"cmc"
	],
	"application/vnd.crick.clicker": [
		"clkx"
	],
	"application/vnd.crick.clicker.keyboard": [
		"clkk"
	],
	"application/vnd.crick.clicker.palette": [
		"clkp"
	],
	"application/vnd.crick.clicker.template": [
		"clkt"
	],
	"application/vnd.crick.clicker.wordbank": [
		"clkw"
	],
	"application/vnd.criticaltools.wbs+xml": [
		"wbs"
	],
	"application/vnd.ctc-posml": [
		"pml"
	],
	"application/vnd.cups-ppd": [
		"ppd"
	],
	"application/vnd.curl.car": [
		"car"
	],
	"application/vnd.curl.pcurl": [
		"pcurl"
	],
	"application/vnd.dart": [
		"dart"
	],
	"application/vnd.data-vision.rdz": [
		"rdz"
	],
	"application/vnd.dece.data": [
		"uvf",
		"uvvf",
		"uvd",
		"uvvd"
	],
	"application/vnd.dece.ttml+xml": [
		"uvt",
		"uvvt"
	],
	"application/vnd.dece.unspecified": [
		"uvx",
		"uvvx"
	],
	"application/vnd.dece.zip": [
		"uvz",
		"uvvz"
	],
	"application/vnd.denovo.fcselayout-link": [
		"fe_launch"
	],
	"application/vnd.dna": [
		"dna"
	],
	"application/vnd.dolby.mlp": [
		"mlp"
	],
	"application/vnd.dpgraph": [
		"dpg"
	],
	"application/vnd.dreamfactory": [
		"dfac"
	],
	"application/vnd.ds-keypoint": [
		"kpxx"
	],
	"application/vnd.dvb.ait": [
		"ait"
	],
	"application/vnd.dvb.service": [
		"svc"
	],
	"application/vnd.dynageo": [
		"geo"
	],
	"application/vnd.ecowin.chart": [
		"mag"
	],
	"application/vnd.enliven": [
		"nml"
	],
	"application/vnd.epson.esf": [
		"esf"
	],
	"application/vnd.epson.msf": [
		"msf"
	],
	"application/vnd.epson.quickanime": [
		"qam"
	],
	"application/vnd.epson.salt": [
		"slt"
	],
	"application/vnd.epson.ssf": [
		"ssf"
	],
	"application/vnd.eszigno3+xml": [
		"es3",
		"et3"
	],
	"application/vnd.ezpix-album": [
		"ez2"
	],
	"application/vnd.ezpix-package": [
		"ez3"
	],
	"application/vnd.fdf": [
		"fdf"
	],
	"application/vnd.fdsn.mseed": [
		"mseed"
	],
	"application/vnd.fdsn.seed": [
		"seed",
		"dataless"
	],
	"application/vnd.flographit": [
		"gph"
	],
	"application/vnd.fluxtime.clip": [
		"ftc"
	],
	"application/vnd.framemaker": [
		"fm",
		"frame",
		"maker",
		"book"
	],
	"application/vnd.frogans.fnc": [
		"fnc"
	],
	"application/vnd.frogans.ltf": [
		"ltf"
	],
	"application/vnd.fsc.weblaunch": [
		"fsc"
	],
	"application/vnd.fujitsu.oasys": [
		"oas"
	],
	"application/vnd.fujitsu.oasys2": [
		"oa2"
	],
	"application/vnd.fujitsu.oasys3": [
		"oa3"
	],
	"application/vnd.fujitsu.oasysgp": [
		"fg5"
	],
	"application/vnd.fujitsu.oasysprs": [
		"bh2"
	],
	"application/vnd.fujixerox.ddd": [
		"ddd"
	],
	"application/vnd.fujixerox.docuworks": [
		"xdw"
	],
	"application/vnd.fujixerox.docuworks.binder": [
		"xbd"
	],
	"application/vnd.fuzzysheet": [
		"fzs"
	],
	"application/vnd.genomatix.tuxedo": [
		"txd"
	],
	"application/vnd.geogebra.file": [
		"ggb"
	],
	"application/vnd.geogebra.tool": [
		"ggt"
	],
	"application/vnd.geometry-explorer": [
		"gex",
		"gre"
	],
	"application/vnd.geonext": [
		"gxt"
	],
	"application/vnd.geoplan": [
		"g2w"
	],
	"application/vnd.geospace": [
		"g3w"
	],
	"application/vnd.gmx": [
		"gmx"
	],
	"application/vnd.google-earth.kml+xml": [
		"kml"
	],
	"application/vnd.google-earth.kmz": [
		"kmz"
	],
	"application/vnd.grafeq": [
		"gqf",
		"gqs"
	],
	"application/vnd.groove-account": [
		"gac"
	],
	"application/vnd.groove-help": [
		"ghf"
	],
	"application/vnd.groove-identity-message": [
		"gim"
	],
	"application/vnd.groove-injector": [
		"grv"
	],
	"application/vnd.groove-tool-message": [
		"gtm"
	],
	"application/vnd.groove-tool-template": [
		"tpl"
	],
	"application/vnd.groove-vcard": [
		"vcg"
	],
	"application/vnd.hal+xml": [
		"hal"
	],
	"application/vnd.handheld-entertainment+xml": [
		"zmm"
	],
	"application/vnd.hbci": [
		"hbci"
	],
	"application/vnd.hhe.lesson-player": [
		"les"
	],
	"application/vnd.hp-hpgl": [
		"hpgl"
	],
	"application/vnd.hp-hpid": [
		"hpid"
	],
	"application/vnd.hp-hps": [
		"hps"
	],
	"application/vnd.hp-jlyt": [
		"jlt"
	],
	"application/vnd.hp-pcl": [
		"pcl"
	],
	"application/vnd.hp-pclxl": [
		"pclxl"
	],
	"application/vnd.ibm.minipay": [
		"mpy"
	],
	"application/vnd.ibm.modcap": [
		"afp",
		"listafp",
		"list3820"
	],
	"application/vnd.ibm.rights-management": [
		"irm"
	],
	"application/vnd.ibm.secure-container": [
		"sc"
	],
	"application/vnd.iccprofile": [
		"icc",
		"icm"
	],
	"application/vnd.igloader": [
		"igl"
	],
	"application/vnd.immervision-ivp": [
		"ivp"
	],
	"application/vnd.immervision-ivu": [
		"ivu"
	],
	"application/vnd.insors.igm": [
		"igm"
	],
	"application/vnd.intercon.formnet": [
		"xpw",
		"xpx"
	],
	"application/vnd.intergeo": [
		"i2g"
	],
	"application/vnd.intu.qbo": [
		"qbo"
	],
	"application/vnd.intu.qfx": [
		"qfx"
	],
	"application/vnd.ipunplugged.rcprofile": [
		"rcprofile"
	],
	"application/vnd.irepository.package+xml": [
		"irp"
	],
	"application/vnd.is-xpr": [
		"xpr"
	],
	"application/vnd.isac.fcs": [
		"fcs"
	],
	"application/vnd.jam": [
		"jam"
	],
	"application/vnd.jcp.javame.midlet-rms": [
		"rms"
	],
	"application/vnd.jisp": [
		"jisp"
	],
	"application/vnd.joost.joda-archive": [
		"joda"
	],
	"application/vnd.kahootz": [
		"ktz",
		"ktr"
	],
	"application/vnd.kde.karbon": [
		"karbon"
	],
	"application/vnd.kde.kchart": [
		"chrt"
	],
	"application/vnd.kde.kformula": [
		"kfo"
	],
	"application/vnd.kde.kivio": [
		"flw"
	],
	"application/vnd.kde.kontour": [
		"kon"
	],
	"application/vnd.kde.kpresenter": [
		"kpr",
		"kpt"
	],
	"application/vnd.kde.kspread": [
		"ksp"
	],
	"application/vnd.kde.kword": [
		"kwd",
		"kwt"
	],
	"application/vnd.kenameaapp": [
		"htke"
	],
	"application/vnd.kidspiration": [
		"kia"
	],
	"application/vnd.kinar": [
		"kne",
		"knp"
	],
	"application/vnd.koan": [
		"skp",
		"skd",
		"skt",
		"skm"
	],
	"application/vnd.kodak-descriptor": [
		"sse"
	],
	"application/vnd.las.las+xml": [
		"lasxml"
	],
	"application/vnd.llamagraphics.life-balance.desktop": [
		"lbd"
	],
	"application/vnd.llamagraphics.life-balance.exchange+xml": [
		"lbe"
	],
	"application/vnd.lotus-1-2-3": [
		"123"
	],
	"application/vnd.lotus-approach": [
		"apr"
	],
	"application/vnd.lotus-freelance": [
		"pre"
	],
	"application/vnd.lotus-notes": [
		"nsf"
	],
	"application/vnd.lotus-organizer": [
		"org"
	],
	"application/vnd.lotus-screencam": [
		"scm"
	],
	"application/vnd.lotus-wordpro": [
		"lwp"
	],
	"application/vnd.macports.portpkg": [
		"portpkg"
	],
	"application/vnd.mcd": [
		"mcd"
	],
	"application/vnd.medcalcdata": [
		"mc1"
	],
	"application/vnd.mediastation.cdkey": [
		"cdkey"
	],
	"application/vnd.mfer": [
		"mwf"
	],
	"application/vnd.mfmp": [
		"mfm"
	],
	"application/vnd.micrografx.flo": [
		"flo"
	],
	"application/vnd.micrografx.igx": [
		"igx"
	],
	"application/vnd.mif": [
		"mif"
	],
	"application/vnd.mobius.daf": [
		"daf"
	],
	"application/vnd.mobius.dis": [
		"dis"
	],
	"application/vnd.mobius.mbk": [
		"mbk"
	],
	"application/vnd.mobius.mqy": [
		"mqy"
	],
	"application/vnd.mobius.msl": [
		"msl"
	],
	"application/vnd.mobius.plc": [
		"plc"
	],
	"application/vnd.mobius.txf": [
		"txf"
	],
	"application/vnd.mophun.application": [
		"mpn"
	],
	"application/vnd.mophun.certificate": [
		"mpc"
	],
	"application/vnd.mozilla.xul+xml": [
		"xul"
	],
	"application/vnd.ms-artgalry": [
		"cil"
	],
	"application/vnd.ms-cab-compressed": [
		"cab"
	],
	"application/vnd.ms-excel": [
		"xls",
		"xlm",
		"xla",
		"xlc",
		"xlt",
		"xlw"
	],
	"application/vnd.ms-excel.addin.macroenabled.12": [
		"xlam"
	],
	"application/vnd.ms-excel.sheet.binary.macroenabled.12": [
		"xlsb"
	],
	"application/vnd.ms-excel.sheet.macroenabled.12": [
		"xlsm"
	],
	"application/vnd.ms-excel.template.macroenabled.12": [
		"xltm"
	],
	"application/vnd.ms-fontobject": [
		"eot"
	],
	"application/vnd.ms-htmlhelp": [
		"chm"
	],
	"application/vnd.ms-ims": [
		"ims"
	],
	"application/vnd.ms-lrm": [
		"lrm"
	],
	"application/vnd.ms-officetheme": [
		"thmx"
	],
	"application/vnd.ms-pki.seccat": [
		"cat"
	],
	"application/vnd.ms-pki.stl": [
		"stl"
	],
	"application/vnd.ms-powerpoint": [
		"ppt",
		"pps",
		"pot"
	],
	"application/vnd.ms-powerpoint.addin.macroenabled.12": [
		"ppam"
	],
	"application/vnd.ms-powerpoint.presentation.macroenabled.12": [
		"pptm"
	],
	"application/vnd.ms-powerpoint.slide.macroenabled.12": [
		"sldm"
	],
	"application/vnd.ms-powerpoint.slideshow.macroenabled.12": [
		"ppsm"
	],
	"application/vnd.ms-powerpoint.template.macroenabled.12": [
		"potm"
	],
	"application/vnd.ms-project": [
		"mpp",
		"mpt"
	],
	"application/vnd.ms-word.document.macroenabled.12": [
		"docm"
	],
	"application/vnd.ms-word.template.macroenabled.12": [
		"dotm"
	],
	"application/vnd.ms-works": [
		"wps",
		"wks",
		"wcm",
		"wdb"
	],
	"application/vnd.ms-wpl": [
		"wpl"
	],
	"application/vnd.ms-xpsdocument": [
		"xps"
	],
	"application/vnd.mseq": [
		"mseq"
	],
	"application/vnd.musician": [
		"mus"
	],
	"application/vnd.muvee.style": [
		"msty"
	],
	"application/vnd.mynfc": [
		"taglet"
	],
	"application/vnd.neurolanguage.nlu": [
		"nlu"
	],
	"application/vnd.nitf": [
		"ntf",
		"nitf"
	],
	"application/vnd.noblenet-directory": [
		"nnd"
	],
	"application/vnd.noblenet-sealer": [
		"nns"
	],
	"application/vnd.noblenet-web": [
		"nnw"
	],
	"application/vnd.nokia.n-gage.data": [
		"ngdat"
	],
	"application/vnd.nokia.radio-preset": [
		"rpst"
	],
	"application/vnd.nokia.radio-presets": [
		"rpss"
	],
	"application/vnd.novadigm.edm": [
		"edm"
	],
	"application/vnd.novadigm.edx": [
		"edx"
	],
	"application/vnd.novadigm.ext": [
		"ext"
	],
	"application/vnd.oasis.opendocument.chart": [
		"odc"
	],
	"application/vnd.oasis.opendocument.chart-template": [
		"otc"
	],
	"application/vnd.oasis.opendocument.database": [
		"odb"
	],
	"application/vnd.oasis.opendocument.formula": [
		"odf"
	],
	"application/vnd.oasis.opendocument.formula-template": [
		"odft"
	],
	"application/vnd.oasis.opendocument.graphics": [
		"odg"
	],
	"application/vnd.oasis.opendocument.graphics-template": [
		"otg"
	],
	"application/vnd.oasis.opendocument.image": [
		"odi"
	],
	"application/vnd.oasis.opendocument.image-template": [
		"oti"
	],
	"application/vnd.oasis.opendocument.presentation": [
		"odp"
	],
	"application/vnd.oasis.opendocument.presentation-template": [
		"otp"
	],
	"application/vnd.oasis.opendocument.spreadsheet": [
		"ods"
	],
	"application/vnd.oasis.opendocument.spreadsheet-template": [
		"ots"
	],
	"application/vnd.oasis.opendocument.text": [
		"odt"
	],
	"application/vnd.oasis.opendocument.text-master": [
		"odm"
	],
	"application/vnd.oasis.opendocument.text-template": [
		"ott"
	],
	"application/vnd.oasis.opendocument.text-web": [
		"oth"
	],
	"application/vnd.olpc-sugar": [
		"xo"
	],
	"application/vnd.oma.dd2+xml": [
		"dd2"
	],
	"application/vnd.openofficeorg.extension": [
		"oxt"
	],
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": [
		"pptx"
	],
	"application/vnd.openxmlformats-officedocument.presentationml.slide": [
		"sldx"
	],
	"application/vnd.openxmlformats-officedocument.presentationml.slideshow": [
		"ppsx"
	],
	"application/vnd.openxmlformats-officedocument.presentationml.template": [
		"potx"
	],
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
		"xlsx"
	],
	"application/vnd.openxmlformats-officedocument.spreadsheetml.template": [
		"xltx"
	],
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
		"docx"
	],
	"application/vnd.openxmlformats-officedocument.wordprocessingml.template": [
		"dotx"
	],
	"application/vnd.osgeo.mapguide.package": [
		"mgp"
	],
	"application/vnd.osgi.dp": [
		"dp"
	],
	"application/vnd.osgi.subsystem": [
		"esa"
	],
	"application/vnd.palm": [
		"pdb",
		"pqa",
		"oprc"
	],
	"application/vnd.pawaafile": [
		"paw"
	],
	"application/vnd.pg.format": [
		"str"
	],
	"application/vnd.pg.osasli": [
		"ei6"
	],
	"application/vnd.picsel": [
		"efif"
	],
	"application/vnd.pmi.widget": [
		"wg"
	],
	"application/vnd.pocketlearn": [
		"plf"
	],
	"application/vnd.powerbuilder6": [
		"pbd"
	],
	"application/vnd.previewsystems.box": [
		"box"
	],
	"application/vnd.proteus.magazine": [
		"mgz"
	],
	"application/vnd.publishare-delta-tree": [
		"qps"
	],
	"application/vnd.pvi.ptid1": [
		"ptid"
	],
	"application/vnd.quark.quarkxpress": [
		"qxd",
		"qxt",
		"qwd",
		"qwt",
		"qxl",
		"qxb"
	],
	"application/vnd.realvnc.bed": [
		"bed"
	],
	"application/vnd.recordare.musicxml": [
		"mxl"
	],
	"application/vnd.recordare.musicxml+xml": [
		"musicxml"
	],
	"application/vnd.rig.cryptonote": [
		"cryptonote"
	],
	"application/vnd.rim.cod": [
		"cod"
	],
	"application/vnd.rn-realmedia": [
		"rm"
	],
	"application/vnd.rn-realmedia-vbr": [
		"rmvb"
	],
	"application/vnd.route66.link66+xml": [
		"link66"
	],
	"application/vnd.sailingtracker.track": [
		"st"
	],
	"application/vnd.seemail": [
		"see"
	],
	"application/vnd.sema": [
		"sema"
	],
	"application/vnd.semd": [
		"semd"
	],
	"application/vnd.semf": [
		"semf"
	],
	"application/vnd.shana.informed.formdata": [
		"ifm"
	],
	"application/vnd.shana.informed.formtemplate": [
		"itp"
	],
	"application/vnd.shana.informed.interchange": [
		"iif"
	],
	"application/vnd.shana.informed.package": [
		"ipk"
	],
	"application/vnd.simtech-mindmapper": [
		"twd",
		"twds"
	],
	"application/vnd.smaf": [
		"mmf"
	],
	"application/vnd.smart.teacher": [
		"teacher"
	],
	"application/vnd.solent.sdkm+xml": [
		"sdkm",
		"sdkd"
	],
	"application/vnd.spotfire.dxp": [
		"dxp"
	],
	"application/vnd.spotfire.sfs": [
		"sfs"
	],
	"application/vnd.stardivision.calc": [
		"sdc"
	],
	"application/vnd.stardivision.draw": [
		"sda"
	],
	"application/vnd.stardivision.impress": [
		"sdd"
	],
	"application/vnd.stardivision.math": [
		"smf"
	],
	"application/vnd.stardivision.writer": [
		"sdw",
		"vor"
	],
	"application/vnd.stardivision.writer-global": [
		"sgl"
	],
	"application/vnd.stepmania.package": [
		"smzip"
	],
	"application/vnd.stepmania.stepchart": [
		"sm"
	],
	"application/vnd.sun.xml.calc": [
		"sxc"
	],
	"application/vnd.sun.xml.calc.template": [
		"stc"
	],
	"application/vnd.sun.xml.draw": [
		"sxd"
	],
	"application/vnd.sun.xml.draw.template": [
		"std"
	],
	"application/vnd.sun.xml.impress": [
		"sxi"
	],
	"application/vnd.sun.xml.impress.template": [
		"sti"
	],
	"application/vnd.sun.xml.math": [
		"sxm"
	],
	"application/vnd.sun.xml.writer": [
		"sxw"
	],
	"application/vnd.sun.xml.writer.global": [
		"sxg"
	],
	"application/vnd.sun.xml.writer.template": [
		"stw"
	],
	"application/vnd.sus-calendar": [
		"sus",
		"susp"
	],
	"application/vnd.svd": [
		"svd"
	],
	"application/vnd.symbian.install": [
		"sis",
		"sisx"
	],
	"application/vnd.syncml+xml": [
		"xsm"
	],
	"application/vnd.syncml.dm+wbxml": [
		"bdm"
	],
	"application/vnd.syncml.dm+xml": [
		"xdm"
	],
	"application/vnd.tao.intent-module-archive": [
		"tao"
	],
	"application/vnd.tcpdump.pcap": [
		"pcap",
		"cap",
		"dmp"
	],
	"application/vnd.tmobile-livetv": [
		"tmo"
	],
	"application/vnd.trid.tpt": [
		"tpt"
	],
	"application/vnd.triscape.mxs": [
		"mxs"
	],
	"application/vnd.trueapp": [
		"tra"
	],
	"application/vnd.ufdl": [
		"ufd",
		"ufdl"
	],
	"application/vnd.uiq.theme": [
		"utz"
	],
	"application/vnd.umajin": [
		"umj"
	],
	"application/vnd.unity": [
		"unityweb"
	],
	"application/vnd.uoml+xml": [
		"uoml"
	],
	"application/vnd.vcx": [
		"vcx"
	],
	"application/vnd.visio": [
		"vsd",
		"vst",
		"vss",
		"vsw"
	],
	"application/vnd.visionary": [
		"vis"
	],
	"application/vnd.vsf": [
		"vsf"
	],
	"application/vnd.wap.wbxml": [
		"wbxml"
	],
	"application/vnd.wap.wmlc": [
		"wmlc"
	],
	"application/vnd.wap.wmlscriptc": [
		"wmlsc"
	],
	"application/vnd.webturbo": [
		"wtb"
	],
	"application/vnd.wolfram.player": [
		"nbp"
	],
	"application/vnd.wordperfect": [
		"wpd"
	],
	"application/vnd.wqd": [
		"wqd"
	],
	"application/vnd.wt.stf": [
		"stf"
	],
	"application/vnd.xara": [
		"xar"
	],
	"application/vnd.xfdl": [
		"xfdl"
	],
	"application/vnd.yamaha.hv-dic": [
		"hvd"
	],
	"application/vnd.yamaha.hv-script": [
		"hvs"
	],
	"application/vnd.yamaha.hv-voice": [
		"hvp"
	],
	"application/vnd.yamaha.openscoreformat": [
		"osf"
	],
	"application/vnd.yamaha.openscoreformat.osfpvg+xml": [
		"osfpvg"
	],
	"application/vnd.yamaha.smaf-audio": [
		"saf"
	],
	"application/vnd.yamaha.smaf-phrase": [
		"spf"
	],
	"application/vnd.yellowriver-custom-menu": [
		"cmp"
	],
	"application/vnd.zul": [
		"zir",
		"zirz"
	],
	"application/vnd.zzazz.deck+xml": [
		"zaz"
	],
	"application/voicexml+xml": [
		"vxml"
	],
	"application/widget": [
		"wgt"
	],
	"application/winhlp": [
		"hlp"
	],
	"application/wsdl+xml": [
		"wsdl"
	],
	"application/wspolicy+xml": [
		"wspolicy"
	],
	"application/x-7z-compressed": [
		"7z"
	],
	"application/x-abiword": [
		"abw"
	],
	"application/x-ace-compressed": [
		"ace"
	],
	"application/x-apple-diskimage": [
		"dmg"
	],
	"application/x-authorware-bin": [
		"aab",
		"x32",
		"u32",
		"vox"
	],
	"application/x-authorware-map": [
		"aam"
	],
	"application/x-authorware-seg": [
		"aas"
	],
	"application/x-bcpio": [
		"bcpio"
	],
	"application/x-bittorrent": [
		"torrent"
	],
	"application/x-blorb": [
		"blb",
		"blorb"
	],
	"application/x-bzip": [
		"bz"
	],
	"application/x-bzip2": [
		"bz2",
		"boz"
	],
	"application/x-cbr": [
		"cbr",
		"cba",
		"cbt",
		"cbz",
		"cb7"
	],
	"application/x-cdlink": [
		"vcd"
	],
	"application/x-cfs-compressed": [
		"cfs"
	],
	"application/x-chat": [
		"chat"
	],
	"application/x-chess-pgn": [
		"pgn"
	],
	"application/x-chrome-extension": [
		"crx"
	],
	"application/x-conference": [
		"nsc"
	],
	"application/x-cpio": [
		"cpio"
	],
	"application/x-csh": [
		"csh"
	],
	"application/x-debian-package": [
		"deb",
		"udeb"
	],
	"application/x-dgc-compressed": [
		"dgc"
	],
	"application/x-director": [
		"dir",
		"dcr",
		"dxr",
		"cst",
		"cct",
		"cxt",
		"w3d",
		"fgd",
		"swa"
	],
	"application/x-doom": [
		"wad"
	],
	"application/x-dtbncx+xml": [
		"ncx"
	],
	"application/x-dtbook+xml": [
		"dtb"
	],
	"application/x-dtbresource+xml": [
		"res"
	],
	"application/x-dvi": [
		"dvi"
	],
	"application/x-envoy": [
		"evy"
	],
	"application/x-eva": [
		"eva"
	],
	"application/x-font-bdf": [
		"bdf"
	],
	"application/x-font-ghostscript": [
		"gsf"
	],
	"application/x-font-linux-psf": [
		"psf"
	],
	"application/x-font-otf": [
		"otf"
	],
	"application/x-font-pcf": [
		"pcf"
	],
	"application/x-font-snf": [
		"snf"
	],
	"application/x-font-ttf": [
		"ttf",
		"ttc"
	],
	"application/x-font-type1": [
		"pfa",
		"pfb",
		"pfm",
		"afm"
	],
	"application/x-freearc": [
		"arc"
	],
	"application/x-futuresplash": [
		"spl"
	],
	"application/x-gca-compressed": [
		"gca"
	],
	"application/x-glulx": [
		"ulx"
	],
	"application/x-gnumeric": [
		"gnumeric"
	],
	"application/x-gramps-xml": [
		"gramps"
	],
	"application/x-gtar": [
		"gtar"
	],
	"application/x-hdf": [
		"hdf"
	],
	"application/x-install-instructions": [
		"install"
	],
	"application/x-iso9660-image": [
		"iso"
	],
	"application/x-java-jnlp-file": [
		"jnlp"
	],
	"application/x-latex": [
		"latex"
	],
	"application/x-lua-bytecode": [
		"luac"
	],
	"application/x-lzh-compressed": [
		"lzh",
		"lha"
	],
	"application/x-mie": [
		"mie"
	],
	"application/x-mobipocket-ebook": [
		"prc",
		"mobi"
	],
	"application/x-ms-application": [
		"application"
	],
	"application/x-ms-shortcut": [
		"lnk"
	],
	"application/x-ms-wmd": [
		"wmd"
	],
	"application/x-ms-wmz": [
		"wmz"
	],
	"application/x-ms-xbap": [
		"xbap"
	],
	"application/x-msaccess": [
		"mdb"
	],
	"application/x-msbinder": [
		"obd"
	],
	"application/x-mscardfile": [
		"crd"
	],
	"application/x-msclip": [
		"clp"
	],
	"application/x-msdownload": [
		"exe",
		"dll",
		"com",
		"bat",
		"msi"
	],
	"application/x-msmediaview": [
		"mvb",
		"m13",
		"m14"
	],
	"application/x-msmetafile": [
		"wmf",
		"wmz",
		"emf",
		"emz"
	],
	"application/x-msmoney": [
		"mny"
	],
	"application/x-mspublisher": [
		"pub"
	],
	"application/x-msschedule": [
		"scd"
	],
	"application/x-msterminal": [
		"trm"
	],
	"application/x-mswrite": [
		"wri"
	],
	"application/x-netcdf": [
		"nc",
		"cdf"
	],
	"application/x-nzb": [
		"nzb"
	],
	"application/x-pkcs12": [
		"p12",
		"pfx"
	],
	"application/x-pkcs7-certificates": [
		"p7b",
		"spc"
	],
	"application/x-pkcs7-certreqresp": [
		"p7r"
	],
	"application/x-rar-compressed": [
		"rar"
	],
	"application/x-research-info-systems": [
		"ris"
	],
	"application/x-sh": [
		"sh"
	],
	"application/x-shar": [
		"shar"
	],
	"application/x-shockwave-flash": [
		"swf"
	],
	"application/x-silverlight-app": [
		"xap"
	],
	"application/x-sql": [
		"sql"
	],
	"application/x-stuffit": [
		"sit"
	],
	"application/x-stuffitx": [
		"sitx"
	],
	"application/x-subrip": [
		"srt"
	],
	"application/x-sv4cpio": [
		"sv4cpio"
	],
	"application/x-sv4crc": [
		"sv4crc"
	],
	"application/x-t3vm-image": [
		"t3"
	],
	"application/x-tads": [
		"gam"
	],
	"application/x-tar": [
		"tar"
	],
	"application/x-tcl": [
		"tcl"
	],
	"application/x-tex": [
		"tex"
	],
	"application/x-tex-tfm": [
		"tfm"
	],
	"application/x-texinfo": [
		"texinfo",
		"texi"
	],
	"application/x-tgif": [
		"obj"
	],
	"application/x-ustar": [
		"ustar"
	],
	"application/x-wais-source": [
		"src"
	],
	"application/x-web-app-manifest+json": [
		"webapp"
	],
	"application/x-x509-ca-cert": [
		"der",
		"crt"
	],
	"application/x-xfig": [
		"fig"
	],
	"application/x-xliff+xml": [
		"xlf"
	],
	"application/x-xpinstall": [
		"xpi"
	],
	"application/x-xz": [
		"xz"
	],
	"application/x-zmachine": [
		"z1",
		"z2",
		"z3",
		"z4",
		"z5",
		"z6",
		"z7",
		"z8"
	],
	"application/xaml+xml": [
		"xaml"
	],
	"application/xcap-diff+xml": [
		"xdf"
	],
	"application/xenc+xml": [
		"xenc"
	],
	"application/xhtml+xml": [
		"xhtml",
		"xht"
	],
	"application/xml": [
		"xml",
		"xsl",
		"xsd"
	],
	"application/xml-dtd": [
		"dtd"
	],
	"application/xop+xml": [
		"xop"
	],
	"application/xproc+xml": [
		"xpl"
	],
	"application/xslt+xml": [
		"xslt"
	],
	"application/xspf+xml": [
		"xspf"
	],
	"application/xv+xml": [
		"mxml",
		"xhvml",
		"xvml",
		"xvm"
	],
	"application/yang": [
		"yang"
	],
	"application/yin+xml": [
		"yin"
	],
	"application/zip": [
		"zip"
	],
	"audio/adpcm": [
		"adp"
	],
	"audio/basic": [
		"au",
		"snd"
	],
	"audio/midi": [
		"mid",
		"midi",
		"kar",
		"rmi"
	],
	"audio/mp4": [
		"mp4a",
		"m4a"
	],
	"audio/mpeg": [
		"mpga",
		"mp2",
		"mp2a",
		"mp3",
		"m2a",
		"m3a"
	],
	"audio/ogg": [
		"oga",
		"ogg",
		"spx"
	],
	"audio/s3m": [
		"s3m"
	],
	"audio/silk": [
		"sil"
	],
	"audio/vnd.dece.audio": [
		"uva",
		"uvva"
	],
	"audio/vnd.digital-winds": [
		"eol"
	],
	"audio/vnd.dra": [
		"dra"
	],
	"audio/vnd.dts": [
		"dts"
	],
	"audio/vnd.dts.hd": [
		"dtshd"
	],
	"audio/vnd.lucent.voice": [
		"lvp"
	],
	"audio/vnd.ms-playready.media.pya": [
		"pya"
	],
	"audio/vnd.nuera.ecelp4800": [
		"ecelp4800"
	],
	"audio/vnd.nuera.ecelp7470": [
		"ecelp7470"
	],
	"audio/vnd.nuera.ecelp9600": [
		"ecelp9600"
	],
	"audio/vnd.rip": [
		"rip"
	],
	"audio/webm": [
		"weba"
	],
	"audio/x-aac": [
		"aac"
	],
	"audio/x-aiff": [
		"aif",
		"aiff",
		"aifc"
	],
	"audio/x-caf": [
		"caf"
	],
	"audio/x-flac": [
		"flac"
	],
	"audio/x-matroska": [
		"mka"
	],
	"audio/x-mpegurl": [
		"m3u"
	],
	"audio/x-ms-wax": [
		"wax"
	],
	"audio/x-ms-wma": [
		"wma"
	],
	"audio/x-pn-realaudio": [
		"ram",
		"ra"
	],
	"audio/x-pn-realaudio-plugin": [
		"rmp"
	],
	"audio/x-wav": [
		"wav"
	],
	"audio/xm": [
		"xm"
	],
	"chemical/x-cdx": [
		"cdx"
	],
	"chemical/x-cif": [
		"cif"
	],
	"chemical/x-cmdf": [
		"cmdf"
	],
	"chemical/x-cml": [
		"cml"
	],
	"chemical/x-csml": [
		"csml"
	],
	"chemical/x-xyz": [
		"xyz"
	],
	"font/opentype": [
		"otf"
	],
	"image/bmp": [
		"bmp"
	],
	"image/cgm": [
		"cgm"
	],
	"image/g3fax": [
		"g3"
	],
	"image/gif": [
		"gif"
	],
	"image/ief": [
		"ief"
	],
	"image/jpeg": [
		"jpeg",
		"jpg",
		"jpe"
	],
	"image/ktx": [
		"ktx"
	],
	"image/png": [
		"png"
	],
	"image/prs.btif": [
		"btif"
	],
	"image/sgi": [
		"sgi"
	],
	"image/svg+xml": [
		"svg",
		"svgz"
	],
	"image/tiff": [
		"tiff",
		"tif"
	],
	"image/vnd.adobe.photoshop": [
		"psd"
	],
	"image/vnd.dece.graphic": [
		"uvi",
		"uvvi",
		"uvg",
		"uvvg"
	],
	"image/vnd.djvu": [
		"djvu",
		"djv"
	],
	"image/vnd.dvb.subtitle": [
		"sub"
	],
	"image/vnd.dwg": [
		"dwg"
	],
	"image/vnd.dxf": [
		"dxf"
	],
	"image/vnd.fastbidsheet": [
		"fbs"
	],
	"image/vnd.fpx": [
		"fpx"
	],
	"image/vnd.fst": [
		"fst"
	],
	"image/vnd.fujixerox.edmics-mmr": [
		"mmr"
	],
	"image/vnd.fujixerox.edmics-rlc": [
		"rlc"
	],
	"image/vnd.ms-modi": [
		"mdi"
	],
	"image/vnd.ms-photo": [
		"wdp"
	],
	"image/vnd.net-fpx": [
		"npx"
	],
	"image/vnd.wap.wbmp": [
		"wbmp"
	],
	"image/vnd.xiff": [
		"xif"
	],
	"image/webp": [
		"webp"
	],
	"image/x-3ds": [
		"3ds"
	],
	"image/x-cmu-raster": [
		"ras"
	],
	"image/x-cmx": [
		"cmx"
	],
	"image/x-freehand": [
		"fh",
		"fhc",
		"fh4",
		"fh5",
		"fh7"
	],
	"image/x-icon": [
		"ico"
	],
	"image/x-mrsid-image": [
		"sid"
	],
	"image/x-pcx": [
		"pcx"
	],
	"image/x-pict": [
		"pic",
		"pct"
	],
	"image/x-portable-anymap": [
		"pnm"
	],
	"image/x-portable-bitmap": [
		"pbm"
	],
	"image/x-portable-graymap": [
		"pgm"
	],
	"image/x-portable-pixmap": [
		"ppm"
	],
	"image/x-rgb": [
		"rgb"
	],
	"image/x-tga": [
		"tga"
	],
	"image/x-xbitmap": [
		"xbm"
	],
	"image/x-xpixmap": [
		"xpm"
	],
	"image/x-xwindowdump": [
		"xwd"
	],
	"message/rfc822": [
		"eml",
		"mime"
	],
	"model/iges": [
		"igs",
		"iges"
	],
	"model/mesh": [
		"msh",
		"mesh",
		"silo"
	],
	"model/vnd.collada+xml": [
		"dae"
	],
	"model/vnd.dwf": [
		"dwf"
	],
	"model/vnd.gdl": [
		"gdl"
	],
	"model/vnd.gtw": [
		"gtw"
	],
	"model/vnd.mts": [
		"mts"
	],
	"model/vnd.vtu": [
		"vtu"
	],
	"model/vrml": [
		"wrl",
		"vrml"
	],
	"model/x3d+binary": [
		"x3db",
		"x3dbz"
	],
	"model/x3d+vrml": [
		"x3dv",
		"x3dvz"
	],
	"model/x3d+xml": [
		"x3d",
		"x3dz"
	],
	"text/cache-manifest": [
		"appcache",
		"manifest"
	],
	"text/calendar": [
		"ics",
		"ifb"
	],
	"text/coffeescript": [
		"coffee"
	],
	"text/css": [
		"css"
	],
	"text/csv": [
		"csv"
	],
	"text/hjson": [
		"hjson"
	],
	"text/html": [
		"html",
		"htm"
	],
	"text/jade": [
		"jade"
	],
	"text/jsx": [
		"jsx"
	],
	"text/less": [
		"less"
	],
	"text/n3": [
		"n3"
	],
	"text/plain": [
		"txt",
		"text",
		"conf",
		"def",
		"list",
		"log",
		"in",
		"ini"
	],
	"text/prs.lines.tag": [
		"dsc"
	],
	"text/richtext": [
		"rtx"
	],
	"text/sgml": [
		"sgml",
		"sgm"
	],
	"text/stylus": [
		"stylus",
		"styl"
	],
	"text/tab-separated-values": [
		"tsv"
	],
	"text/troff": [
		"t",
		"tr",
		"roff",
		"man",
		"me",
		"ms"
	],
	"text/turtle": [
		"ttl"
	],
	"text/uri-list": [
		"uri",
		"uris",
		"urls"
	],
	"text/vcard": [
		"vcard"
	],
	"text/vnd.curl": [
		"curl"
	],
	"text/vnd.curl.dcurl": [
		"dcurl"
	],
	"text/vnd.curl.mcurl": [
		"mcurl"
	],
	"text/vnd.curl.scurl": [
		"scurl"
	],
	"text/vnd.dvb.subtitle": [
		"sub"
	],
	"text/vnd.fly": [
		"fly"
	],
	"text/vnd.fmi.flexstor": [
		"flx"
	],
	"text/vnd.graphviz": [
		"gv"
	],
	"text/vnd.in3d.3dml": [
		"3dml"
	],
	"text/vnd.in3d.spot": [
		"spot"
	],
	"text/vnd.sun.j2me.app-descriptor": [
		"jad"
	],
	"text/vnd.wap.wml": [
		"wml"
	],
	"text/vnd.wap.wmlscript": [
		"wmls"
	],
	"text/vtt": [
		"vtt"
	],
	"text/x-asm": [
		"s",
		"asm"
	],
	"text/x-c": [
		"c",
		"cc",
		"cxx",
		"cpp",
		"h",
		"hh",
		"dic"
	],
	"text/x-component": [
		"htc"
	],
	"text/x-fortran": [
		"f",
		"for",
		"f77",
		"f90"
	],
	"text/x-handlebars-template": [
		"hbs"
	],
	"text/x-java-source": [
		"java"
	],
	"text/x-lua": [
		"lua"
	],
	"text/x-markdown": [
		"markdown",
		"md",
		"mkd"
	],
	"text/x-nfo": [
		"nfo"
	],
	"text/x-opml": [
		"opml"
	],
	"text/x-pascal": [
		"p",
		"pas"
	],
	"text/x-sass": [
		"sass"
	],
	"text/x-scss": [
		"scss"
	],
	"text/x-setext": [
		"etx"
	],
	"text/x-sfv": [
		"sfv"
	],
	"text/x-uuencode": [
		"uu"
	],
	"text/x-vcalendar": [
		"vcs"
	],
	"text/x-vcard": [
		"vcf"
	],
	"text/yaml": [
		"yaml",
		"yml"
	],
	"video/3gpp": [
		"3gp"
	],
	"video/3gpp2": [
		"3g2"
	],
	"video/h261": [
		"h261"
	],
	"video/h263": [
		"h263"
	],
	"video/h264": [
		"h264"
	],
	"video/jpeg": [
		"jpgv"
	],
	"video/jpm": [
		"jpm",
		"jpgm"
	],
	"video/mj2": [
		"mj2",
		"mjp2"
	],
	"video/mp2t": [
		"ts"
	],
	"video/mp4": [
		"mp4",
		"mp4v",
		"mpg4"
	],
	"video/mpeg": [
		"mpeg",
		"mpg",
		"mpe",
		"m1v",
		"m2v"
	],
	"video/ogg": [
		"ogv"
	],
	"video/quicktime": [
		"qt",
		"mov"
	],
	"video/vnd.dece.hd": [
		"uvh",
		"uvvh"
	],
	"video/vnd.dece.mobile": [
		"uvm",
		"uvvm"
	],
	"video/vnd.dece.pd": [
		"uvp",
		"uvvp"
	],
	"video/vnd.dece.sd": [
		"uvs",
		"uvvs"
	],
	"video/vnd.dece.video": [
		"uvv",
		"uvvv"
	],
	"video/vnd.dvb.file": [
		"dvb"
	],
	"video/vnd.fvt": [
		"fvt"
	],
	"video/vnd.mpegurl": [
		"mxu",
		"m4u"
	],
	"video/vnd.ms-playready.media.pyv": [
		"pyv"
	],
	"video/vnd.uvvu.mp4": [
		"uvu",
		"uvvu"
	],
	"video/vnd.vivo": [
		"viv"
	],
	"video/webm": [
		"webm"
	],
	"video/x-f4v": [
		"f4v"
	],
	"video/x-fli": [
		"fli"
	],
	"video/x-flv": [
		"flv"
	],
	"video/x-m4v": [
		"m4v"
	],
	"video/x-matroska": [
		"mkv",
		"mk3d",
		"mks"
	],
	"video/x-mng": [
		"mng"
	],
	"video/x-ms-asf": [
		"asf",
		"asx"
	],
	"video/x-ms-vob": [
		"vob"
	],
	"video/x-ms-wm": [
		"wm"
	],
	"video/x-ms-wmv": [
		"wmv"
	],
	"video/x-ms-wmx": [
		"wmx"
	],
	"video/x-ms-wvx": [
		"wvx"
	],
	"video/x-msvideo": [
		"avi"
	],
	"video/x-sgi-movie": [
		"movie"
	],
	"video/x-smv": [
		"smv"
	],
	"x-conference/x-cooltalk": [
		"ice"
	]
};

/***/ }),
/* 38 */
/***/ (function(module, exports) {

module.exports = require("events");

/***/ }),
/* 39 */
/***/ (function(module, exports) {

module.exports = require("os");

/***/ }),
/* 40 */
/***/ (function(module, exports) {

module.exports = require("stream");

/***/ }),
/* 41 */
/***/ (function(module, exports) {

module.exports = require("util");

/***/ })
/******/ ]);