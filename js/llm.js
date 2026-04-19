// Bring-your-own-key LLM client. Supports OpenAI/Groq/OpenRouter/Anthropic-compatible
// chat completion APIs. All calls go directly from the browser to the provider
// (no server). If no key is set or the call fails, callers fall back to templates.

const STORAGE = 'devteam-sim:llm';

export function getLlmConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || 'null') || { provider: 'none', apiKey: '', model: '' };
  } catch { return { provider: 'none', apiKey: '', model: '' }; }
}

export function setLlmConfig(cfg) {
  localStorage.setItem(STORAGE, JSON.stringify(cfg));
}

export const PROVIDERS = {
  none:       { label: 'Template Engine (no key needed)', endpoint: '', defaultModel: '' },
  openai:     { label: 'OpenAI',     endpoint: 'https://api.openai.com/v1/chat/completions',     defaultModel: 'gpt-4o-mini' },
  groq:       { label: 'Groq',       endpoint: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.1-8b-instant' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'meta-llama/llama-3.1-8b-instruct:free' },
  anthropic:  { label: 'Anthropic (CORS limited)', endpoint: 'https://api.anthropic.com/v1/messages', defaultModel: 'claude-3-5-sonnet-latest' },
};

export function isLlmEnabled() {
  const c = getLlmConfig();
  return c.provider !== 'none' && !!c.apiKey;
}

// Generic chat completion. Returns string or throws.
// Always uses the OpenAI-compatible chat schema for the first three providers.
export async function chat(messages, { temperature = 0.7, max_tokens = 800, signal } = {}) {
  const c = getLlmConfig();
  if (!c.provider || c.provider === 'none' || !c.apiKey) throw new Error('LLM not configured');
  const provider = PROVIDERS[c.provider];
  if (!provider) throw new Error('Unknown provider');
  const model = c.model || provider.defaultModel;

  if (c.provider === 'anthropic') {
    // Anthropic schema (note: requires CORS-friendly proxy in browser; included for completeness)
    const body = {
      model,
      max_tokens,
      messages: messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') || undefined,
      temperature,
    };
    const res = await fetch(provider.endpoint, {
      method: 'POST', signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': c.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  // OpenAI-compatible
  const body = { model, messages, temperature, max_tokens };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` };
  if (c.provider === 'openrouter') {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'DevTeam Simulator';
  }
  const res = await fetch(provider.endpoint, {
    method: 'POST', signal, headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${c.provider} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Convenience: ask the LLM to extend/customize an HTML game template.
// Returns updated HTML, or throws.
export async function customizeGame({ templateHtml, prompt, signal }) {
  const sys = `You are a senior game programmer. You are given a working HTML5+JS canvas mini-game as a complete HTML document. Modify it to satisfy the user's request. Keep it as a SINGLE self-contained HTML file (no external assets, no fetch). Keep total file under 4000 characters. Output ONLY the final HTML, no prose, no code fences.`;
  const user = `User request:\n${prompt}\n\nCurrent game:\n${templateHtml}\n\nReturn the full updated HTML now.`;
  let out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: user }],
    { temperature: 0.6, max_tokens: 2400, signal }
  );
  // strip code fences if any
  out = out.trim().replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '');
  if (!out.includes('<canvas') && !out.includes('<body')) throw new Error('LLM output missing HTML');
  return out;
}

// Ask an agent persona to deliver an in-character message (standup line, PR comment, retro).
export async function speakAs(persona, kind, ctx) {
  const sys = `You roleplay a software engineer named ${persona.displayName}. Role: ${persona.role}. Seniority: ${persona.seniority}. Traits: ${persona.traits.join(', ')}. Communication style: ${persona.communicationStyle}. Quirk: "${persona.quirks}". Stay in character. Reply in 1-2 sentences max.`;
  const promptByKind = {
    standup: `Give your sprint stand-up line. Yesterday: ${ctx.yesterday}. Today: ${ctx.today}.`,
    pr_review: `You are reviewing a pull request titled "${ctx.title}" by ${ctx.author}. Leave one short review comment.`,
    retro: `Give your sprint retro reflection in one or two sentences.`,
    chatter: `Say something casual to your team in one short sentence.`,
  };
  return chat(
    [{ role: 'system', content: sys }, { role: 'user', content: promptByKind[kind] || promptByKind.chatter }],
    { temperature: 0.95, max_tokens: 100 }
  );
}
