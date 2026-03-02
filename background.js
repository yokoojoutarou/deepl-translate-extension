// ==============================
// DeepL Translate — Background Service Worker
// ==============================

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TEXT_SELECTED') {
    // Forward selected text to the side panel
    chrome.runtime.sendMessage({
      type: 'UPDATE_SOURCE_TEXT',
      text: message.text
    }).catch(() => {
      // Side panel might not be open yet — ignore
    });
  }

  if (message.type === 'TRANSLATE') {
    handleTranslation(message.text, message.targetLang, message.sourceLang)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

/**
 * Call the DeepL API to translate text
 */
async function handleTranslation(text, targetLang, sourceLang) {
  const settings = await chrome.storage.local.get(['apiKey', 'apiType']);
  const apiKey = settings.apiKey;

  if (!apiKey) {
    throw new Error('API key not set. Please configure your DeepL API key in settings.');
  }

  const baseUrl = settings.apiType === 'pro'
    ? 'https://api.deepl.com/v2/translate'
    : 'https://api-free.deepl.com/v2/translate';

  const params = new URLSearchParams();
  params.append('text', text);
  params.append('target_lang', targetLang);
  if (sourceLang && sourceLang !== 'auto') {
    params.append('source_lang', sourceLang);
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 403) {
      throw new Error('Invalid API key. Please check your settings.');
    }
    if (response.status === 456) {
      throw new Error('Character limit exceeded for this billing period.');
    }
    throw new Error(`DeepL API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    translatedText: data.translations[0].text,
    detectedSourceLang: data.translations[0].detected_source_language,
  };
}
