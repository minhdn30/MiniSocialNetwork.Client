/**
 * Shared Emoji Utilities
 * Handles loading Emoji Mart and managing picker instances.
 */

window.EmojiUtils = {
  _loading: false,
  _loaded: false,

  _syncChatPickerState: function (container, isOpen) {
    if (!container) return;
    const pageActions = container.closest(".chat-view-input-actions");
    if (pageActions) {
      pageActions.classList.toggle("emoji-open", !!isOpen);
    }

    const windowActions = container.closest(".chat-actions-group");
    if (windowActions) {
      windowActions.classList.toggle("emoji-open", !!isOpen);
    }
  },

  /**
   * Load Emoji Picker library dynamically
   */
  loadLibrary: async function () {
    if (this._loaded) return true;
    if (this._loading) {
      // Wait for current load to complete
      while (this._loading) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return this._loaded;
    }

    this._loading = true;

    try {
      // Check if already loaded
      if (typeof window.EmojiPicker !== "undefined") {
        this._loaded = true;
        this._loading = false;
        return true;
      }

      // Method 1: Try emoji-picker-element (simpler, lighter)
      if (typeof customElements.get("emoji-picker") === "undefined") {
        const script = document.createElement("script");
        script.type = "module";
        script.src =
          "https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js";

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        // Wait for custom element to be defined
        await customElements.whenDefined("emoji-picker");
      }

      this._loaded = true;
      this._loading = false;
      return true;
    } catch (error) {
      console.error("Failed to load emoji library:", error);
      this._loading = false;
      this._loaded = false;
      return false;
    }
  },

  /**
   * Initialize or toggle an emoji picker in a container
   * @param {HTMLElement} container - The container to render the picker in
   * @param {Function} onSelect - Callback when an emoji is selected
   * @param {Object} options - Additional options (theme, etc.)
   * @returns {Promise<Object>} The picker instance or null
   */
  togglePicker: async function (container, onSelect, options = {}) {
    if (!container) return null;

    const isShowing = container.classList.contains("show");

    // 1. Close ALL other open pickers first
    const allPickers = document.querySelectorAll(`
            .detail-emoji-picker.show, 
            .reply-emoji-picker-container.show, 
            .edit-emoji-picker-container.show, 
            .chat-emoji-picker-container.show,
            .chat-window-emoji-container.show,
            .create-story-emoji-picker-container.show
        `);
    allPickers.forEach((p) => {
      if (p !== container) EmojiUtils.closePicker(p);
    });

    // 2. If this picker was already open, close it and stop
    if (isShowing) {
      EmojiUtils.closePicker(container);
      return null;
    }

    // 3. Open this picker
    return await EmojiUtils.createPicker(container, onSelect, options);
  },

  /**
   * Close the picker and clean up
   * @param {HTMLElement} container
   */
  closePicker: function (container) {
    if (!container) return;
    container.classList.remove("show");
    this._syncChatPickerState(container, false);
    // Delay clearing to allow animation
    setTimeout(() => {
      container.innerHTML = "";
    }, 200);
  },

  /**
   * Create and append the picker instance
   */
  createPicker: async function (container, onSelect, options = {}) {
    // Show loading with fixed height to match final picker
    container.innerHTML =
      '<div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 13px;">Loading emoji picker...</div>';
    container.classList.add("show");
    this._syncChatPickerState(container, true);

    // Load library if not loaded
    const loaded = await this.loadLibrary();

    if (!loaded) {
      container.innerHTML =
        '<div style="color: var(--danger); padding: 10px; text-align: center;">Failed to load emoji library.</div>';
      this._syncChatPickerState(container, false);
      return null;
    }

    container.innerHTML = "";

    try {
      // Use emoji-picker-element
      const picker = document.createElement("emoji-picker");

      // Apply theme
      const isLightMode = document.body.classList.contains("light-mode");
      picker.className = isLightMode ? "light" : "dark";

      // Listen for emoji selection
      picker.addEventListener("emoji-click", (event) => {
        if (onSelect) {
          onSelect({
            native: event.detail.unicode,
            unified: event.detail.emoji.unicode,
            id: event.detail.emoji.annotation,
          });
        }
      });

      container.appendChild(picker);

      // Fix indicator bar width calculation in shadow DOM
      setTimeout(() => {
        try {
          const shadowRoot = picker.shadowRoot;
          if (shadowRoot) {
            // Count number of category buttons
            const buttons = shadowRoot.querySelectorAll('button[role="tab"]');
            const buttonCount = buttons.length;

            if (buttonCount > 0) {
              const style = document.createElement("style");
              style.textContent = `
                                /* Fix indicator width to match button width */
                                .indicator {
                                    width: calc(100% / ${buttonCount}) !important;
                                }
                                
                                /* Ensure buttons are evenly distributed */
                                nav {
                                    display: flex;
                                    width: 100%;
                                }
                                
                                button[role="tab"] {
                                    flex: 1;
                                    min-width: 0;
                                }
                            `;
              style.textContent += `
                                /* Custom Scrollbar */
                                ::-webkit-scrollbar {
                                    width: 6px;
                                }
                                ::-webkit-scrollbar-track {
                                    background: transparent;
                                }
                                ::-webkit-scrollbar-thumb {
                                    background: var(--accent-primary);
                                    border-radius: 3px;
                                    cursor: pointer;
                                    transition: background 0.2s ease;
                                }
                                ::-webkit-scrollbar-thumb:hover {
                                    background: var(--accent-hover);
                                }
                                ::-webkit-scrollbar-thumb:active {
                                    background: var(--accent-primary);
                                    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
                                }
                            `;
              shadowRoot.appendChild(style);
            }
          }
        } catch (e) {
          console.warn("Could not inject indicator fix styles:", e);
        }
      }, 150);

      return picker;
    } catch (error) {
      console.error("Emoji Picker Error:", error);
      container.innerHTML =
        '<div style="color: var(--danger); padding: 10px;">Error initializing picker</div>';
      this._syncChatPickerState(container, false);
      return null;
    }
  },

  /**
   * Insert text at cursor position in an input/textarea
   */
  insertAtCursor: function (inputElement, text) {
    if (!inputElement) return;

    const start = inputElement.selectionStart;
    const end = inputElement.selectionEnd;
    const currentVal = inputElement.value;

    inputElement.value =
      currentVal.substring(0, start) + text + currentVal.substring(end);

    const newPos = start + text.length;
    inputElement.selectionStart = newPos;
    inputElement.selectionEnd = newPos;
    inputElement.focus();

    // Trigger input event for auto-resize or validation listeners
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
  },

  /**
   * Setup click-outside handler to close emoji picker
   * @param {string} containerSelector - CSS selector for the emoji picker container
   * @param {string} triggerSelector - CSS selector for the trigger button
   */
  setupClickOutsideHandler: function (containerSelector, triggerSelector) {
    document.addEventListener("click", (e) => {
      // Support comma-separated selectors by appending .show to each part
      const fullSelector = containerSelector
        .split(",")
        .map((s) => s.trim() + ".show")
        .join(", ");
      const containers = document.querySelectorAll(fullSelector);

      containers.forEach((container) => {
        const isTrigger = e.target.closest(triggerSelector);
        if (!container.contains(e.target) && !isTrigger) {
          this.closePicker(container);
        }
      });
    });
  },
};
