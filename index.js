const express = require('express');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

let client;

mongoose.connect(MONGODB_URI).then(() => {
    console.log('Conectado ao MongoDB');
    const store = new MongoStore({ mongoose: mongoose });
    
    client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }
    });

    // Só exibe o QR Code no terminal
    client.on('qr', (qr) => {
        console.log('🚨 NOVO QR CODE GERADO. ESCANEIE AGORA:');
        qrcode.generate(qr, { small: true });
    });

    // Avisa assim que o celular aprovar (Antes de baixar mensagens)
    client.on('authenticated', () => {
        console.log('🔐 Celular aceitou! Autenticando (Aguarde...)');
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp conectado e pronto para uso!');
    });

    client.on('remote_session_saved', () => {
        console.log('💾 Sessão salva com sucesso no MongoDB.');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
    });

    client.initialize();
}).catch(err => {
    console.error('Erro ao conectar no MongoDB:', err);
});

app.post('/enviar-mensagem', async (req, res) => {
    const { telefone, mensagem } = req.body;
    if (!client || !client.info) {
        return res.status(503).json({ error: 'Sistema iniciando ou aguardando QR Code.' });
    }
    try {
        const chatId = `${telefone}@c.us`;
        await client.sendMessage(chatId, mensagem);
        res.status(200).json({ status: 'sucesso', message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.send('API WhatsApp Online'));

app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}`));
