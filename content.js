// ==============================
// DeepL Translate — Content Script
// ==============================

(() => {
    let debounceTimer = null;
    let isContextAlive = true;

    function isRuntimeAvailable() {
        return Boolean(chrome?.runtime?.id);
    }

    function markContextInvalidated(error, trigger) {
        const message = error?.message || String(error);
        if (message.includes('Extension context invalidated')) {
            isContextAlive = false;
            console.warn('[DeepL Translate][content] extension_context_invalidated', {
                trigger,
                error: message
            });
            return true;
        }
        return false;
    }

    function sendSelectedText(text, trigger) {
        if (!text || !isContextAlive || !isRuntimeAvailable()) {
            return;
        }

        try {
            Promise.resolve(
                chrome.runtime.sendMessage({
                    type: 'TEXT_SELECTED',
                    text: text
                })
            ).catch((error) => {
                if (!markContextInvalidated(error, trigger)) {
                    console.warn('[DeepL Translate][content] text_selected_send_failed', {
                        trigger,
                        error: error?.message || String(error)
                    });
                }
            });
        } catch (error) {
            if (!markContextInvalidated(error, trigger)) {
                console.warn('[DeepL Translate][content] text_selected_send_failed_sync', {
                    trigger,
                    error: error?.message || String(error)
                });
            }
        }
    }

    // Listen for text selection via mouseup
    document.addEventListener('mouseup', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : '';

            if (text.length > 0) {
                sendSelectedText(text, 'mouseup');
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
                    sendSelectedText(text, 'keyup_shift');
                }
            }, 400);
        }
    });
})();
