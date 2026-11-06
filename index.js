const express = require('express');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

// Configurações e Variáveis de Ambiente
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

let client; // Variável global para manter a sessão ativa

// 1. Conecta ao Banco de Dados e inicializa o WhatsApp
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
                '--disable-dev-shm-usage', // Fundamental para Docker com pouca RAM
                '--disable-accelerated-2d-canvas', // Desativa aceleração gráfica
                '--no-first-run',
                '--no-zygote', 
                '--single-process', // Roda tudo em um processo só (economiza muita RAM)
                '--disable-gpu' // Desativa placa de vídeo
            ]
        },
        // ADICIONE ESTE BLOCO PARA TRAVAR A VERSÃO DO WHATSAPP
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }
    });

    // Exibe o QR Code nos logs do Render para o primeiro acesso
    client.on('qr', (qr) => {
        console.log('🚨 LEIA O QR CODE ABAIXO NO SEU WHATSAPP:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp conectado e pronto para uso!');
    });

    client.on('remote_session_saved', () => {
        console.log('💾 Sessão salva com sucesso no MongoDB.');
    });

    client.initialize();
});

// 2. Rota que o seu PHP na Hostinger irá chamar
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

// Rota simples de healthcheck (obrigatório para o Render manter o app vivo)
app.get('/', (req, res) => res.send('API Mensagem Whatsapp - Online'));

// 3. Inicia o servidor Express
app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}`));
