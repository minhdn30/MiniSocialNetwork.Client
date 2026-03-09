/**
 * PageCache.js
 */

const PageCache = (function() {
    const _caches = new Map();
    let _lastScrollY = 0;
    let _snapshotScrollY = null;

    const _isContainerScrollLocked = (mc) => {
        if (!mc) return false;
        const inlineOverflow = (mc.style.overflow || "").toString().trim().toLowerCase();
        const inlineOverflowY = (mc.style.overflowY || "").toString().trim().toLowerCase();
        if (
            inlineOverflow === "hidden" ||
            inlineOverflow === "clip" ||
            inlineOverflowY === "hidden" ||
            inlineOverflowY === "clip"
        ) {
            return true;
        }

        if (typeof window.getComputedStyle !== "function") return false;
        const computed = window.getComputedStyle(mc);
        if (!computed) return false;
        const overflow = (computed.overflow || "").toString().trim().toLowerCase();
        const overflowY = (computed.overflowY || "").toString().trim().toLowerCase();
        return (
            overflow === "hidden" ||
            overflow === "clip" ||
            overflowY === "hidden" ||
            overflowY === "clip"
        );
    };

    // Track scroll position continuously to avoid losing it during navigation/hashreset
    const _getScrollContainer = () => document.querySelector('.main-content');
    const _trackScroll = () => {
        const mc = _getScrollContainer();
        if (!mc) return;
        // Only track if not locked by a modal
        if (!_isContainerScrollLocked(mc)) {
            _lastScrollY = mc.scrollTop;
        }
    };
    const _trackScrollPassive = () => {
        const mc = _getScrollContainer();
        if (!mc) return;
        if (!_isContainerScrollLocked(mc)) {
            _snapshotScrollY = mc ? mc.scrollTop : 0;
        }
    };
    // Attach to .main-content once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        const mc = _getScrollContainer();
        if (mc) mc.addEventListener('scroll', _trackScroll, { passive: true });
    });

    function snapshot() {
        const mc = _getScrollContainer();
        if (mc && !_isContainerScrollLocked(mc)) {
            _snapshotScrollY = mc ? mc.scrollTop : 0;
        }
    }

    function clear(key) {
        if (_caches.has(key)) {
            _caches.delete(key);
            console.log(`[PageCache] Cleared: ${key}`);
        }
    }

    function clearAll() {
        _caches.clear();
        console.log(`[PageCache] All caches cleared`);
    }

    function save(key, container, data = null) {
        if (!container) return;

        const fragment = document.createDocumentFragment();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }

        // Use snapshot if available, otherwise last tracked
        // This failsafe protects against browser auto-scroll-to-top during hashchange
        let finalScroll = _lastScrollY;
        if (_snapshotScrollY !== null) {
            finalScroll = _snapshotScrollY;
            _snapshotScrollY = null; // Consume snapshot
        }

        const state = {
            fragment: fragment,
            scrollY: finalScroll, 
            data: data,
            timestamp: Date.now()
        };

        _caches.set(key, state);
        console.log(`[PageCache] Saved: ${key} (Scroll: ${state.scrollY})`);
    }

    function get(key) {
        return _caches.get(key);
    }

    function has(key) {
        return _caches.has(key);
    }

    function restore(key, container) {
        const state = _caches.get(key);
        if (!state || !container) return false;

        container.innerHTML = "";
        container.appendChild(state.fragment);

        // Restore scroll position
        requestAnimationFrame(() => {
            const mc = _getScrollContainer();
            if (mc) {
                mc.scrollTop = state.scrollY;
                _lastScrollY = state.scrollY;
            }
        });

        console.log(`[PageCache] Restored: ${key} (Scroll: ${state.scrollY})`);
        return true;
    }

    function getKeys() {
        return Array.from(_caches.keys());
    }

    return {
        save,
        get,
        restore,
        has,
        clear,
        clearAll,
        getKeys,
        snapshot
    };
})();

window.PageCache = PageCache;
