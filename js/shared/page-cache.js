/**
 * PageCache.js
 */

const PageCache = (function() {
    const _caches = new Map();
    let _lastScrollY = 0;
    let _snapshotScrollY = null;

    // Track scroll position continuously to avoid losing it during navigation/hashreset
    window.addEventListener("scroll", () => {
        // Only track if not currently within a transition or modal
        if (document.body.style.overflow !== "hidden") {
            _lastScrollY = window.scrollY;
        }
    }, { passive: true });

    function snapshot() {
        if (document.body.style.overflow !== "hidden") {
            _snapshotScrollY = window.scrollY;
            // console.log(`[PageCache] Snapshot taken: ${_snapshotScrollY}`);
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
            window.scrollTo(0, state.scrollY);
            // Sync the internal tracker back to restored position
            _lastScrollY = state.scrollY;
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
