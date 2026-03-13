(() => {
  let latestSelectedText = '';

  function createMessage(role, text) {
    const item = document.createElement('div');
    item.className = `ai-msg ${role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}`;

    const body = document.createElement('div');
    body.className = 'ai-msg-body';
    body.textContent = text;

    item.appendChild(body);
    return item;
  }

  function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
  }

  function init() {
    const aiMessages = document.getElementById('aiMessages');
    const aiPromptInput = document.getElementById('aiPromptInput');
    const aiSendBtn = document.getElementById('aiSendBtn');

    if (!aiMessages || !aiPromptInput || !aiSendBtn) {
      return;
    }

    let isAsking = false;

    const ask = async () => {
      const prompt = aiPromptInput.value.trim();
      if (!prompt || isAsking) return;

      const contextText = latestSelectedText;
      aiMessages.appendChild(createMessage('user', prompt));

      const pending = createMessage('assistant', 'Thinking...');
      aiMessages.appendChild(pending);
      scrollToBottom(aiMessages);

      aiPromptInput.value = '';
      isAsking = true;
      aiSendBtn.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'AI_ASK',
          prompt,
          contextText,
        });

        pending.remove();

        if (response?.success) {
          aiMessages.appendChild(createMessage('assistant', response.data.answer));
        } else {
          aiMessages.appendChild(createMessage('assistant', response?.error || 'AI request failed.'));
        }
      } catch (error) {
        pending.remove();
        aiMessages.appendChild(createMessage('assistant', 'Connection error. Please try again.'));
      } finally {
        isAsking = false;
        aiSendBtn.disabled = false;
        scrollToBottom(aiMessages);
      }
    };

    aiSendBtn.addEventListener('click', ask);

    aiPromptInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        ask();
      }
    });

    window.addEventListener('deepl:selectedTextUpdated', (event) => {
      latestSelectedText = event.detail?.text || '';
    });

    scrollToBottom(aiMessages);
  }

  window.AIChatFeature = { init };
})();
