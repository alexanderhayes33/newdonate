// server.js - Multi-User Alert System with Separate Files
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Import custom modules
const UserManager = require('./utils/UserManager');
const TemplateEngine = require('./utils/TemplateEngine');

// Import TrueWallet API (optional)
let truewallet;
try {
    truewallet = require('./apis/truewallet');
    console.log('✅ TrueWallet API loaded');
} catch (error) {
    console.error('❌ TrueWallet API not found:', error.message);
    console.log('ℹ️ TrueWallet features will be disabled');
}

// ⚙️ Configuration
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || 'localhost';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// สร้าง Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// สร้าง instances
const userManager = new UserManager();
const templateEngine = new TemplateEngine();

// แสดง debug info
console.log('🔍 System Debug Info:');
templateEngine.debugInfo();

// ===============================
// Utility Functions
// ===============================
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

function isUserActive(lastActiveAt) {
    return Date.now() - lastActiveAt < 7 * 24 * 60 * 60 * 1000;
}

// ===============================
// Express Configuration
// ===============================
app.set('trust proxy', true);

app.use(cors({
    origin: "*",
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
        console.log(`📋 Body:`, req.body);
    }
    next();
});

// ===============================
// Username Parameter Middleware
// ===============================
app.param('username', (req, res, next, username) => {
    const validation = userManager.validateUsername(username);
    
    if (!validation.isValid) {
        return res.status(400).json({
            success: false,
            message: `Invalid username: ${validation.errors.join(', ')}`
        });
    }
    
    req.username = username;
    req.userData = userManager.loadUserData(username);
    next();
});

