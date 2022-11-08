(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        //Allow using this built library as an AMD module
        //in another project. That other project will only
        //see this AMD call, not the internal modules in
        //the closure below.
        define([], factory);
    } else {
        //Browser globals case. Just assign the
        //result to a property on the global.
        root.libGlobalName = factory();
    }
}(this, function () {
    //almond, and your modules will be inlined here
/**
 * @license almond 0.3.2 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, http://github.com/requirejs/almond/LICENSE
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part, normalizedBaseParts,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name) {
            name = name.split('/');
            lastIndex = name.length - 1;

            // If wanting node ID compatibility, strip .js from end
            // of IDs. Have to do this here, and not in nameToUrl
            // because node allows either .js or non .js to map
            // to same file.
            if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
            }

            // Starts with a '.' so need the baseName
            if (name[0].charAt(0) === '.' && baseParts) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that 'directory' and not name of the baseName's
                //module. For instance, baseName of 'one/two/three', maps to
                //'one/two/three.js', but we want the directory, 'one/two' for
                //this normalization.
                normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                name = normalizedBaseParts.concat(name);
            }

            //start trimDots
            for (i = 0; i < name.length; i++) {
                part = name[i];
                if (part === '.') {
                    name.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        name.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
            //end trimDots

            name = name.join('/');
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
define("vendor/deploy/almond", function(){});

!function(a){"use strict";function f(a){if("string"!=typeof a&&(a=String(a)),/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(a))throw new TypeError("Invalid character in header field name");return a.toLowerCase()}function g(a){return"string"!=typeof a&&(a=String(a)),a}function h(a){var c={next:function(){var b=a.shift();return{done:void 0===b,value:b}}};return b.iterable&&(c[Symbol.iterator]=function(){return c}),c}function i(a){this.map={},a instanceof i?a.forEach(function(a,b){this.append(b,a)},this):a&&Object.getOwnPropertyNames(a).forEach(function(b){this.append(b,a[b])},this)}function j(a){return a.bodyUsed?Promise.reject(new TypeError("Already read")):void(a.bodyUsed=!0)}function k(a){return new Promise(function(b,c){a.onload=function(){b(a.result)},a.onerror=function(){c(a.error)}})}function l(a){var b=new FileReader,c=k(b);return b.readAsArrayBuffer(a),c}function m(a){var b=new FileReader,c=k(b);return b.readAsText(a),c}function n(a){for(var b=new Uint8Array(a),c=new Array(b.length),d=0;d<b.length;d++)c[d]=String.fromCharCode(b[d]);return c.join("")}function o(a){if(a.slice)return a.slice(0);var b=new Uint8Array(a.byteLength);return b.set(new Uint8Array(a)),b.buffer}function p(){return this.bodyUsed=!1,this._initBody=function(a){if(this._bodyInit=a,a)if("string"==typeof a)this._bodyText=a;else if(b.blob&&Blob.prototype.isPrototypeOf(a))this._bodyBlob=a;else if(b.formData&&FormData.prototype.isPrototypeOf(a))this._bodyFormData=a;else if(b.searchParams&&URLSearchParams.prototype.isPrototypeOf(a))this._bodyText=a.toString();else if(b.arrayBuffer&&b.blob&&d(a))this._bodyArrayBuffer=o(a.buffer),this._bodyInit=new Blob([this._bodyArrayBuffer]);else{if(!b.arrayBuffer||!ArrayBuffer.prototype.isPrototypeOf(a)&&!e(a))throw new Error("unsupported BodyInit type");this._bodyArrayBuffer=o(a)}else this._bodyText="";this.headers.get("content-type")||("string"==typeof a?this.headers.set("content-type","text/plain;charset=UTF-8"):this._bodyBlob&&this._bodyBlob.type?this.headers.set("content-type",this._bodyBlob.type):b.searchParams&&URLSearchParams.prototype.isPrototypeOf(a)&&this.headers.set("content-type","application/x-www-form-urlencoded;charset=UTF-8"))},b.blob&&(this.blob=function(){var a=j(this);if(a)return a;if(this._bodyBlob)return Promise.resolve(this._bodyBlob);if(this._bodyArrayBuffer)return Promise.resolve(new Blob([this._bodyArrayBuffer]));if(this._bodyFormData)throw new Error("could not read FormData body as blob");return Promise.resolve(new Blob([this._bodyText]))},this.arrayBuffer=function(){return this._bodyArrayBuffer?j(this)||Promise.resolve(this._bodyArrayBuffer):this.blob().then(l)}),this.text=function(){var a=j(this);if(a)return a;if(this._bodyBlob)return m(this._bodyBlob);if(this._bodyArrayBuffer)return Promise.resolve(n(this._bodyArrayBuffer));if(this._bodyFormData)throw new Error("could not read FormData body as text");return Promise.resolve(this._bodyText)},b.formData&&(this.formData=function(){return this.text().then(t)}),this.json=function(){return this.text().then(JSON.parse)},this}function r(a){var b=a.toUpperCase();return q.indexOf(b)>-1?b:a}function s(a,b){b=b||{};var c=b.body;if("string"==typeof a)this.url=a;else{if(a.bodyUsed)throw new TypeError("Already read");this.url=a.url,this.credentials=a.credentials,b.headers||(this.headers=new i(a.headers)),this.method=a.method,this.mode=a.mode,c||null==a._bodyInit||(c=a._bodyInit,a.bodyUsed=!0)}if(this.credentials=b.credentials||this.credentials||"omit",!b.headers&&this.headers||(this.headers=new i(b.headers)),this.method=r(b.method||this.method||"GET"),this.mode=b.mode||this.mode||null,this.referrer=null,("GET"===this.method||"HEAD"===this.method)&&c)throw new TypeError("Body not allowed for GET or HEAD requests");this._initBody(c)}function t(a){var b=new FormData;return a.trim().split("&").forEach(function(a){if(a){var c=a.split("="),d=c.shift().replace(/\+/g," "),e=c.join("=").replace(/\+/g," ");b.append(decodeURIComponent(d),decodeURIComponent(e))}}),b}function u(a){var b=new i;return a.split(/\r?\n/).forEach(function(a){var c=a.split(":"),d=c.shift().trim();if(d){var e=c.join(":").trim();b.append(d,e)}}),b}function v(a,b){b||(b={}),this.type="default",this.status="status"in b?b.status:200,this.ok=this.status>=200&&this.status<300,this.statusText="statusText"in b?b.statusText:"OK",this.headers=new i(b.headers),this.url=b.url||"",this._initBody(a)}if(!a.fetch){var b={searchParams:"URLSearchParams"in a,iterable:"Symbol"in a&&"iterator"in Symbol,blob:"FileReader"in a&&"Blob"in a&&function(){try{return new Blob,!0}catch(a){return!1}}(),formData:"FormData"in a,arrayBuffer:"ArrayBuffer"in a};if(b.arrayBuffer)var c=["[object Int8Array]","[object Uint8Array]","[object Uint8ClampedArray]","[object Int16Array]","[object Uint16Array]","[object Int32Array]","[object Uint32Array]","[object Float32Array]","[object Float64Array]"],d=function(a){return a&&DataView.prototype.isPrototypeOf(a)},e=ArrayBuffer.isView||function(a){return a&&c.indexOf(Object.prototype.toString.call(a))>-1};i.prototype.append=function(a,b){a=f(a),b=g(b);var c=this.map[a];this.map[a]=c?c+","+b:b},i.prototype.delete=function(a){delete this.map[f(a)]},i.prototype.get=function(a){return a=f(a),this.has(a)?this.map[a]:null},i.prototype.has=function(a){return this.map.hasOwnProperty(f(a))},i.prototype.set=function(a,b){this.map[f(a)]=g(b)},i.prototype.forEach=function(a,b){for(var c in this.map)this.map.hasOwnProperty(c)&&a.call(b,this.map[c],c,this)},i.prototype.keys=function(){var a=[];return this.forEach(function(b,c){a.push(c)}),h(a)},i.prototype.values=function(){var a=[];return this.forEach(function(b){a.push(b)}),h(a)},i.prototype.entries=function(){var a=[];return this.forEach(function(b,c){a.push([c,b])}),h(a)},b.iterable&&(i.prototype[Symbol.iterator]=i.prototype.entries);var q=["DELETE","GET","HEAD","OPTIONS","POST","PUT"];s.prototype.clone=function(){return new s(this,{body:this._bodyInit})},p.call(s.prototype),p.call(v.prototype),v.prototype.clone=function(){return new v(this._bodyInit,{status:this.status,statusText:this.statusText,headers:new i(this.headers),url:this.url})},v.error=function(){var a=new v(null,{status:0,statusText:""});return a.type="error",a};var w=[301,302,303,307,308];v.redirect=function(a,b){if(w.indexOf(b)===-1)throw new RangeError("Invalid status code");return new v(null,{status:b,headers:{location:a}})},a.Headers=i,a.Request=s,a.Response=v,a.fetch=function(a,c){return new Promise(function(d,e){var f=new s(a,c),g=new XMLHttpRequest;g.onload=function(){var a={status:g.status,statusText:g.statusText,headers:u(g.getAllResponseHeaders()||"")};a.url="responseURL"in g?g.responseURL:a.headers.get("X-Request-URL");var b="response"in g?g.response:g.responseText;d(new v(b,a))},g.onerror=function(){e(new TypeError("Network request failed"))},g.ontimeout=function(){e(new TypeError("Network request failed"))},g.open(f.method,f.url,!0),"include"===f.credentials&&(g.withCredentials=!0),"responseType"in g&&b.blob&&(g.responseType="blob"),f.headers.forEach(function(a,b){g.setRequestHeader(b,a)}),g.send("undefined"==typeof f._bodyInit?null:f._bodyInit)})},a.fetch.polyfill=!0}}("undefined"!=typeof self?self:this);
define("vendor/shared/fetch", function(){});

!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define('vendor/shared/es6-promise.auto.min',e):t.ES6Promise=e()}(this,function(){"use strict";function t(t){var e=typeof t;return null!==t&&("object"===e||"function"===e)}function e(t){return"function"==typeof t}function n(t){B=t}function r(t){G=t}function o(){return function(){return process.nextTick(a)}}function i(){return"undefined"!=typeof z?function(){z(a)}:c()}function s(){var t=0,e=new J(a),n=document.createTextNode("");return e.observe(n,{characterData:!0}),function(){n.data=t=++t%2}}function u(){var t=new MessageChannel;return t.port1.onmessage=a,function(){return t.port2.postMessage(0)}}function c(){var t=setTimeout;return function(){return t(a,1)}}function a(){for(var t=0;t<W;t+=2){var e=V[t],n=V[t+1];e(n),V[t]=void 0,V[t+1]=void 0}W=0}function f(){try{var t=Function("return this")().require("vertx");return z=t.runOnLoop||t.runOnContext,i()}catch(e){return c()}}function l(t,e){var n=this,r=new this.constructor(p);void 0===r[Z]&&O(r);var o=n._state;if(o){var i=arguments[o-1];G(function(){return P(o,r,i,n._result)})}else E(n,r,t,e);return r}function h(t){var e=this;if(t&&"object"==typeof t&&t.constructor===e)return t;var n=new e(p);return g(n,t),n}function p(){}function v(){return new TypeError("You cannot resolve a promise with itself")}function d(){return new TypeError("A promises callback cannot return that same promise.")}function _(t){try{return t.then}catch(e){return nt.error=e,nt}}function y(t,e,n,r){try{t.call(e,n,r)}catch(o){return o}}function m(t,e,n){G(function(t){var r=!1,o=y(n,e,function(n){r||(r=!0,e!==n?g(t,n):S(t,n))},function(e){r||(r=!0,j(t,e))},"Settle: "+(t._label||" unknown promise"));!r&&o&&(r=!0,j(t,o))},t)}function b(t,e){e._state===tt?S(t,e._result):e._state===et?j(t,e._result):E(e,void 0,function(e){return g(t,e)},function(e){return j(t,e)})}function w(t,n,r){n.constructor===t.constructor&&r===l&&n.constructor.resolve===h?b(t,n):r===nt?(j(t,nt.error),nt.error=null):void 0===r?S(t,n):e(r)?m(t,n,r):S(t,n)}function g(e,n){e===n?j(e,v()):t(n)?w(e,n,_(n)):S(e,n)}function A(t){t._onerror&&t._onerror(t._result),T(t)}function S(t,e){t._state===$&&(t._result=e,t._state=tt,0!==t._subscribers.length&&G(T,t))}function j(t,e){t._state===$&&(t._state=et,t._result=e,G(A,t))}function E(t,e,n,r){var o=t._subscribers,i=o.length;t._onerror=null,o[i]=e,o[i+tt]=n,o[i+et]=r,0===i&&t._state&&G(T,t)}function T(t){var e=t._subscribers,n=t._state;if(0!==e.length){for(var r=void 0,o=void 0,i=t._result,s=0;s<e.length;s+=3)r=e[s],o=e[s+n],r?P(n,r,o,i):o(i);t._subscribers.length=0}}function M(t,e){try{return t(e)}catch(n){return nt.error=n,nt}}function P(t,n,r,o){var i=e(r),s=void 0,u=void 0,c=void 0,a=void 0;if(i){if(s=M(r,o),s===nt?(a=!0,u=s.error,s.error=null):c=!0,n===s)return void j(n,d())}else s=o,c=!0;n._state!==$||(i&&c?g(n,s):a?j(n,u):t===tt?S(n,s):t===et&&j(n,s))}function x(t,e){try{e(function(e){g(t,e)},function(e){j(t,e)})}catch(n){j(t,n)}}function C(){return rt++}function O(t){t[Z]=rt++,t._state=void 0,t._result=void 0,t._subscribers=[]}function k(){return new Error("Array Methods must be provided an Array")}function F(t){return new ot(this,t).promise}function Y(t){var e=this;return new e(U(t)?function(n,r){for(var o=t.length,i=0;i<o;i++)e.resolve(t[i]).then(n,r)}:function(t,e){return e(new TypeError("You must pass an array to race."))})}function q(t){var e=this,n=new e(p);return j(n,t),n}function D(){throw new TypeError("You must pass a resolver function as the first argument to the promise constructor")}function K(){throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.")}function L(){var t=void 0;if("undefined"!=typeof global)t=global;else if("undefined"!=typeof self)t=self;else try{t=Function("return this")()}catch(e){throw new Error("polyfill failed because global object is unavailable in this environment")}var n=t.Promise;if(n){var r=null;try{r=Object.prototype.toString.call(n.resolve())}catch(e){}if("[object Promise]"===r&&!n.cast)return}t.Promise=it}var N=void 0;N=Array.isArray?Array.isArray:function(t){return"[object Array]"===Object.prototype.toString.call(t)};var U=N,W=0,z=void 0,B=void 0,G=function(t,e){V[W]=t,V[W+1]=e,W+=2,2===W&&(B?B(a):X())},H="undefined"!=typeof window?window:void 0,I=H||{},J=I.MutationObserver||I.WebKitMutationObserver,Q="undefined"==typeof self&&"undefined"!=typeof process&&"[object process]"==={}.toString.call(process),R="undefined"!=typeof Uint8ClampedArray&&"undefined"!=typeof importScripts&&"undefined"!=typeof MessageChannel,V=new Array(1e3),X=void 0;X=Q?o():J?s():R?u():void 0===H&&"function"==typeof require?f():c();var Z=Math.random().toString(36).substring(2),$=void 0,tt=1,et=2,nt={error:null},rt=0,ot=function(){function t(t,e){this._instanceConstructor=t,this.promise=new t(p),this.promise[Z]||O(this.promise),U(e)?(this.length=e.length,this._remaining=e.length,this._result=new Array(this.length),0===this.length?S(this.promise,this._result):(this.length=this.length||0,this._enumerate(e),0===this._remaining&&S(this.promise,this._result))):j(this.promise,k())}return t.prototype._enumerate=function(t){for(var e=0;this._state===$&&e<t.length;e++)this._eachEntry(t[e],e)},t.prototype._eachEntry=function(t,e){var n=this._instanceConstructor,r=n.resolve;if(r===h){var o=_(t);if(o===l&&t._state!==$)this._settledAt(t._state,e,t._result);else if("function"!=typeof o)this._remaining--,this._result[e]=t;else if(n===it){var i=new n(p);w(i,t,o),this._willSettleAt(i,e)}else this._willSettleAt(new n(function(e){return e(t)}),e)}else this._willSettleAt(r(t),e)},t.prototype._settledAt=function(t,e,n){var r=this.promise;r._state===$&&(this._remaining--,t===et?j(r,n):this._result[e]=n),0===this._remaining&&S(r,this._result)},t.prototype._willSettleAt=function(t,e){var n=this;E(t,void 0,function(t){return n._settledAt(tt,e,t)},function(t){return n._settledAt(et,e,t)})},t}(),it=function(){function t(e){this[Z]=C(),this._result=this._state=void 0,this._subscribers=[],p!==e&&("function"!=typeof e&&D(),this instanceof t?x(this,e):K())}return t.prototype["catch"]=function(t){return this.then(null,t)},t.prototype["finally"]=function(t){var e=this,n=e.constructor;return e.then(function(e){return n.resolve(t()).then(function(){return e})},function(e){return n.resolve(t()).then(function(){throw e})})},t}();return it.prototype.then=l,it.all=F,it.race=Y,it.resolve=h,it.reject=q,it._setScheduler=n,it._setAsap=r,it._asap=G,it.polyfill=L,it.Promise=it,it.polyfill(),it});
(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c){ return c(i,!0); }if(u){ return u(i,!0); }var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++){ o(t[i]); }return o}return r})()({1:[function(require,module,exports){
"use strict";var _adviceService=_interopRequireDefault(require("../services/adviceService.js"));function _interopRequireDefault(e){return e&&e.__esModule?e:{default:e}}window.adviceService=_adviceService.default;

},{"../services/adviceService.js":2}],2:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0}),exports.default=void 0;var schemas={orgSchema:"{ \n    description\n    ein\n    guid\n    location\n    name\n    slug\n    tagline\n    type\n    attrs\n  }",campaignSchema:"{\n    content\n    name\n    guid\n    slug\n  }",readMoreSchema:"readMore(content_id: $content_id, partner_id: $partner_id, environment: $environment) {\n    URL\n    snippet\n    title\n  }"};function getAdvice(e,n,a){return function(t){var r={query:"query getAdvice($url:String, $partner_id:String, $target_id: String, $ignore_advice: Boolean, $bypass_geo: Boolean) {\n      getAdvice(url: $url, partner_id: $partner_id, target_id: $target_id, ignore_advice: $ignore_advice, bypass_geo: $bypass_geo) {\n        action\n        content {\n          content_id\n          cid_match_type\n          partner_id\n          title\n          hide\n          tag\n          target_id\n          qa_verified\n          is_override\n          is_filter\n          url_id\n          parent_org\n          rules_match_info\n        }\n        url\n        targetData {\n          campaign_id\n          hasReadMore\n          partner_id\n          parent_org\n          target_id\n          widget_type\n          widgets_start_as_buttons\n          hideReason\n          deviceType\n          cpm\n        }\n      }\n    }",variables:{url:a,partner_id:n||"publicgood",target_id:e,ignore_advice:t.ignoreAdvice,bypass_geo:t.bypassGeo},operationName:"getAdvice"};t={method:"POST",mode:"cors",headers:{"x-api-key":"da2-qgtw6jdhhjed3eocynczdx3b7e","Content-Type":"application/graphql"},body:JSON.stringify(r)};return fetch("https://drwaiqwbfbh5tnyqhfr7dknnei.appsync-api.us-east-1.amazonaws.com/graphql",t)}(arguments.length>3&&void 0!==arguments[3]?arguments[3]:{})}function getCampaignSchema(e,n,a,t){return{query:"query getPGMData($target_id:String, $partner_id:String, ".concat(t?"$content_id:Int, ":""," $environment: String) {\n      getPGMData {\n        campaign(target_id: $target_id, environment: $environment)\n        ").concat(schemas.campaignSchema,"\n        campaignMembers(target_id: $target_id, environment: $environment) {\n          originator\n          ").concat(schemas.orgSchema,"\n          sponsor\n          ").concat(schemas.orgSchema,"\n          beneficiaries\n          ").concat(schemas.orgSchema,"\n          participants\n          ").concat(schemas.orgSchema,"\n        }\n        partner(partner_id: $partner_id, environment: $environment)\n        ").concat(schemas.orgSchema,"\n        config(environment: $environment) {\n          trackers\n        }\n        ").concat(t?schemas.readMoreSchema:"","\n        rtssData(target_id: $target_id)\n      }\n    }"),variables:{target_id:e,partner_id:n||"publicgood",content_id:a||0,environment:"production"},operationName:"getPGMData"}}function getCampaignData(e,n,a,t){var r={method:"POST",mode:"cors",headers:{"x-api-key":"da2-qgtw6jdhhjed3eocynczdx3b7e","Content-Type":"application/graphql"},body:JSON.stringify(getCampaignSchema(e,n,a,t))};return fetch("https://drwaiqwbfbh5tnyqhfr7dknnei.appsync-api.us-east-1.amazonaws.com/graphql",r).then(function(e){return e.json()}).then(function(e){var n=e&&e.data&&e.data.getPGMData?e.data.getPGMData:{};if(n.campaign&&n.campaign.content&&(n.campaign.content=JSON.parse(n.campaign.content),n.campaign.content.pgmEngagement&&(n.campaign.content.pgmEngagement=JSON.parse(n.campaign.content.pgmEngagement))),n.partner&&n.partner.attrs&&(n.partner.attrs=JSON.parse(n.partner.attrs)),n.campaignMembers){if(n.campaignMembers.originator&&n.campaignMembers.originator.attrs&&(n.campaignMembers.originator.attrs=JSON.parse(n.campaignMembers.originator.attrs)),n.campaignMembers.sponsor&&n.campaignMembers.sponsor.attrs&&(n.campaignMembers.sponsor.attrs=JSON.parse(n.campaignMembers.sponsor.attrs)),n.campaignMembers.participants&&n.campaignMembers.participants.length>0){ for(var a=0;a<n.campaignMembers.participants.length;a++){ n.campaignMembers.participants[a].attrs=JSON.parse(n.campaignMembers.participants[a].attrs); } }if(n.campaignMembers.beneficiaries&&n.campaignMembers.beneficiaries.length>0){ for(a=0;a<n.campaignMembers.beneficiaries.length;a++){ n.campaignMembers.beneficiaries[a].attrs=JSON.parse(n.campaignMembers.beneficiaries[a].attrs); } }n.rtssData&&(n.rtssData=JSON.parse(n.rtssData))}return n})}var _default={getAdvice:getAdvice,getCampaignData:getCampaignData};exports.default=_default;

},{}]},{},[1]);

define("../dist/v3/js/imports/deployer_imports", function(){});

var utils = (function () {

  var months = {
    0: 'January',
    1: 'February',
    2: 'March',
    3: 'April',
    4: 'May',
    5: 'June',
    6: 'July',
    7: 'August',
    8: 'September',
    9: 'October',
    10: 'November',
    11: 'December'
  }

  var isMobile = {
    Android: function() {
        return navigator.userAgent.match(/Android/i);
    },
    BlackBerry: function() {
        return navigator.userAgent.match(/BlackBerry/i);
    },
    iOS: function() {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i);
    },
    Nokia: function() {
        return navigator.userAgent.match(/SymbianOS/i);
    },
    Windows: function() {
        return navigator.userAgent.match(/IEMobile/i);
    },
    any: function() {
        return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Nokia() || isMobile.Windows());
    }
  };

  function shadeColor(color, percent) {
      var f=color.indexOf("#") === 0 ? parseInt(color.slice(1),16) : parseInt(color,16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
      return (0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
  }

  function create_UUID(){
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
  }

  function isValid(type, data) {

    switch(type) {
      case "email":
        if (/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(data)) {
          return (true);
        }
        break;
      case "zip":
        if (/(^\d{5}$)|(^\d{5}-\d{4}$)/.test(data)) { // US
          return true;
        } else if (/([ABCEGHJKLMNPRSTVXY]\d)([ABCEGHJKLMNPRSTVWXYZ]\d){2}/i.test(data.replace(/\W+/g, ''))) { // Canada
          return true;
        }
        break;
      case "phone":
        if (/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im.test(data)) {
          return true;
        }
        break;
    }

    return false;
  }

  function initCustomTextLinks(id) {
    var anchors = document.querySelectorAll("#"+ id + " a");

    for (var i=0; i<anchors.length;i++) {
      anchors[i].setAttribute('target', '_blank');
      anchors[i].classList.add("brand-color");
      anchors[i].addEventListener("click", function(e){
        eventService.send('click', e.currentTarget.innerText);
      });
    }
  }

  function formatDate(fullDate) {
    var date = new Date(fullDate);
    console.log.apply(date);
    return months[date.getMonth()] + " " + ((date.getDate() > 9) ? date.getDate() : ('0' + date.getDate())) + ', ' + date.getFullYear();
  }

  function parseURL(url) {
    var parser = document.createElement('a'),
        searchObject = {},
        queries, split, i;
    // Let the browser do the work
    parser.href = url;
    // Convert query string to object
    queries = parser.search.replace(/^\?/, '').split('&');
    for( i = 0; i < queries.length; i++ ) {
        split = queries[i].split('=');
        searchObject[split[0]] = split[1];
    }
    return {
        protocol: parser.protocol,
        host: parser.host,
        hostname: parser.hostname,
        port: parser.port,
        pathname: parser.pathname,
        search: parser.search,
        searchObject: searchObject,
        hash: parser.hash
    };
  } 

  return {
    isMobile: isMobile,
    shadeColor: shadeColor,
    create_UUID: create_UUID,
    isValid: isValid,
    initCustomTextLinks: initCustomTextLinks,
    formatDate: formatDate,
    parseURL: parseURL
  }

})();
define("services/utils", function(){});

define('core',['vendor/shared/fetch', 'vendor/shared/es6-promise.auto.min', '../dist/v3/js/imports/deployer_imports', 'services/utils'], function() {
  var settings = {
    buttonUrl: "https://action.publicgood.com/button.html",
    cardUrl: "https://action.publicgood.com/embed.html",
    unitOrigin: "https://action.publicgood.com",
    environment: "production",
    adblockUrl: "https://assets.publicgood.com/pgm/v1/adblock/wp-banners.js?ad_slot=foo&adbannerid=bar",
    adBlockEnabled: false,
    widget: {
      button: {
        cssClass : "pgs-dpg-btn",
        url : "https://action.publicgood.com/",
        medium : "button",
        defaultDimensions: {
          width: "100%",
          height: "115"
        }
      },
      chat: {
        cssClass : "pgs-dpg-chat",
        altClasses : ["pgs-dpg-ex"],
        url : "https://action.publicgood.com/",
        medium : "chat",
        defaultDimensions: {
          width: "100%",
          height: "115"
        }
      },
      card: {
        cssClass : "pgs-dpg-card",
        url : "https://action.publicgood.com/",
        medium : "card",
        defaultDimensions: {
          width: "100%",
          height: "115"
        }
      },
      flex: {
        cssClass : "pgs-dpg-flex",
        url : "https://action.publicgood.com/",
        medium : "flex",
        defaultDimensions: {
          width: "100%",
          height: "115"
        }
      }
    },
    whitelistedParams: [
      "location",
      "variant",
      "url",
      "target-type",
      "target-id",
      "partner-id",
      "align",
      "descriptor",
      "action-id",
      "ignore-advice",
      "test-mode"
    ],
    whitelistedWidgets: [
      "button",
      "card",
      "chat",
      "flex"
    ],
    sessionID: utils.create_UUID()
  },

  module = {
    settings: settings,

    setMessageListener: setMessageListener,
    loadWidgets: loadWidgets,
    reloadWidgets: reloadWidgets,
    getAdvice: getAdvice,
    logError: logError
  },

  widgetDataArray = [],
  
  impressionTimerArray = [];

  window.addEventListener("pgs-reload", function() {
    console.log("reloading units");
    reloadWidgets();
  });
  window.addEventListener("pgs-reload-nogeo", function() {
    console.log("reloading units with no geofencing");
    reloadWidgets({bypassGeo: true});
  });

  return module;


  //////////////////////////////////////

  /**
   * Instantiates listeners for incoming cross-domain communication.  The format of the incoming
   * messages are as follow:
   * { type: widgetType, // widget type as defined in settings.widget
   *   action: eventAction, // predifined lister action name
   *   actionData: { data } // optional: data object specific to action
   * }
   */
  function setMessageListener(wndw) {
    wndw = wndw ? wndw : window;
    wndw.addEventListener("message", function(msg) {
      if (msg.origin !== settings.unitOrigin) {
        return;
      }
      var widgetType = msg.data.type;

      if (settings.whitelistedWidgets.indexOf(widgetType) === -1) {
        return;
      }

      var widgetClass = settings.widget[widgetType].cssClass;
      var action = msg.data.action;
      var data = msg.data.actionData || {};
      if (!widgetType) {
        return;
      }
      switch(action) {
        // figure out which iframe sent this message and adjust its height.
        // Input params: height, width
        case "setDimensions" :
          if (data.height || data.width) {
            var els = document.querySelectorAll("." + widgetClass + " iframe");
            try {
              if (document !== window.top.document) {
                els = Array.prototype.slice.call(els);
                els = els.concat(Array.prototype.slice.call(window.top.document.querySelectorAll("." + widgetClass + " iframe")));
              }
            } catch(e) {
              // no access to top
            }
            for (var i=0; i< els.length; i++) {
              if (els[i].contentWindow === msg.source) {
                if (data.height) {
                  els[i].style.height = isInt(data.height) ? data.height + "px" : data.height;
                }
                if (data.width) {
                  if (window.getComputedStyle(els[0]).width === "100%") {
                     els[i].style.width = "auto";
                  } else {
                    els[i].style.width = isInt(data.width) ? data.width + "px" : data.width;
                  }
                }
                if (els[i].parentNode.getAttribute("widget-loading") === "true") {
                  els[i].parentNode.setAttribute("widget-loading", false);
                }
                break;
              }
            }
            if (isInt(data.height)) {
              resizeAdFrame(data.height);
              postAMPMessage(data.height, Math.max(
                document.body.scrollWidth,
                document.body.offsetWidth,
                document.body.clientWidth
              ));
            }
          }
          break;
        case "getWidgetData":
          var els = document.querySelectorAll("." + widgetClass + " iframe");
          try {
            if (document !== window.top.document) {
              els = Array.prototype.slice.call(els);
              els = els.concat(Array.prototype.slice.call(window.top.document.querySelectorAll("." + widgetClass + " iframe")));
            }
          } catch(e) {
            // no access to top
          }
          for (var i=0; i< els.length; i++) {
            if (els[i].contentWindow === msg.source) {
              els[i].contentWindow.postMessage({ widgetData: widgetDataArray[els[i].parentNode.getAttribute("data-widget-index")] }, "*");
              break;
            }
          }
          break;
        default :
          console.log("undefined message");
      }
    }, false);
  }
  
  /**
   * Sets in motion the loading of all widgets on a page
   * @param {Dom element} containerEl - a starting dom element, usually document
   * @param {String} type - predefined widget type from settings.widget
   */
  function loadWidgets(containerEl, options) {

    try {

      if (!options) {
        options = {};
      }

      if (!containerEl) {
        containerEl = document;
      }

      var els,
        pre = "data-pgs",
        attrs,
        src,
        qsParams,
        articleUrl,
        partnerId,
        selectorArray = [];

      if (options.widgetType) {
        selectorArray.push("." + settings.widget[options.widgetType].cssClass + ":not([data-loaded])");
      } else {
        for (var prop in settings.widget) {
          if (settings.widget.hasOwnProperty(prop)) {
            selectorArray.push("." + settings.widget[prop].cssClass + ":not([data-loaded])");

            if (settings.widget[prop].altClasses) {
              for (var i=0, l=settings.widget[prop].altClasses.length, elems, altClass; i<l; i++) {
                altClass = settings.widget[prop].altClasses[i];
                elems = containerEl.querySelectorAll("." + altClass + ":not([data-loaded])");
                for (j=0; j<elems.length; j++) {
                  elems[i].classList.add(settings.widget[prop].cssClass);
                  elems[i].classList.remove(altClass);
                }
              }
            }
          }
        }
      }

      els = containerEl.querySelectorAll(selectorArray.join(", ") + ":not([data-loaded])");

      // cycle through each instance of the widget div found on the page
      for (var j = 0, k = els.length; j<k; j++) {

        var medium = getMedium(els[j].className);

        attrs = els[j].attributes;

        articleUrl = "";
        qsParams = {};
        partnerId = "";

        els[j].setAttribute("data-loaded", true);
        els[j].setAttribute("widget-loading", true);

        // for each "data-pgs" prefixed attribute on the element,
        // append a query string parameter to the iframe's source url
        // and also capture for the parade event ping
        for (var i = 0, l = attrs.length, attr, val, _attr; i < l; i++) {

          attr = attrs[i].name;
          val = encodeURIComponent(attrs[i].value);

          if (attr.indexOf(pre) !== -1) {

            _attr = attr.slice(9).replace("-", "_"); // remove prefix and replace hyphens with underscores

            qsParams[_attr] = val;

            if (attr === "data-pgs-url") {

              // If a url parameter is set, pass it on. If not, the url will be the parent window url
              articleUrl = decodeURIComponent(attrs[i].value) === attrs[i].value ? encodeURIComponent(attrs[i].value) : attrs[i].value;

            } 
            if (attr === "data-pgs-partner-id") {

              partnerId = attrs[i].value;
              qsParams["utm_source"] = partnerId;

            }

          }
        }

        qsParams["title"] = encodeURIComponent(getSocialTitle());

        if (!articleUrl) {

          // If url wasn't passed explicitly, the parent is the url
          articleUrl = encodeURIComponent(location);

          try {
            if (window.self !== window.top && document.referrer) {
              articleUrl = encodeURIComponent(document.referrer);
            }
          } catch (e) {
            if (document.referrer) {
              articleUrl = encodeURIComponent(document.referrer);
            }
          }

        }

        qsParams["url"] = articleUrl;
        qsParams["utm_content"] = articleUrl;
        qsParams["widget_type"] = medium;

        embedWidget(els[j], qsParams, medium, articleUrl, {bypassGeo: options.bypassGeo, adviceData: options.adviceData})
        .then(function(data){
          if (data === "hide" && typeof options.onHide === "function") {
            options.onHide();
          } else if (typeof options.onShow === "function") {
            options.onShow();
          }
        });

      }

    } catch (e) {
      logError("Error during load", e);
    }


  }

  function getMedium(cssClass) {
    for (var prop in settings.widget) {
      if (settings.widget.hasOwnProperty(prop)) {
        if (cssClass.indexOf(settings.widget[prop].cssClass) >=0) {
          return settings.widget[prop].medium;
        }
      }
    }
  }
  
  /**
   * Adds params from the advice call to a list of qsParams
   * @param {Object} advice
   * @param {Object} qsParams
   * @return {Object} qsParams
   */ 
  function addAdviceParams(advice, qsParams, el) {
    var content = advice.content || {},
    targetData = advice.targetData || {},
    partnerAttrs = (advice.partner && advice.partner.attrs ? advice.partner.attrs : null) || {};
    
    qsParams["action"] = advice.action;

    if (targetData.partner_id) {
      qsParams["utm_source"] = targetData.partner_id;
      qsParams["partner_id"] = targetData.partner_id;
    }

    // if this is a flex div and advice knows what widget type this should be, turn it into that widget
    if (qsParams["widget_type"] === "flex") {
      if (targetData.widget_type) {
        qsParams["widget_type"] = targetData.widget_type;
      } else {
        qsParams["widget_type"] = "button";
      }
      qsParams["is_flex"] = "true";
      el.className = settings.widget[qsParams["widget_type"]].cssClass;
    }

    qsParams["match_type"] = advice.targetData.matchType;

    // always use the ones from advice
    if (qsParams["target_id"]) {
      delete qsParams.target_id;
    }

    // content id title supersedes page title
    if (content.title) {
      qsParams["title"] = encodeURIComponent(content.title);
    }

    for (i in targetData) {
      if (!qsParams[i] && targetData[i]) {
        qsParams[i] = encodeURIComponent(targetData[i]);
      }
    }

    for (i in content) {
      if (!qsParams[i] && content[i] && i != 'rules_match_info') {
        qsParams[i] = encodeURIComponent(content[i]);
      }
    }

    for (i in partnerAttrs) {
      if (!qsParams[i]) {
        qsParams[i] = encodeURIComponent(partnerAttrs[i]);
      }
    }

    return qsParams;

  }


  function logError(msg, error) {
    console.log("PGMErr: " + msg);
  }

  function embedWidget(el, qsParams, type, articleUrl, adviceOptions) {

    var hasTarget = el.getAttribute("data-pgs-target-id") ? true : false,
    ignoreAdvice = el.getAttribute("data-pgs-ignore-advice") ? true : false,
    qs = JSON.parse(JSON.stringify(qsParams));

    return detectAdBlock()
    .then(function() {

      return getData(el, qs, type, articleUrl, hasTarget, ignoreAdvice, settings.sessionID, adviceOptions)
      .then(function(data){

          if (data.hide) {
            window.postMessage({ data: data, context: "unit-hide", hideReason: data.hideReason, cid: data.adviceData.content }, "*");
          }
          
          if (settings.adBlockEnabled) {
            sendCSDetectAdBlockEvent(data.qs["utm_content"], settings.sessionID, data.qs["partner_id"], data.qs["parent_org"], data.qs["content_id"], data.qs["url_id"]);
          }

          if (data && !data.hide) {
            if (data.delayLoad) {
              let myData = {el: el, widgetUrl: data.widgetUrl, qs: data.qs, width: settings.widget[type].defaultDimensions.width, height: settings.widget[type].defaultDimensions.height, type: type};
              var observer = new IntersectionObserver(function(entries, observer){
                for (var i=0; i<entries.length; i++) {
                  if (entries[i].intersectionRatio > 0) {
                    console.log("did it!");
                    insertIframe(myData.el, myData.widgetUrl, myData.qs, myData.width, myData.height, myData.type);
                    observer.unobserve(el);
                  }
                }
              }, {rootMargin: '0px', threshold: [0]});
    
              observer.observe(el);
            } else {
              insertIframe(el, data.widgetUrl, data.qs, settings.widget[type].defaultDimensions.width, settings.widget[type].defaultDimensions.height, type);
            }
            return "show";
          } else {
            el.innerHTML = "";
            return "hide";
          }
      });
    });
  }

  function getAdvice(target_id, partner_id, url, params) {
    return adviceService.getAdvice(target_id, partner_id, url, {ignoreAdvice: params.ignoreAdvice, bypassGeo: params.bypassGeo})
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      var adviceData = data && data.data && data.data.getAdvice ? data.data.getAdvice : null,
      matchType = "";
      if (adviceData) {
        // manual targets superceed overrides
        if (target_id && target_id != "") {
          matchType = "manual";
        } else if (adviceData.content.is_override === true) {
          matchType = "override";
        } else if (adviceData.content.cid_match_type) {
          if (adviceData.content.cid_match_type === "regex") {
            matchType = "terms";
          } else {
            matchType = "ml";
          }
        } else {
          matchType = "N/A";
        }

        adviceData.targetData.matchType = matchType;

        sendCSInitEvent(url, settings.sessionID, adviceData.targetData.partner_id, adviceData.content.parent_org, adviceData.content.content_id, adviceData.content.url_id, matchType, adviceData.content.tag, (adviceData.action === 'Default') ? "show" : "hide", adviceData.targetData.hideReason);
      }

      return adviceData;
    })
  }

  function getData(el, qs, type, articleUrl, hasTarget, ignoreAdvice, sessionID, adviceOptions) {

    var sid = sessionID.slice(0),
    isTestMode = el.getAttribute("data-pgs-test-mode") ? true : false;

    return (adviceOptions.adviceData ? Promise.resolve(adviceOptions.adviceData) : getAdvice(qs["target_id"], qs["partner_id"], articleUrl, {ignoreAdvice: ignoreAdvice, bypassGeo: adviceOptions.bypassGeo}))
    .then(function(data) {
      var advice = data;

      qs = addAdviceParams(advice, qs, el);

      if (!advice || advice.action === "Hide" || advice.action === "Fallback") {
        return {hide: true, qs: qs, hideReason: advice.targetData.hideReason || 'Hide Reason Unknown', adviceData: advice};
      }

      return getPGMData(advice.targetData.target_id, advice.targetData.partner_id, advice.content.content_id, advice.targetData.hasReadMore)
      .then(function(widgetData) {
        var widgetUrl = settings.cardUrl;
        if (qs.target_id) {
          if (!widgetData.campaign || !widgetData.campaignMembers || widgetData.campaignMembers.length === 0 || !widgetData.partner || !widgetData.config) {
            console.log('Advice call is missing expected data: ' + JSON.stringify(widgetData));
            return {hide: true, qs: qs, hideReason: 'Advice call is missing expected data: ' + JSON.stringify(widgetData), adviceData: widgetData};
          }
          widgetData.type = "campaign";
          qs.target_name = encodeURIComponent(widgetData.campaign.name);
          qs.is_sponsored = (widgetData.campaignMembers.sponsor && widgetData.campaignMembers.sponsor.guid) ? "true" : "false";
          qs.sponsor_name = (widgetData.campaignMembers.sponsor && widgetData.campaignMembers.sponsor.name) ? encodeURIComponent(widgetData.campaignMembers.sponsor.name) : "";
          if (widgetData.campaign.content.pgmEngagement.type === "button") {
            widgetUrl = settings.buttonUrl;
            qs.buttonImage = widgetData.campaign.content.customButtonImage;
          }
        } else {
          return {hide: true, qs: qs, hideReason: 'No campaign guid returned', adviceData: widgetData};
        }

        if (settings.adBlockEnabled && widgetData.campaign.content.hideOnAdBlock === 'true' && !ignoreAdvice) {
          return {hide: true, qs: qs, hideReason: 'Ad blocking detected', adviceData: widgetData};
        }

        widgetData.sessionID = sid;
        widgetData.environment = settings.environment;
        widgetData.isTestMode = isTestMode;
        widgetData.deviceType = advice.targetData.deviceType;
        widgetData.isCidHide = (advice.content.hide !== true && advice.content.target_id) ? false : true;

        el.setAttribute("data-widget-index", widgetDataArray.length);
        widgetDataArray.push(widgetData);

        return {hide: false, qs: qs, widgetUrl: widgetUrl, adviceData: widgetData, delayLoad: widgetData.partner.attrs.pgm_delay_load === 'true'};
      })
      .catch(function(error) {
        el.innerHTML = "";
        console.log(error);
      });

    })
    .catch(function(error) {
      el.innerHTML = "";
      console.log(error);
    });
  }

  function getPGMData(target_id, partner_id, content_id, hasReadMore) {

    if (target_id ) {
      return adviceService.getCampaignData(target_id, partner_id, content_id, hasReadMore);
    } else {
      return Promise.resolve({});
    }

  }

  /**
   * Embeds widget iframe inside button wrapper
   * @param {Dom element} el - element containing widget
   * @param {string} src - widget iframe src
   * @param {Object} qsParams
   * @param {String} w -default width for widget
   * @param {String} h - default height for widget
   * @param {String} type - widget type as defiend by settings.widget
   */
  function insertIframe(el, src, qsParams, w, h, type) {

    var iframeNode = document.createElement('iframe'),
    preContentNode = el.querySelector(".pre-content"),
    postContentNode = el.querySelector(".post-content"),
    tempNode = document.createElement('div'),
    isIOS = isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (w === "auto") {
      w = "100%";
    }
    
    src += "?" + convertParamsToQS(qsParams);

    // Insert an iframe inside the dpg-btn div
    iframeNode.setAttribute('src', src);
    iframeNode.setAttribute('width', w);
    iframeNode.setAttribute('height', '450px;');
    iframeNode.setAttribute('frameborder','0');
    iframeNode.setAttribute('marginheight', '0');
    iframeNode.setAttribute('marginwidth', '0');
    iframeNode.setAttribute('scrolling', 'no');
    iframeNode.setAttribute('sandbox','allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation');
    iframeNode.setAttribute('allow', 'autoplay; fullscreen');
    iframeNode.style.transition = "height 0.2s ease-out";

    if (isIOS) {
      iframeNode.style.width = "1px";
      iframeNode.style.minWidth = "100%";
    }

    if (preContentNode) {
      tempNode.appendChild(preContentNode);
    }

    if (postContentNode) {
      tempNode.appendChild(postContentNode);
    }

    el.innerHTML = "";

    if (preContentNode) {
      el.appendChild(preContentNode);
    }

    el.appendChild(iframeNode);

    if (postContentNode) {
      el.appendChild(postContentNode);
    }
    
  }

  function detectAdBlock() {
    settings.adBlockEnabled = false;
    
    try {
      return fetch(settings.adblockUrl, {mode: 'cors'})
      .then(function(data) {
        // Everything is fine
      })
      .catch(function() {
        settings.adBlockEnabled = true;
      });
    } catch (e) {
      settings.adBlockEnabled = true;
      return Promise.resolve({})
    }

  }
  
  function convertParamsToQS(qsParams) {
    var arr = [];
    for (var i in qsParams) {
      arr.push(i + "=" + qsParams[i]);
    }
    return arr.join("&");
  }
  
  // Attempts to scrape the news article title
  function getSocialTitle() {
    var metas = document.getElementsByTagName('meta');

    for (var i=0; i<metas.length; i++) {
      if (metas[i].getAttribute("property") == "og:title") { 
         return metas[i].getAttribute("content");
      } 
    }

    var headerTags = document.getElementsByTagName('h1');

    if (headerTags.length > 0) {
      return document.getElementsByTagName('h1')[0].innerText;
    }

    return "";

  }
  
  function isInt(value) {
    return !isNaN(value) && 
           parseInt(Number(value)) == value && 
           !isNaN(parseInt(value, 10));
  }

  function postAMPMessage(height, width) {
    try {
      window.parent.postMessage({
      sentinel: 'amp',
      type: 'embed-size',
      height: height,
      width: width
      }, '*');
    } catch(e) {}
  }

  function resizeAdFrame(h) {
    try {
      if (document !== window.top.document) {
        window.frameElement.height = h + "px";
        window.frameElement.width = "100%";
      }
    } catch(e) {}

    if (typeof $sf !== "undefined") {
      try {
        expandSFAd();
      } catch(e) {
        console.log("Safeframe expansion failed");
      }
    }
  }

  function expandSFAd(){
    var g, ex, obj,
    expandedWidth = "600",
    expandedHeight = "460";

    if ($sf.ext) {
     try {
      g = $sf.ext.geom(); // the geometry object
      ex = g && g.exp;
      obj = {};
      obj.l=0;
      obj.r=expandedWidth;
      obj.t=0;
      obj.b=expandedHeight;
      obj.push=true;
      if (Math.abs(ex.l) >= expandedWidth && Math.abs(ex.t) >= expandedHeight) {
        $sf.ext.expand(obj);
      } else {
        obj.r=ex.l;
        obj.b=ex.t;
      }
     } catch (e) {
      console.log("safeframe expansion failed");
      //do not expand, not enough room
     }
    } else {
      console.log("safeframe expansion not supported");
     //api expansion not supported
    }
   } 

  function sendCSInitEvent(url, sessionID, partnerID, parentOrg, cid, urlID, matchType, matchTag, status, hideReason) {
    var data = [{
      "url": decodeURIComponent(url), 
      "session_id": sessionID, 
      "partner_id": partnerID, 
      "parent_org": parentOrg || partnerID || "", 
      "content_id": parseInt(cid), 
      "url_id": parseInt(urlID), 
      "type": "init", 
      "payload": {
        "load_type": status,
        "match_type": matchType,
        "match_strategy": matchTag ? matchTag.split("~")[0] : null,
        "match_strategy_extended" : matchTag,
        "hide_reason": hideReason
      }
    }]

    fetch("https://count.api.pgs.io/count", {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      mode: 'cors',
      body : JSON.stringify(data)
    });
  }

  function sendCSDetectAdBlockEvent(url, sessionID, partnerID, parentOrg, cid, urlID) {
    var data = [{
      "url": decodeURIComponent(url), 
      "session_id": sessionID, 
      "partner_id": partnerID, 
      "parent_org": parentOrg || partnerID || "", 
      "content_id": parseInt(cid), 
      "url_id": parseInt(urlID), 
      "type": "detect", 
      "payload": {
        "context": "Ad Block"
      }
    }]

    fetch("https://count.api.pgs.io/count", {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      mode: 'cors',
      body : JSON.stringify(data)
    });
  }

  function reloadWidgets(options) {
      var selectorArray = [];

      containerEl = document;

      try {
        if (document !== window.top.document) {
          containerEl = window.top.document;
        }
      } catch(e) {
        //forget it
      }

      for (var prop in settings.widget) {
        if (settings.widget.hasOwnProperty(prop)) {
          selectorArray.push("." + settings.widget[prop].cssClass);
        }
      }

      var widgets = containerEl.querySelectorAll(selectorArray.join(", "));

      for (var i = 0, l = widgets.length, innerContent; i < l; i++) {
        innerContent = widgets[i].firstChild;
        if (innerContent) {
          widgets[i].innerHTML = "";
        }
        widgets[i].removeAttribute("data-loaded");
        widgets[i].removeAttribute("widget-loading");
      }

      loadWidgets(document, options);

      try {
        if (document !== window.top.document) {
          loadWidgets(window.top.document, options);
        }
      } catch(e) {
        //forget it
      }
  }

});
define('api',['core'], function(core){
  /**
   * @namespace pgmApi
   * @description
   * Include the pgm-api.js file in your application if you wish to use javascript to control when and how Public Good's Action Units appears on your website.
   *
   * Note: If you wish to automatically display the Action Unit when your site loads, you must include the dpg.js script on your page instead of pgm-api.js. Do not include both files.
   * Refer to the {@link https://publicgood.notion.site/Public-Good-Action-Unit-Implementation-8a97ce937be24a169d336bfbd072c95c Public Good Action Unit Implementation} guide for more information.
   *
   * Add the API javascript to your page template or conditionally load it on certain pages.
   *
   * @example <caption>1. To use the pgmApi, add the pgm-api.js script to your html file</caption>
   * {@lang html}
   * Synchronous load:
   * <script type="text/javascript" src="https://assets.publicgood.com/pgm/v1/pgm-api.js"></script>
   *
   * Asynchronous load:
   * <script>
   *   var script = document.createElement('script');
   *   script.async = true;
   *   script.onload = function() {
   *      // place api method calls here to run when load is complete
   *      pgmApi.create(document.getElementById("some-container-id"), pgmOptions)
   *   };
   *   script.src = "https://assets.publicgood.com/pgm/v1/pgm-api.js";
   *   document.head.appendChild(script);
   * </script>
   */

  var adviceData = null;

  var pgmApi = {

    /** @function load
    * @memberof pgmApi
    * @instance
    * @description Load Action Unit Units within a specified container. If no container is passed,
    * all Action Units on the current page will be loaded.
    * @param {HTMLElement} [containerEl=document] HTML element wrapping the Action Unit to be disabled
    * @example <caption>In your html file, add an Action Unit element placeholder</caption>
    * {@lang html}
    * <div class="pgs-dpg-{btn/card/chat/flex}" data-pgs-partner-id="my-media-organization"></div>
    * @example <caption>In your js file call load when you wish to display the Action Unit</caption>
    * pgmApi.load();
    */
    load: core.loadWidgets,

    /** @function disable
    * @memberof pgmApi
    * @instance
    * @description Disable Action Units within a specified container. If no container is passed,
    * all Action Units on the current page will be disabled. Bidgets which have been disabled are able to be reloaded
    * using load(). To remove Action Units completely, use remove().
    * @param {HTMLElement} [containerEl=document] HTML element wrapping the Action Unit to be disabled
    * @example
    * var el = document.getElementById("some-container-id");
    * pgmApi.disable(el);
    */
    disable: disableWidgets,

    /** @function remove
    * @memberof pgmApi
    * @instance
    * @description Remove Action Units within a specified container. If no container is passed,
    * all Action Units on the current page will be removed. Action Units will be deleted from the DOM and cannot be reloaded.
    * @param {HTMLElement} [containerEl=document] HTML element wrapping the Action Units to be removed
    * @example
    * var el = document.getElementById("some-container-id");
    * pgmApi.remove(el);
    */
    remove: removeWidgets,

    /** @function create
    * @memberof pgmApi
    * @instance
    * @description Request for an Action Unit to be rendered within a specified container. If the `getAdvice` method has already been called and the response indicated that a unit is
    * available, a unit will be rendered.  Otherwise, a determination will be made automatically.  If no action unit is available for a given article, nothing 
    * will be rendered.  Optional callback functions can be passed in order to run conditional code when a unit is shown or hidden. It is not necessary to call 
    * the `getAdvice` method prior to calling this.
    * @param {HTMLElement} [containerEl=document] HTML element where the Action Unit should appear. The Action Unit will be appended to the bottom of the element.
    * @param {object} options Configuration options for the Action Unit (optional)
    * @param {string} options.partnerId Public Good partner ID for your organization (ex. "my-media-organization")
    * @param {object} options.attributes Attributes used to define specific campaign parameters
    * @param {string} options.attributes.targetId The ID of an organization or campaign on PublicGood.com which the Action Unit should route directly to. Use with targetType.
    * @param {string} options.attributes.targetType The type of entity specified by targetId. Possible values: "campaign"
    * @param {string} options.attributes.url Signifies that the article analysis should be performed at a url different from the one in which the Action Unit is placed
    * @param {function} options.onShow A function to be called when an Action Unit can be rendered
    * @param {function} options.onHide A function to be called when an Action Unit can not be rendered
    *
    * @example
    * var el = document.getElementById("some-container-id"),
    * options = {
    *   partnerId: "my-media-organization"
    * };
    * pgmApi.create(el, options);
    */
    create: createWidget,

    /**
    * @typedef {Object} MatchInfo
    * @property {string} action The value will be 'hide' if there is no match, otherwise 'default'
    * @property {number} cpm The cpm of a matched campaign
    * @property {string} partner_id The internal publication id determined by the domain of the website
    * @property {string} campaign_id The internal id of the matching Public Good campaign
    */

    /** @function getAdvice
    * @memberof pgmApi
    * @instance
    * @description Retrieve classification information without automatically rendering a unit.  The information in the response may be used to decide whether
    * or not to subsequently call the `create` method to render an Action Unit.  This method is provided for scenarios where the Action Unit is one
    * of many creative types that share a container.  If the Action Unit has a dedicated container use the `create` method directly instead.
    * @param {object} options Configuration options (optional)
    * @param {string} options.partner_id Public Good partner ID for your organization (ex. "my-media-organization") (optional)
    * @param {string} options.attributes.url Signifies that the article analysis should be performed at a url different from the one in which the Action Unit is placed (optional)
    * @returns {Promise<MatchInfo>} Promise object representing match information
    * @example
    * var el = document.getElementById("some-container-id"),
    * options = {
    *   partnerId: "my-media-organization",
    *   url: "http://my-url.com"
    * };
    * pgmApi.getAdvice(options)
    * .then(function(data) {
    *   if (data.action !== 'hide')
    *     if (data.cpm > 0) {
    *       pgmApi.create(document.getElementById("some-container-id"));
    *     }
    *   }
    * });
    */
    getAdvice: getAdvice
  };

  return pgmApi;


  ////////////////////////////

  function disableWidgets(containerEl) {

    try {

      var selectorArray = [];

      if (!containerEl) {
        containerEl = document;
      }

      for (var prop in core.settings.widget) {
        if (core.settings.widget.hasOwnProperty(prop)) {
          selectorArray.push("." + core.settings.widget[prop].cssClass);
        }
      }

      var widgets = containerEl.querySelectorAll(selectorArray.join(", "));

      for (var i = 0, l = widgets.length, innerContent; i < l; i++) {
        innerContent = widgets[i].firstChild;
        if (innerContent) {
          widgets[i].innerHTML = "";
          widgets[i].removeAttribute("data-loaded");
        }
      }

    } catch (e) {
      core.logError("Error disabling widget", e);
    }

  }

  function removeWidgets(containerEl) {

    try {

      var selectorArray = [];

      if (!containerEl) {
        containerEl = document;
      }

      for (var prop in core.settings.widget) {
        if (core.settings.widget.hasOwnProperty(prop)) {
          selectorArray.push("." + core.settings.widget[prop].cssClass);
        }
      }

      var widgets = containerEl.querySelectorAll(selectorArray.join(", "));

      for (var i = 0, l = widgets.length, innerContent; i < l; i++) {
        widgets[i].parentNode.removeChild(widgets[i]);
      }

    } catch (e) {
      core.logError("Error removing widget", e);
    }

  }

  function createWidget(targetEl, options) {

    try {

      if (!options) {
        var options = {};
      }

      if (!targetEl) {
        targetEl = document.body;
      }

      removeWidgets(targetEl);

      var widgetEl = document.createElement("div");
      widgetEl.className = options.widgetType ? core.settings.widget[options.widgetType].cssClass : core.settings.widget["flex"].cssClass;

      var attr;

      if (!options.attributes) {
        options.attributes = {};
      }

      if (options.partnerId) {
        options.attributes.partnerId = options.partnerId;
      }

      for (var prop in options.attributes) {

        // convert camelCased option property to hyphen-ated
        attr = prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

        if (isValidProp(attr)) {
          widgetEl.setAttribute("data-pgs-" + attr, options.attributes[prop]);
        }

        if (options.isTestMode) {
          widgetEl.setAttribute("data-pgs-test-mode", true);
        }

      }

      targetEl.appendChild(widgetEl);
      core.loadWidgets(targetEl, {widgetType: options.widgetType, onHide: options.onHide, onShow: options.onShow, adviceData: adviceData});

    } catch(e) {
      core.logError("Error creating widget", e);
    }

  }

  function getAdvice(options) {
    var url;

    if (options.url) {
      url = encodeURIComponent(options.url);
    } else {

      // If url wasn't passed explicitly, the parent is the url
      url = encodeURIComponent(location);

      try {
        if (window.self !== window.top && document.referrer) {
          url = encodeURIComponent(document.referrer);
        }
      } catch (e) {
        if (document.referrer) {
          url = encodeURIComponent(document.referrer);
        }
      }
    }


    return core.getAdvice("", options.partner_id || "publicgood", url, {})
    .then(function(data) {
      adviceData = data;
      return {
        action: adviceData.action,
        cpm: adviceData.action === 'Hide' ? 0 : adviceData.targetData.cpm,
        partner_id: adviceData.targetData.partner_id,
        campaign_id: adviceData.targetData.campaign_id
      }
    });
  }


  ////////////////////////////


  function isValidProp(prop) {
    return (core.settings.whitelistedParams.indexOf(prop) !== -1);
  }

});
define('main',['api', 'core'], function (api, core) {

  if (!('IntersectionObserver' in window)) {
    console.log("Intersection Observer not supported, exiting")
    return
  }

  core.setMessageListener();

  try {
    if (document !== window.top.document) {
      core.setMessageListener(window.top);
    }
  } catch(e) {
    //forget it
  }

  window.pgmApi = api;

});
    //The modules for your project will be inlined above
    //this snippet. Ask almond to synchronously require the
    //module value for 'main' here and return it as the
    //value to use for the public API for the built file.
    return require('main');
}));
