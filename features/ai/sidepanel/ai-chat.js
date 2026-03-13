(() => {
  let latestSelectedText = '';
  const hasMarkdownIt = typeof window.markdownit === 'function';
  const hasKatex = typeof window.katex?.renderToString === 'function';

  const markdownRenderer = hasMarkdownIt
    ? window.markdownit({
        html: false,
        linkify: true,
        breaks: true,
      })
    : null;

  function setupMathPlugin(md) {
    if (!md || !hasKatex) return;

    const katexOptions = {
      throwOnError: false,
      strict: 'ignore',
    };

    const renderInline = (expression) => window.katex.renderToString(expression, {
      ...katexOptions,
      displayMode: false,
    });

    const renderBlock = (expression) => `<div class="katex-block">${window.katex.renderToString(expression, {
      ...katexOptions,
      displayMode: true,
    })}</div>`;

    md.inline.ruler.after('backticks', 'math_inline', (state, silent) => {
      const start = state.pos;
      const src = state.src;

      if (src[start] !== '$') return false;
      if (src[start + 1] === '$') return false;

      let end = start + 1;
      while ((end = src.indexOf('$', end)) !== -1) {
        if (src[end - 1] !== '\\') break;
        end += 1;
      }

      if (end === -1) return false;

      const content = src.slice(start + 1, end).trim();
      if (!content) return false;

      if (!silent) {
        const token = state.push('math_inline', 'math', 0);
        token.content = content;
      }

      state.pos = end + 1;
      return true;
    });

    md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const firstLine = state.src.slice(start, max).trim();

      if (!firstLine.startsWith('$$')) return false;

      let nextLine = startLine;
      let content = '';

      if (firstLine.endsWith('$$') && firstLine.length > 4) {
        content = firstLine.slice(2, -2).trim();
      } else {
        content = firstLine.slice(2).trim();
        while (++nextLine < endLine) {
          const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineMax = state.eMarks[nextLine];
          const lineText = state.src.slice(lineStart, lineMax);

          if (lineText.trim().endsWith('$$')) {
            content += `\n${lineText.replace(/\$\$\s*$/, '').trimEnd()}`;
            break;
          }

          content += `\n${lineText}`;
        }
      }

      if (silent) return true;

      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.content = content.trim();
      token.map = [startLine, nextLine + 1];

      state.line = nextLine + 1;
      return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

    md.renderer.rules.math_inline = (tokens, idx) => renderInline(tokens[idx].content);
    md.renderer.rules.math_block = (tokens, idx) => renderBlock(tokens[idx].content);
  }

  setupMathPlugin(markdownRenderer);

  if (markdownRenderer) {
    const defaultValidateLink = markdownRenderer.validateLink.bind(markdownRenderer);
    markdownRenderer.validateLink = (url) => {
      if (!/^https?:\/\//i.test(url || '')) return false;
      return defaultValidateLink(url);
    };
  }

  function createMessage(role, text) {
    const item = document.createElement('div');
    item.className = `ai-msg ${role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}`;

    const body = document.createElement('div');
    body.className = 'ai-msg-body';
    if (role === 'assistant') {
      body.innerHTML = markdownRenderer
        ? markdownRenderer.render(text || '')
        : (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    } else {
      body.textContent = text;
    }

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
