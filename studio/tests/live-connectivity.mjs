// Small, explicit live API checks. Never prints API keys or response bodies.
const timeout = AbortSignal.timeout(20_000);
const checks = [
  ['Gemini Lite', `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with exactly OK.' }] }], generationConfig: { maxOutputTokens: 20 } }),
  }],
  ['Freesound', 'https://freesound.org/apiv2/search/text/?query=whoosh&fields=id,license&page_size=1', {
    headers: { Authorization: `Token ${process.env.FREESOUND_API_KEY || ''}` },
  }],
  ['Cartesia', 'https://api.cartesia.ai/voices', {
    headers: { Authorization: `Bearer ${process.env.CARTESIA_API_KEY || ''}`,
      'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14' },
  }],
];

for (const [name, url, init] of checks) {
  try {
    const response = await fetch(url, { ...init, signal: timeout });
    let detail = '';
    if (response.ok && name === 'Cartesia') {
      const json = await response.json();
      const voices = Array.isArray(json) ? json : json.data || json.voices || [];
      detail = `${voices.length} available voices`;
      const hindi = voices.find(v => (v.languages || v.supported_languages || []).some(x => String(x).toLowerCase().startsWith('hi')));
      if (hindi) detail += `; Hindi voice: ${hindi.name || 'available'}`;
    }
    if (response.ok && name === 'Freesound') {
      const json = await response.json();
      detail = `${json.count || 0} indexed results`;
    }
    if (response.ok && name === 'Gemini Lite') {
      const json = await response.json();
      detail = json.candidates?.length ? 'text-generation response returned' : 'no candidate';
    }
    console.log(`${name}: HTTP ${response.status}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    console.log(`${name}: unavailable (${error.name || 'network failure'})`);
  }
}
