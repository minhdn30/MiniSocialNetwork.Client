(function (global) {
  const STORY_TEXT_EDITOR_CONFIG_SOURCE = {
    options: {
      backgrounds: {
        accent: {
          label: "Accent",
          css: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 55%, var(--accent-active) 100%)",
        },
        sunset: {
          label: "Sunset",
          css: "linear-gradient(140deg, #ff5f6d 0%, #ffc371 100%)",
        },
        tangerine: {
          label: "Tangerine",
          css: "linear-gradient(140deg, #f12711 0%, #f5af19 100%)",
        },
        amethyst: {
          label: "Amethyst",
          css: "linear-gradient(145deg, #7f00ff 0%, #e100ff 100%)",
        },
        midnight: {
          label: "Midnight",
          css: "linear-gradient(145deg, #0f172a 0%, #1d4ed8 48%, #38bdf8 100%)",
        },
        aurora: {
          label: "Aurora",
          css: "linear-gradient(145deg, #0f766e 0%, #14b8a6 45%, #a7f3d0 100%)",
        },
        forest: {
          label: "Forest",
          css: "linear-gradient(145deg, #14532d 0%, #15803d 50%, #86efac 100%)",
        },
        rose: {
          label: "Rose",
          css: "linear-gradient(145deg, #831843 0%, #db2777 48%, #f9a8d4 100%)",
        },
        ocean: {
          label: "Ocean",
          css: "linear-gradient(145deg, #003973 0%, #00b4db 100%)",
        },
        dusk: {
          label: "Dusk",
          css: "linear-gradient(145deg, #2c3e50 0%, #fd746c 100%)",
        },
        ember: {
          label: "Ember",
          css: "linear-gradient(145deg, #3e1f47 0%, #d76d77 55%, #ffaf7b 100%)",
        },
        slate: {
          label: "Slate",
          css: "linear-gradient(145deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
        },
        lagoon: {
          label: "Lagoon",
          css: "linear-gradient(145deg, #004e64 0%, #00a5cf 55%, #9fffcb 100%)",
        },
        neon: {
          label: "Neon",
          css: "linear-gradient(145deg, #0f0c29 0%, #302b63 50%, #00f5d4 100%)",
        },
        candy: {
          label: "Candy",
          css: "linear-gradient(145deg, #ff6fd8 0%, #ff9671 55%, #ffc75f 100%)",
        },
        glacier: {
          label: "Glacier",
          css: "linear-gradient(145deg, #1f4068 0%, #4da8da 52%, #dff6ff 100%)",
        },
        mango: {
          label: "Mango",
          css: "linear-gradient(145deg, #f857a6 0%, #ff5858 45%, #ffcc70 100%)",
        },
        emerald: {
          label: "Emerald",
          css: "linear-gradient(145deg, #0b3d2e 0%, #0f9d58 52%, #b7f7d8 100%)",
        },
        berry: {
          label: "Berry",
          css: "linear-gradient(145deg, #3f0d5a 0%, #7b1fa2 48%, #f06292 100%)",
        },
        copper: {
          label: "Copper",
          css: "linear-gradient(145deg, #41210f 0%, #a04a1a 52%, #ffd6a5 100%)",
        },
        twilight: {
          label: "Twilight",
          css: "linear-gradient(145deg, #1a1a40 0%, #5b4b8a 50%, #9f86ff 100%)",
        },
        graphite: {
          label: "Graphite",
          css: "linear-gradient(145deg, #111111 0%, #3a3a3a 52%, #7b7b7b 100%)",
        },
        candycane: {
          label: "Candy Cane",
          css: "linear-gradient(145deg, #d32f2f 0%, #f06292 40%, #fff5f5 100%)",
        },
        peach: {
          label: "Peach",
          css: "linear-gradient(145deg, #ff9a9e 0%, #fecfef 55%, #fcb69f 100%)",
        },
      },
      textColors: {
        light: { label: "Light", css: "#ffffff" },
        ink: { label: "Ink", css: "#0f172a" },
        cloud: { label: "Cloud", css: "#f8fafc" },
        graphite: { label: "Graphite", css: "#1f2937" },
        sun: { label: "Sun", css: "#fef08a" },
        mint: { label: "Mint", css: "#bbf7d0" },
        rose: { label: "Rose", css: "#ffe4e6" },
        sky: { label: "Sky", css: "#dbeafe" },
        cyan: { label: "Cyan", css: "#a5f3fc" },
        peach: { label: "Peach", css: "#fed7aa" },
        lavender: { label: "Lavender", css: "#e9d5ff" },
        coral: { label: "Coral", css: "#fecdd3" },
        ivory: { label: "Ivory", css: "#fffdf0" },
        silver: { label: "Silver", css: "#d1d5db" },
        charcoal: { label: "Charcoal", css: "#111827" },
        obsidian: { label: "Obsidian", css: "#020617" },
        lemon: { label: "Lemon", css: "#fff176" },
        amber: { label: "Amber", css: "#fbbf24" },
        lime: { label: "Lime", css: "#bef264" },
        emerald: { label: "Emerald", css: "#34d399" },
        aqua: { label: "Aqua", css: "#67e8f9" },
        royal: { label: "Royal", css: "#93c5fd" },
        violet: { label: "Violet", css: "#c4b5fd" },
        fuchsia: { label: "Fuchsia", css: "#f0abfc" },
        magenta: { label: "Magenta", css: "#f472b6" },
        ruby: { label: "Ruby", css: "#fb7185" },
        cocoa: { label: "Cocoa", css: "#a78b6d" },
        gold: { label: "Gold", css: "#fcd34d" },
      },
      fonts: {
        modern: { css: "'Segoe UI', 'Inter', system-ui, sans-serif" },
        classic: { css: "Georgia, 'Times New Roman', serif" },
        rounded: { css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
        mono: { css: "'Consolas', 'Courier New', monospace" },
        elegant: {
          css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
        },
        display: { css: "Impact, 'Arial Black', sans-serif" },
        script: { css: "'Brush Script MT', 'Segoe Script', cursive" },
        handwriting: { css: "'Lucida Handwriting', 'Segoe Script', cursive" },
        slab: { css: "Rockwell, 'Courier New', serif" },
        condensed: {
          css: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
        },
        geometric: {
          css: "'Century Gothic', Futura, 'Trebuchet MS', sans-serif",
        },
        humanist: { css: "'Gill Sans', Calibri, 'Segoe UI', sans-serif" },
        clean: { css: "Verdana, Geneva, sans-serif" },
        serifmodern: { css: "Cambria, 'Times New Roman', serif" },
      },
    },
    fontSize: {
      min: 8,
      max: 72,
      default: 32,
    },
    defaults: {
      backgroundColorKey: "accent",
      textColorKey: "light",
      fontTextKey: "modern",
      fontSizePx: 32,
    },
  };

  const STORY_TEXT_EDITOR_CONFIG_FALLBACK = {
    options: {
      backgrounds: {
        accent: {
          label: "Accent",
          css: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 55%, var(--accent-active) 100%)",
        },
      },
      textColors: {
        light: { label: "Light", css: "#ffffff" },
        ink: { label: "Ink", css: "#0f172a" },
      },
      fonts: {
        modern: { css: "'Segoe UI', 'Inter', system-ui, sans-serif" },
      },
    },
    fontSize: {
      min: 8,
      max: 72,
      default: 32,
    },
    defaults: {
      backgroundColorKey: "accent",
      textColorKey: "light",
      fontTextKey: "modern",
      fontSizePx: 32,
    },
  };

  function stIsPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function stGetObjectByKeys(source, keys) {
    if (!stIsPlainObject(source) || !Array.isArray(keys)) return null;
    for (const rawKey of keys) {
      const key = typeof rawKey === "string" ? rawKey.trim() : "";
      if (!key) continue;
      const value = source[key];
      if (stIsPlainObject(value)) return value;
    }
    return null;
  }

  function stToInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function stResolveKey(collection, rawKey, fallbackKey) {
    const map = stIsPlainObject(collection) ? collection : {};
    const normalizeKey = (value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "";

    const directKey = normalizeKey(rawKey);
    if (directKey && Object.prototype.hasOwnProperty.call(map, directKey)) {
      return directKey;
    }

    const normalizedFallback = normalizeKey(fallbackKey);
    if (
      normalizedFallback &&
      Object.prototype.hasOwnProperty.call(map, normalizedFallback)
    ) {
      return normalizedFallback;
    }

    const firstKey = Object.keys(map)[0];
    return typeof firstKey === "string" ? firstKey : "";
  }

  function stNormalizeStyleMap(rawMap, fallbackMap, labelPrefix) {
    const resolvedFallbackMap = stIsPlainObject(fallbackMap) ? fallbackMap : {};
    const sourceMap =
      stIsPlainObject(rawMap) && Object.keys(rawMap).length > 0
        ? rawMap
        : resolvedFallbackMap;

    const normalizedMap = {};
    Object.entries(sourceMap).forEach(([rawKey, rawValue]) => {
      const key = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
      if (!key) return;

      const option = stIsPlainObject(rawValue) ? rawValue : {};
      const fallbackOption = stIsPlainObject(resolvedFallbackMap[key])
        ? resolvedFallbackMap[key]
        : {};

      const css =
        typeof option.css === "string" && option.css.trim()
          ? option.css.trim()
          : typeof fallbackOption.css === "string" && fallbackOption.css.trim()
            ? fallbackOption.css.trim()
            : "";
      if (!css) return;

      const label =
        typeof option.label === "string" && option.label.trim()
          ? option.label.trim()
          : typeof fallbackOption.label === "string" &&
              fallbackOption.label.trim()
            ? fallbackOption.label.trim()
            : `${labelPrefix} ${key}`;

      normalizedMap[key] = { ...option, label, css };
    });

    if (Object.keys(normalizedMap).length > 0) {
      return normalizedMap;
    }

    return { ...resolvedFallbackMap };
  }

  function stNormalizeStoryTextConfig(rawConfig) {
    const sourceConfig = stIsPlainObject(rawConfig) ? rawConfig : {};
    const fallback = STORY_TEXT_EDITOR_CONFIG_FALLBACK;

    const rawOptions =
      stGetObjectByKeys(sourceConfig, ["options", "styleOptions"]) || {};
    const backgrounds = stNormalizeStyleMap(
      stGetObjectByKeys(rawOptions, [
        "backgrounds",
        "bgColors",
        "backgroundOptions",
      ]),
      fallback.options.backgrounds,
      "Background",
    );
    const textColors = stNormalizeStyleMap(
      stGetObjectByKeys(rawOptions, [
        "textColors",
        "colors",
        "textColorOptions",
      ]),
      fallback.options.textColors,
      "Text",
    );
    const fonts = stNormalizeStyleMap(
      stGetObjectByKeys(rawOptions, ["fonts", "fontOptions", "fontFamilies"]),
      fallback.options.fonts,
      "Font",
    );

    const rawFontSize =
      stGetObjectByKeys(sourceConfig, ["fontSize", "fontSizeConfig"]) || {};
    let minSize = stToInt(rawFontSize.min, fallback.fontSize.min);
    let maxSize = stToInt(rawFontSize.max, fallback.fontSize.max);
    if (minSize < 1) {
      minSize = fallback.fontSize.min;
    }
    if (maxSize < minSize) {
      maxSize = minSize;
    }

    let defaultFontSize = stToInt(
      rawFontSize.default,
      fallback.fontSize.default,
    );
    if (defaultFontSize < minSize) {
      defaultFontSize = minSize;
    }
    if (defaultFontSize > maxSize) {
      defaultFontSize = maxSize;
    }

    const rawDefaults =
      stGetObjectByKeys(sourceConfig, [
        "defaults",
        "defaultStyle",
        "defaultStyles",
      ]) || {};

    const defaultBackgroundKey = stResolveKey(
      backgrounds,
      rawDefaults.backgroundColorKey ??
        rawDefaults.backgroundKey ??
        rawDefaults.bgKey,
      fallback.defaults.backgroundColorKey,
    );
    const defaultTextColorKey = stResolveKey(
      textColors,
      rawDefaults.textColorKey ?? rawDefaults.colorKey,
      fallback.defaults.textColorKey,
    );
    const defaultFontKey = stResolveKey(
      fonts,
      rawDefaults.fontTextKey ?? rawDefaults.fontKey,
      fallback.defaults.fontTextKey,
    );

    let defaultFontSizePx = stToInt(
      rawDefaults.fontSizePx ?? rawDefaults.fontSize,
      defaultFontSize,
    );
    if (defaultFontSizePx < minSize) {
      defaultFontSizePx = minSize;
    }
    if (defaultFontSizePx > maxSize) {
      defaultFontSizePx = maxSize;
    }

    return {
      options: {
        backgrounds,
        textColors,
        fonts,
      },
      fontSize: {
        min: minSize,
        max: maxSize,
        default: defaultFontSize,
      },
      defaults: {
        backgroundColorKey: defaultBackgroundKey,
        textColorKey: defaultTextColorKey,
        fontTextKey: defaultFontKey,
        fontSizePx: defaultFontSizePx,
      },
    };
  }

  global.STORY_TEXT_EDITOR_CONFIG = stNormalizeStoryTextConfig(
    STORY_TEXT_EDITOR_CONFIG_SOURCE,
  );
})(window);
