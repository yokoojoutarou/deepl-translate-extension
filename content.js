// ==============================
// DeepL Translate — Content Script
// ==============================

(() => {
    let debounceTimer = null;

    // Listen for text selection via mouseup
    document.addEventListener('mouseup', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : '';

            if (text.length > 0) {
                chrome.runtime.sendMessage({
                    type: 'TEXT_SELECTED',
                    text: text
                }).catch(() => {
                    // Extension context may be invalidated — ignore
                });
            }
        }, 250);
    });

    // Also handle keyboard-based selection (Shift+Arrow keys)
    document.addEventListener('keyup', (e) => {
        if (e.shiftKey) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const selection = window.getSelection();
                const text = selection ? selection.toString().trim() : '';

                if (text.length > 0) {
                    chrome.runtime.sendMessage({
                        type: 'TEXT_SELECTED',
                        text: text
                    }).catch(() => { });
                }
            }, 400);
        }
    });
})();
