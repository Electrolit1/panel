const express = require('express');
const { spawn } = require('child_process');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const SERVER_FOLDER = path.resolve(__dirname, 'plugins'); // plugins
const SERVER_ROOT = path.resolve(__dirname, 'panel'); // carpeta web sincronizada con GitHub

app.use(express.json());
app.use(express.static(SERVER_ROOT));  // Sirve la carpeta panel como web

// Multer para subir archivos .jar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SERVER_FOLDER);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/java-archive' || file.originalname.endsWith('.jar')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .jar'));
    }
  }
});

// Endpoint subir plugin
app.post('/upload-plugin', upload.single('plugin'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  res.json({ status: 'Plugin subido correctamente: ' + req.file.originalname });
});

// Explorador archivos
app.get('/files', async (req, res) => {
  try {
    const ruta = req.query.path || '';
    const absPath = path.resolve(SERVER_ROOT, ruta);
    if (!absPath.startsWith(SERVER_ROOT)) return res.status(400).json({ error: 'Ruta inválida' });

    const files = await fs.readdir(absPath, { withFileTypes: true });
    const lista = files.map(f => ({
      name: f.name,
      path: path.join(ruta, f.name).replace(/\\/g, '/'),
      isDirectory: f.isDirectory()
    }));
    res.json(lista);
  } catch (e) {
    res.status(500).json({ error: 'Error al leer carpeta' });
  }
});

// Leer archivo
app.get('/file', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'No se indicó archivo' });
    const absPath = path.resolve(SERVER_ROOT, filePath);
    if (!absPath.startsWith(SERVER_ROOT)) return res.status(400).json({ error: 'Ruta inválida' });

    const content = await fs.readFile(absPath, 'utf-8');
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: 'Error al leer archivo' });
  }
});

// Guardar archivo
app.post('/file', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No se indicó archivo' });
    const absPath = path.resolve(SERVER_ROOT, filePath);
    if (!absPath.startsWith(SERVER_ROOT)) return res.status(400).json({ error: 'Ruta inválida' });

    await fs.writeFile(absPath, content, 'utf-8');
    res.json({ status: 'Archivo guardado correctamente' });
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar archivo' });
  }
});

let mcServer = null;

function startServer() {
  if (mcServer) return;
  // Ajusta la cantidad de RAM según tu PC
  mcServer = spawn('java', ['-Xmx6G', '-Xms6G', '-jar', 'paper.jar', 'nogui'], { cwd: __dirname });

  mcServer.stdout.on('data', (data) => {
    io.emit('console', data.toString());
  });

  mcServer.stderr.on('data', (data) => {
    io.emit('console', `ERROR: ${data.toString()}`);
  });

  mcServer.on('exit', (code, signal) => {
    io.emit('console', `Servidor Minecraft cerrado con código ${code} y señal ${signal}\n`);
    mcServer = null;
  });
}

// Iniciar servidor MC
app.post('/iniciar', (req, res) => {
  if (mcServer) return res.json({ status: 'El servidor ya está iniciado.' });
  startServer();
  res.json({ status: 'Servidor iniciado.' });
});

// Apagar servidor MC limpio o forzado
app.post('/kill', (req, res) => {
  if (!mcServer) return res.json({ status: 'El servidor no está iniciado.' });

  mcServer.stdin.write('stop\n');

  const timeout = setTimeout(() => {
    if (mcServer) {
      mcServer.kill('SIGKILL');
      io.emit('console', 'Servidor forzado a cerrar con SIGKILL\n');
      mcServer = null;
    }
  }, 10000);

  mcServer.once('exit', () => clearTimeout(timeout));

  res.json({ status: 'Se ha enviado el comando stop para apagar el servidor.' });
});

// Enviar comando al servidor MC
app.post('/comando', (req, res) => {
  const { comando } = req.body;
  if (!comando) return res.status(400).json({ error: 'Comando requerido' });

  if (mcServer) {
    mcServer.stdin.write(comando + '\n');
    res.json({ respuesta: `[Comando enviado]: ${comando}` });
  } else {
    res.status(400).json({ error: 'El servidor no está iniciado' });
  }
});

// Logs en vivo con socket.io
io.on('connection', (socket) => {
  console.log('Cliente conectado a la consola');

  socket.on('command', (cmd) => {
    if (mcServer) {
      mcServer.stdin.write(cmd + '\n');
    } else {
      socket.emit('console', 'El servidor no está iniciado.\n');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Panel iniciado en http://localhost:${PORT}`);
});
