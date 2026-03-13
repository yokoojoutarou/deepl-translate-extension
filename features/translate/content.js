// ==============================
// DeepL Translate — Content Script
// ==============================

(() => {
    let debounceTimer = null;
    let isContextAlive = true;
    const MAX_PAGE_CONTEXT_CHARS = 22000;
    const MAX_SELECTION_CHARS = 4000;

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

    function normalizeText(text) {
        return (text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    function extractActiveElementSelection() {
        const active = document.activeElement;
        if (!active) return '';

        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
            const start = active.selectionStart;
            const end = active.selectionEnd;
            if (typeof start === 'number' && typeof end === 'number' && end > start) {
                return (active.value || '').slice(start, end);
            }
        }

        return '';
    }

    function getCurrentSelectionText() {
        const selection = window.getSelection();
        const windowSelectionText = selection ? selection.toString() : '';
        const elementSelectionText = extractActiveElementSelection();
        const merged = normalizeText(windowSelectionText || elementSelectionText);
        return merged.slice(0, MAX_SELECTION_CHARS);
    }

    function collectPageContext() {
        const pageText = normalizeText(document.body?.innerText || '').slice(0, MAX_PAGE_CONTEXT_CHARS);
        return {
            title: document.title || '',
            url: location.href || '',
            pageText,
            selectedText: getCurrentSelectionText(),
        };
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === 'REQUEST_PAGE_CONTEXT') {
            try {
                sendResponse({ success: true, data: collectPageContext() });
            } catch (error) {
                sendResponse({ success: false, error: error?.message || String(error) });
            }
            return true;
        }
    });

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
