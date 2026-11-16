const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? 'index.html' : req.url.slice(1);
  let filePath = path.join(__dirname, file);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback to index.html
      fs.readFile(path.join(__dirname, 'index.html'), (e, html) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
    } else {
      let ext = path.extname(filePath);
      let type = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
