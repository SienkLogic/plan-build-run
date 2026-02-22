const fs = require('fs');
const lines = fs.readFileSync('C:/Users/dave/.claude/projects/D--Repos-plan-build-run/9e3477dc-30cd-4faa-8f32-e9540c3cbf9c.jsonl','utf8').split('\n').filter(Boolean);
let humanCmds = 0, toolResults = 0;
for (const l of lines) {
  const o = JSON.parse(l);
  if (o.type === 'user' && o.isMeta !== true) {
    const m = typeof o.message === 'string' ? o.message : JSON.stringify(o.message);
    if (m.includes('command-name') || m.includes('command-message')) {
      humanCmds++;
      console.log('CMD:', m.substring(0, 150));
    } else if (m.includes('tool_result')) {
      toolResults++;
    } else if (!m.startsWith('[') && !m.startsWith('{')) {
      humanCmds++;
      console.log('TYPED:', m.substring(0, 150));
    }
  }
}
console.log('\nHuman commands:', humanCmds, 'Tool results:', toolResults, 'Total lines:', lines.length);
