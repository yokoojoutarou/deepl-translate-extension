// ==============================
// DeepL Translate — Side Panel Logic
// ==============================

(() => {
    // --- DOM Elements ---
    const sourceText = document.getElementById('sourceText');
    const resultText = document.getElementById('resultText');
    const translateBtn = document.getElementById('translateBtn');
    const clearBtn = document.getElementById('clearBtn');
    const copyBtn = document.getElementById('copyBtn');
    const charCount = document.getElementById('charCount');
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const swapLangsBtn = document.getElementById('swapLangsBtn');
    const autoTranslate = document.getElementById('autoTranslate');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiTypeSelect = document.getElementById('apiTypeSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorDisplay = document.getElementById('errorDisplay');
    const detectedLang = document.getElementById('detectedLang');

    let isTranslating = false;
    let translateDebounce = null;

    // --- Initialize ---
    init();

    async function init() {
        // Load saved settings
        const settings = await chrome.storage.local.get([
            'apiKey', 'apiType', 'targetLang', 'sourceLang', 'autoTranslate'
        ]);

        if (settings.apiKey) apiKeyInput.value = settings.apiKey;
        if (settings.apiType) apiTypeSelect.value = settings.apiType;
        if (settings.targetLang) targetLang.value = settings.targetLang;
        if (settings.sourceLang) sourceLang.value = settings.sourceLang;
        if (settings.autoTranslate !== undefined) {
            autoTranslate.checked = settings.autoTranslate;
        }

        // Check if API key is set; if not, show settings modal
        if (!settings.apiKey) {
            settingsModal.classList.remove('hidden');
        }
    }

    // --- Message Listener (from background) ---
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_SOURCE_TEXT') {
            sourceText.value = message.text;
            updateCharCount();

            if (autoTranslate.checked && message.text.trim()) {
                debouncedTranslate();
            }
        }
    });

    // --- Translate ---
    translateBtn.addEventListener('click', () => {
        translate();
    });

    sourceText.addEventListener('input', () => {
        updateCharCount();
    });

    // Ctrl+Enter to translate
    sourceText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            translate();
        }
    });

    function debouncedTranslate() {
        clearTimeout(translateDebounce);
        translateDebounce = setTimeout(() => translate(), 500);
    }

    async function translate() {
        const text = sourceText.value.trim();
        if (!text || isTranslating) return;

        isTranslating = true;
        translateBtn.disabled = true;
        showLoading();
        hideError();
        detectedLang.textContent = '';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'TRANSLATE',
                text: text,
                targetLang: targetLang.value,
                sourceLang: sourceLang.value,
            });

            if (response.success) {
                resultText.innerHTML = '';
                resultText.textContent = response.data.translatedText;
                resultText.classList.remove('placeholder-text');

                // Show detected source language
                if (response.data.detectedSourceLang) {
                    const langName = getLangName(response.data.detectedSourceLang);
                    detectedLang.textContent = langName;
                }
            } else {
                showError(response.error);
            }
        } catch (err) {
            showError('Connection error. Please try again.');
        } finally {
            isTranslating = false;
            translateBtn.disabled = false;
            hideLoading();
        }
    }

    // --- Clear ---
    clearBtn.addEventListener('click', () => {
        sourceText.value = '';
        resultText.innerHTML = '<span class="placeholder-text">Translation will appear here...</span>';
        detectedLang.textContent = '';
        updateCharCount();
        hideError();
        sourceText.focus();
    });

    // --- Copy ---
    copyBtn.addEventListener('click', () => {
        const text = resultText.textContent;
        if (!text || resultText.querySelector('.placeholder-text')) return;

        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard');
        });
    });

    // --- Swap Languages ---
    swapLangsBtn.addEventListener('click', () => {
        const srcVal = sourceLang.value;
        const tgtVal = targetLang.value;

        // Can't swap if source is auto
        if (srcVal === 'auto') return;

        // Map target variants to source format
        const tgtToSrc = {
            'EN-US': 'EN', 'EN-GB': 'EN',
            'PT-BR': 'PT', 'PT-PT': 'PT',
            'ZH-HANS': 'ZH', 'ZH-HANT': 'ZH',
        };

        const newSrc = tgtToSrc[tgtVal] || tgtVal;

        // Set source to previous target
        if ([...sourceLang.options].some(o => o.value === newSrc)) {
            sourceLang.value = newSrc;
        }

        // Set target to previous source (try exact or variant)
        const srcToTgt = {
            'EN': 'EN-US',
            'PT': 'PT-BR',
            'ZH': 'ZH-HANS',
        };
        const newTgt = srcToTgt[srcVal] || srcVal;

        if ([...targetLang.options].some(o => o.value === newTgt)) {
            targetLang.value = newTgt;
        }

        saveLangPrefs();

        // If there's text, re-translate
        if (sourceText.value.trim()) {
            debouncedTranslate();
        }
    });

    // Save language prefs on change
    sourceLang.addEventListener('change', saveLangPrefs);
    targetLang.addEventListener('change', saveLangPrefs);
    autoTranslate.addEventListener('change', () => {
        chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
    });

    function saveLangPrefs() {
        chrome.storage.local.set({
            sourceLang: sourceLang.value,
            targetLang: targetLang.value,
        });
    }

    // --- Settings Modal ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    document.querySelector('.modal-overlay').addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    toggleKeyVisibility.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const apiType = apiTypeSelect.value;

        await chrome.storage.local.set({ apiKey, apiType });
        settingsModal.classList.add('hidden');

        // Show confirmation toast
        showToast('Settings saved');
    });

    // --- Helpers ---
    function updateCharCount() {
        const count = sourceText.value.length;
        charCount.textContent = `${count.toLocaleString()} chars`;
    }

    function showLoading() {
        loadingIndicator.classList.remove('hidden');
    }

    function hideLoading() {
        loadingIndicator.classList.add('hidden');
    }

    function showError(msg) {
        errorDisplay.textContent = msg;
        errorDisplay.classList.remove('hidden');
    }

    function hideError() {
        errorDisplay.classList.add('hidden');
        errorDisplay.textContent = '';
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'copy-success';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    function getLangName(code) {
        const names = {
            'EN': 'English',
            'JA': '日本語',
            'DE': 'Deutsch',
            'FR': 'Français',
            'ES': 'Español',
            'IT': 'Italiano',
            'NL': 'Nederlands',
            'PL': 'Polski',
            'PT': 'Português',
            'RU': 'Русский',
            'ZH': '中文',
            'KO': '한국어',
            'BG': 'Български',
            'CS': 'Čeština',
            'DA': 'Dansk',
            'EL': 'Ελληνικά',
            'ET': 'Eesti',
            'FI': 'Suomi',
            'HU': 'Magyar',
            'ID': 'Bahasa Indonesia',
            'LT': 'Lietuvių',
            'LV': 'Latviešu',
            'NB': 'Norsk Bokmål',
            'RO': 'Română',
            'SK': 'Slovenčina',
            'SL': 'Slovenščina',
            'SV': 'Svenska',
            'TR': 'Türkçe',
            'UK': 'Українська',
        };
        return names[code] || code;
    }
})();
