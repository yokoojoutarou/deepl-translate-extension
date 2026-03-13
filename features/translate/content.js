// ==============================
// DeepL Translate — Content Script
// ==============================

(() => {
    let debounceTimer = null;
    let isContextAlive = true;
    const MAX_PAGE_CONTEXT_CHARS = 22000;
    const MAX_SELECTION_CHARS = 4000;
    const NOISE_SELECTORS = [
        'script', 'style', 'noscript', 'svg', 'canvas', 'iframe',
        'header', 'footer', 'nav', 'aside',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
        '.sidebar', '.sidenav', '.drawer', '.menu', '.breadcrumb', '.breadcrumbs',
        '.ad', '.ads', '.advertisement', '.sponsored', '.promo', '.share', '.social', '.related',
        '.cookie', '.consent', '.newsletter', '.subscription', '.comments', '.comment',
        '[aria-hidden="true"]', '[hidden]'
    ];

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

    function removeNoiseNodes(root) {
        NOISE_SELECTORS.forEach((selector) => {
            root.querySelectorAll(selector).forEach((node) => node.remove());
        });
    }

    function collectStructuredText(root) {
        const blockNodes = root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre, td');
        if (blockNodes.length === 0) {
            return normalizeText(root.textContent || '');
        }

        const parts = [];
        blockNodes.forEach((node) => {
            const text = normalizeText(node.textContent || '');
            if (text) parts.push(text);
        });

        return normalizeText(parts.join('\n'));
    }

    function getCandidateContentRoots(root) {
        const selectors = [
            'article',
            'main',
            '[role="main"]',
            '.article',
            '.post',
            '.entry-content',
            '.content',
            '#content'
        ];

        const roots = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
        return roots.length > 0 ? roots : [root];
    }

    function scoreContentText(text) {
        const punctuationCount = (text.match(/[。！？.!?]/g) || []).length;
        return text.length + punctuationCount * 30;
    }

    function filterNoisyLines(text) {
        const rawLines = normalizeText(text).split('\n').map((line) => line.trim()).filter(Boolean);
        const freq = new Map();

        rawLines.forEach((line) => {
            freq.set(line, (freq.get(line) || 0) + 1);
        });

        const noisePattern = /^(menu|home|search|login|log in|sign in|sign up|privacy|terms|cookie|share|next|previous|トップ|メニュー|ログイン|利用規約|プライバシー|関連記事)$/i;

        const filtered = rawLines.filter((line) => {
            if (freq.get(line) > 2) return false;
            if (noisePattern.test(line)) return false;

            const hasSentenceSignal = /[。！？.!?]/.test(line);
            const isLongEnough = line.length >= 22;
            return hasSentenceSignal || isLongEnough;
        });

        return normalizeText(filtered.join('\n'));
    }

    function extractPageTextWithoutNoise() {
        if (!document.body) return '';

        const clonedBody = document.body.cloneNode(true);
        removeNoiseNodes(clonedBody);

        const candidates = getCandidateContentRoots(clonedBody);
        let bestText = '';
        let bestScore = -1;

        candidates.forEach((candidate) => {
            const structured = collectStructuredText(candidate);
            const filtered = filterNoisyLines(structured);
            const score = scoreContentText(filtered);

            if (score > bestScore) {
                bestScore = score;
                bestText = filtered;
            }
        });

        if (!bestText) {
            bestText = filterNoisyLines(collectStructuredText(clonedBody));
        }

        return bestText.slice(0, MAX_PAGE_CONTEXT_CHARS);
    }

    function collectPageContext() {
        const pageText = extractPageTextWithoutNoise();
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
