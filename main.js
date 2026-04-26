const { app, BrowserWindow, Tray, Menu, nativeImage  } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const AutoLaunch = require('auto-launch');

let tray;
let win;
let nodeProcess = null;

// AUTOSTART
// const autoLauncher = new AutoLaunch({
//   name: 'Dubrovnik Apartmani Sync',
//   path: process.execPath,
// });

//autoLauncher.enable().catch(err => console.error('Autostart error:', err));

function createWindow() {
  win = new BrowserWindow({
  width: 1100,
  height: 500,
  show: true,
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false
  }
});

  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('minimize', (event) => {
    event.preventDefault();
    win.hide();
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png')); // možeš kasnije staviti ikonu
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => win.show() },
    { label: 'Exit', click: () => {
        if (nodeProcess) nodeProcess.kill();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Recepcija');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
  win.show();
  });
}

// function startBackend() {
//   nodeProcess = spawn('node', ['trello.js'], {
//     cwd: __dirname
//   });

//   nodeProcess.stdout.on('data', (data) => {
//     win.webContents.send('log', data.toString());
//   });

//   nodeProcess.stderr.on('data', (data) => {
//     win.webContents.send('log', '❌ ' + data.toString());
//   });
// }

function setupLogger() {
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args) => {
    const message = args.join(' ') + '\n';
    if (win) win.webContents.send('log', message);
    originalLog(...args);
  };

  console.error = (...args) => {
    const message = args.join(' ') + '\n';
    if (win) win.webContents.send('log', message);
    originalError(...args);
  };
}

app.whenReady().then(() => {
  createWindow(); 
  createTray();
  setupLogger();

  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, ".env");

  require("dotenv").config({ path: envPath });

  console.log("ENV PATH:", envPath);
  console.log("TRELLO_KEY:", process.env.TRELLO_API_KEY ? "OK" : "MISSING");

  const trelloPath = app.isPackaged
    ? path.join(process.resourcesPath, 'trello.js')
    : path.join(__dirname, 'trello.js');

  require(trelloPath);
});