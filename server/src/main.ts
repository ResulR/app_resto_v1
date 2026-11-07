import { createApp } from './app.js'

const host = '127.0.0.1'
const port = 4600

const server = createApp().listen(port, host, () => {
  console.log(`Restaurant API : ${host}:${port}`)
})

server.on('error', (error) => {
  console.error('Démarrage API impossible :', error.message)
  process.exitCode = 1
})
