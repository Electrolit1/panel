const socket = io();
const consoleDiv = document.getElementById('console');
const commandInput = document.getElementById('command');

socket.on('console', (data) => {
  consoleDiv.innerText += '\n' + data;
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
});

commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = commandInput.value.trim();
    if (cmd) {
      socket.emit('command', cmd);
      commandInput.value = '';
    }
  }
});
