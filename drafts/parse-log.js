const fs = require('fs');
const p = 'C:/Users/dave/.claude/projects/D--Repos-plan-build-run/0d7922bb-ee47-4d02-becb-6d89e9115e63.jsonl';
const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
const events = lines.map(l => { try { return JSON.parse(l); } catch(e) { return null; } }).filter(Boolean);

for (const e of events) {
  const ts = e.timestamp || '';
  const t = e.type;
  if (t === 'user' && e.message && e.message.content && !e.isMeta) {
    console.log('[USER ' + ts + '] ' + String(e.message.content).slice(0, 400));
  } else if (t === 'assistant') {
    const content = e.message && e.message.content ? e.message.content : [];
    const text = content.filter(c => c.type === 'text').map(c => c.text).join(' ');
    const tools = content.filter(c => c.type === 'tool_use').map(c => ({ name: c.name, input: JSON.stringify(c.input).slice(0, 200) }));
    if (text) console.log('[ASST ' + ts + '] ' + text.slice(0, 300));
    for (const tool of tools) console.log('[TOOL_USE ' + ts + '] ' + tool.name + ': ' + tool.input);
  } else if (t === 'tool_result') {
    const str = JSON.stringify(e.content || '');
    if (str.includes('additionalContext') || str.includes('BLOCKED') || str.includes('decision') || str.includes('hook') || str.includes('pbr:')) {
      console.log('[HOOK_RESULT ' + ts + '] ' + str.slice(0, 500));
    }
  } else if (t === 'progress' && e.data && e.data.type === 'hook_progress') {
    console.log('[HOOK ' + ts + '] ' + e.data.hookEvent + ':' + e.data.hookName + ' - ' + (e.data.statusMessage || '').slice(0, 150));
  }
}
