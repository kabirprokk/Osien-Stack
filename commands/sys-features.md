---
description: Feature flags — what layers are on/off and how to flip them
---
Run: python3 -c "import json,os; j=json.load(open(os.path.expanduser('~/.config/opencode/opencode.json'))); print('PLUGINS:',*j.get('plugin',[]),sep='\n  '); print('MCP:',*['+k' if v.get('enabled') else '-'+k for k,v in j.get('mcp',{}).items()],sep='\n  '); print('INSTRUCTIONS:',len(j.get('instructions',[])))" + check ~/.config/opencode/memory/.soul-paused (memories off?) + ~/.config/opencode/.no-voice (voice off?). Report as toggle table (7 lines max): to flip, say the word.