// ===============================
// Socket.io Connection Handling
// ===============================
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    socket.on('join-user-room', (username) => {
        if (userManager.validateUsername(username).isValid) {
            socket.join(`user-${username}`);
            console.log(`👤 Socket ${socket.id} joined room: user-${username}`);
        }
    });
    
    socket.on('send-alert', (data) => {
        if (!data.username || !data.name || !data.amount) {
            socket.emit('alert-error', { message: 'Missing required data' });
            return;
        }
        
        try {
            const donationData = {
                name: data.name,
                amount: parseInt(data.amount),
                message: data.message || '',
                paymentMethod: 'manual',
                ip: socket.handshake.address,
                userAgent: socket.handshake.headers['user-agent']
            };
            
            const donation = userManager.addDonation(data.username, donationData);
            
            io.to(`user-${data.username}`).emit('new-alert', {
                id: donation.id,
                name: donation.name,
                amount: donation.amount,
                message: donation.message,
                timestamp: donation.timestamp
            });
            
            socket.emit('alert-sent', { 
                success: true, 
                donation: donation 
            });
            
            console.log(`📢 Manual alert sent for ${data.username}: ${donation.name} - ฿${donation.amount}`);
            
        } catch (error) {
            console.error('Error sending manual alert:', error);
            socket.emit('alert-error', { message: error.message });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// ===============================
// Routes
// ===============================

// 🏠 หน้าแรก
app.get('/', (req, res) => {
    try {
        console.log('📄 Rendering homepage...');
        
        const users = userManager.getAllUsers();
        const globalStats = userManager.getGlobalStats();
        
        let usersList = '';
        
        if (users.length === 0) {
            usersList = `
                <div class="empty-state">
                    <div class="icon">🎮</div>
                    <h3>ยังไม่มี Streamers</h3>
                    <p>เป็นคนแรกที่เริ่มใช้ระบบ Alert ของเรา!</p>
                </div>
            `;
        } else {
            usersList = '<div class="streamers-grid">';
            
            users.forEach(user => {
                const isActive = isUserActive(user.lastActiveAt);
                const statusClass = isActive ? 'status-active' : 'status-inactive';
                const statusText = isActive ? 'Online' : 'Offline';
                const avatarLetter = user.username.charAt(0).toUpperCase();
                
                usersList += `
                    <div class="streamer-card">
                        <div class="card-header">
                            <div class="streamer-info">
                                <div class="avatar">${avatarLetter}</div>
                                <div class="streamer-details">
                                    <h3>${user.username}</h3>
                                    <div class="stream-title">${user.streamTitle}</div>
                                </div>
                            </div>
                            <div class="status-badge ${statusClass}">${statusText}</div>
                        </div>
                        
                        <div class="card-stats">
                            <div class="stat-box">
                                <div class="stat-value">${user.totalDonations}</div>
                                <div class="stat-label">Donations</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">฿${user.totalAmount.toLocaleString()}</div>
                                <div class="stat-label">Total</div>
                            </div>
                        </div>
                        
                        <div class="card-actions">
                            <a href="/user/${user.username}/donate" class="action-btn primary">
                                 Donate Page
                            </a>
                            <a href="/user/${user.username}/widget" class="action-btn" target="_blank">
                                📺 Widget
                            </a>
                            
                            <div class="more-actions">
                                <a href="/user/${user.username}/control" class="action-btn" target="_blank">
                                     Alert Test
                                </a>
                                <a href="/user/${user.username}/history" class="action-btn" target="_blank">
                                     History
                                </a>
                                <a href="/user/${user.username}/config" class="action-btn">
                                     Settings
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            usersList += '</div>';
        }
        
        console.log('📋 Users HTML length:', usersList.length);
        console.log('📋 First 200 chars:', usersList.substring(0, 200));
        
        const html = templateEngine.render('homepage', {
            totalUsers: globalStats.totalUsers,
            totalAmount: globalStats.totalAmount.toLocaleString(),
            totalDonations: globalStats.totalDonations,
            activeUsers: globalStats.activeUsers,
            usersList: usersList
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering homepage:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>เกิดข้อผิดพลาด: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/homepage.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 🆕 สร้าง user ใหม่
app.post('/user/create', (req, res) => {
    try {
        console.log('📝 Create user request:', req.body);
        
        const { username, phone } = req.body;
        
        if (!username || !phone) {
            console.log('❌ Missing data:', { username, phone });
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ ข้อมูลไม่ครบถ้วน</h1>
                    <p>กรุณากรอก Username และเบอร์โทรศัพท์</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        const usernameValidation = userManager.validateUsername(username);
        if (!usernameValidation.isValid) {
            console.log('❌ Invalid username:', username, usernameValidation.errors);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Username ไม่ถูกต้อง</h1>
                    <p>${usernameValidation.errors.join('<br>')}</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        if (!/^[0-9]{10}$/.test(phone)) {
            console.log('❌ Invalid phone:', phone);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ เบอร์โทรศัพท์ไม่ถูกต้อง</h1>
                    <p>เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        if (userManager.userExists(username)) {
            console.log('❌ User already exists:', username);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Username นี้มีอยู่แล้ว</h1>
                    <p>กรุณาเลือก Username อื่น</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        const userData = userManager.createUser(username, {
            truewalletPhone: phone,
            streamTitle: `${username}'s Stream`
        });
        
        console.log(`✅ New user created: ${username} with phone: ${phone.substring(0, 3)}***${phone.substring(7)}`);
        
        res.redirect(`/user/${username}/config?created=true`);
        
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><title>Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ เกิดข้อผิดพลาดในระบบ</h1>
                <p>${error.message}</p>
                <button onclick="history.back()">← กลับไป</button>
            </body></html>
        `);
    }
});

// 💝 หน้าโดเนท
app.get('/user/:username/donate', (req, res) => {
    try {
        console.log(`📄 Rendering donate page for: ${req.username}`);
        
        const html = templateEngine.render('donate', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString()
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering donate page:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>ไม่สามารถแสดงหน้าโดเนทได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/donate.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 📺 Alert Widget
app.get('/user/:username/widget', (req, res) => {
    try {
        console.log(`📄 Rendering widget for: ${req.username}`);
        
        const config = req.userData.config;
        
        const html = templateEngine.render('widget', {
            username: req.username,
            streamTitle: config.streamTitle || `${req.username}'s Stream`,
            alertDuration: config.alertDuration || 5000,
            enableTTS: config.enableTTS ? 'true' : 'false',
            enableSound: config.enableSound ? 'true' : 'false',
            minTTSAmount: config.minTTSAmount || 50,
            alertFormat: (config.alertFormat || '{{user}} โดเนท {{amount}}').replace(/"/g, '\\"'),
            showBackground: (config.showBackground === true) ? 'true' : 'false', // เปลี่ยนเป็นตรวจสอบแบบชัดเจน
            showIcon: (config.showIcon !== false) ? 'true' : 'false',
            showSparkles: (config.showSparkles !== false) ? 'true' : 'false',
            useCustomGif: config.useCustomGif ? 'true' : 'false',
            customGifUrl: config.customGifUrl || '',
            backgroundColor: config.backgroundColor || 'rgba(255, 255, 255, 0.95)',
            textColor: config.textColor || '#1f2937',
            amountColor: config.amountColor || '#f59e0b',
            donorColor: config.donorColor || '#667eea',
            fontSize: config.fontSize || 42,
            amountSize: config.amountSize || 56,
            borderRadius: config.borderRadius || 25,
            animationSpeed: config.animationSpeed || 1.2,
            customCSS: config.customCSS || ''
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering widget:', error);
        res.status(500).send(`
            <h1>Widget Error</h1>
            <p>ไม่สามารถแสดง Widget ได้: ${error.message}</p>
            <p>Debug info: ${JSON.stringify({
                username: req.username,
                configExists: !!req.userData,
                configKeys: req.userData ? Object.keys(req.userData.config) : 'none'
            })}</p>
        `);
    }
});


// ⚙️ Config/Settings
app.get('/user/:username/config', (req, res) => {
    try {
        console.log(`📄 Loading config page for: ${req.username}`);
        
        const isNewUser = req.query.created === 'true';
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        
        const widgetUrl = `${protocol}://${req.get('host')}/user/${req.username}/widget`;
        const donateUrl = `${protocol}://${req.get('host')}/user/${req.username}/donate`;
        
        console.log(`🔗 URLs:`, { widgetUrl, donateUrl });
        console.log(`⚙️ Current config:`, req.userData.config);
        
        // ส่ง config ที่ escape quotes ให้ถูกต้อง
        const configForTemplate = JSON.stringify(req.userData.config).replace(/"/g, '&quot;');
        
        const html = templateEngine.render('config', {
            username: req.username,
            config: configForTemplate,
            isNewUser: isNewUser ? 'block' : 'none',
            widgetUrl: widgetUrl,
            donateUrl: donateUrl
        });
        
        res.send(html);
        
    } catch (error) {
        console.error(`❌ Error rendering config page for ${req.username}:`, error);
        res.status(500).send(`
            <h1>Config Error</h1>
            <p>ไม่สามารถแสดงหน้า Settings ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/config.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 🎮 Control Panel
app.get('/user/:username/control', (req, res) => {
    try {
        console.log(`📄 Rendering control panel for: ${req.username}`);
        
        const html = templateEngine.render('control', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString(),
            recentDonations: JSON.stringify(req.userData.donations.slice(0, 10))
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering control panel:', error);
        res.status(500).send(`
            <h1>Control Panel Error</h1>
            <p>ไม่สามารถแสดง Control Panel ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/control.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 📊 History Dashboard
app.get('/user/:username/history', (req, res) => {
    try {
        console.log(`📄 Rendering history for: ${req.username}`);
        
        const html = templateEngine.render('history', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString(),
            averageAmount: req.userData.stats.averageAmount,
            uniqueDonors: req.userData.stats.uniqueDonors
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering history:', error);
        res.status(500).send(`
            <h1>History Error</h1>
            <p>ไม่สามารถแสดงหน้า History ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/history.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// ===============================
// API Routes
// ===============================

// 💰 API เติมเงิน TrueWallet
app.post('/user/:username/api/redeem-voucher', async (req, res) => {
    try {
        const { voucher_code, donor_name, donor_message } = req.body;
        const phoneNumber = req.userData.config.truewalletPhone;
        
        if (!phoneNumber) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'ยังไม่ได้ตั้งค่าเบอร์ TrueWallet กรุณาไปที่หน้า Settings'
            });
        }
        
        if (!voucher_code) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'กรุณากรอกรหัส voucher'
            });
        }
        
        console.log(`🔄 [${req.username}] กำลังเติมเงินด้วย voucher: ${voucher_code.substring(0, 10)}...`);
        
        if (!truewallet) {
            return res.status(500).json({
                status: 'ERROR',
                reason: 'TrueWallet API ไม่พร้อมใช้งาน'
            });
        }
        
        const result = await truewallet.redeemvouchers(phoneNumber, voucher_code);
        
        if (result.status === 'SUCCESS') {
            console.log(`✅ [${req.username}] เติมเงินสำเร็จ: ${result.amount} บาท`);
            
            if (donor_name) {
                const donationData = {
                    name: donor_name,
                    amount: parseInt(result.amount),
                    message: donor_message || '',
                    paymentMethod: 'truewallet',
                    voucherCode: voucher_code,
                    phoneNumber: phoneNumber,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                };
                
                const donation = userManager.addDonation(req.username, donationData);
                
                io.to(`user-${req.username}`).emit('new-alert', {
                    id: donation.id,
                    name: donation.name,
                    amount: donation.amount,
                    message: donation.message,
                    timestamp: donation.timestamp
                });
                
                console.log(`🎉 [${req.username}] Donation alert sent:`, donation);
            }
        } else {
            console.log(`❌ [${req.username}] เติมเงินไม่สำเร็จ: ${result.reason}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error(`❌ [${req.username}] Error in voucher redemption:`, error);
        res.status(500).json({
            status: 'ERROR',
            reason: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// ⚙️ API อัพเดท config
app.post('/user/:username/api/config', (req, res) => {
    try {
        const updatedConfig = userManager.updateConfig(req.username, req.body);
        res.json({ 
            success: true, 
            message: 'Configuration updated successfully',
            config: updatedConfig 
        });
    } catch (error) {
        console.error(`Error updating config for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 📊 API ดู donation logs
app.get('/user/:username/api/donations', (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', dateFrom, dateTo } = req.query;
        
        let donations = [...req.userData.donations];
        
        if (search) {
            const searchLower = search.toLowerCase();
            donations = donations.filter(donation => 
                donation.name.toLowerCase().includes(searchLower) ||
                (donation.message && donation.message.toLowerCase().includes(searchLower))
            );
        }
        
        if (dateFrom || dateTo) {
            donations = donations.filter(donation => {
                const donationDate = new Date(donation.timestamp);
                if (dateFrom && donationDate < new Date(dateFrom)) return false;
                if (dateTo && donationDate > new Date(dateTo + ' 23:59:59')) return false;
                return true;
            });
        }
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedDonations = donations.slice(startIndex, endIndex);
        
        // คำนวณสถิติสำหรับ search results
        const searchStats = {
            totalDonations: donations.length,
            totalAmount: donations.reduce((sum, d) => sum + d.amount, 0),
            averageAmount: donations.length > 0 ? 
                Math.round(donations.reduce((sum, d) => sum + d.amount, 0) / donations.length) : 0
        };
        
        // คำนวณสถิติวันนี้
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayDonations = req.userData.donations.filter(d => new Date(d.timestamp) >= startOfDay);
        
        const userStats = {
            ...req.userData.stats,
            todayDonations: todayDonations.length
        };
        
        res.json({
            success: true,
            data: paginatedDonations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: donations.length,
                pages: Math.ceil(donations.length / limit)
            },
            stats: searchStats,
            userStats: userStats
        });
        
    } catch (error) {
        console.error(`Error fetching donations for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch donations',
            error: error.message
        });
    }
});

// 📥 API export donations
app.get('/user/:username/api/donations/export', (req, res) => {
    try {
        const donations = req.userData.donations;
        const filename = `${req.username}_donations_${new Date().toISOString().split('T')[0]}.json`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
            username: req.username,
            exportDate: new Date().toISOString(),
            stats: req.userData.stats,
            donations: donations
        }, null, 2));
        
    } catch (error) {
        console.error(`Error exporting donations for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 🔊 API TTS
app.get('/api/tts', async (req, res) => {
    const { text, lang = 'th' } = req.query;
    
    if (!text) {
        return res.status(400).json({ 
            success: false, 
            message: 'Text parameter is required' 
        });
    }
    
    try {
        console.log('🔊 TTS Request:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
        
        const https = require('https');
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
                message: 'Failed to fetch TTS audio' 
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
            message: 'Internal server error' 
        });
    }
});

// 📊 API สถานะ server
app.get('/api/status', (req, res) => {
    const globalStats = userManager.getGlobalStats();
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        success: true,
        server: 'Multi-User Alert System',
        version: '2.0.0',
        domain: DOMAIN,
        protocol: protocol,
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        ...globalStats,
        timestamp: new Date().toISOString()
    });
});

// 🏥 Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Multi-User Alert System is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ===============================
// Error Handling
// ===============================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!' 
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>404 - Page Not Found</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>404 - Page Not Found</h1>
            <p>หน้าที่คุณกำลังมองหาไม่พบ</p>
            <a href="/" style="color: #667eea; text-decoration: none;">← กลับหน้าแรก</a>
        </body>
        </html>
    `);
});

// ===============================
// Start Server
// ===============================
server.listen(PORT, '0.0.0.0', () => {
    const protocol = USE_HTTPS ? 'https' : 'http';
    
    console.log('🎉 =====================================');
    console.log('🚀 Multi-User Alert System Started!');
    console.log('🎉 =====================================');
    console.log(`🌐 Server: ${protocol}://${DOMAIN}:${PORT}`);
    console.log(`🏠 Homepage: ${protocol}://${DOMAIN}:${PORT}/`);
    console.log(`📊 API Status: ${protocol}://${DOMAIN}:${PORT}/api/status`);
    console.log(`💾 Users Directory: ${userManager.USER_DATA_DIR}`);
    console.log('🎉 =====================================');
    
    // แสดงรายชื่อ users ที่มีอยู่
    const existingUsers = userManager.getAllUsers();
    if (existingUsers.length > 0) {
        console.log(`👥 Existing Users (${existingUsers.length}):`);
        existingUsers.forEach(user => {
            console.log(`   📺 ${user.username} - ${user.streamTitle}`);
            console.log(`      💝 Donate: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/donate`);
            console.log(`      📺 Widget: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/widget`);
        });
        console.log('🎉 =====================================');
    }
    
    // แสดง debug information
    console.log('🔍 Debug Information:');
    templateEngine.debugInfo();
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, userManager, templateEngine };