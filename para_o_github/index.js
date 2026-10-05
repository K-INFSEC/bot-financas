require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const qr = require('qrcode');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const express = require('express');

// --- Configuração do Servidor Web (Para manter o robô acordado na nuvem) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('✅ Robô do WhatsApp está rodando e acordado!');
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor Web rodando na porta ${PORT}`);
});
// ---------------------------------------------------------------------------
// Imports duplicados removidos
// Configuração da planilha (arquivo CSV local)
const csvFile = 'gastos.csv';
const csvWriter = createObjectCsvWriter({
    path: csvFile,
    header: [
        { id: 'data', title: 'Data' },
        { id: 'categoria', title: 'Categoria' },
        { id: 'valor', title: 'Valor' }
    ],
    append: fs.existsSync(csvFile) // Adiciona novas linhas se o arquivo já existir
});

// Configuração do cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Salva o login para não precisar ler o QR Code sempre
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
    }
});

// Geração do QR Code no terminal
client.on('qr', (qr) => {
    console.log('\n--- 📱 CONECTE SEU WHATSAPP ---');
    console.log('Escaneie o QR Code no terminal OU abra o arquivo qr.png gerado na pasta:');
    
    // Gerar QR code no terminal
    qrcodeTerminal.generate(qr, { small: true });
    
    // Salvar QR code como imagem
    qrcodeImage.toFile('qr.png', qr, (err) => {
        if (err) console.error('Erro ao gerar imagem do QR Code:', err);
        else console.log('✅ Arquivo qr.png criado com sucesso. Abra-o para escanear!');
    });
});

client.on('ready', () => {
    console.log('\n✅ Cliente WhatsApp conectado e pronto!');
    console.log('Aguardando mensagens no grupo "contas" no formato:');
    console.log('"Registrar Gasto - [Categoria], [Valor]" (ex: Registrar Gasto - Gasolina, 80)\n');
});

// Escuta as mensagens (incluindo as que VOCÊ mesmo envia pelo celular)
client.on('message_create', async msg => {
    try {
        const body = msg.body;
        
        // Regex para extrair a Categoria e o Valor
        const regex = /^Registrar Gasto\s*-\s*(.+?)\s*,\s*([\d.,]+)/i;
        const match = body.match(regex);
        
        if (match) {
            console.log('\n--- 🎯 MENSAGEM DETECTADA! ---');
            console.log('Mensagem:', body);
            
            const categoria = match[1].trim();
            const valor = match[2].trim();
            
            // Pega a data e hora atuais
            const data = new Date().toLocaleString('pt-BR'); 
            
            // Salva na planilha local (CSV) como backup
            await csvWriter.writeRecords([{
                data: data,
                categoria: categoria,
                valor: valor
            }]);
            
            // Envia os dados para a planilha do Google Sheets na nuvem!
            const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
            
            if (!GOOGLE_SHEETS_URL) {
                console.error(`[${data}] ❌ URL do Google Sheets não configurada no arquivo .env!`);
            } else {
                try {
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        data: data,
                        categoria: categoria,
                        valor: valor
                    })
                });
                console.log(`[${data}] ✅ Gasto enviado para o Google Sheets: ${categoria} - R$ ${valor}`);
            } catch (err) {
                console.error(`[${data}] ❌ Erro ao enviar para o Google Sheets:`, err.message);
            }
            
            // Responde no WhatsApp confirmando o registro
            await msg.reply(`✅ *Gasto Registrado na Nuvem!*\nCategoria: ${categoria}\nValor: R$ ${valor}\nSua planilha foi atualizada!`);
            }
        }
    } catch (error) {
        console.error('Erro ao processar mensagem:', error.message);
    }
});

client.initialize();
