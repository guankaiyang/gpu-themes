import http.server, sys, functools, subprocess, time, json, urllib.parse
root, out, marker = sys.argv[1], sys.argv[2], sys.argv[3]
marks = []
def cpu_seconds():
    total = 0.0
    for line in subprocess.run(['ps', '-axo', 'time=,command='], capture_output=True, text=True).stdout.splitlines():
        if marker not in line: continue
        t = line.strip().split(None, 1)[0]
        days = 0
        if '-' in t: d, t = t.split('-', 1); days = int(d)
        secs = 0.0
        for part in t.split(':'): secs = secs * 60 + float(part)
        total += secs + days * 86400
    return total
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        n = int(self.headers.get('Content-Length', 0)); body = self.rfile.read(n)
        if self.path.startswith('/mark'):
            marks.append({'id': q['id'][0], 'e': q['e'][0], 'wall': time.time(), 'cpu': cpu_seconds()})
        else:
            res = {}
            for a, b in zip(marks[::2], marks[1::2]):
                res[a['id']] = round((b['cpu'] - a['cpu']) / (b['wall'] - a['wall']), 3)
            open(out, 'w').write(json.dumps(res))
        self.send_response(204); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8766), functools.partial(H, directory=root)).serve_forever()
