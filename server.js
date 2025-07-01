const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const https = require('https');
const truewallet = require('./apis/truewallet');

// ⚙️ การตั้งค่าระบบ
const TRUEWALLET_PHONE = process.env.TRUEWALLET_PHONE || '0801544992';
const DOMAIN = process.env.DOMAIN || 'chatmateth.chat';
const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === 'true'; // เปิด/ปิด HTTPS

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: [
            `http://${DOMAIN}`,
            `https://${DOMAIN}`,
            `http://localhost:${PORT}`,
            `http://127.0.0.1:${PORT}`,
            `http://154.215.14.36:${PORT}`,
            "*"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    allowEIO3: true
});

// เส้นทางไฟล์ logs
const LOGS_FILE = path.join(__dirname, 'donation_logs.json');

// ฟังก์ชันสำหรับ Bangkok timezone
function getBangkokTime() {
    return new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ฟังก์ชันโหลด logs จากไฟล์
function loadLogs() {
    try {
        if (fs.existsSync(LOGS_FILE)) {
            const data = fs.readFileSync(LOGS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
    return [];
}

// ฟังก์ชันบันทึก logs ลงไฟล์
function saveLogs(logs) {
    try {
        fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
        console.log('✅ Logs saved successfully');
    } catch (error) {
        console.error('❌ Error saving logs:', error);
    }
}

// ฟังก์ชันเพิ่ม log ใหม่
function addDonationLog(alertData) {
    const logs = loadLogs();
    
    const logEntry = {
        id: Date.now(),
        timestamp: alertData.timestamp,
        bangkokTime: getBangkokTime(),
        name: alertData.name,
        amount: alertData.amount,
        message: alertData.message || '',
        paymentMethod: alertData.paymentMethod || 'manual',
        voucherCode: alertData.voucherCode || '',
        phoneNumber: alertData.phoneNumber || '',
        status: 'completed',
        ip: alertData.ip || 'unknown',
        userAgent: alertData.userAgent || 'unknown'
    };
    
    logs.unshift(logEntry);
    
    if (logs.length > 1000) {
        logs.splice(1000);
    }
    
    saveLogs(logs);
    
    console.log('📝 New donation logged:', logEntry);
    return logEntry;
}

// Store active alerts และ queue
let activeAlerts = [];
let alertHistory = [];
let alertQueue = [];
let isProcessingQueue = false;

// ฟังก์ชันจัดการ Alert Queue
async function processAlertQueue() {
    if (isProcessingQueue || alertQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    console.log(`🎯 Processing alert queue: ${alertQueue.length} items`);
    
    while (alertQueue.length > 0) {
        const alertData = alertQueue.shift();
        
        try {
            alertHistory.unshift(alertData);
            if (alertHistory.length > 100) {
                alertHistory.pop();
            }
            
            addDonationLog(alertData);
            
            io.emit('new-alert', alertData);
            
            console.log(`✅ Alert processed: ${alertData.name} - ฿${alertData.amount}`);
            
            await new Promise(resolve => setTimeout(resolve, 6000));
            
        } catch (error) {
            console.error('❌ Error processing alert:', error);
        }
    }
    
    isProcessingQueue = false;
    console.log('🏁 Alert queue processing completed');
}

// ฟังก์ชันเพิ่ม alert เข้า queue
function addToAlertQueue(alertData) {
    alertData.queueId = Date.now() + Math.random();
    alertData.queuedAt = Date.now();
    
    alertQueue.push(alertData);
    
    console.log(`📋 Alert added to queue: ${alertData.name} (Queue: ${alertQueue.length})`);
    
    processAlertQueue();
    
    return { success: true };
}

// Middleware สำหรับ HTTPS Redirect
app.use((req, res, next) => {
    // ถ้าใช้ Cloudflare และต้องการ Force HTTPS
    if (req.headers['x-forwarded-proto'] === 'http' && USE_HTTPS) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// Trust proxy headers (สำคัญสำหรับ Cloudflare)
app.set('trust proxy', true);

// CORS Configuration
app.use(cors({
    origin: [
        `http://${DOMAIN}`,
        `https://${DOMAIN}`,
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`,
        `http://154.215.14.36:${PORT}`,
        "*"
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Security Headers สำหรับ HTTPS
app.use((req, res, next) => {
    if (USE_HTTPS) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    next();
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('send-alert', (data) => {
        const alertData = {
            id: Date.now(),
            name: data.name,
            amount: data.amount,
            message: data.message || '',
            paymentMethod: data.paymentMethod || 'manual',
            timestamp: Date.now(),
            socketId: socket.id,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
        };
        
        addToAlertQueue(alertData);
        
        console.log('Alert queued:', alertData);
        
        socket.emit('alert-sent', { 
            success: true, 
            alert: alertData
        });
    });
    
    socket.on('request-recent-alerts', () => {
        socket.emit('recent-alerts', alertHistory.slice(0, 10));
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// REST API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/widget', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'alert-widget.html'));
});

app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control-panel.html'));
});

app.get('/donate', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'donate.html'));
});

app.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

// API สำหรับส่ง alert ผ่าน HTTP
app.post('/api/alert', (req, res) => {
    const { name, amount, message, paymentMethod } = req.body;
    
    if (!name || !amount) {
        return res.status(400).json({ 
            success: false, 
            message: 'Name and amount are required' 
        });
    }
    
    const alertData = {
        id: Date.now(),
        name: name,
        amount: parseInt(amount),
        message: message || '',
        paymentMethod: paymentMethod || 'api',
        timestamp: Date.now(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || 'unknown'
    };
    
    addToAlertQueue(alertData);
    
    console.log('Alert queued via API:', alertData);
    
    res.json({ 
        success: true, 
        message: 'Alert sent successfully',
        alert: alertData
    });
});

// API สำหรับเติมเงิน TrueWallet
app.post('/api/redeem-voucher', async (req, res) => {
    try {
        const { voucher_code, donor_name, donor_message } = req.body;
        
        if (!voucher_code) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'กรุณากรอกรหัส voucher'
            });
        }
        
        const phoneNumber = TRUEWALLET_PHONE;
        
        console.log(`🔄 กำลังเติมเงินให้เบอร์: ${phoneNumber} ด้วย voucher: ${voucher_code.substring(0, 10)}...`);
        
        const result = await truewallet.redeemvouchers(phoneNumber, voucher_code);
        
        if (result.status === 'SUCCESS') {
            console.log(`✅ เติมเงินสำเร็จ: ${result.amount} บาท`);
            
            if (donor_name) {
                const alertData = {
                    id: Date.now(),
                    name: donor_name,
                    amount: parseInt(result.amount),
                    message: donor_message || '',
                    paymentMethod: 'truewallet',
                    voucherCode: voucher_code,
                    phoneNumber: phoneNumber,
                    timestamp: Date.now(),
                    ip: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent') || 'unknown'
                };
                
                addToAlertQueue(alertData);
                
                console.log('✅ Donation alert created:', alertData);
            }
            
        } else {
            console.log(`❌ เติมเงินไม่สำเร็จ: ${result.reason}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดใน API:', error);
        res.status(500).json({
            status: 'ERROR',
            reason: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// API สำหรับดู donation logs (from version 2)
app.get('/api/logs', (req, res) => {
    const { page = 1, limit = 50, search = '', dateFrom, dateTo } = req.query;
    
    try {
        let logs = loadLogs();
        
        // กรองตามคำค้นหา
        if (search) {
            const searchLower = search.toLowerCase();
            logs = logs.filter(log => 
                log.name.toLowerCase().includes(searchLower) ||
                (log.message && log.message.toLowerCase().includes(searchLower))
            );
        }
        
        // กรองตามวันที่
        if (dateFrom || dateTo) {
            logs = logs.filter(log => {
                const logDate = new Date(log.timestamp);
                if (dateFrom && logDate < new Date(dateFrom)) return false;
                if (dateTo && logDate > new Date(dateTo + ' 23:59:59')) return false;
                return true;
            });
        }
        
        // คำนวณ pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedLogs = logs.slice(startIndex, endIndex);
        
        // สถิติ
        const stats = {
            totalDonations: logs.length,
            totalAmount: logs.reduce((sum, log) => sum + log.amount, 0),
            averageAmount: logs.length > 0 ? logs.reduce((sum, log) => sum + log.amount, 0) / logs.length : 0,
            todayDonations: logs.filter(log => {
                const today = new Date().toDateString();
                const logDate = new Date(log.timestamp).toDateString();
                return today === logDate;
            }).length,
            truewalletDonations: logs.filter(log => log.paymentMethod === 'truewallet').length,
            manualDonations: logs.filter(log => log.paymentMethod === 'manual').length
        };
        
        res.json({
            success: true,
            data: paginatedLogs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: logs.length,
                pages: Math.ceil(logs.length / limit)
            },
            stats: stats
        });
        
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch logs',
            error: error.message
        });
    }
});

// API สำหรับลบ log (from version 2)
app.delete('/api/logs/:id', (req, res) => {
    try {
        const { id } = req.params;
        let logs = loadLogs();
        
        const initialLength = logs.length;
        logs = logs.filter(log => log.id != id);
        
        if (logs.length < initialLength) {
            saveLogs(logs);
            res.json({ success: true, message: 'Log deleted successfully' });
        } else {
            res.status(404).json({ success: false, message: 'Log not found' });
        }
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// API สำหรับ export logs (from version 2)
app.get('/api/logs/export', (req, res) => {
    try {
        const logs = loadLogs();
        const filename = `donation_logs_${new Date().toISOString().split('T')[0]}.json`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(logs, null, 2));
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// API สำหรับดู alert history (from version 2)
app.get('/api/alerts', (req, res) => {
    res.json({
        success: true,
        alerts: alertHistory,
        total: alertHistory.length
    });
});

// API สำหรับ alert.json (legacy support) (from version 2)
app.get('/alert.json', (req, res) => {
    if (alertHistory.length > 0) {
        const latestAlert = alertHistory[0];
        res.json({
            name: latestAlert.name,
            amount: latestAlert.amount,
            message: latestAlert.message || '',
            timestamp: latestAlert.timestamp
        });
    } else {
        res.json({
            name: '',
            amount: 0,
            message: '',
            timestamp: 0
        });
    }
});

// API สำหรับ Google TTS Proxy (from version 2)
app.get('/api/tts', async (req, res) => {
    const { text, lang = 'th' } = req.query;
    
    if (!text) {
        return res.status(400).json({ 
            success: false, 
            message: 'Text parameter is required' 
        });
    }
    
    try {
        console.log('🔊 TTS Request:', text);
        
        const encodedText = encodeURIComponent(text);
        const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;
        
        const googleReq = https.get(googleUrl, (googleRes) => {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            googleRes.pipe(res);
            console.log('✅ TTS served successfully');
        });
        
        googleReq.on('error', (error) => {
            console.error('❌ Google TTS Error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch TTS audio',
                error: error.message 
            });
        });
        
        googleReq.setTimeout(10000, () => {
            googleReq.destroy();
            res.status(408).json({ 
                success: false, 
                message: 'TTS request timeout' 
            });
        });
        
    } catch (error) {
        console.error('❌ TTS API Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// API สำหรับดู queue status (from version 2)
app.get('/api/queue', (req, res) => {
    res.json({
        success: true,
        queue: {
            length: alertQueue.length,
            isProcessing: isProcessingQueue,
            estimatedWaitTime: alertQueue.length * 6,
            items: alertQueue.map(item => ({
                id: item.id,
                name: item.name,
                amount: item.amount,
                queuedAt: item.queuedAt,
                position: alertQueue.indexOf(item) + 1
            }))
        }
    });
});

// API สำหรับล้าง queue (ฉุกเฉิน) (from version 2)
app.post('/api/queue/clear', (req, res) => {
    const clearedCount = alertQueue.length;
    alertQueue = [];
    isProcessingQueue = false;
    
    console.log(`🗑️ Queue cleared: ${clearedCount} items removed`);
    
    res.json({
        success: true,
        message: `Queue cleared successfully. ${clearedCount} items removed.`,
        clearedCount: clearedCount
    });
});

// API สำหรับตรวจสอบสถานะ server
app.get('/api/health', (req, res) => {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        status: 'OK',
        message: 'OBS Alert Server with TrueWallet is running',
        timestamp: new Date().toISOString(),
        domain: DOMAIN,
        protocol: protocol,
        httpsEnabled: USE_HTTPS,
        truewalletPhone: TRUEWALLET_PHONE.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')
    });
});

// API สำหรับดู server status
app.get('/api/status', (req, res) => {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        success: true,
        server: 'OBS Alert Server',
        version: '1.0.0',
        domain: DOMAIN,
        protocol: protocol,
        httpsEnabled: USE_HTTPS,
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        totalAlerts: alertHistory.length,
        totalLogs: loadLogs().length,
        queue: {
            length: alertQueue.length,
            isProcessing: isProcessingQueue
        },
        truewalletPhone: TRUEWALLET_PHONE.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Page not found' 
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    const protocol = USE_HTTPS ? 'https' : 'http';
    
    console.log(`🚀 OBS Alert Server with TrueWallet running on port ${PORT}`);
    console.log(`🌐 Domain: ${protocol}://${DOMAIN}`);
    console.log(`🔒 HTTPS Enabled: ${USE_HTTPS}`);
    console.log(`📱 TrueWallet Phone: ${TRUEWALLET_PHONE.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')}`);
    console.log(`📱 Widget: ${protocol}://${DOMAIN}/widget`);
    console.log(`💝 Donate: ${protocol}://${DOMAIN}/donate`);
    console.log(`🎛️ Control: ${protocol}://${DOMAIN}/control`);
    console.log(`📊 History: ${protocol}://${DOMAIN}/history`);
    console.log(`📊 API Status: ${protocol}://${DOMAIN}/api/status`);
    console.log('---------------------------------------------------');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});