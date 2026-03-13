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

  if (message.type === 'AI_ASK') {
    handleAiAsk(message.prompt, message.contextText)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'AI_FETCH_MODELS') {
    handleAiFetchModels(message.provider, message.apiKey)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
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

async function handleAiAsk(prompt, contextText) {
  const trimmedPrompt = (prompt || '').trim();
  if (!trimmedPrompt) {
    throw new Error('Prompt is empty.');
  }

  const settings = await chrome.storage.local.get(['aiProvider', 'aiApiKeys', 'aiModels']);
  const provider = settings.aiProvider || 'openai';
  const apiKeys = settings.aiApiKeys || {};
  const aiModels = settings.aiModels || {};
  const apiKey = apiKeys[provider];

  if (!apiKey) {
    throw new Error(`API key is not set for provider: ${provider}`);
  }

  const model = aiModels[provider] || getDefaultAiModel(provider);
  const cleanContext = (contextText || '').trim();
  const userPrompt = cleanContext
    ? `Selected context:\n${cleanContext}\n\nQuestion:\n${trimmedPrompt}`
    : trimmedPrompt;

  if (provider === 'openai') {
    return await askOpenAI(apiKey, model, userPrompt);
  }

  if (provider === 'anthropic') {
    return await askAnthropic(apiKey, model, userPrompt);
  }

  if (provider === 'gemini') {
    return await askGemini(apiKey, model, userPrompt);
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

function getDefaultAiModel(provider) {
  const defaults = {
    openai: 'gpt-4.1-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-2.0-flash',
  };

  return defaults[provider] || defaults.openai;
}

async function askOpenAI(apiKey, model, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a concise helpful assistant.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error('OpenAI response was empty.');
  }

  return { answer };
}

async function askAnthropic(apiKey, model, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const answer = (data?.content || [])
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join('\n')
    .trim();

  if (!answer) {
    throw new Error('Anthropic response was empty.');
  }

  return { answer };
}

async function askGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();

  if (!answer) {
    throw new Error('Gemini response was empty.');
  }

  return { answer };
}

async function handleAiFetchModels(provider, apiKey) {
  const normalizedProvider = (provider || '').trim();
  const trimmedKey = (apiKey || '').trim();

  if (!normalizedProvider) {
    throw new Error('Provider is required.');
  }

  if (!trimmedKey) {
    throw new Error('API key is required to fetch models.');
  }

  if (normalizedProvider === 'openai') {
    return await fetchOpenAiModels(trimmedKey);
  }

  if (normalizedProvider === 'anthropic') {
    return await fetchAnthropicModels(trimmedKey);
  }

  if (normalizedProvider === 'gemini') {
    return await fetchGeminiModels(trimmedKey);
  }

  throw new Error(`Unsupported AI provider: ${normalizedProvider}`);
}

async function fetchOpenAiModels(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI model fetch error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const models = (data?.data || [])
    .map(item => item?.id)
    .filter(id => typeof id === 'string' && /^gpt|^o[0-9]/i.test(id))
    .sort((a, b) => a.localeCompare(b));

  return { models };
}

async function fetchAnthropicModels(apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic model fetch error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const models = (data?.data || [])
    .map(item => item?.id)
    .filter(id => typeof id === 'string' && id.length > 0)
    .sort((a, b) => a.localeCompare(b));

  return { models };
}

async function fetchGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini model fetch error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const models = (data?.models || [])
    .filter(item => Array.isArray(item?.supportedGenerationMethods) && item.supportedGenerationMethods.includes('generateContent'))
    .map(item => (item?.name || '').replace(/^models\//, ''))
    .filter(name => name.length > 0)
    .sort((a, b) => a.localeCompare(b));

  return { models };
}
