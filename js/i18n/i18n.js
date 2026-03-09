(function (global) {
  const SUPPORTED_LANGUAGES = ["en", "vi"];
  const DEFAULT_LANGUAGE = "en";
  const STORAGE_KEY = "appLanguage";
  const PENDING_SYNC_STORAGE_KEY = "appLanguagePendingSync";
  const subscribers = new Set();
  const reverseMapCache = new Map();
  let currentLanguage = DEFAULT_LANGUAGE;

  function getLocales() {
    return global.__I18N_LOCALES || {};
  }

  function normalizeLanguage(language) {
    const normalized = (language || "").toString().trim().toLowerCase();
    if (!normalized) return DEFAULT_LANGUAGE;
    if (normalized.startsWith("vi")) return "vi";
    if (normalized.startsWith("en")) return "en";
    return SUPPORTED_LANGUAGES.includes(normalized)
      ? normalized
      : DEFAULT_LANGUAGE;
  }

  function getLanguage() {
    return currentLanguage;
  }

  function getInitialLanguage() {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY) || navigator.language);
    } catch (_) {
      return normalizeLanguage(navigator.language);
    }
  }

  function deepGet(source, path) {
    if (!source || !path) return undefined;
    return path.split(".").reduce((acc, key) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
        return acc[key];
      }
      return undefined;
    }, source);
  }

  function flattenMessages(source, prefix = "", out = {}) {
    if (!source || typeof source !== "object") return out;
    Object.entries(source).forEach(([key, value]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        flattenMessages(value, nextKey, out);
      } else if (typeof value === "string") {
        out[nextKey] = value;
      }
    });
    return out;
  }

  function interpolate(template, params = {}) {
    if (typeof template !== "string") return template;
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        return String(params[key]);
      }
      return `{${key}}`;
    });
  }

  function t(key, params = {}, fallback = "") {
    const locales = getLocales();
    const locale = locales[currentLanguage] || {};
    const fallbackLocale = locales[DEFAULT_LANGUAGE] || {};
    const resolvedValue =
      deepGet(locale, key) ??
      deepGet(fallbackLocale, key) ??
      fallback ??
      key;
    const value =
      typeof resolvedValue === "string"
        ? resolvedValue
        : typeof fallback === "string" && fallback
          ? fallback
          : typeof key === "string"
            ? key
            : "";
    return interpolate(value, params);
  }

  function hasTranslationKey(key) {
    const normalizedKey = (key || "").toString().trim();
    if (!normalizedKey) return false;
    const locales = getLocales();
    return SUPPORTED_LANGUAGES.some((language) => {
      const locale = locales[language] || {};
      return typeof deepGet(locale, normalizedKey) === "string";
    });
  }

  function buildReverseMap(language = DEFAULT_LANGUAGE) {
    const normalizedLanguage = normalizeLanguage(language);
    if (reverseMapCache.has(normalizedLanguage)) {
      return reverseMapCache.get(normalizedLanguage);
    }

    const locale = getLocales()[normalizedLanguage] || {};
    const flattened = flattenMessages(locale);
    const map = new Map();
    Object.entries(flattened).forEach(([key, value]) => {
      if (typeof value !== "string") return;
      const normalized = value.trim();
      if (!normalized || map.has(normalized)) return;
      map.set(normalized, key);
    });
    reverseMapCache.set(normalizedLanguage, map);
    return map;
  }

  function translateLiteral(value, params = {}) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const key = resolveLiteralKey(trimmed);
    if (!key) return value;
    const translated = t(key, params, trimmed);
    return value.replace(trimmed, translated);
  }

  function resolveLiteralKey(value) {
    const trimmed = (value || "").toString().trim();
    if (!trimmed) return "";
    if (hasTranslationKey(trimmed)) {
      return trimmed;
    }

    const variants = Array.from(
      new Set(
        [
          trimmed,
          trimmed.replace(/\s+/g, " ").trim(),
          trimmed.replace(/[.!?]+$/, "").trim(),
          trimmed.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim(),
        ].filter(Boolean),
      ),
    );

    const languages = [DEFAULT_LANGUAGE].concat(
      SUPPORTED_LANGUAGES.filter((language) => language !== DEFAULT_LANGUAGE),
    );

    for (const language of languages) {
      const reverseMap = buildReverseMap(language);
      for (const candidate of variants) {
        const directKey = reverseMap.get(candidate);
        if (directKey) {
          return directKey;
        }
      }

      const lowercaseVariants = variants.map((candidate) =>
        candidate.toLowerCase(),
      );
      for (const [literal, key] of reverseMap.entries()) {
        if (lowercaseVariants.includes(literal.toLowerCase())) {
          return key;
        }
      }
    }

    return "";
  }

  function translateServerText(value, params = {}, fallback = "") {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const key = resolveLiteralKey(trimmed);
    if (!key) {
      if (typeof fallback === "string" && fallback.trim()) {
        return interpolate(fallback, params);
      }

      return interpolate(trimmed, params);
    }
    return t(key, params, fallback || trimmed);
  }

  function readParams(element, attributeName) {
    const raw = element.getAttribute(attributeName);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  function translateElementText(element) {
    const key = element.getAttribute("data-i18n");
    if (!key) return;
    const params = readParams(element, "data-i18n-params");
    const translated = t(key, params);
    const lastTranslated = element.getAttribute("data-i18n-last-text");
    const currentText = element.textContent;

    // Skip overwriting text that has been replaced by runtime state after
    // the previous auto-translation pass.
    if (
      lastTranslated !== null &&
      currentText !== lastTranslated &&
      currentText.trim() !== ""
    ) {
      return;
    }

    element.textContent = translated;
    element.setAttribute("data-i18n-last-text", translated);
  }

  function translateElementAttribute(element, destinationAttribute, keyAttribute, paramsAttribute) {
    const key = element.getAttribute(keyAttribute);
    if (!key) return;
    const params = readParams(element, paramsAttribute);
    const translated = t(key, params);
    const lastTranslatedAttribute = `data-i18n-last-${destinationAttribute}`;
    const currentValue = element.getAttribute(destinationAttribute) || "";
    const lastTranslated = element.getAttribute(lastTranslatedAttribute);

    if (
      lastTranslated !== null &&
      currentValue !== lastTranslated &&
      currentValue.trim() !== ""
    ) {
      return;
    }

    element.setAttribute(destinationAttribute, translated);
    element.setAttribute(lastTranslatedAttribute, translated);
  }

  function translateAutoNode(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.hasAttribute("data-i18n-ignore")) return;
    const insideUserContent =
      element.hasAttribute("data-i18n-user-content") ||
      element.closest("[data-i18n-user-content]");

    ["placeholder", "title", "aria-label", "alt", "data-placeholder"].forEach((attributeName) => {
      const currentValue = element.getAttribute(attributeName);
      const originalAttribute = `data-i18n-original-${attributeName}`;
      const originalValue = element.getAttribute(originalAttribute) || currentValue;
      if (!originalValue) return;
      if (!element.hasAttribute(originalAttribute)) {
        element.setAttribute(originalAttribute, originalValue);
      }
      const translated = translateLiteral(originalValue);
      if (translated !== currentValue) {
        element.setAttribute(attributeName, translated);
      }
    });

    if (insideUserContent) {
      return;
    }

    Array.from(element.childNodes || []).forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const originalText =
        typeof node.__i18nOriginalText === "string"
          ? node.__i18nOriginalText
          : node.nodeValue || "";
      if (typeof node.__i18nOriginalText !== "string") {
        node.__i18nOriginalText = originalText;
      }
      const translated = translateLiteral(originalText);
      if (translated !== node.nodeValue) {
        node.nodeValue = translated;
      }
    });
  }

  function translateDom(root = document) {
    const target =
      root instanceof Element || root instanceof Document ? root : document;
    if (!target) return;

    if (target instanceof Element) {
      translateElementText(target);
      translateElementAttribute(
        target,
        "placeholder",
        "data-i18n-placeholder",
        "data-i18n-placeholder-params",
      );
      translateElementAttribute(
        target,
        "title",
        "data-i18n-title",
        "data-i18n-title-params",
      );
      translateElementAttribute(
        target,
        "aria-label",
        "data-i18n-aria-label",
        "data-i18n-aria-label-params",
      );
      translateElementAttribute(
        target,
        "alt",
        "data-i18n-alt",
        "data-i18n-alt-params",
      );
      if (target.hasAttribute("data-i18n-auto")) {
        translateAutoNode(target);
        target.querySelectorAll("*").forEach(translateAutoNode);
      }
    }

    target.querySelectorAll("[data-i18n]").forEach(translateElementText);
    target
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach((element) =>
        translateElementAttribute(
          element,
          "placeholder",
          "data-i18n-placeholder",
          "data-i18n-placeholder-params",
        ),
      );
    target
      .querySelectorAll("[data-i18n-data-placeholder]")
      .forEach((element) =>
        translateElementAttribute(
          element,
          "data-placeholder",
          "data-i18n-data-placeholder",
          "data-i18n-data-placeholder-params",
        ),
      );
    target
      .querySelectorAll("[data-i18n-title]")
      .forEach((element) =>
        translateElementAttribute(
          element,
          "title",
          "data-i18n-title",
          "data-i18n-title-params",
        ),
      );
    target
      .querySelectorAll("[data-i18n-aria-label]")
      .forEach((element) =>
        translateElementAttribute(
          element,
          "aria-label",
          "data-i18n-aria-label",
          "data-i18n-aria-label-params",
        ),
      );
    target
      .querySelectorAll("[data-i18n-alt]")
      .forEach((element) =>
        translateElementAttribute(
          element,
          "alt",
          "data-i18n-alt",
          "data-i18n-alt-params",
        ),
      );
    target.querySelectorAll("[data-i18n-auto]").forEach((element) => {
      translateAutoNode(element);
      element.querySelectorAll("*").forEach(translateAutoNode);
    });
  }

  function setLanguage(language, options = {}) {
    currentLanguage = normalizeLanguage(language);
    document.documentElement.lang = currentLanguage;

    if (options.persist !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, currentLanguage);
      } catch (_) {}
    }

    if (options.translate !== false) {
      translateDom(document);
    }

    subscribers.forEach((callback) => {
      try {
        callback(currentLanguage);
      } catch (error) {
        console.error("[I18n] subscriber failed:", error);
      }
    });

    return currentLanguage;
  }

  function getPendingLanguageSync() {
    try {
      const value = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
      return value ? normalizeLanguage(value) : "";
    } catch (_) {
      return "";
    }
  }

  function markPendingLanguageSync(language) {
    const normalized = normalizeLanguage(language);
    try {
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, normalized);
    } catch (_) {}
    return normalized;
  }

  function clearPendingLanguageSync(language = "") {
    try {
      const currentPending = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
      if (
        !language ||
        normalizeLanguage(currentPending) === normalizeLanguage(language)
      ) {
        localStorage.removeItem(PENDING_SYNC_STORAGE_KEY);
      }
    } catch (_) {}
  }

  function onChange(callback) {
    if (typeof callback !== "function") return () => {};
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }

  function formatRelativeTime(value, options = {}) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const short = options.short === true;
    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSeconds < 60) {
      return short ? t("common.labels.now") : t("common.labels.justNow");
    }

    const units = [
      { unit: "minute", seconds: 60 },
      { unit: "hour", seconds: 60 * 60 },
      { unit: "day", seconds: 60 * 60 * 24 },
      { unit: "week", seconds: 60 * 60 * 24 * 7 },
    ];

    let selected = units[0];
    for (let index = units.length - 1; index >= 0; index -= 1) {
      if (diffSeconds >= units[index].seconds) {
        selected = units[index];
        break;
      }
    }

    const valueInUnit = Math.max(1, Math.floor(diffSeconds / selected.seconds));
    const formatter = new Intl.RelativeTimeFormat(currentLanguage, {
      numeric: "auto",
      style: short ? "narrow" : "long",
    });

    return formatter.format(-valueInUnit, selected.unit);
  }

  function formatDateTime(value, options = {}) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(currentLanguage, options).format(date);
  }

  function formatDate(value, options = {}) {
    return formatDateTime(value, {
      dateStyle: options.dateStyle || "medium",
      ...(options || {}),
    });
  }

  function formatLanguageLabel(language) {
    const normalized = normalizeLanguage(language);
    return normalized === "vi"
      ? t("common.labels.vietnamese")
      : t("common.labels.english");
  }

  setLanguage(getInitialLanguage(), { persist: true, translate: false });

  global.I18n = {
    SUPPORTED_LANGUAGES,
    DEFAULT_LANGUAGE,
    STORAGE_KEY,
    PENDING_SYNC_STORAGE_KEY,
    normalizeLanguage,
    getLanguage,
    setLanguage,
    getPendingLanguageSync,
    markPendingLanguageSync,
    clearPendingLanguageSync,
    onChange,
    t,
    translateDom,
    translateLiteral,
    translateServerText,
    resolveLiteralKey,
    formatRelativeTime,
    formatDateTime,
    formatDate,
    formatLanguageLabel,
  };
})(window);
