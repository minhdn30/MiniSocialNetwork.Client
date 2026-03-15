(function (global) {
  const hostname = (global.location?.hostname || "").toLowerCase();
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
  const isFileProtocol = global.location?.protocol === "file:";

  if (isLocalHost || isFileProtocol) {
    return;
  }

  const noop = function () {};
  const consoleRef = global.console || {};
  const originalConsole = {
    log: typeof consoleRef.log === "function" ? consoleRef.log.bind(consoleRef) : noop,
    info: typeof consoleRef.info === "function" ? consoleRef.info.bind(consoleRef) : noop,
    debug:
      typeof consoleRef.debug === "function" ? consoleRef.debug.bind(consoleRef) : noop,
    warn: typeof consoleRef.warn === "function" ? consoleRef.warn.bind(consoleRef) : noop,
    error:
      typeof consoleRef.error === "function" ? consoleRef.error.bind(consoleRef) : noop,
    trace:
      typeof consoleRef.trace === "function" ? consoleRef.trace.bind(consoleRef) : noop,
  };

  global.__cloudmOriginalConsole__ = originalConsole;
  global.console = {
    ...consoleRef,
    log: noop,
    info: noop,
    debug: noop,
    warn: noop,
    error: noop,
    trace: noop,
  };
})(window);
