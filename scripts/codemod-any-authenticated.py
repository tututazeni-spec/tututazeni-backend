"""Marca com @AnyAuthenticated() todos os handlers sem politica (docs/security/authz-inventory.json)."""
import json, re, os, sys
inv = json.load(open('docs/security/authz-inventory.json', encoding='utf8'))
todo = {}
for h in inv:
    if h['policy'] == 'none':
        todo.setdefault(h['file'], []).append((h['controller'], h['handler']))
missed = []
for rel, items in todo.items():
    path = os.path.join('src', rel)
    raw = open(path, 'rb').read().decode('utf8')
    crlf = '\r\n' in raw
    lines = raw.replace('\r\n', '\n').split('\n')
    for ctrl, handler in items:
        start = next((i for i, l in enumerate(lines) if re.match(r'\s*export\s+class\s+' + ctrl + r'\b', l)), None)
        if start is None:
            missed.append((rel, ctrl, handler)); continue
        end = next((i for i in range(start + 1, len(lines)) if re.match(r'\s*export\s+class\s', lines[i])), len(lines))
        idx = next((i for i in range(start, end) if re.match(r'\s{2}(?:async\s+)?' + handler + r'\s*[(<]', lines[i])), None)
        if idx is None:
            missed.append((rel, ctrl, handler)); continue
        if '@AnyAuthenticated' in lines[idx - 1]:
            continue
        lines.insert(idx, '  @AnyAuthenticated()')
    depth = rel.count('/')
    imp = "import { AnyAuthenticated } from '" + ('../' * (depth + 1)) + "common/decorators/authz.decorators';"
    if imp not in lines:
        first = next(i for i, l in enumerate(lines) if l.startswith('import '))
        lines.insert(first, imp)
    out = '\n'.join(lines)
    if crlf: out = out.replace('\n', '\r\n')
    open(path, 'wb').write(out.encode('utf8'))
print('missed', missed)
