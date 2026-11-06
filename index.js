const express = require('express');
const { default: makeWASocket, DisconnectReason, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Esquema do MongoDB para salvar a sessão do Baileys
const AuthSchema = new mongoose.Schema({
    _id: String,
    data: String
}, { versionKey: false });
const Auth = mongoose.model('Auth', AuthSchema);

// Adaptador de Sessão (MongoDB)
async function useMongoDBAuthState() {
    const readData = async (id) => {
        const doc = await Auth.findById(id);
        return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
    };
    const writeData = async (id, data) => {
        await Auth.findByIdAndUpdate(id, { data: JSON.stringify(data, BufferJSON.replacer) }, { upsert: true });
    };
    const removeData = async (id) => {
        await Auth.findByIdAndDelete(id);
    };

    let creds = await readData('creds');
    if (!creds) creds = initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            value ? await writeData(key, value) : await removeData(key);
                        }
                    }
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
}

let sock; // Variável global do socket

async function connectToWhatsApp() {
    console.log('Conectando ao MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    const { state, saveCreds } = await useMongoDBAuthState();

    // Inicializa o núcleo do Baileys (Sem navegador)
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }), // Evita poluição nos logs
        browser: ['Hostinger API', 'Chrome', '1.0.0']
    });

    // Salva credenciais automaticamente a cada atualização
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('🚨 NOVO QR CODE GERADO. ESCANEIE AGORA:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp conectado e pronto para uso!');
        }
    });
}

connectToWhatsApp();

// Rota da API
app.post('/enviar-mensagem', async (req, res) => {
    const { telefone, mensagem } = req.body;
    
    // Verifica se a conexão está pronta (sock.user existe quando autenticado)
    if (!sock || !sock.user) {
        return res.status(503).json({ error: 'Sistema iniciando ou aguardando QR Code.' });
    }
    
    try {
        // O Baileys exige o formato @s.whatsapp.net ao invés de @c.us
        const jid = `${telefone}@s.whatsapp.net`; 
        await sock.sendMessage(jid, { text: mensagem });
        res.status(200).json({ status: 'sucesso', message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Falha ao enviar a mensagem.' });
    }
});

app.get('/', (req, res) => res.send('API WhatsApp Online (Baileys)'));

app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}`));
