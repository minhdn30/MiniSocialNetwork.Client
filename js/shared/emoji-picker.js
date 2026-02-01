/**
 * Shared Emoji Utilities
 * Handles loading Emoji Mart and managing picker instances.
 */

window.EmojiUtils = {
    _loading: false,
    _loaded: false,

    /**
     * Load Emoji Picker library dynamically
     */
    loadLibrary: async function () {
        if (this._loaded) return true;
        if (this._loading) {
            // Wait for current load to complete
            while (this._loading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this._loaded;
        }

        this._loading = true;

        try {
            // Check if already loaded
            if (typeof window.EmojiPicker !== 'undefined') {
                this._loaded = true;
                this._loading = false;
                return true;
            }

            // Method 1: Try emoji-picker-element (simpler, lighter)
            if (typeof customElements.get('emoji-picker') === 'undefined') {
                const script = document.createElement('script');
                script.type = 'module';
                script.src = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js';
                
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });

                // Wait for custom element to be defined
                await customElements.whenDefined('emoji-picker');
            }

            this._loaded = true;
            this._loading = false;
            return true;

        } catch (error) {
            console.error('Failed to load emoji library:', error);
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

        // If picker is already open, close it
        if (container.classList.contains("show")) {
            EmojiUtils.closePicker(container);
            return null;
        }

        // Open picker
        return await EmojiUtils.createPicker(container, onSelect, options);
    },

    /**
     * Close the picker and clean up
     * @param {HTMLElement} container 
     */
    closePicker: function (container) {
        if (!container) return;
        container.classList.remove("show");
        // Delay clearing to allow animation
        setTimeout(() => {
            container.innerHTML = "";
        }, 200);
    },

    /**
     * Create and append the picker instance
     */
    createPicker: async function (container, onSelect, options = {}) {
        // Show loading
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Loading emoji picker...</div>';
        container.classList.add("show");

        // Load library if not loaded
        const loaded = await this.loadLibrary();
        
        if (!loaded) {
            container.innerHTML = '<div style="color: var(--danger); padding: 10px; text-align: center;">Failed to load emoji library.</div>';
            return null;
        }

        container.innerHTML = "";

        try {
            // Use emoji-picker-element
            const picker = document.createElement('emoji-picker');
            
            // Apply theme
            const isLightMode = document.body.classList.contains("light-mode");
            picker.className = isLightMode ? 'light' : 'dark';
            
            // Listen for emoji selection
            picker.addEventListener('emoji-click', event => {
                if (onSelect) {
                    onSelect({ 
                        native: event.detail.unicode,
                        unified: event.detail.emoji.unicode,
                        id: event.detail.emoji.annotation
                    });
                }
            });
            
            container.appendChild(picker);
            return picker;

        } catch (error) {
            console.error("Emoji Picker Error:", error);
            container.innerHTML = '<div style="color: var(--danger); padding: 10px;">Error initializing picker</div>';
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

        inputElement.value = currentVal.substring(0, start) + text + currentVal.substring(end);

        const newPos = start + text.length;
        inputElement.selectionStart = newPos;
        inputElement.selectionEnd = newPos;
        inputElement.focus();

        // Trigger input event for auto-resize or validation listeners
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
};