const http = require('http');
const fs = require('fs');
const path = require('path');
const apiHandler = require('./api/call');

const PORT = process.env.PORT || 3000;
const INDEX_FILE = path.join(__dirname, 'frontend', 'Index.html');

async function requestHandler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    if (req.method === 'POST') {
      // If Vercel already parsed req.body, use it; otherwise read stream
      if (req.body !== undefined) {
        if (!res.status) {
          res.status = (code) => {
            res.statusCode = code;
            return {
              json: (obj) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(obj));
              },
              end: () => res.end()
            };
          };
        }
        return await apiHandler(req, res);
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        req.body = body;
        res.status = (code) => {
          res.statusCode = code;
          return {
            json: (obj) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(obj));
            },
            end: () => res.end()
          };
        };
        await apiHandler(req, res);
      });
      return;
    }

    // Serve og-image.jpg or favicon if requested directly
    const reqUrl = String(req.url || '');
    if (reqUrl.includes('og-image.jpg')) {
      const ogCandidates = [
        path.join(__dirname, 'frontend', 'assets', 'og-image.jpg'),
        path.join(process.cwd(), 'frontend', 'assets', 'og-image.jpg')
      ];
      for (const og of ogCandidates) {
        if (fs.existsSync(og)) {
          const img = fs.readFileSync(og);
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': img.length,
            'Cache-Control': 'public, max-age=86400'
          });
          return res.end(img);
        }
      }
    }

    if (reqUrl.includes('favicon.ico') || reqUrl.includes('favicon.png')) {
      const favCandidates = [
        path.join(__dirname, 'frontend', 'assets', 'favicon.png'),
        path.join(process.cwd(), 'frontend', 'assets', 'favicon.png')
      ];
      for (const fav of favCandidates) {
        if (fs.existsSync(fav)) {
          const img = fs.readFileSync(fav);
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': img.length,
            'Cache-Control': 'public, max-age=86400'
          });
          return res.end(img);
        }
      }
    }

    // Serve frontend/Index.html for GET requests
    const candidates = [
      INDEX_FILE,
      path.join(process.cwd(), 'frontend', 'Index.html'),
      path.join(__dirname, 'index.html'),
      path.join(process.cwd(), 'index.html')
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const html = fs.readFileSync(file, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Portal file not found');
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || String(err) }));
  }
}

if (!process.env.VERCEL) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`ITSU Lacoste Portal running on port ${PORT}`);
  });
}

module.exports = requestHandler;
